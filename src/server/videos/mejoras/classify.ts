import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { imagePart, textPart, type LlmContent } from "@/llm/content";
import { getGateway, LlmCapReachedError, LlmNotConfiguredError, type LlmGateway } from "@/llm/gateway";
import { PROBLEM_TYPE_KEYS, PROBLEM_TYPES, type ProblemType } from "@/lib/mejoras";
import { makeThumbnail } from "@/server/media/ffmpeg";
import { productNamesByIds } from "@/server/products";
import { activeCorrections, createCorrection, MAX_DIRECTIVE_CHARS, type Correction } from "@/server/videos/mejoras/corrections";
import { SYSTEM_REJECT_PREFIX } from "@/server/videos/generations";

/**
 * Clasificación con Claude Haiku (el modelo pequeño, barato), dentro del tope de gasto de la persona:
 * - de cada reporte: tipo de problema, causa, qué hace falta (regla/prompt, código o nada) y, si es de
 *   regla, la instrucción que el motor añadirá al prompt (o la corrección activa que ya lo cubre);
 * - de los rechazos con motivo de imágenes y clips: solo el tipo, en tandas.
 * Lo hace la tarea programada `mejoras.barrido` (`src/jobs/mejoras-jobs.ts`).
 */

export const SWEEP_NAME = "mejoras.barrido";
/** Tras un fallo (tope de gasto, sin clave…), cuándo se vuelve a intentar. */
const RETRY_MS = 30 * 60 * 1000;
/** Tras tantos fallos, se deja sin clasificar (el dueño lo puede pedir otra vez). */
const MAX_ATTEMPTS = 6;
/** Rechazos por llamada. */
const REJECTION_BATCH = 30;

const typeEnum = z.enum(PROBLEM_TYPE_KEYS as [ProblemType, ...ProblemType[]]);

export const reportClassification = z.object({
  problem_type: typeEnum,
  fix_kind: z.enum(["regla", "codigo", "uso"]),
  cause: z.string().min(1).max(400),
  stage: z.enum(["frame", "clip"]).nullable(),
  directive: z.string().max(MAX_DIRECTIVE_CHARS).nullable(),
  existing_correction_id: z.number().int().nullable(),
  product_specific: z.boolean(),
});
export type ReportClassification = z.infer<typeof reportClassification>;

const typeList = PROBLEM_TYPE_KEYS.map((key) => `- ${key}: ${PROBLEM_TYPES[key]}`).join("\n");

export const REPORT_INSTRUCTIONS = `Eres el clasificador de reportes de problemas de una web que fabrica anuncios en vídeo (imagen inicial con Nano Banana, clip con Higgsfield, doblaje y montaje automáticos).
Te llega un reporte escrito por una persona (a veces dictado, con faltas) con el contexto técnico del vídeo.

Devuelve:
- problem_type, uno de:
${typeList}
- fix_kind:
  - "regla": se arregla cambiando el prompt de la imagen inicial o del clip (p. ej. producto deformado, fondo que no encaja, luz, rótulos o textos dentro de la imagen, manos raras, movimiento malo).
  - "codigo": es un fallo del programa (p. ej. vídeo sin audio, montaje roto, botón que no funciona, algo que no se guarda, error en pantalla, descarga que falla).
  - "uso": no hay nada que cambiar (duda de uso, ya resuelto, petición que no es un fallo).
- cause: la causa más probable, en español sencillo, una o dos frases, sin tecnicismos. Si el contexto técnico la explica (p. ej. el modelo del clip no genera audio), dila.
- stage: "frame" (imagen inicial) o "clip" si fix_kind es "regla"; si no, null.
- directive: si fix_kind es "regla", UNA instrucción en inglés, imperativa, concreta y general (que valga para próximos vídeos, sin nombres de archivo ni números de vídeo), de como mucho ${MAX_DIRECTIVE_CHARS} caracteres, para añadir al final del prompt. Si no, null.
- existing_correction_id: si una de las correcciones activas que te paso ya cubre exactamente este problema, su id (y directive null); si no, null.
- product_specific: true si la instrucción solo tiene sentido para este producto.
No inventes: si no está claro, elige el tipo más probable y explica la duda en cause.`;

export const REJECTION_INSTRUCTIONS = `Clasifica cada motivo de rechazo (de una imagen inicial o un clip de un anuncio) en uno de estos tipos:
${typeList}
Devuelve una entrada por motivo, con su id y el tipo.`;

const rejectionSchema = z.object({ items: z.array(z.object({ id: z.number().int(), problem_type: typeEnum })) });

interface Deps {
  gateway?: LlmGateway;
  now?: () => Date;
}

type Report = typeof schema.problemReports.$inferSelect;

/** Contexto técnico del vídeo para Claude: modelo, rondas con sus motivos, montaje y doblaje. Corto. */
async function videoContext(report: Report): Promise<string> {
  if (report.videoId === null) return "Sin vídeo (problema de pantalla o del lote).";
  const db = getDb();
  const [video] = await db.select().from(schema.videos).where(eq(schema.videos.id, report.videoId));
  if (!video) return "El vídeo ya no existe.";
  const productName = (await productNamesByIds([video.productId])).get(video.productId);
  const gens = await db
    .select({ kind: schema.generations.kind, round: schema.generations.round, status: schema.generations.status, error: schema.generations.error, rejectReason: schema.generations.rejectReason, request: schema.generations.request })
    .from(schema.generations)
    .where(eq(schema.generations.videoId, video.id))
    .orderBy(asc(schema.generations.id));
  const [run] = await db
    .select({ status: schema.editRuns.status, error: schema.editRuns.error, notes: schema.editRuns.notes })
    .from(schema.editRuns)
    .where(eq(schema.editRuns.videoId, video.id))
    .orderBy(desc(schema.editRuns.id))
    .limit(1);
  const [edit] = await db
    .select({ version: schema.edits.version, durationMs: schema.edits.durationMs, selfCheck: schema.edits.selfCheck })
    .from(schema.edits)
    .where(eq(schema.edits.videoId, video.id))
    .orderBy(desc(schema.edits.version))
    .limit(1);
  const dubs = await db.select({ status: schema.dubs.status, language: schema.dubs.language }).from(schema.dubs).where(eq(schema.dubs.videoId, video.id));
  const lines = [
    `Producto: ${productName ?? "?"}`,
    `Tipo de vídeo: ${video.kind}`,
    ...gens.map((g) => {
      const request = g.request as { model?: string; generateAudio?: boolean } | null;
      const audio = g.kind === "clip" && request ? `, audio generado: ${request.generateAudio === true ? "sí" : request.generateAudio === false ? "no" : "no se pide"}` : "";
      return `${g.kind === "frame" ? "Imagen" : "Clip"} ronda ${g.round}: ${g.status}, modelo ${request?.model ?? "?"}${audio}${g.error ? `, error: ${g.error}` : ""}${g.rejectReason ? `, rechazada: ${g.rejectReason}` : ""}`;
    }),
    run ? `Último montaje: ${run.status}${run.error ? `, error: ${run.error.slice(0, 300)}` : ""}${run.notes?.length ? `, notas: ${run.notes.join("; ").slice(0, 400)}` : ""}` : "Sin montaje.",
    edit ? `Montaje v${edit.version}: ${Math.round(edit.durationMs / 1000)} s; autocomprobación: ${JSON.stringify(edit.selfCheck ?? {}).slice(0, 500)}` : "",
    dubs.length ? `Doblaje: ${dubs.map((d) => `${d.language} ${d.status}`).join(", ")}` : "Sin doblaje.",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}

function errorText(error: unknown): string {
  if (error instanceof LlmCapReachedError || error instanceof LlmNotConfiguredError) return error.message;
  return error instanceof Error ? error.message.slice(0, 300) : String(error);
}

/**
 * Aplica una clasificación: guarda tipo y causa y, si es de regla, crea la corrección (o enlaza la que
 * ya la cubre), que el motor usa desde ya. Pura en cuanto a decisiones: se prueba con la base de datos.
 */
export async function applyClassification(reportId: number, result: ReportClassification, now: Date): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [report] = await tx.select().from(schema.problemReports).where(eq(schema.problemReports.id, reportId)).for("update");
    if (!report || report.status !== "recibido") return;
    let correctionId: number | null = null;
    let status: Report["status"] = result.fix_kind === "uso" ? "sin_arreglo" : "clasificado";
    if (result.fix_kind === "regla" && result.stage) {
      if (result.existing_correction_id !== null) {
        const [existing] = await tx
          .select()
          .from(schema.learnedCorrections)
          .where(and(eq(schema.learnedCorrections.id, result.existing_correction_id), eq(schema.learnedCorrections.status, "activa")));
        if (existing) correctionId = existing.id;
      }
      if (correctionId === null && result.directive && result.directive.trim().length >= 10) {
        const created = await createCorrection(tx, {
          stage: result.stage,
          problemType: result.problem_type,
          productId: result.product_specific ? report.productId : null,
          directive: result.directive,
          note: result.cause,
          sourceReportId: report.id,
          createdBy: null,
        });
        correctionId = created.id;
      }
      if (correctionId !== null) status = "aplicado";
    }
    await tx
      .update(schema.problemReports)
      .set({
        status,
        problemType: result.problem_type,
        fixKind: result.fix_kind,
        cause: result.cause,
        correctionId,
        classifiedAt: now,
        classifyError: null,
        updatedAt: now,
      })
      .where(eq(schema.problemReports.id, report.id));
  });
}

/** Clasifica un reporte recibido. Si falla (tope, sin clave…), lo deja para más tarde. */
export async function classifyReport(reportId: number, deps: Deps = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const [report] = await getDb().select().from(schema.problemReports).where(eq(schema.problemReports.id, reportId));
  if (!report || report.status !== "recibido") return;
  try {
    const stage = report.stage === "imagen" ? "frame" : report.stage === "clip" ? "clip" : null;
    const active: Correction[] = stage ? await activeCorrections(stage, report.productId) : [];
    const content: LlmContent = [
      textPart(
        [
          `Dónde lo vio: ${report.stage}${report.versionLabel ? ` (${report.versionLabel})` : ""}`,
          `Página: ${report.page ?? "?"}`,
          `Reporte: ${report.body}`,
          "",
          "Contexto técnico:",
          await videoContext(report),
          "",
          active.length ? `Correcciones activas de este paso:\n${active.map((c) => `- id ${c.id} (${c.problemType}): ${c.directive}`).join("\n")}` : "No hay correcciones activas de este paso.",
        ].join("\n"),
      ),
    ];
    if (report.screenshot && report.screenshotMime) {
      try {
        content.push(textPart("Captura que adjuntó la persona:"), imagePart(await makeThumbnail(Buffer.from(report.screenshot), "image", 1024), "image/jpeg"));
      } catch {
        // Una captura que no se puede leer no impide clasificar el texto.
      }
    }
    const result = await (deps.gateway ?? getGateway()).call({
      tier: "small",
      stepKey: `${SWEEP_NAME}:reporte:${report.id}:${report.classifyAttempts}`,
      userId: report.createdBy,
      productId: report.productId,
      rules: [],
      instructions: REPORT_INSTRUCTIONS,
      content,
      maxTokens: 1_500,
      schema: reportClassification,
    });
    await applyClassification(report.id, result.data!, now);
  } catch (error) {
    await getDb()
      .update(schema.problemReports)
      .set({
        classifyAttempts: sql`${schema.problemReports.classifyAttempts} + 1`,
        classifyAfter: new Date(now.getTime() + RETRY_MS),
        classifyError: errorText(error),
        updatedAt: now,
      })
      .where(eq(schema.problemReports.id, report.id));
  }
}

/** Clasifica rechazos con motivo aún sin tipo (o cuyo motivo cambió), en tandas por persona que paga. */
export async function classifyRejections(deps: Deps = {}): Promise<number> {
  const db = getDb();
  const g = schema.generations;
  const rt = schema.rejectionTypes;
  const pending = await db
    .select({ id: g.id, reason: g.rejectReason, userId: g.userId, productId: schema.videos.productId })
    .from(g)
    .innerJoin(schema.videos, eq(schema.videos.id, g.videoId))
    .leftJoin(rt, eq(rt.generationId, g.id))
    .where(
      and(
        isNotNull(g.rejectReason),
        sql`${g.rejectReason} not like ${SYSTEM_REJECT_PREFIX + "%"}`,
        or(isNull(rt.generationId), sql`${rt.reason} <> ${g.rejectReason}`),
      ),
    )
    .orderBy(desc(g.id))
    .limit(REJECTION_BATCH * 4);
  const byUser = new Map<number, typeof pending>();
  for (const row of pending) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  let done = 0;
  for (const [userId, rows] of byUser) {
    const batch = rows.slice(0, REJECTION_BATCH);
    try {
      const result = await (deps.gateway ?? getGateway()).call({
        tier: "small",
        stepKey: `${SWEEP_NAME}:rechazos:${batch[0].id}:${batch.length}`,
        userId,
        productId: null,
        rules: [],
        instructions: REJECTION_INSTRUCTIONS,
        content: [textPart(batch.map((row) => `id ${row.id}: ${row.reason}`).join("\n"))],
        maxTokens: 2_000,
        schema: rejectionSchema,
      });
      const known = new Map(batch.map((row) => [row.id, row.reason!]));
      for (const item of result.data!.items) {
        const reason = known.get(item.id);
        if (reason === undefined) continue;
        await db
          .insert(rt)
          .values({ generationId: item.id, problemType: item.problem_type, reason })
          .onConflictDoUpdate({ target: rt.generationId, set: { problemType: item.problem_type, reason, classifiedAt: new Date() } });
        done += 1;
      }
    } catch (error) {
      // Tope de gasto o Claude caído: se intenta en el siguiente barrido.
      console.error(`[mejoras] No se pudieron clasificar rechazos: ${errorText(error)}`);
    }
  }
  return done;
}

/** El barrido: reportes pendientes (los más antiguos primero, pocos cada vez) y rechazos sin tipo. */
export async function mejorasSweep(deps: Deps = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const r = schema.problemReports;
  const due = await getDb()
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.status, "recibido"), sql`${r.classifyAttempts} < ${MAX_ATTEMPTS}`, or(isNull(r.classifyAfter), lte(r.classifyAfter, now))))
    .orderBy(asc(r.id))
    .limit(10);
  for (const { id } of due) await classifyReport(id, deps);
  await classifyRejections(deps);
}

/** Vuelve a dejar un reporte para clasificar (el dueño lo pide desde «Mejoras»). */
export async function requeueReport(reportIds: number[]): Promise<void> {
  if (reportIds.length === 0) return;
  await getDb()
    .update(schema.problemReports)
    .set({ status: "recibido", classifyAttempts: 0, classifyAfter: null, classifyError: null, updatedAt: new Date() })
    .where(inArray(schema.problemReports.id, reportIds));
}
