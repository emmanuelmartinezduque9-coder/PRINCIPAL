import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { getGateway, LlmCallError, type LlmCall } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * La pasarela con el cliente real del SDK, hablando con un servidor de mentira en este mismo
 * ordenador (nunca con la API de verdad): comprueba lo que sale por el cable y cómo se
 * clasifican los fallos reales de red.
 */

const FAKE_KEY = "clave-de-prueba-que-no-es-de-nadie";

interface Seen {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

let server: http.Server;
let seen: Seen[] = [];
let respond: (res: http.ServerResponse) => void;
let ana: AuthUser;

const saved = { key: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL };

function reply(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const okMessage = {
  id: "msg_local",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: "hola" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
};

const apiError = (type: string) => ({ type: "error", error: { type, message: "Error del servidor de mentira." } });

const req = (tier: "small" | "medium"): LlmCall<unknown> => ({
  tier,
  stepKey: "prueba:cable",
  userId: ana.id,
  productId: null,
  rules: [{ slug: "angulos-de-venta", version: 1, body: "Cuerpo de la regla." }],
  instructions: "instrucciones del paso",
  content: "Producto: cepillo de bambú.",
  maxTokens: 1_000,
});

async function onlyEntry() {
  const { rows } = await getPool().query<{ status: string; cost: number | null; reserved: number; detail: unknown }>(
    `select status, cost_micros::int as cost, reserved_micros::int as reserved, detail from spend_entries`,
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  server = http.createServer((request, res) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>,
      });
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // El cliente real se crea en la primera llamada y lee de aquí la dirección: siempre la local.
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const [name, value] of [
    ["ANTHROPIC_API_KEY", saved.key],
    ["ANTHROPIC_BASE_URL", saved.url],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(async () => {
  await truncateAll();
  ana = await makeUser("colaborador", { name: "Ana" });
  seen = [];
  respond = (res) => reply(res, 200, okMessage);
});

afterEach(() => {
  server.closeIdleConnections();
});

describe("pasarela a Claude con el cliente real contra un servidor local", () => {
  it("el nivel pequeño: una sola petición, con la clave solo en su cabecera y sin modelo de reserva", async () => {
    const r = await getGateway().call(req("small"));

    expect(r).toMatchObject({ text: "hola", costMicros: 2_000, model: "claude-haiku-5-5" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("/v1/messages");
    expect(seen[0].headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(seen[0].headers["anthropic-beta"]).toBeUndefined();
    expect(seen[0].body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 1_000,
      system: [
        {
          type: "text",
          text: '<regla nombre="angulos-de-venta">\nCuerpo de la regla.\n</regla>',
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "instrucciones del paso" },
      ],
      messages: [{ role: "user", content: "Producto: cepillo de bambú." }],
      output_config: { effort: "low" },
    });
    expect(JSON.stringify(seen[0].body)).not.toContain(FAKE_KEY);
    expect(await onlyEntry()).toMatchObject({ status: "settled", cost: 2_000 });
  });

  it("el nivel mediano pide el modelo de reserva con su cabecera beta", async () => {
    respond = (res) => reply(res, 200, { ...okMessage, model: "claude-sonnet-5-5" });
    await getGateway().call(req("medium"));
    expect(seen).toHaveLength(1);
    expect(seen[0].headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    expect(seen[0].body).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", output_config: { effort: "medium" } });
    expect(seen[0].body).not.toHaveProperty("betas");
  });

  it("un error del servidor no se reintenta solo: una petición, y lo reservado queda apuntado", async () => {
    respond = (res) => reply(res, 500, apiError("api_error"));
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "desconocido", status: 500 });
    expect(seen).toHaveLength(1);
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", cost: row.reserved, detail: { outcome: "unknown" } });
  });

  it("un rechazo por exceso de peticiones tampoco se reintenta, y la reserva se libera", async () => {
    respond = (res) => reply(res, 429, apiError("rate_limit_error"));
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "no", status: 429 });
    expect(seen).toHaveLength(1);
    expect(await onlyEntry()).toMatchObject({ status: "released", cost: null });
  });

  it("si el servidor corta la conexión a medias, no se sabe si cobró: lo reservado queda apuntado", async () => {
    respond = (res) => res.destroy();
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "desconocido", status: null });
    expect(seen).toHaveLength(1);
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", cost: row.reserved, detail: { outcome: "unknown" } });
  });

  it("la clave no aparece en el error ni en el libro", async () => {
    respond = (res) => reply(res, 500, apiError("api_error"));
    const error: unknown = await getGateway()
      .call(req("small"))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmCallError);
    expect(inspect(error, { depth: 8, showHidden: true })).not.toContain(FAKE_KEY);
    expect(JSON.stringify(await onlyEntry())).not.toContain(FAKE_KEY);
  });

  // La última: cierra el servidor para que la conexión se rechace de verdad.
  it("si la conexión se rechaza antes de enviar nada, la reserva se libera", async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "no", status: null });
    expect(seen).toHaveLength(0);
    expect(await onlyEntry()).toMatchObject({ status: "released", cost: null });
  });
});
