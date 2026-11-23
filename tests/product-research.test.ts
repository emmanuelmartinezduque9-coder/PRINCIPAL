import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getPool } from "@/db/client";
import { createGateway, trailingJson, WEB_SEARCH_MICROS, webSourcesOf } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { listResearch, requestResearch, runResearch, type ResearchAnswer } from "@/server/product-research";
import { getProductFor, updateProduct } from "@/server/products";
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

describe("buscar nicho, ángulo o audiencia diferente", () => {
  let dueno: AuthUser;
  beforeEach(async () => {
    await truncateAll();
    await seedRules();
    dueno = await makeUser("dueno");
  });

  const ANSWER: ResearchAnswer = {
    situacionActual: { resumen: "El pijama del Grinch tiene decenas de cuentas en Alemania.", saturacion: "alta", pruebas: [{ fuente: "TikTok", dato: "1,2 M visualizaciones", url: SEEN }] },
    propuestas: [
      {
        titulo: "Pijama de Harry Potter",
        porQue: "Es el pijama temático más vendido en Amazon.de.",
        enVideo: "Familia en pijama de Hogwarts abriendo regalos.",
        ganchos: ["Der Schlafanzug, den jeder Potter-Fan will", "Weihnachten in Hogwarts"],
        nivel: "senales_de_demanda",
        pruebas: [
          { fuente: "Amazon.de", dato: "n.º 1 en pijamas, 4 312 valoraciones", url: "https://www.amazon.de/bestsellers" },
          { fuente: "Meta", dato: "35 anuncios activos", url: "https://www.facebook.com/ads/library/?q=inventado" },
        ],
      },
    ],
    limitaciones: "Sin datos de ventas propias.",
  };

  it("guarda las propuestas con pruebas comprobadas y sin inventar; la persona elige", async () => {
    const product = await makeProduct(dueno, { name: "FestKapuze", summary: "Pijama del Grinch" });
    await updateProduct(dueno, product.id, { niche: "Grinch" });
    const row = await requestResearch(dueno, product.id, { kind: "nicho", note: "el Grinch está saturado" });
    await expect(requestResearch(dueno, product.id, { kind: "nicho" })).rejects.toMatchObject({ status: 409 });
    await expect(requestResearch(dueno, product.id, { kind: "otra" })).rejects.toMatchObject({ status: 400 });

    const { client, calls } = fakeMessages([searched(`\`\`\`json\n${JSON.stringify(ANSWER)}\n\`\`\``)]);
    await runResearch(row.id, { gateway: createGateway({ client }) });

    const brief = JSON.stringify(calls[0].messages);
    expect(brief).toContain("Nicho actual: Grinch");
    expect(brief).toContain("el Grinch está saturado");
    const system = JSON.stringify(calls[0].system);
    expect(system).toContain("NICHO diferente");
    expect(system).toContain("Sin avisos de marca");

    const [saved] = await listResearch(dueno, product.id);
    expect(saved.status).toBe("hecho");
    const result = saved.result as { propuestas: Array<{ pruebas: Array<{ url: string; comprobada: boolean }> }>; situacionActual: { pruebas: Array<{ comprobada: boolean }> } };
    expect(result.situacionActual.pruebas[0].comprobada).toBe(true);
    expect(result.propuestas[0].pruebas.map((p) => p.comprobada)).toEqual([true, false]);

    await updateProduct(dueno, product.id, { niche: "Pijama de Harry Potter" });
    expect((await getProductFor(dueno, product.id)).niche).toBe("Pijama de Harry Potter");
  });

  it("un fallo de Claude queda como búsqueda fallida con el motivo", async () => {
    const product = await makeProduct(dueno);
    const row = await requestResearch(dueno, product.id, { kind: "audiencia" });
    const { client } = fakeMessages([searched("no hay json")]);
    await runResearch(row.id, { gateway: createGateway({ client }) });
    const [saved] = await listResearch(dueno, product.id);
    expect(saved.status).toBe("fallido");
    expect(saved.error).toContain("Vuelve a pulsar");
  });
});
