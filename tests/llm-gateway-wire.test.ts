import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getPool } from "@/db/client";
import { getGateway, LlmCallError, type LlmCall } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * La pasarela con el cliente real del SDK, hablando con un servidor de mentira en este mismo
 * ordenador (nunca con la API de verdad): comprueba lo que sale por el cable y cómo se
 * clasifican los fallos reales de red. Cada prueba arranca y para su propio servidor, siempre
 * en el mismo puerto, así que no importa el orden en que se ejecuten.
 */

const FAKE_KEY = "clave-de-prueba-que-no-es-de-nadie";
const OTHER_KEY = "otra-clave-de-prueba-distinta";
const PROMPT = "Producto: cepillo de bambú.";

interface Seen {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

let server: http.Server | null = null;
let port = 0;
let seen: Seen[] = [];
let respond: (res: http.ServerResponse) => void;
let ana: AuthUser;
let consoleSpies: MockInstance[] = [];

const ENV_NAMES = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_LOG"] as const;
const savedEnv = ENV_NAMES.map((name) => [name, process.env[name]] as const);

function reply(res: http.ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  // Sin conexiones reutilizadas: cada petición abre la suya y el servidor se puede parar sin esperas.
  res.writeHead(status, { "content-type": contentType, connection: "close" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
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
  content: PROMPT,
  maxTokens: 1_000,
});

async function onlyEntry() {
  const { rows } = await getPool().query<{ status: string; cost: number | null; reserved: number; detail: unknown }>(
    `select status, cost_micros::int as cost, reserved_micros::int as reserved, detail from spend_entries`,
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function startServer(): Promise<void> {
  const created = http.createServer((request, res) => {
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
  // La primera vez, un puerto libre cualquiera; después, siempre ese.
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) =>
      reject(new Error(`No se pudo abrir el servidor de prueba en el puerto ${port}: ${error.message}`, { cause: error }));
    created.once("error", failed);
    created.listen(port, "127.0.0.1", () => {
      created.off("error", failed);
      resolve();
    });
  });
  port = (created.address() as AddressInfo).port;
  server = created;
}

async function stopServer(): Promise<void> {
  const running = server;
  server = null;
  if (!running) return;
  await new Promise<void>((resolve) => {
    running.close(() => resolve());
    running.closeAllConnections();
  });
}

/** Todo lo que se haya escrito por consola durante la prueba, en un solo texto. */
function consoleOutput(): string {
  return consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => inspect(args, { depth: 8 }))).join("\n");
}

beforeEach(async () => {
  await truncateAll();
  ana = await makeUser("colaborador", { name: "Ana" });
  seen = [];
  respond = (res) => reply(res, 200, okMessage);
  await startServer();
  // El cliente real lee de aquí la dirección al crearse: siempre la local, nunca la API de verdad.
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  // Como si alguien hubiera dejado puesto el registro detallado del SDK en el entorno.
  process.env.ANTHROPIC_LOG = "debug";
  consoleSpies = (["debug", "info", "log", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(async () => {
  const written = consoleOutput();
  for (const spy of consoleSpies) spy.mockRestore();
  await stopServer();
  // Pase lo que pase en la prueba, ni la clave ni lo que se le manda al modelo salen por consola.
  expect(written).not.toContain(FAKE_KEY);
  expect(written).not.toContain(OTHER_KEY);
  expect(written).not.toContain("cepillo");
  expect(written).not.toContain("Cuerpo de la regla");
});

afterAll(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
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
      messages: [{ role: "user", content: PROMPT }],
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

  it("cada llamada tiene 10 minutos como mucho y ningún reintento automático", async () => {
    await getGateway().call(req("small"));
    expect(seen[0].headers["x-stainless-timeout"]).toBe("600");
    expect(seen[0].headers["x-stainless-retry-count"]).toBe("0");
  });

  it("aunque el entorno pida el registro detallado del SDK, no se escribe nada de la petición", async () => {
    expect(process.env.ANTHROPIC_LOG).toBe("debug");
    // Con otra clave el cliente del SDK se crea aquí mismo, mientras esta prueba vigila la consola
    // (el SDK se queda con la consola que hay al crearse).
    process.env.ANTHROPIC_API_KEY = OTHER_KEY;
    await getGateway().call(req("small"));
    respond = (res) => reply(res, 500, apiError("api_error"));
    await expect(getGateway().call({ ...req("small"), stepKey: "prueba:cable:2" })).rejects.toBeInstanceOf(LlmCallError);
    expect(seen).toHaveLength(2);
    // Con el nivel fijado en «warn» el SDK no escribe ni el detalle ni los avisos de cada petición.
    expect(consoleOutput()).toBe("");
  });

  it("si la clave del entorno cambia, la siguiente llamada ya usa la nueva", async () => {
    await getGateway().call(req("small"));
    process.env.ANTHROPIC_API_KEY = OTHER_KEY;
    await getGateway().call({ ...req("small"), stepKey: "prueba:cable:2" });
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    await getGateway().call({ ...req("small"), stepKey: "prueba:cable:3" });
    expect(seen.map((request) => request.headers.authorization)).toEqual([
      `Bearer ${FAKE_KEY}`,
      `Bearer ${OTHER_KEY}`,
      `Bearer ${FAKE_KEY}`,
    ]);
  });

  it("un error del servidor no se reintenta solo: una petición, y lo reservado queda apuntado", async () => {
    respond = (res) => reply(res, 500, apiError("api_error"));
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "desconocido", status: 500 });
    expect(seen).toHaveLength(1);
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", cost: row.reserved, detail: { outcome: "unknown" } });
  });

  it("un rechazo por saturación tampoco se reintenta, y la reserva se libera", async () => {
    for (const [status, type] of [
      [429, "rate_limit_error"],
      [529, "overloaded_error"],
    ] as const) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      seen = [];
      respond = (res) => reply(res, status, apiError(type));
      await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "no", status });
      expect(seen).toHaveLength(1);
      expect(await onlyEntry()).toMatchObject({ status: "released", cost: null });
    }
  });

  it("si el servidor corta la conexión a medias, no se sabe si cobró: lo reservado queda apuntado", async () => {
    respond = (res) => res.destroy();
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "desconocido", status: null });
    expect(seen).toHaveLength(1);
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", cost: row.reserved, detail: { outcome: "unknown" } });
  });

  it("un 200 que no es un mensaje no deja la fila a medias: lo reservado queda apuntado", async () => {
    const bodies: Array<[unknown, string]> = [
      [{}, "application/json"],
      [{ id: "msg_sin_usage", type: "message", content: [] }, "application/json"],
      ["<html>Puerta de enlace</html>", "text/html"],
      ["esto no es JSON", "application/json"],
    ];
    for (const [body, contentType] of bodies) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      seen = [];
      respond = (res) => reply(res, 200, body, contentType);
      const attempt = getGateway().call(req("small"));
      await expect(attempt, contentType).rejects.toBeInstanceOf(LlmCallError);
      await expect(attempt, contentType).rejects.toMatchObject({ charged: "desconocido" });
      await expect(attempt, contentType).rejects.not.toThrow(/int[eé]ntalo|de nuevo/i);
      expect(seen).toHaveLength(1);
      const row = await onlyEntry();
      expect(row, contentType).toMatchObject({ status: "settled", cost: row.reserved, detail: { outcome: "unknown" } });
    }
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

  it("si la conexión se rechaza antes de enviar nada, la reserva se libera", async () => {
    await stopServer(); // nadie escucha en el puerto: la conexión se rechaza de verdad
    await expect(getGateway().call(req("small"))).rejects.toMatchObject({ charged: "no", status: null });
    expect(seen).toHaveLength(0);
    expect(await onlyEntry()).toMatchObject({ status: "released", cost: null });
  });
});
