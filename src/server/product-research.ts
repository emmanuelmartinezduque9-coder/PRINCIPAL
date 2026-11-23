import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { textPart } from "@/llm/content";
import { getGateway, LlmCallError, LlmCapReachedError, LlmInvalidOutputError, LlmNotConfiguredError, LlmRefusalError, LlmTruncatedError, type LlmGateway } from "@/llm/gateway";
import { JobPausedError, runStep, StepFailedError } from "@/jobs/steps";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, type Product } from "@/server/products";
import { loadRules } from "@/server/rules";

/**
 * «Buscar nicho / ángulo / audiencia diferente» de un producto, con datos reales de internet.
 * Claude (nivel mediano) busca en el país del producto (TikTok, Instagram, Biblioteca de anuncios
 * de Meta, Amazon, Etsy, tiendas…) y devuelve 3–5 propuestas con pruebas. El programa marca como
 * «sin comprobar» toda prueba cuya dirección no salió de verdad en la búsqueda. Decide la persona.
 */

export const RESEARCH_JOB = "producto.investigar";
export const RESEARCH_KINDS = ["nicho", "angulo", "audiencia"] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];
const MAX_NOTE = 500;
/** Búsquedas y lecturas de páginas por investigación (≈ 0,10 US$ de búsquedas + tokens). */
export const RESEARCH_WEB = { searches: 10, fetches: 4 } as const;

const KIND_TEXT: Record<ResearchKind, string> = {
  nicho: "un NICHO diferente: otra temática, personaje, afición o comunidad para el mismo tipo de producto que se venda más o esté menos saturada en este país",
  angulo: "un ÁNGULO diferente: otro motivo de compra para el mismo producto",
  audiencia: "una AUDIENCIA diferente: otra gente que lo compraría por el mismo mecanismo",
};
const COUNTRY_NAME: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia" };
const LANGUAGE_NAME: Record<string, string> = { de: "alemán", it: "italiano" };

const evidence = z.object({ fuente: z.string(), dato: z.string(), url: z.string() });
const researchSchema = z.object({
  situacionActual: z.object({
    resumen: z.string(),
    saturacion: z.enum(["alta", "media", "baja", "sin_datos"]),
    pruebas: z.array(evidence),
  }),
  propuestas: z.array(
    z.object({
      titulo: z.string(),
      porQue: z.string(),
      enVideo: z.string(),
      ganchos: z.array(z.string()),
      nivel: z.enum(["ventas_verificadas", "senales_de_demanda", "hipotesis"]),
      pruebas: z.array(evidence),
    }),
  ),
  limitaciones: z.string(),
});
export type ResearchAnswer = z.infer<typeof researchSchema>;
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
    .where(and(eq(research.productId, product.id), eq(research.kind, input.kind as string), inArray(research.status, ["en_cola", "buscando"])));
  if (busy) throw new HttpError(409, "Ya hay una búsqueda de este tipo en marcha.");
  const [row] = await getDb().insert(research).values({ productId: product.id, kind: input.kind as string, note, createdBy: user.id }).returning();
  return row;
}

export async function listResearch(user: AuthUser, productId: number): Promise<Row[]> {
  const product = await getProductFor(user, productId);
  return getDb().select().from(research).where(eq(research.productId, product.id)).orderBy(desc(research.id)).limit(20);
}

function instructions(product: Product, kind: ResearchKind): string {
  const country = product.countries.map((c) => COUNTRY_NAME[c] ?? c).join(", ");
  return [
    "Eres el investigador de mercado de PRINCIPAL, la web de Emmanuel para vender productos con anuncios en vídeo orgánicos.",
    `Busca ${KIND_TEXT[kind]}. Mercado: ${country} (idioma ${LANGUAGE_NAME[product.language] ?? product.language}).`,
    "Aplica las reglas «Nicho, ángulo o audiencia diferente» y «Ángulos de venta». Usa la búsqueda en internet en el idioma del mercado y trae cifras reales con su dirección.",
    "Primero mide la situación actual del producto (¿está saturado? pruebas). Después 3–5 propuestas ordenadas de mejor a peor.",
    "Campos de cada propuesta: `titulo` (corto), `porQue` (español sencillo), `enVideo` (cómo se vería en un vídeo de 20 s), `ganchos` (dos, en el idioma del mercado), `nivel` y `pruebas` (cada una con `fuente`, `dato` con la cifra tal como aparece y `url` que hayas visto de verdad). En `limitaciones`, qué no se pudo comprobar.",
    "Sin avisos de marcas registradas ni de propiedad intelectual. No te inventes cifras: si no hay datos, dilo.",
  ].join("\n");
}

function productBrief(product: Product, previous: string[], note: string | null): string {
  const lines = [
    `Producto: ${product.name}`,
    `Qué hace: ${product.summary}`,
    product.niche ? `Nicho actual: ${product.niche}` : null,
    product.audience ? `Audiencia actual: ${product.audience}` : null,
    product.angle ? `Ángulo actual: ${product.angle}` : null,
    product.sourceUrl ? `Enlace de origen: ${product.sourceUrl}` : null,
    previous.length ? `Ya se propusieron (no los repitas): ${previous.join("; ")}` : null,
    note ? `Indicación de la persona: ${note}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export interface ResearchDeps {
  gateway?: LlmGateway;
}

/** Ejecuta una investigación en cola (una sola llamada pagada por investigación). */
export async function runResearch(researchId: number, deps: ResearchDeps = {}): Promise<void> {
  const [row] = await getDb()
    .update(research)
    .set({ status: "buscando", updatedAt: new Date() })
    .where(and(eq(research.id, researchId), inArray(research.status, ["en_cola", "buscando"])))
    .returning();
  if (!row) return;
  const fail = (error: string) => getDb().update(research).set({ status: "fallido", error, updatedAt: new Date() }).where(eq(research.id, row.id));
  const user = await getActiveUser(row.createdBy);
  if (!user) return void (await fail("La cuenta que pidió la búsqueda está desactivada."));
  let product: Product;
  try {
    product = await getProductFor(user, row.productId);
  } catch {
    return void (await fail("Ya no tienes acceso a este producto."));
  }
  const kind = row.kind as ResearchKind;
  const previous = (await getDb().select({ result: research.result }).from(research).where(and(eq(research.productId, product.id), eq(research.kind, kind), eq(research.status, "hecho"))))
    .flatMap((r) => ((r.result as ResearchResult | null)?.propuestas ?? []).map((p) => p.titulo));

  let answer: { data: ResearchAnswer; webSources: string[]; costMicros: number; spendEntryId: number };
  try {
    answer = await runStep({ jobName: RESEARCH_JOB, userId: user.id, productId: product.id }, `${RESEARCH_JOB}:${row.id}`, async () => {
      const result = await (deps.gateway ?? getGateway()).call({
        tier: "medium",
        stepKey: `${RESEARCH_JOB}:${kind}:${row.id}`,
        userId: user.id,
        productId: product.id,
        rules: await loadRules(["angulos-de-venta", "angulos-ejemplos", "nichos-con-datos"]),
        instructions: instructions(product, kind),
        content: [textPart(productBrief(product, previous, row.note))],
        maxTokens: 8_000,
        schema: researchSchema,
        web: { ...RESEARCH_WEB, country: product.countries[0] },
      });
      return { data: result.data!, webSources: result.webSources, costMicros: result.costMicros, spendEntryId: result.spendEntryId };
    });
  } catch (error) {
    if (error instanceof JobPausedError) {
      await getDb().update(research).set({ status: "en_cola", error: "Tope de gasto de Claude alcanzado: sigue cuando haya saldo.", updatedAt: new Date() }).where(eq(research.id, row.id));
      throw error;
    }
    if (error instanceof LlmCapReachedError || error instanceof LlmNotConfiguredError) return void (await fail(error.message));
    if (error instanceof LlmCallError || error instanceof LlmRefusalError || error instanceof LlmTruncatedError || error instanceof LlmInvalidOutputError || error instanceof StepFailedError) {
      return void (await fail(`La búsqueda no terminó bien (${error.message}). Vuelve a pulsar el botón.`));
    }
    throw error;
  }

  const seen = new Set(answer.webSources);
  const mark = (items: Array<z.infer<typeof evidence>>): Evidence[] => items.map((e) => ({ ...e, comprobada: seen.has(e.url) }));
  const result: ResearchResult = {
    situacionActual: { ...answer.data.situacionActual, pruebas: mark(answer.data.situacionActual.pruebas) },
    propuestas: answer.data.propuestas.map((p) => ({ ...p, pruebas: mark(p.pruebas) })),
    limitaciones: answer.data.limitaciones,
    costeMicros: answer.costMicros,
  };
  await getDb().update(research).set({ status: "hecho", result, error: null, spendEntryId: answer.spendEntryId, updatedAt: new Date() }).where(eq(research.id, row.id));
}
