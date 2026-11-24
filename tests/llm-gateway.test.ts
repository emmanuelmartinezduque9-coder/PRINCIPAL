import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getPool } from "@/db/client";
import {
  createGateway,
  getGateway,
  isGrammarTooLarge,
  LlmCallError,
  LlmCapReachedError,
  LlmInvalidOutputError,
  LlmNotConfiguredError,
  LlmRefusalError,
  LlmTruncatedError,
  MAX_OUTPUT_TOKENS,
  type LlmCall,
} from "@/llm/gateway";
import { computeCostMicros, estimateMaxCostMicros } from "@/llm/models";
import type { AuthUser } from "@/server/auth";
import type { Product } from "@/server/products";
import type { RuleSnapshot } from "@/server/rules";
import { setGlobalCap, setUserCap, SpendCapError, spendSummary } from "@/server/spend";
import {
  fakeApiError,
  fakeConnectionError,
  fakeMessages,
  fakeSdkValidationError,
  fakeTimeoutError,
} from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let dueno: AuthUser;
let ana: AuthUser;
let producto: Product;

const RETRY_LATER = "Claude no ha respondido. Inténtalo de nuevo dentro de unos minutos.";
const INVALID_REQUEST = "La petición a Claude no es válida; se repite sola.";
const UNREADABLE_ANSWER = "Claude ha devuelto una respuesta que no se entiende; se repite sola.";
const UNEXPECTED_FAILURE = "La llamada a Claude ha fallado de forma inesperada; se repite sola.";
const SUGGESTS_RETRY = /int[eé]ntalo|de nuevo/i;

const reglas: RuleSnapshot[] = [
  { slug: "angulos-de-venta", version: 1, body: "Cuerpo de la regla de ángulos de venta." },
];
const otraRegla: RuleSnapshot = { slug: "angulos-ejemplos", version: 3, body: "Ejemplos para aprender el criterio." };

const req = (user: AuthUser, product: Product | null): LlmCall<unknown> => ({
  tier: "small",
  stepKey: "angulos:proponer",
  userId: user.id,
  productId: product?.id ?? null,
  rules: reglas,
  instructions: "instrucciones del paso",
  content: "Producto: cepillo de bambú.",
  maxTokens: 1_000,
});

interface EntryRow {
  status: string;
  userId: number;
  productId: number | null;
  provider: string;
  model: string | null;
  stepKey: string;
  reservedMicros: number;
  costMicros: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  createdAt: Date;
  detail: Record<string, unknown> | null;
}

const ENTRY_COLUMNS = `status, user_id::int as "userId", product_id::int as "productId", provider, model,
  step_key as "stepKey", reserved_micros::int as "reservedMicros", cost_micros::int as "costMicros",
  input_tokens as "inputTokens", output_tokens as "outputTokens", cache_read_tokens as "cacheReadTokens",
  cache_write_tokens as "cacheWriteTokens", created_at as "createdAt", detail`;

async function entry(id: number): Promise<EntryRow> {
  const { rows } = await getPool().query<EntryRow>(`select ${ENTRY_COLUMNS} from spend_entries where id = $1`, [id]);
  return rows[0];
}

async function allEntries(): Promise<EntryRow[]> {
  const { rows } = await getPool().query<EntryRow>(`select ${ENTRY_COLUMNS} from spend_entries order by id`);
  return rows;
}

async function onlyEntry(): Promise<EntryRow> {
  const rows = await allEntries();
  expect(rows).toHaveLength(1);
  return rows[0];
}

const savedKey = process.env.ANTHROPIC_API_KEY;

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana" });
  producto = await makeProduct(ana);
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe("pasarela a Claude: la llamada", () => {
  it("llama al modelo del nivel pedido y apunta el coste real contra producto y persona", async () => {
    const { client, calls } = fakeMessages([{ text: "hola", usage: { inputTokens: 10_000, outputTokens: 2_000 } }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "small" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 1_000 });
    expect(r.text).toBe("hola");
    expect(r.data).toBeNull();
    expect(r.model).toBe("claude-haiku-5-5");
    expect(r.usage).toEqual({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(r.costMicros).toBe(2_000);
    expect(await entry(r.spendEntryId)).toMatchObject({
      status: "settled",
      userId: ana.id,
      productId: producto.id,
      provider: "claude",
      stepKey: "angulos:proponer",
      costMicros: 2_000,
      model: "claude-haiku-5-5",
      inputTokens: 10_000,
      outputTokens: 2_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    // El resumen de gasto cuenta ya el coste real, no lo reservado.
    expect((await spendSummary(ana)).spentMicros).toBe(2_000);
  });

  it("el nivel pequeño va con esfuerzo bajo y sin modelo de reserva (Haiku no lo admite)", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }]);
    await createGateway({ client }).call({ ...req(ana, producto), tier: "small" });
    expect(calls[0].output_config).toEqual({ effort: "low" });
    expect(calls[0]).not.toHaveProperty("fallbacks");
    expect(calls[0]).not.toHaveProperty("betas");
  });

  it("el nivel mediano va a Sonnet con esfuerzo medio y modelo de reserva del servidor para los rechazos", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "medium" });
    expect(calls[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      output_config: { effort: "medium" },
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    expect(r.model).toBe("claude-sonnet-5-5");
  });

  it("no manda parámetros que estos modelos rechazan ni pide respuesta en flujo", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }, { text: "ok" }]);
    const gateway = createGateway({ client });
    await gateway.call({ ...req(ana, producto), tier: "small" });
    await gateway.call({ ...req(ana, producto), tier: "medium" });
    for (const call of calls) {
      for (const banned of ["temperature", "top_p", "top_k", "thinking", "tool_choice", "tools", "stream"]) {
        expect(call).not.toHaveProperty(banned);
      }
      // Sin relleno previo: el único mensaje es el del usuario.
      expect(call.messages).toEqual([{ role: "user", content: "Producto: cepillo de bambú." }]);
    }
  });

  it("las reglas van primero en system, con marca de caché, y las instrucciones después", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }]);
    await createGateway({ client }).call(req(ana, producto));
    const system = calls[0].system as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(system).toHaveLength(2);
    expect(system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    expect(system[0].text).toContain(reglas[0].body);
    expect(system.at(-1)!.text).toBe("instrucciones del paso");
    expect(system.at(-1)).not.toHaveProperty("cache_control");
  });

  it("el mismo conjunto de reglas produce exactamente el mismo bloque (la caché depende de ello)", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }, { text: "ok" }]);
    const gateway = createGateway({ client });
    await gateway.call({ ...req(ana, producto), rules: [reglas[0], otraRegla], stepKey: "paso:a", instructions: "uno" });
    await gateway.call({ ...req(dueno, null), rules: [otraRegla, reglas[0]], stepKey: "paso:b", instructions: "dos" });
    const first = (calls[0].system as Array<{ text: string }>)[0].text;
    const second = (calls[1].system as Array<{ text: string }>)[0].text;
    expect(second).toBe(first);
    // Ordenadas por slug, y sin nada que cambie de una llamada a otra (persona, paso, fecha).
    expect(first.indexOf(reglas[0].body)).toBeLessThan(first.indexOf(otraRegla.body));
    expect(first).not.toContain("paso:a");
    expect(first).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("devuelve qué versión de cada regla se usó", async () => {
    const { client } = fakeMessages([{ text: "ok" }, { text: "ok" }]);
    const gateway = createGateway({ client });
    const r = await gateway.call(req(ana, producto));
    expect(r.ruleVersions).toEqual({ "angulos-de-venta": 1 });
    const both = await gateway.call({ ...req(ana, producto), rules: [otraRegla, reglas[0]] });
    expect(both.ruleVersions).toEqual({ "angulos-de-venta": 1, "angulos-ejemplos": 3 });
    expect((await entry(both.spendEntryId)).detail).toMatchObject({
      tier: "small",
      stopReason: "end_turn",
      ruleVersions: { "angulos-de-venta": 1, "angulos-ejemplos": 3 },
    });
  });

  it("sin reglas, system lleva solo las instrucciones y no marca caché", async () => {
    const { client, calls } = fakeMessages([{ text: "ok" }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), rules: [] });
    expect(calls[0].system).toEqual([{ type: "text", text: "instrucciones del paso" }]);
    expect(r.ruleVersions).toEqual({});
  });

  it("apunta lo leído y lo escrito en caché, y lo cobra a su precio", async () => {
    const usage = { inputTokens: 500, outputTokens: 1_000, cacheReadTokens: 6_000, cacheWriteTokens: 2_000 };
    const { client } = fakeMessages([{ text: "ok", usage }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "medium" });
    // 500 × 2 + 1 000 × 10 + 6 000 × 0,10 + 2 000 × 2,50 micro-dólares.
    expect(r.costMicros).toBe(1_000 + 10_000 + 600 + 5_000);
    expect(await entry(r.spendEntryId)).toMatchObject({ costMicros: 16_600, cacheReadTokens: 6_000, cacheWriteTokens: 2_000 });
  });

  it("rechaza una petición mal formada antes de reservar o llamar", async () => {
    const { client, calls } = fakeMessages([]);
    const gateway = createGateway({ client });
    const base = req(ana, producto);
    await expect(gateway.call({ ...base, maxTokens: 0 })).rejects.toThrow(/tokens/);
    await expect(gateway.call({ ...base, maxTokens: 1.5 })).rejects.toThrow(/tokens/);
    await expect(gateway.call({ ...base, maxTokens: MAX_OUTPUT_TOKENS + 1 })).rejects.toThrow(/tokens/);
    await expect(gateway.call({ ...base, stepKey: "" })).rejects.toThrow(/paso/);
    await expect(gateway.call({ ...base, instructions: "  " })).rejects.toThrow(/instrucciones/);
    await expect(gateway.call({ ...base, content: "" })).rejects.toThrow(/contenido/);
    await expect(gateway.call({ ...base, content: [] })).rejects.toThrow(/contenido/);
    await expect(gateway.call({ ...base, rules: [reglas[0], { ...reglas[0], version: 2 }] })).rejects.toThrow(/repetida/);
    await expect(gateway.call({ ...base, tier: "grande" as never })).rejects.toThrow(/Nivel/);
    expect(calls).toHaveLength(0);
    expect(await allEntries()).toHaveLength(0);
  });
});

describe("pasarela a Claude: reserva antes de llamar", () => {
  it("mientras el modelo responde, el peor caso ya está reservado y confirmado en el libro", async () => {
    const { client } = fakeMessages([{ text: "hola", usage: { inputTokens: 100, outputTokens: 50 } }]);
    let during: EntryRow[] = [];
    const spy = {
      create: async (...args: Parameters<typeof client.create>) => {
        during = await allEntries(); // otra conexión: solo ve lo ya confirmado
        return client.create(...args);
      },
    } as unknown as typeof client;

    const request = { ...req(ana, producto), maxTokens: 2_000 };
    const r = await createGateway({ client: spy }).call(request);

    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ status: "reserved", costMicros: null, userId: ana.id, model: "claude-haiku-5-5" });
    // Toda la entrada a precio de escritura en caché y toda la salida permitida.
    const inputChars = reglas[0].body.length + request.instructions.length + (request.content as string).length;
    expect(during[0].reservedMicros).toBeGreaterThanOrEqual(estimateMaxCostMicros("claude-haiku-5-5", inputChars, 2_000));
    expect(during[0].reservedMicros).toBeGreaterThan(r.costMicros);
    expect(await entry(r.spendEntryId)).toMatchObject({ status: "settled", costMicros: r.costMicros });
  });

  it("el nivel mediano reserva también el intento del modelo de reserva", async () => {
    const { client } = fakeMessages([{ text: "a" }, { text: "b" }]);
    const gateway = createGateway({ client });
    const small = await gateway.call({ ...req(ana, producto), tier: "small" });
    const medium = await gateway.call({ ...req(ana, producto), tier: "medium" });
    const inputChars = reglas[0].body.length + "instrucciones del paso".length + "Producto: cepillo de bambú.".length;
    const oneAttempt = estimateMaxCostMicros("claude-sonnet-5-5", inputChars, 1_000);
    expect((await entry(medium.spendEntryId)).reservedMicros).toBeGreaterThanOrEqual(2 * oneAttempt);
    expect((await entry(small.spendEntryId)).reservedMicros).toBeLessThan(oneAttempt);
  });

  it("una foto reserva un margen fijo, no el tamaño de su archivo", async () => {
    const { client } = fakeMessages([{ text: "a" }, { text: "b" }]);
    const gateway = createGateway({ client });
    const photo = {
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: "A".repeat(3_000_000) },
    };
    const text = { type: "text" as const, text: "Producto: cepillo de bambú." };
    const withPhoto = await gateway.call({ ...req(ana, producto), content: [photo, text] });
    const withoutPhoto = await gateway.call({ ...req(ana, producto), content: [text] });
    const extra = (await entry(withPhoto.spendEntryId)).reservedMicros - (await entry(withoutPhoto.spendEntryId)).reservedMicros;
    // Unos 5 000 tokens de entrada como mucho por foto, lejos del millón que saldría de contar sus letras.
    expect(extra).toBeGreaterThanOrEqual(computeCostMicros("claude-haiku-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 5_000 }));
    expect(extra).toBeLessThan(2_000);
  });

  it("por encima del tope se niega y NO llama al modelo", async () => {
    const { client, calls } = fakeMessages([{ text: "no debería llegar" }]);
    const gateway = createGateway({ client });
    await setUserCap(dueno, ana.id, 0);
    const attempt = gateway.call(req(ana, producto));
    await expect(attempt).rejects.toBeInstanceOf(LlmCapReachedError);
    await expect(attempt).rejects.toMatchObject({ scope: "persona", message: "Has alcanzado tu tope mensual de gasto." });
    expect(calls).toHaveLength(0);
    expect(await allEntries()).toHaveLength(0);
  });

  it("el error de tope no lleva cuánto se ha gastado ni cuál es el tope (son datos de todos)", async () => {
    const { client, calls } = fakeMessages([{ text: "no debería llegar" }]);
    await setGlobalCap(dueno, 0);
    const error: unknown = await createGateway({ client })
      .call(req(ana, producto))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmCapReachedError);
    expect(error).not.toBeInstanceOf(SpendCapError);
    expect(error).toMatchObject({ scope: "global", message: "Se ha alcanzado el tope mensual de gasto." });
    expect(Object.keys(error as object).sort()).toEqual(["name", "scope"]);
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toMatch(/micros/i);
    expect(calls).toHaveLength(0);
  });

  it("si el peor caso no cabe en lo que queda, se niega aunque el coste real fuese a caber", async () => {
    const { client, calls } = fakeMessages([{ text: "barato", usage: { inputTokens: 10, outputTokens: 10 } }]);
    // Quedan 100 micro-dólares; la llamada real costaría 6, pero el peor caso son más de 500.
    await setUserCap(dueno, ana.id, 100);
    await expect(createGateway({ client }).call(req(ana, producto))).rejects.toBeInstanceOf(LlmCapReachedError);
    expect(calls).toHaveLength(0);
  });

  it("una persona desactivada o inexistente no gasta ni llama", async () => {
    const { client, calls } = fakeMessages([{ text: "no" }]);
    await expect(createGateway({ client }).call({ ...req(ana, producto), userId: 999_999 })).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toHaveLength(0);
    expect(await allEntries()).toHaveLength(0);
  });

  it("la fecha de la reserva es la del servidor; solo las pruebas pueden fijarla al crear la pasarela", async () => {
    const { client } = fakeMessages([{ text: "a" }, { text: "b" }]);
    const real = await createGateway({ client }).call(req(ana, producto));
    expect(Math.abs((await entry(real.spendEntryId)).createdAt.getTime() - Date.now())).toBeLessThan(60_000);

    const fixed = new Date("2026-03-15T12:00:00Z");
    const past = await createGateway({ client, now: () => fixed }).call(req(ana, producto));
    expect((await entry(past.spendEntryId)).createdAt.toISOString()).toBe(fixed.toISOString());
  });
});

describe("pasarela a Claude: cuando la llamada falla", () => {
  it("si la API rechaza la petición sin procesarla, la reserva se libera y no se cobra", async () => {
    for (const status of [400, 401, 403, 404, 413, 422]) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client, calls } = fakeMessages([{ error: fakeApiError(status) }]);
      const attempt = createGateway({ client }).call(req(ana, null));
      await expect(attempt).rejects.toBeInstanceOf(LlmCallError);
      await expect(attempt).rejects.toMatchObject({ charged: "no", status });
      expect(calls).toHaveLength(1);
      expect(await onlyEntry()).toMatchObject({ status: "released", costMicros: null });
      expect((await spendSummary(ana)).spentMicros).toBe(0);
    }
  });

  it("sin créditos en la API (402, o 400 «credit balance is too low») no es un fallo: pausa como un tope, sin cobrar", async () => {
    const { NO_CREDIT } = await import("@/llm/gateway");
    for (const status of [402, 400]) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const error = fakeApiError(status);
      if (status === 400) error.message = "400 Your credit balance is too low to access the Anthropic API.";
      const { client } = fakeMessages([{ error }]);
      const attempt = createGateway({ client }).call(req(ana, null));
      await expect(attempt).rejects.toMatchObject({ name: "LlmCapReachedError", scope: "saldo", message: NO_CREDIT });
      expect(await onlyEntry()).toMatchObject({ status: "released", costMicros: null });
    }
  });

  it("si la API está saturada y rechaza la petición antes de empezar, la reserva también se libera", async () => {
    for (const status of [409, 429, 503, 529]) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client } = fakeMessages([{ error: fakeApiError(status) }]);
      await expect(createGateway({ client }).call(req(ana, null)), String(status)).rejects.toMatchObject({
        charged: "no",
        status,
        message: "Claude no ha respondido. Inténtalo de nuevo dentro de unos minutos.",
      });
      expect(await onlyEntry(), String(status)).toMatchObject({ status: "released", costMicros: null });
      expect((await spendSummary(ana)).spentMicros).toBe(0);
    }
  });

  it("si la conexión se rechaza antes de enviar nada, la reserva se libera", async () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client } = fakeMessages([{ error: fakeConnectionError(code) }]);
      await expect(createGateway({ client }).call(req(ana, null))).rejects.toMatchObject({
        charged: "no",
        status: null,
        message: RETRY_LATER,
      });
      expect(await onlyEntry()).toMatchObject({ status: "released", costMicros: null });
    }
  });

  it("si el propio SDK para la petición antes de enviarla, la reserva se libera y no se invita a reintentar", async () => {
    const { client } = fakeMessages([{ error: fakeSdkValidationError() }]);
    const error = (await createGateway({ client })
      .call(req(ana, null))
      .catch((caught: unknown) => caught)) as LlmCallError;
    expect(error).toBeInstanceOf(LlmCallError);
    expect(error).toMatchObject({ charged: "no", status: null, message: INVALID_REQUEST });
    expect(error.message).not.toMatch(SUGGESTS_RETRY);
    expect(await onlyEntry()).toMatchObject({ status: "released", costMicros: null });
  });

  it("si no se sabe si el proveedor llegó a cobrar, NO se libera: se apunta lo reservado y se marca", async () => {
    // Lo pasajero invita a volver a intentarlo más tarde; lo que no se reconoce, a avisar al dueño.
    const unknowns: Array<[string, Error, number | null, string]> = [
      ["error 500", fakeApiError(500), 500, RETRY_LATER],
      ["pasarela 502", fakeApiError(502), 502, RETRY_LATER],
      ["pasarela agotada 504", fakeApiError(504), 504, RETRY_LATER],
      ["tiempo agotado en el servidor 408", fakeApiError(408), 408, RETRY_LATER],
      ["tiempo agotado", fakeTimeoutError(), null, RETRY_LATER],
      ["conexión cortada a medias", fakeConnectionError("ECONNRESET"), null, RETRY_LATER],
      ["un error cualquiera", new Error("algo raro"), null, UNEXPECTED_FAILURE],
    ];
    for (const [label, error, status, message] of unknowns) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client } = fakeMessages([{ error }]);
      const attempt = createGateway({ client }).call(req(ana, null));
      await expect(attempt, label).rejects.toBeInstanceOf(LlmCallError);
      await expect(attempt, label).rejects.toMatchObject({ charged: "desconocido", status, message });
      const row = await onlyEntry();
      expect(row, label).toMatchObject({ status: "settled", costMicros: row.reservedMicros });
      expect(row.detail, label).toMatchObject({ outcome: "unknown", tier: "small" });
      expect((await spendSummary(ana)).spentMicros, label).toBe(row.reservedMicros);
    }
  });

  it("el error que sale no arrastra la respuesta ni las cabeceras del proveedor en su mensaje", async () => {
    const { client } = fakeMessages([{ error: fakeApiError(500) }]);
    const error = (await createGateway({ client })
      .call(req(ana, null))
      .catch((caught: unknown) => caught)) as LlmCallError;
    expect(error.message).toBe(RETRY_LATER);
    expect(error.cause).toBeInstanceOf(Error);
    const row = await onlyEntry();
    expect(row.detail).toMatchObject({ error: { name: "InternalServerError", status: 500 } });
    expect(JSON.stringify(row.detail)).not.toContain("Error simulado");
  });

  it("lo que no se arregla reintentando no invita a reintentar: dice que se avise al dueño", async () => {
    const messages: Array<[number, string]> = [
      [400, INVALID_REQUEST],
      [403, INVALID_REQUEST],
      [404, INVALID_REQUEST],
      [413, INVALID_REQUEST],
      [422, INVALID_REQUEST],
      [401, "Claude no acepta la clave configurada (ANTHROPIC_API_KEY)."],
    ];
    for (const [status, message] of messages) {
      const { client } = fakeMessages([{ error: fakeApiError(status) }]);
      const error = (await createGateway({ client })
        .call(req(ana, null))
        .catch((caught: unknown) => caught)) as LlmCallError;
      expect(error.message, String(status)).toBe(message);
      expect(error.message, String(status)).not.toMatch(SUGGESTS_RETRY);
    }
  });

  it("una respuesta que no se entiende no deja la fila a medias: se apunta lo reservado y se marca", async () => {
    const valid = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "hola" }],
      stop_reason: "end_turn",
      stop_details: null,
      usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    };
    const malformed: Array<[string, unknown]> = [
      ["sin usage", { ...valid, usage: undefined }],
      ["usage nulo", { ...valid, usage: null }],
      ["sin contenido", { ...valid, content: undefined }],
      ["un bloque nulo en el contenido", { ...valid, content: [null] }],
      ["sin modelo", { ...valid, model: undefined }],
      ["intentos que no son una lista", { ...valid, usage: { ...valid.usage, iterations: "tres" } }],
      // Sin cuenta de tokens no se puede saber el coste: nunca se liquida a 0.
      ["usage vacío", { ...valid, usage: {} }],
      ["usage que es una lista", { ...valid, usage: [] }],
      ["tokens nulos", { ...valid, usage: { input_tokens: null, output_tokens: null } }],
      ["sin tokens de salida", { ...valid, usage: { input_tokens: 10 } }],
      ["sin tokens de entrada", { ...valid, usage: { output_tokens: 10 } }],
      ["tokens en texto", { ...valid, usage: { input_tokens: "10", output_tokens: "10" } }],
      [
        "un intento sin tokens",
        { ...valid, usage: { ...valid.usage, iterations: [{ type: "message", model: "claude-haiku-5-5" }] } },
      ],
      ["un objeto vacío", {}],
      ["nada", null],
      ["un texto", "200 OK"],
    ];
    for (const [label, raw] of malformed) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client } = fakeMessages([{ raw }]);
      const attempt = createGateway({ client }).call(req(ana, null));
      await expect(attempt, label).rejects.toBeInstanceOf(LlmCallError);
      // Reintentar no lo arregla y ya se ha apuntado un gasto: que avise al dueño.
      await expect(attempt, label).rejects.toMatchObject({ charged: "desconocido", status: null, message: UNREADABLE_ANSWER });
      const row = await onlyEntry();
      expect(row.reservedMicros, label).toBeGreaterThan(0);
      expect(row, label).toMatchObject({ status: "settled", costMicros: row.reservedMicros });
      expect(row.detail, label).toMatchObject({ outcome: "unknown", error: { name: "MalformedResponse", status: null } });
      expect((await spendSummary(ana)).spentMicros, label).toBe(row.reservedMicros);
    }
  });

  it("si los tokens de la respuesta son números imposibles, no se inventa un coste: se apunta lo reservado", async () => {
    const { client } = fakeMessages([
      {
        raw: {
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: "hola" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1.5, output_tokens: -5 },
        },
      },
    ]);
    const r = await createGateway({ client }).call(req(ana, null));
    const row = await entry(r.spendEntryId);
    expect(r.costMicros).toBe(row.reservedMicros);
    expect(row).toMatchObject({ status: "settled", costMicros: row.reservedMicros, inputTokens: null, outputTokens: null });
    expect(row.detail).toMatchObject({ outcome: "unpriced" });
  });
});

describe("pasarela a Claude: respuestas que no sirven se cobran igual", () => {
  it("un rechazo del modelo se cobra y se informa como LlmRefusalError", async () => {
    const { client } = fakeMessages([
      { stopReason: "refusal", refusalCategory: "bio", usage: { inputTokens: 10_000, outputTokens: 0 } },
    ]);
    const attempt = createGateway({ client }).call(req(ana, producto));
    await expect(attempt).rejects.toBeInstanceOf(LlmRefusalError);
    await expect(attempt).rejects.toMatchObject({ category: "bio", message: "Claude ha rechazado esta petición." });
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", costMicros: 1_000, inputTokens: 10_000 });
    expect(row.detail).toMatchObject({ stopReason: "refusal", refusalCategory: "bio" });
  });

  it("una respuesta cortada por max_tokens se cobra y se informa como LlmTruncatedError", async () => {
    const { client } = fakeMessages([
      { text: "a medias", stopReason: "max_tokens", usage: { inputTokens: 10_000, outputTokens: 1_000 } },
    ]);
    await expect(createGateway({ client }).call(req(ana, producto))).rejects.toBeInstanceOf(LlmTruncatedError);
    const row = await onlyEntry();
    expect(row).toMatchObject({ status: "settled", costMicros: 1_500, outputTokens: 1_000 });
    expect(row.detail).toMatchObject({ stopReason: "max_tokens" });
  });

  it("si la petición no cabe en la ventana del modelo, también cuenta como cortada", async () => {
    const { client } = fakeMessages([{ stopReason: "model_context_window_exceeded", usage: { inputTokens: 10 } }]);
    await expect(createGateway({ client }).call(req(ana, producto))).rejects.toBeInstanceOf(LlmTruncatedError);
    expect(await onlyEntry()).toMatchObject({ status: "settled" });
  });

  it("con schema pide salida estructurada y devuelve los datos validados", async () => {
    const schema = z.object({ ok: z.boolean() });
    const { client, calls } = fakeMessages([{ text: '{"ok":true}', usage: { inputTokens: 10_000, outputTokens: 2_000 } }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), schema });
    expect(r.data).toEqual({ ok: true });
    expect(r.text).toBe('{"ok":true}');
    expect(calls[0].output_config).toMatchObject({
      effort: "low",
      format: { type: "json_schema", schema: { type: "object", required: ["ok"] } },
    });
    expect(await entry(r.spendEntryId)).toMatchObject({ status: "settled", costMicros: 2_000 });
  });

  it("con schema, si los datos no validan, falla tras cobrar", async () => {
    const schema = z.object({ ok: z.boolean() });
    for (const text of ['{"ok":"sí"}', "esto no es JSON", ""]) {
      await truncateAll();
      ana = await makeUser("colaborador", { name: "Ana" });
      const { client } = fakeMessages([{ text, usage: { inputTokens: 10_000, outputTokens: 2_000 } }]);
      const attempt = createGateway({ client }).call({ ...req(ana, null), schema });
      await expect(attempt).rejects.toBeInstanceOf(LlmInvalidOutputError);
      expect(await onlyEntry()).toMatchObject({ status: "settled", costMicros: 2_000 });
    }
  });
});

describe("pasarela a Claude: el coste real, sin maquillar", () => {
  it("si el servidor pasó a un modelo de reserva, cobra cada intento a la tarifa de su modelo", async () => {
    const { client } = fakeMessages([
      {
        text: "respuesta del modelo de reserva",
        model: "claude-sonnet-5",
        // Lo de arriba describe solo el intento que respondió; la cuenta completa está en los intentos.
        usage: { inputTokens: 400, outputTokens: 1_000, cacheReadTokens: 10_000 },
        attempts: [
          { type: "message", model: "claude-sonnet-5-5", usage: { inputTokens: 500, cacheWriteTokens: 10_000 } },
          {
            type: "fallback_message",
            model: "claude-sonnet-5",
            usage: { inputTokens: 400, outputTokens: 1_000, cacheReadTokens: 10_000 },
          },
        ],
      },
    ]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "medium" });

    const declined = 500 * 2 + 10_000 * 2.5; // Sonnet 5.5: entrada y escritura en caché
    const served = 400 * 2 + 1_000 * 10 + 10_000 * 0.2; // Sonnet 5: su lectura de caché es más cara
    expect(r.costMicros).toBe(declined + served);
    expect(r.model).toBe("claude-sonnet-5");
    expect(r.text).toBe("respuesta del modelo de reserva");
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 1_000, cacheReadTokens: 10_000, cacheWriteTokens: 10_000 });
    const row = await entry(r.spendEntryId);
    expect(row).toMatchObject({ status: "settled", model: "claude-sonnet-5", costMicros: declined + served, inputTokens: 900 });
    expect(row.detail).toMatchObject({
      attempts: [
        { type: "message", model: "claude-sonnet-5-5", costMicros: declined },
        { type: "fallback_message", model: "claude-sonnet-5", costMicros: served },
      ],
    });
  });

  it("si el coste real supera lo reservado, se apunta el real y se marca el exceso", async () => {
    // Muchos más tokens de los que cabría esperar de una petición tan corta.
    const { client } = fakeMessages([{ text: "ok", usage: { inputTokens: 50_000, outputTokens: 1_000 } }]);
    const r = await createGateway({ client }).call(req(ana, producto));
    const row = await entry(r.spendEntryId);
    expect(r.costMicros).toBe(5_500);
    expect(row.reservedMicros).toBeLessThan(5_500);
    expect(row).toMatchObject({ status: "settled", costMicros: 5_500 });
    expect(row.detail).toMatchObject({ overrun: true });
    expect((await spendSummary(ana)).spentMicros).toBe(5_500);
  });

  it("una llamada normal no lleva marca de exceso ni de resultado desconocido", async () => {
    const { client } = fakeMessages([{ text: "ok", usage: { inputTokens: 10, outputTokens: 10 } }]);
    const r = await createGateway({ client }).call(req(ana, producto));
    const { detail } = await entry(r.spendEntryId);
    expect(detail).not.toHaveProperty("overrun");
    expect(detail).not.toHaveProperty("outcome");
    expect(detail).not.toHaveProperty("attempts");
  });

  it("si responde un modelo del que no se conoce el precio, se apunta lo reservado y se marca", async () => {
    const usage = { inputTokens: 10_000, outputTokens: 2_000 };
    const { client } = fakeMessages([{ text: "ok", model: "claude-opus-9", usage }]);
    const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "medium" });
    const row = await entry(r.spendEntryId);
    expect(r.text).toBe("ok");
    expect(r.costMicros).toBe(row.reservedMicros);
    expect(row).toMatchObject({ status: "settled", model: "claude-opus-9", costMicros: row.reservedMicros, inputTokens: 10_000 });
    expect(row.detail).toMatchObject({ outcome: "unpriced" });
  });

  it("con la inferencia fijada a Estados Unidos cobra el recargo del 10 %", async () => {
    const usage = { inputTokens: 10_000, outputTokens: 2_000 };
    const { client } = fakeMessages([
      { text: "ok", usage, inferenceGeo: "us" },
      { text: "ok", usage, inferenceGeo: "global" },
    ]);
    const gateway = createGateway({ client });
    const us = await gateway.call(req(ana, producto));
    const global = await gateway.call(req(ana, producto));
    expect(us.costMicros).toBe(2_200);
    expect(global.costMicros).toBe(2_000);
    expect((await entry(us.spendEntryId)).detail).toMatchObject({ inferenceGeo: "us" });
  });
});

describe("pasarela a Claude: la clave", () => {
  it("sin ANTHROPIC_API_KEY, getGateway().call lanza LlmNotConfiguredError sin reservar", async () => {
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = value;
      const attempt = getGateway().call(req(ana, producto));
      await expect(attempt).rejects.toBeInstanceOf(LlmNotConfiguredError);
      await expect(attempt).rejects.toThrow("Falta la clave de Claude (ANTHROPIC_API_KEY).");
    }
    expect(await allEntries()).toHaveLength(0);
  });

  it("getGateway devuelve siempre la misma pasarela", () => {
    expect(getGateway()).toBe(getGateway());
  });

  it("con un cliente inyectado no hace falta la clave (las pruebas nunca llaman a la API real)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { client } = fakeMessages([{ text: "ok" }]);
    await expect(createGateway({ client }).call(req(ana, producto))).resolves.toMatchObject({ text: "ok" });
  });
});

describe("esquema demasiado grande para la API (lote 8, 24/11/2026)", () => {
  it("si la API rechaza la gramática del esquema, se repite con el esquema en el texto y se valida igual", async () => {
    const grammar = new Anthropic.BadRequestError(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." } },
      "400 The compiled grammar is too large, which would cause performance issues.",
      new Headers(),
    );
    const { client, calls } = fakeMessages([{ error: grammar }, { text: 'Aquí va:\n```json\n{"idea":"ok","planos":2}\n```', usage: { inputTokens: 100, outputTokens: 20 } }]);
    const schema = z.object({ idea: z.string(), planos: z.number() });
    const result = await createGateway({ client, mac: null }).call({ ...req(ana, producto), schema });
    expect(result.data).toEqual({ idea: "ok", planos: 2 });
    expect(calls).toHaveLength(2);
    // La primera con la gramática; la segunda sin ella y con el esquema en las instrucciones.
    expect(calls[0].output_config?.format).toBeTruthy();
    expect(calls[1].output_config?.format).toBeUndefined();
    expect(JSON.stringify(calls[1].system)).toContain("cumpla este esquema JSON");
    expect(isGrammarTooLarge(new Error("x", { cause: grammar }))).toBe(true);
    expect(isGrammarTooLarge(new Error("Claude no ha respondido"))).toBe(false);
  });
});
