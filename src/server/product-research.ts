import { and, desc, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { textPart } from "@/llm/content";
import { getGateway, LlmCallError, LlmCapReachedError, LlmInvalidOutputError, LlmNotConfiguredError, LlmRefusalError, LlmTruncatedError, type LlmGateway } from "@/llm/gateway";
import { JobPausedError, runStep, StepFailedError } from "@/jobs/steps";
import { macOnline } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { marketTaskStatus, marketUrls, requestMarketData, type MarketQuery } from "@/server/market-data";
import { getProductFor, type Product } from "@/server/products";
import { loadRules } from "@/server/rules";

/**
 * «Buscar nicho / ángulo / audiencia diferente» con DATOS REALES (corrección de Emmanuel del
 * 23/11/2026: nada de hipótesis ni «sin datos»). Dos fases:
 *
 * 1. **Candidatos** (Claude con búsqueda web): 6–8 candidatos y, por cada uno y por el producto
 *    actual, las consultas que hay que medir (texto para Amazon/TikTok/YouTube y palabras cortas para
 *    la Biblioteca de anuncios de Meta).
 * 2. **Cifras** (Mac del dueño, tarea `market_data`): Amazon del país (resultados, valoraciones,
 *    compras del último mes), anuncios activos de Meta en el país, TikTok (con sesión) y YouTube.
 * 3. **Ranking** (Claude sin búsqueda): ordena por lo que dicen las cifras. Cada prueba tiene que
 *    citar una dirección que esté en los datos; una propuesta sin pruebas comprobadas se descarta.
 *    Si no queda ninguna, se vuelve a empezar con otros candidatos (sola, hasta `MAX_ROUNDS`), sin
 *    enseñar conjeturas. Si el Mac no responde, se espera («Esperando a tu Mac…»).
 */

export const RESEARCH_JOB = "producto.investigar";
export const RESEARCH_SWEEP = "producto.investigaciones";
export const RESEARCH_KINDS = ["nicho", "angulo", "audiencia"] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];
const MAX_NOTE = 500;
/**
 * Búsquedas y lecturas de la fase 1. La búsqueda web nueva lanza varias consultas desde código, y
 * con 10 se agotaba tras las primeras (era el «bloqueo» que vio Emmanuel).
 */
export const RESEARCH_WEB = { searches: 15, fetches: 6 } as const;
/** Rondas (candidatos nuevos) antes de dar la búsqueda por fallida. */
export const MAX_ROUNDS = 3;
/** Espera entre rondas sin datos. */
export const ROUND_RETRY_MS = 10 * 60_000;
/** Lo que se espera al Mac antes de volver a pedirle los datos (si la tarea falló). */
const DATA_RETRY_MS = 5 * 60_000;
export const WAITING_FOR_MAC = "Esperando a tu Mac para buscar los datos…";
const MAX_QUERIES = 10;

const KIND_TEXT: Record<ResearchKind, string> = {
  nicho: "NICHOS diferentes: otra temática, personaje, afición o comunidad para el mismo tipo de producto que se venda más o esté menos saturada en este país",
  angulo: "ÁNGULOS diferentes: otros motivos de compra para el mismo producto",
  audiencia: "AUDIENCIAS diferentes: otra gente que lo compraría por el mismo mecanismo",
};
const COUNTRY_NAME: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia" };
const LANGUAGE_NAME: Record<string, string> = { de: "alemán", it: "italiano" };

const query = z.object({ texto: z.string(), anuncios: z.string() });
const candidatesSchema = z.object({
  actual: z.array(query),
  candidatos: z.array(z.object({ titulo: z.string(), porQue: z.string(), consultas: z.array(query) })),
});
export type Candidates = z.infer<typeof candidatesSchema>;

const evidence = z.object({ fuente: z.string(), dato: z.string(), url: z.string() });
const rankingSchema = z.object({
  situacionActual: z.object({ resumen: z.string(), saturacion: z.enum(["alta", "media", "baja"]), pruebas: z.array(evidence) }),
  propuestas: z.array(
    z.object({
      titulo: z.string(),
      porQue: z.string(),
      enVideo: z.string(),
      ganchos: z.array(z.string()),
      nivel: z.enum(["ventas_verificadas", "senales_de_demanda"]),
      pruebas: z.array(evidence),
    }),
  ),
  limitaciones: z.string(),
});
export type ResearchAnswer = z.infer<typeof rankingSchema>;
type Evidence = z.infer<typeof evidence> & { comprobada: boolean };
export interface ResearchResult {
  situacionActual: Omit<ResearchAnswer["situacionActual"], "pruebas"> & { pruebas: Evidence[] };
  propuestas: Array<Omit<ResearchAnswer["propuestas"][number], "pruebas"> & { pruebas: Evidence[] }>;
  limitaciones: string;
  costeMicros: number;
}

const research = schema.productResearch;
type Row = typeof research.$inferSelect;

/** Pide una investigación nueva. Quien llama encola el trabajo `RESEARCH_JOB`. */
export async function requestResearch(user: AuthUser, productId: number, input: { kind: unknown; note?: unknown }): Promise<Row> {
  const product = await getProductFor(user, productId);
  if (!RESEARCH_KINDS.includes(input.kind as ResearchKind)) throw new HttpError(400, "Elige nicho, ángulo o audiencia.");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) || null : null;
  const [busy] = await getDb()
    .select({ id: research.id })
    .from(research)
    .where(and(eq(research.productId, product.id), eq(research.kind, input.kind as string), inArray(research.status, ["en_cola", "buscando", "esperando_datos"])));
  if (busy) throw new HttpError(409, "Ya hay una búsqueda de este tipo en marcha.");
  const [row] = await getDb().insert(research).values({ productId: product.id, kind: input.kind as string, note, createdBy: user.id }).returning();
  return row;
}

export async function listResearch(user: AuthUser, productId: number): Promise<Row[]> {
  const product = await getProductFor(user, productId);
  return getDb().select().from(research).where(eq(research.productId, product.id)).orderBy(desc(research.id)).limit(20);
}

const marketOf = (product: Product) => `${product.countries.map((c) => COUNTRY_NAME[c] ?? c).join(", ")} (idioma ${LANGUAGE_NAME[product.language] ?? product.language})`;

function candidatesInstructions(product: Product, kind: ResearchKind): string {
  return [
    "Eres el investigador de mercado de PRINCIPAL, la web de Emmanuel para vender productos con anuncios en vídeo orgánicos.",
    `Busca ${KIND_TEXT[kind]}. Mercado: ${marketOf(product)}.`,
    "Aplica las reglas «Nicho, ángulo o audiencia diferente» y «Ángulos de venta». Usa la búsqueda en internet en el idioma del mercado para encontrar candidatos que de verdad se venden allí (más vendidos de Amazon, tiendas, vídeos virales, anunciantes).",
    "Esta fase NO decide: propone 6–8 candidatos distintos y, para cada uno, 1 consulta que luego se medirá con cifras reales en Amazon del país, la Biblioteca de anuncios de Meta, TikTok y YouTube. Da también 1–2 consultas para medir el producto tal como está ahora (`actual`).",
    "Cada consulta: `texto` = cómo lo buscaría un comprador en el idioma del mercado (p. ej. «Harry Potter Schlafanzug Damen»); `anuncios` = 1–3 palabras clave cortas para la Biblioteca de anuncios (p. ej. «Harry Potter Pyjama»). Máximo 10 consultas en total.",
    "Sin avisos de marcas, licencias ni propiedad intelectual. No descartes un candidato por ser de marca.",
  ].join("\n");
}

function rankingInstructions(product: Product, kind: ResearchKind): string {
  return [
    "Eres el investigador de mercado de PRINCIPAL. Tienes las CIFRAS REALES que acaba de medir el Mac de Emmanuel para cada consulta: Amazon del país (número de resultados, valoraciones de los primeros productos, «compras del último mes», si son anuncios), anuncios activos en la Biblioteca de anuncios de Meta del país (y anunciantes), TikTok (vídeos y vistas, si hay sesión) y YouTube (vídeos y vistas).",
    `Tarea: elegir los mejores ${KIND_TEXT[kind]} para el producto, en ${marketOf(product)}, ORDENADOS POR LO QUE DICEN LAS CIFRAS (demanda alta: muchas valoraciones o compras, vídeos con muchas vistas; y espacio: pocos anunciantes o pocos resultados para esa demanda).`,
    "Reglas duras:",
    "- Cada propuesta lleva al menos 2 pruebas con cifra y su `url` copiada EXACTAMENTE de los datos (la de la búsqueda de Amazon, la de un producto, la de la Biblioteca de anuncios, la de un vídeo). Nada de direcciones que no estén en los datos.",
    "- Un producto de Amazon solo cuenta para un candidato si su TÍTULO corresponde de verdad a ese candidato (un pijama genérico no prueba «Harry Potter» aunque salga en esa búsqueda). No le pongas al producto atributos que no salen en su título.",
    "- Si un candidato no tiene cifras que lo respalden, no lo propongas. Nada de hipótesis ni de «falta comprobar».",
    "- `nivel`: `ventas_verificadas` solo con compras del último mes o miles de valoraciones; si no, `senales_de_demanda`.",
    "- `situacionActual`: la saturación del producto tal como está, con pruebas de los datos de `actual`.",
    "- 3–5 propuestas como mucho; `dato` con la cifra tal como sale en los datos (p. ej. «744 valoraciones», «~1.100 anuncios activos», «13.873 vistas»).",
    "- Dos ganchos por propuesta en el idioma del mercado. Sin avisos de marcas, licencias ni propiedad intelectual.",
  ].join("\n");
}

function productBrief(product: Product, previous: string[], note: string | null): string {
  return [
    `Producto: ${product.name}`,
    `Qué hace: ${product.summary}`,
    product.niche ? `Nicho actual: ${product.niche}` : null,
    product.audience ? `Audiencia actual: ${product.audience}` : null,
    product.angle ? `Ángulo actual: ${product.angle}` : null,
    product.sourceUrl ? `Enlace de origen: ${product.sourceUrl}` : null,
    previous.length ? `Ya se propusieron o no tuvieron datos (no los repitas): ${previous.join("; ")}` : null,
    note ? `Indicación de la persona: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ResearchDeps {
  gateway?: LlmGateway;
  macOnline?: () => Promise<boolean>;
  now?: () => Date;
}

const nowOf = (deps: ResearchDeps) => deps.now?.() ?? new Date();

async function set(id: number, changes: Partial<typeof research.$inferInsert>, now: Date): Promise<void> {
  await getDb().update(research).set({ ...changes, updatedAt: now }).where(eq(research.id, id));
}

/** Mensaje corto para un fallo de Claude; `null` si no es de la pasarela. */
function gatewayFailure(error: unknown): string | null {
  if (error instanceof LlmCapReachedError || error instanceof LlmNotConfiguredError) return error.message;
  if (error instanceof LlmCallError || error instanceof LlmRefusalError || error instanceof LlmTruncatedError || error instanceof LlmInvalidOutputError || error instanceof StepFailedError) {
    return "La búsqueda no terminó bien. Vuelve a pulsar el botón.";
  }
  return null;
}

/**
 * Avanza una investigación todo lo que se pueda ahora: candidatos → datos del Mac → ranking. Cada
 * llamada a Claude va en su paso (`runStep`): repetirla no paga dos veces.
 */
export async function runResearch(researchId: number, deps: ResearchDeps = {}): Promise<void> {
  const now = nowOf(deps);
  let [row] = await getDb().select().from(research).where(eq(research.id, researchId));
  if (!row || !["en_cola", "buscando", "esperando_datos"].includes(row.status)) return;
  if (row.availableAt && row.availableAt > now) return;
  const user = await getActiveUser(row.createdBy);
  if (!user) return void (await set(row.id, { status: "fallido", error: "La cuenta que pidió la búsqueda está desactivada." }, now));
  let product: Product;
  try {
    product = await getProductFor(user, row.productId);
  } catch {
    return void (await set(row.id, { status: "fallido", error: "Ya no tienes acceso a este producto." }, now));
  }
  const kind = row.kind as ResearchKind;
  const ctx = { jobName: RESEARCH_JOB, userId: user.id, productId: product.id };
  const gateway = deps.gateway ?? getGateway();

  try {
    // 1. Candidatos.
    if (!row.candidates) {
      await set(row.id, { status: "buscando", error: null }, now);
      const previous = await previousTitles(product.id, kind, row);
      const found = await runStep(ctx, `${RESEARCH_JOB}:${row.id}:candidatos:${row.attempts}`, async () => {
        const result = await gateway.call({
          tier: "medium",
          stepKey: `${RESEARCH_JOB}:${kind}:${row.id}:candidatos`,
          userId: user.id,
          productId: product.id,
          rules: await loadRules(["angulos-de-venta", "angulos-ejemplos", "nichos-con-datos"]),
          instructions: candidatesInstructions(product, kind),
          content: [textPart(productBrief(product, previous, row.note))],
          maxTokens: 6_000,
          schema: candidatesSchema,
          web: { ...RESEARCH_WEB, country: product.countries[0] },
        });
        return { data: result.data!, costMicros: result.costMicros };
      });
      const candidates = { ...found.data, costeMicros: found.costMicros };
      await set(row.id, { candidates, data: null, dataTaskId: null }, now);
      row = { ...row, candidates, data: null, dataTaskId: null };
    }

    // 2. Cifras del Mac.
    if (!row.data) {
      const task = await marketTaskStatus(row.dataTaskId);
      const stale = task?.status === "failed" && now.getTime() - row.updatedAt.getTime() >= DATA_RETRY_MS;
      if (!task || stale) {
        const spec = { pais: product.countries[0] ?? "DE", consultas: queriesOf(row.candidates as Candidates) };
        if (!(await requestMarketData(row.id, spec, now))) return void (await set(row.id, { status: "esperando_datos", error: WAITING_FOR_MAC }, now));
      }
      const online = await (deps.macOnline ?? (() => macOnline(now)))();
      return void (await set(row.id, { status: "esperando_datos", error: online ? "Tu Mac está midiendo Amazon, los anuncios de Meta y los vídeos…" : WAITING_FOR_MAC }, now));
    }

    // 3. Ranking con las cifras.
    const ranked = await runStep(ctx, `${RESEARCH_JOB}:${row.id}:ranking:${row.attempts}`, async () => {
      const result = await gateway.call({
        tier: "medium",
        stepKey: `${RESEARCH_JOB}:${kind}:${row.id}:ranking`,
        userId: user.id,
        productId: product.id,
        rules: await loadRules(["angulos-de-venta", "nichos-con-datos"]),
        instructions: rankingInstructions(product, kind),
        content: [
          textPart(productBrief(product, [], row.note)),
          textPart(`Candidatos:\n${JSON.stringify(row.candidates)}`),
          textPart(`CIFRAS MEDIDAS (JSON):\n${JSON.stringify(row.data)}`),
        ],
        maxTokens: 8_000,
        schema: rankingSchema,
      });
      return { data: result.data!, costMicros: result.costMicros };
    });

    const seen = marketUrls(row.data);
    const mark = (items: Array<z.infer<typeof evidence>>): Evidence[] => items.map((e) => ({ ...e, comprobada: seen.has(e.url) }));
    // Solo pruebas que están en los datos; una propuesta sin ninguna se descarta.
    const proposals = ranked.data.propuestas.map((p) => ({ ...p, pruebas: mark(p.pruebas).filter((e) => e.comprobada) })).filter((p) => p.pruebas.length > 0);
    if (proposals.length === 0) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ROUNDS) {
        return void (await set(row.id, { status: "fallido", attempts, error: "No se encontraron cifras suficientes para este producto en este país. Prueba con una indicación más concreta." }, now));
      }
      // Otra ronda con candidatos nuevos, sola.
      return void (await set(row.id, { status: "en_cola", attempts, candidates: null, data: null, dataTaskId: null, availableAt: new Date(now.getTime() + ROUND_RETRY_MS), error: "Los candidatos no tenían cifras: se buscan otros…" }, now));
    }
    const result: ResearchResult = {
      situacionActual: { ...ranked.data.situacionActual, pruebas: mark(ranked.data.situacionActual.pruebas).filter((e) => e.comprobada) },
      propuestas: proposals,
      limitaciones: ranked.data.limitaciones,
      costeMicros: ranked.costMicros + ((row.candidates as { costeMicros?: number } | null)?.costeMicros ?? 0),
    };
    await set(row.id, { status: "hecho", result, error: null }, now);
  } catch (error) {
    if (error instanceof JobPausedError) {
      await set(row.id, { status: "en_cola", error: "Tope de gasto de Claude alcanzado: sigue cuando haya saldo." }, now);
      throw error;
    }
    const message = gatewayFailure(error);
    if (message) {
      console.warn(`[investigaciones] La búsqueda ${row.id} falló: ${error instanceof Error ? error.message : String(error)}`);
      return void (await set(row.id, { status: "fallido", error: message }, now));
    }
    throw error;
  }
}

/** Las consultas a medir: las del producto actual primero y luego las de cada candidato (máx. 10). */
export function queriesOf(candidates: Candidates): MarketQuery[] {
  const all = [...candidates.actual, ...candidates.candidatos.flatMap((c) => c.consultas.slice(0, 1))];
  const unique: MarketQuery[] = [];
  for (const q of all) {
    const texto = q.texto.trim().slice(0, 120);
    if (!texto || unique.some((u) => u.texto.toLowerCase() === texto.toLowerCase())) continue;
    unique.push({ texto, anuncios: (q.anuncios || q.texto).trim().slice(0, 60) });
    if (unique.length >= MAX_QUERIES) break;
  }
  return unique;
}

async function previousTitles(productId: number, kind: ResearchKind, current: Row): Promise<string[]> {
  const rows = await getDb()
    .select({ result: research.result })
    .from(research)
    .where(and(eq(research.productId, productId), eq(research.kind, kind), eq(research.status, "hecho")));
  const done = rows.flatMap((r) => ((r.result as ResearchResult | null)?.propuestas ?? []).map((p) => p.titulo));
  // En una ronda nueva, los candidatos de la anterior (que no tuvieron cifras) tampoco se repiten.
  const tried = ((current.candidates as Candidates | null)?.candidatos ?? []).map((c) => c.titulo);
  return [...done, ...tried];
}

/** Tarea programada: avanza las búsquedas que esperan datos del Mac o una nueva ronda. */
export async function researchSweep(deps: ResearchDeps = {}): Promise<void> {
  const now = nowOf(deps);
  const rows = await getDb()
    .select({ id: research.id })
    .from(research)
    // Las nuevas las empieza su trabajo (`RESEARCH_JOB`); aquí, las que esperan al Mac o una ronda nueva.
    .where(or(eq(research.status, "esperando_datos"), and(eq(research.status, "en_cola"), isNotNull(research.availableAt), lte(research.availableAt, now))))
    .limit(10);
  for (const { id } of rows) {
    try {
      await runResearch(id, deps);
    } catch (error) {
      console.error(`[investigaciones] La búsqueda ${id} no pudo avanzar:`, error instanceof Error ? error.message : error);
    }
  }
}
