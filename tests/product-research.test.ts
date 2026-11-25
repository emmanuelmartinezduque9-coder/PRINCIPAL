import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getPool } from "@/db/client";
import { createGateway, trailingJson, WEB_SEARCH_MICROS, webSourcesOf } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { listResearch, queriesOf, requestResearch, runResearch, WAITING_FOR_MAC } from "@/server/product-research";
import { getDb, schema } from "@/db/client";
import { appendTaskChunk, claimTask, createAgentToken, finishTask } from "@/server/agent";
import { updateProduct } from "@/server/products";
import { seedRules } from "@/server/rules";
import { fakeMessages, type FakeReply } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const SEEN = "https://www.tiktok.com/@shop/video/1";

function searched(text: string, extra: Partial<FakeReply> = {}): FakeReply {
  return {
    blocks: [
      { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: SEEN, title: "t", encrypted_content: "e", page_age: null }] },
      { type: "web_fetch_tool_result", tool_use_id: "f1", content: { type: "web_fetch_result", url: "https://www.amazon.de/bestsellers", content: {} } },
    ],
    text,
    webSearches: 3,
    usage: { inputTokens: 10_000, outputTokens: 1_000 },
    ...extra,
  };
}

describe("pasarela con búsqueda en internet", () => {
  let ana: AuthUser;
  beforeEach(async () => {
    await truncateAll();
    ana = await makeUser("colaborador");
  });

  it("saca el JSON del final y las direcciones que de verdad vio", () => {
    expect(trailingJson('Texto [cita]\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(trailingJson('Resultado: {"a": {"b": 2}} fin')).toBe('{"a": {"b": 2}}');
    expect(webSourcesOf(searched("x").blocks)).toEqual([SEEN, "https://www.amazon.de/bestsellers"]);
    expect(webSourcesOf([{ type: "text", text: "https://no-cuenta.example" }])).toEqual([]);
  });

  it("pide las herramientas, cobra cada búsqueda y continúa una respuesta en pausa", async () => {
    const { client, calls } = fakeMessages([
      searched("Buscando…", { stopReason: "pause_turn" }),
      { text: '```json\n{"ok":true}\n```', webSearches: 1, usage: { inputTokens: 100, outputTokens: 10 } },
    ]);
    const result = await createGateway({ client }).call({
      tier: "medium",
      stepKey: "prueba:web",
      userId: ana.id,
      productId: null,
      rules: [],
      instructions: "Busca.",
      content: "¿Qué se vende?",
      maxTokens: 2_000,
      schema: z.object({ ok: z.boolean() }),
      web: { searches: 4, fetches: 2, country: "DE" },
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.webSources).toContain(SEEN);
    expect(calls).toHaveLength(2);
    expect(calls[0].tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "DE" } },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, max_content_tokens: 8_000 },
    ]);
    // La segunda vuelta lleva la respuesta en pausa como turno del asistente.
    expect(calls[1].messages.at(-1)?.role).toBe("assistant");
    // Dos apuntes en el libro; las búsquedas se cobran aparte de los tokens.
    const { rows } = await getPool().query<{ cost: string; detail: { webSearches?: number } }>("select cost_micros as cost, detail from spend_entries order by id");
    expect(rows).toHaveLength(2);
    expect(rows[0].detail.webSearches).toBe(3);
    // Sonnet 5.5: 10 000 × 2 $/M + 1 000 × 10 $/M = 0,03 $ = 30 000 µ$, más 3 búsquedas.
    expect(Number(rows[0].cost)).toBe(30_000 + 3 * WEB_SEARCH_MICROS);
    expect(result.costMicros).toBe(Number(rows[0].cost) + Number(rows[1].cost));
  });

  it("con búsqueda pide la respuesta en flujo (la conexión no se corta a los 60 s)", async () => {
    const { client } = fakeMessages([searched('```json\n{"ok":true}\n```')]);
    let streamed = 0;
    const withStream = {
      ...client,
      stream: (params: unknown) => {
        streamed += 1;
        return { finalMessage: () => client.create(params as never) };
      },
    } as unknown as typeof client;
    const call = (web: boolean) =>
      createGateway({ client: withStream }).call({ tier: "medium", stepKey: "x", userId: ana.id, productId: null, rules: [], instructions: "x", content: "x", maxTokens: 100, ...(web ? { web: { searches: 1, fetches: 0 } } : {}) });
    await call(true);
    expect(streamed).toBe(1);
  });

  it("rechaza una búsqueda mal configurada sin llamar", async () => {
    const { client, calls } = fakeMessages([]);
    await expect(
      createGateway({ client }).call({ tier: "medium", stepKey: "x", userId: ana.id, productId: null, rules: [], instructions: "x", content: "x", maxTokens: 10, web: { searches: 0, fetches: 0 } }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("buscar nicho, ángulo o audiencia diferente (con cifras del Mac)", () => {
  let dueno: AuthUser;
  beforeEach(async () => {
    await truncateAll();
    await seedRules();
    dueno = await makeUser("dueno");
  });

  const CANDIDATES = {
    actual: [{ texto: "Frozen Schlafanzug Damen", anuncios: "Frozen Pyjama" }],
    candidatos: [
      { titulo: "Pijama de Harry Potter", porQue: "x", consultas: [{ texto: "Harry Potter Schlafanzug Damen", anuncios: "Harry Potter Pyjama" }] },
      { titulo: "Pijama de Stitch", porQue: "y", consultas: [{ texto: "Stitch Schlafanzug Damen", anuncios: "Stitch Pyjama" }] },
    ],
  };
  const AMAZON_HP = "https://www.amazon.de/s?k=Harry%20Potter%20Schlafanzug%20Damen";
  const META_HP = "https://www.facebook.com/ads/library/?q=Harry%20Potter%20Pyjama";
  const DATA = {
    pais: "DE",
    consultas: [
      { consulta: "Frozen Schlafanzug Damen", amazon: { url: "https://www.amazon.de/s?k=Frozen", resultados: 410, productos: [] }, meta: { url: "https://www.facebook.com/ads/library/?q=Frozen", anunciosActivos: 1100, anunciantes: [] } },
      { consulta: "Harry Potter Schlafanzug Damen", amazon: { url: AMAZON_HP, resultados: 66, productos: [{ titulo: "Gryffindor", url: "https://www.amazon.de/dp/HP", valoraciones: 744 }] }, meta: { url: META_HP, anunciosActivos: 3, anunciantes: [] } },
    ],
  };
  const RANKING = {
    situacionActual: { resumen: "Frozen está saturado.", saturacion: "alta", pruebas: [{ fuente: "Meta", dato: "~1.100 anuncios activos", url: "https://www.facebook.com/ads/library/?q=Frozen" }] },
    propuestas: [
      { titulo: "Pijama de Harry Potter", porQue: "Mucha demanda y poca competencia", enVideo: "v", ganchos: ["a", "b"], nivel: "senales_de_demanda", pruebas: [{ fuente: "Amazon.de", dato: "744 valoraciones", url: "https://www.amazon.de/dp/HP" }, { fuente: "Meta", dato: "3 anuncios", url: META_HP }, { fuente: "Inventada", dato: "x", url: "https://inventada.example" }] },
      { titulo: "Pijama de Stitch", porQue: "?", enVideo: "v", ganchos: ["a", "b"], nivel: "senales_de_demanda", pruebas: [{ fuente: "Inventada", dato: "1 M", url: "https://inventada.example/2" }] },
    ],
    limitaciones: "Sin sesión de TikTok.",
  };
  const json = (data: unknown) => `\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;

  async function macDelivers(data: unknown) {
    const [agent] = await getDb().select().from(schema.agents);
    const task = await claimTask(agent.id, new Date(), { can: ["datos"] });
    expect(task).toMatchObject({ kind: "datos" });
    const bytes = Buffer.from(JSON.stringify(data));
    await appendTaskChunk(agent.id, task!.taskId, task!.uploadId, 0, bytes);
    await finishTask(agent.id, task!.taskId, { ok: true, uploadId: task!.uploadId, totalBytes: bytes.length });
    return task as unknown as { datos: { pais: string; consultas: Array<{ texto: string; anuncios: string }> } };
  }

  it("candidatos → el Mac mide → solo se enseñan propuestas con cifras de los datos", async () => {
    const product = await makeProduct(dueno, { name: "FrostNacht", summary: "Pijama que brilla" });
    await updateProduct(dueno, product.id, { niche: "Frozen" });
    await createAgentToken(dueno, "Mac");
    const row = await requestResearch(dueno, product.id, { kind: "nicho", note: "Frozen saturado" });
    const { client, calls } = fakeMessages([searched(json(CANDIDATES)), { text: JSON.stringify(RANKING), usage: { inputTokens: 100, outputTokens: 100 } }]);
    const deps = { gateway: createGateway({ client }), macOnline: async () => true };

    // Fase 1: candidatos con búsqueda web (15 búsquedas) y tarea de datos para el Mac.
    await runResearch(row.id, deps);
    expect(calls[0].tools?.[0]).toMatchObject({ type: "web_search_20260209", max_uses: 15 });
    let [saved] = await listResearch(dueno, product.id);
    expect(saved.status).toBe("esperando_datos");
    expect(saved.error).toContain("Tu Mac está midiendo");

    // El Mac recibe las consultas: la del producto actual primero.
    const task = await macDelivers(DATA);
    expect(task.datos).toEqual({
      pais: "DE",
      consultas: [
        { texto: "Frozen Schlafanzug Damen", anuncios: "Frozen Pyjama" },
        { texto: "Harry Potter Schlafanzug Damen", anuncios: "Harry Potter Pyjama" },
        { texto: "Stitch Schlafanzug Damen", anuncios: "Stitch Pyjama" },
      ],
    });

    // Fase 3: ranking sin búsqueda web, con las cifras.
    await runResearch(row.id, deps);
    expect(calls[1].tools).toBeUndefined();
    expect(JSON.stringify(calls[1].messages)).toContain("744");
    [saved] = await listResearch(dueno, product.id);
    expect(saved.status).toBe("hecho");
    const result = saved.result as { propuestas: Array<{ titulo: string; pruebas: Array<{ url: string }> }>; situacionActual: { pruebas: unknown[] } };
    // La de Stitch no tenía cifras de los datos: fuera. A la de Harry Potter se le quita la prueba inventada.
    expect(result.propuestas.map((p) => p.titulo)).toEqual(["Pijama de Harry Potter"]);
    expect(result.propuestas[0].pruebas.map((p) => p.url)).toEqual(["https://www.amazon.de/dp/HP", META_HP]);
    expect(result.situacionActual.pruebas).toHaveLength(1);
  });

  it("sin Mac espera («Esperando a tu Mac…») y no enseña nada", async () => {
    const product = await makeProduct(dueno);
    const row = await requestResearch(dueno, product.id, { kind: "angulo" });
    const { client } = fakeMessages([searched(json(CANDIDATES))]);
    await runResearch(row.id, { gateway: createGateway({ client }), macOnline: async () => false });
    const [saved] = await listResearch(dueno, product.id);
    expect(saved).toMatchObject({ status: "esperando_datos", error: WAITING_FOR_MAC, result: null });
  });

  it("si ninguna propuesta tiene cifras, se buscan otros candidatos solos (sin enseñar conjeturas)", async () => {
    const product = await makeProduct(dueno);
    await createAgentToken(dueno, "Mac");
    const row = await requestResearch(dueno, product.id, { kind: "audiencia" });
    const empty = { ...RANKING, propuestas: [RANKING.propuestas[1]] };
    const { client } = fakeMessages([searched(json(CANDIDATES)), { text: JSON.stringify(empty) }]);
    const deps = { gateway: createGateway({ client }), macOnline: async () => true };
    await runResearch(row.id, deps);
    await macDelivers(DATA);
    await runResearch(row.id, deps);
    const [saved] = await listResearch(dueno, product.id);
    expect(saved).toMatchObject({ status: "en_cola", attempts: 1, candidates: null, result: null });
    expect(saved.availableAt).not.toBeNull();
  });

  it("las consultas a medir no se repiten y son 10 como mucho", () => {
    const many = { actual: [{ texto: "A", anuncios: "a" }], candidatos: Array.from({ length: 12 }, (_, i) => ({ titulo: `C${i}`, porQue: "", consultas: [{ texto: i === 0 ? "a" : `Q${i}`, anuncios: "" }] })) };
    const queries = queriesOf(many);
    expect(queries).toHaveLength(10);
    expect(queries[0]).toEqual({ texto: "A", anuncios: "a" });
    expect(queries[1]).toEqual({ texto: "Q1", anuncios: "Q1" });
  });

  it("nicho, ángulo o audiencia; una sola búsqueda del mismo tipo a la vez", async () => {
    const product = await makeProduct(dueno);
    await requestResearch(dueno, product.id, { kind: "nicho" });
    await expect(requestResearch(dueno, product.id, { kind: "nicho" })).rejects.toMatchObject({ status: 409 });
    await expect(requestResearch(dueno, product.id, { kind: "otra" })).rejects.toMatchObject({ status: 400 });
  });
});
