import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { missingForAnalysis, requestAnalysis } from "@/server/videos/analysis";
import { briefOf } from "@/server/videos/brief";
// Registra los constructores de la imagen (`frame`) y del clip en las generaciones.
import "@/server/videos/frame";
import "@/server/videos/clip";
import { quoteGeneration, requestGeneration, type GenDeps, type GenerationKind } from "@/server/videos/generations";
import { PROMPT_ERROR } from "@/server/videos/prompt-check";
import { kickBatchOfVideo, stageOf, type Stage } from "@/server/videos/lote";
import { getVideoFor, latestDoneAnalysis, referenceOutdated, requireVideoOwner, withProductNotes, type Video } from "@/server/videos/videos";

/**
 * Flujo automático de un vídeo suelto (sin lote). Regla fija del dueño (23/11/2026): el vídeo va
 * solo de principio a fin, sin avisos ni botones de «¿generar?»:
 *
 *   referencia lista → desglose → imagen inicial (1 por defecto) → [aprobación visual] → clip → montaje
 *
 * La única parada humana rutinaria es mirar la imagen (regla 2 del motor: «tras la aprobación
 * visual, clips y ediciones sin otra ronda»). Fuera de eso solo se para con **una** pregunta
 * concreta y obligatoria que solo el dueño puede resolver (quién sale, falta la foto del artículo,
 * no hay saldo, Higgsfield sin conectar, un fallo que no se repite solo porque cada intento
 * cuesta); se guarda en `videos.auto_stop` y en cuanto se responde (cambiando el vídeo o con
 * «Seguir») continúa sola.
 *
 * El dinero sigue pasando por el núcleo (`requestGeneration`: precio fresco, saldo, envío único y
 * el máximo de regeneraciones); el desglose, por el tope mensual de gasto (`spend.ts`). Los vídeos
 * de un lote los lleva el lote (`lote.ts`), con su presupuesto.
 */

export const AUTO_JOB = "video.automatico";

/** Cuántos vídeos sueltos mira como mucho el seguimiento en cada pasada. */
const SWEEP_LIMIT = 50;
/** Un vídeo suelto sin novedades desde hace más que esto ya no lo mira el seguimiento (sí al abrirlo). */
const SWEEP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const ACTIVE_ANALYSIS = ["queued", "running", "paused"];

/** Lo que el flujo automático está haciendo con un vídeo, para la pantalla. */
export type AutoStatus =
  /** De un lote: lo lleva el lote. */
  | { state: "lote" }
  /** Vídeo de antes del flujo automático que aún no ha abierto quien lo creó. */
  | { state: "off" }
  /** Algo en marcha o a punto de pedirse. */
  | { state: "working"; step: "desglose" | "imagen" | "clip" | "montaje" }
  /** La imagen espera la aprobación visual. */
  | { state: "review" }
  /** Parado con una sola pregunta obligatoria (`retry`: se resuelve con «Seguir»). */
  | { state: "question"; text: string; retry: boolean }
  /** Montado. */
  | { state: "done" };

type Generation = typeof schema.generations.$inferSelect;

async function generationsOf(videoId: number): Promise<{ frames: Generation[]; clips: Generation[] }> {
  const rows = await getDb().select().from(schema.generations).where(eq(schema.generations.videoId, videoId)).orderBy(asc(schema.generations.id));
  return { frames: rows.filter((g) => g.kind === "frame"), clips: rows.filter((g) => g.kind === "clip") };
}

/** Un fallo se queda parado hasta «Seguir» (cada intento cuesta): por eso la fecha de corte es el principio de los tiempos. */
const NEVER = new Date(0);

const frameStageOf = (video: Video, frames: Generation[]): Stage => stageOf(frames, video.approvedFrameResultId !== null, NEVER);
const clipStageOf = (clips: Generation[]): Stage => stageOf(clips, false, NEVER);

async function stop(videoId: number, reason: string): Promise<void> {
  await getDb().update(schema.videos).set({ autoStop: reason.slice(0, 500) }).where(eq(schema.videos.id, videoId));
}

/** Respuestas del núcleo que solo dicen «aún no»: se vuelve a mirar en la siguiente pasada. */
function isWait(error: HttpError): boolean {
  if (error.status !== 409) return false;
  // «Buscando referencias de Pinterest…» / «No se encontraron referencias de Pinterest…»: se están
  // buscando (regla fija: la imagen nunca va sin ellas); en la siguiente pasada ya estarán.
  return ["Ya hay", "Estamos comprobando", "El precio ha cambiado", "El vídeo ha cambiado", "Buscando referencias de Pinterest", "No se encontraron referencias de Pinterest"].some(
    (start) => error.message.startsWith(start),
  );
}

/**
 * Pide la siguiente ronda de `kind` con el precio fresco. Sin saldo, o con algo que solo el dueño
 * puede arreglar (400, Higgsfield sin conectar…), se para con ese motivo; sin enviar nada.
 */
async function requestAuto(user: AuthUser, video: Video, kind: GenerationKind, deps: GenDeps): Promise<void> {
  try {
    const quote = await quoteGeneration(user, video.id, kind, deps);
    if (quote.balance < quote.credits) {
      await stop(video.id, `No tienes créditos suficientes en Higgsfield: hacen falta ${quote.credits} y tienes ${quote.balance}. Recarga y pulsa «Seguir».`);
      return;
    }
    await requestGeneration(user, video.id, kind, { expectedCredits: quote.credits }, deps);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (isWait(error)) return;
    // Un prompt interno con errores no se pregunta (regla fija): se rehace el desglose, como mucho dos veces al día.
    if (error.code === PROMPT_ERROR && (await redoPrompt(user, video))) return;
    await stop(video.id, error.message);
  }
}

/** Rehace el desglose de un vídeo cuyo prompt no pasa la comprobación; `false` si ya se rehízo dos veces hoy. */
async function redoPrompt(user: AuthUser, video: Video): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, video.id), gte(schema.videoAnalyses.createdAt, since)));
  if (n > 2) return false;
  try {
    await requestAnalysis(user, video.id);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
  }
  return true;
}

/** El vídeo suelto y quien lo creó (activo), si el flujo automático lo lleva; si no, `null`. */
async function autoVideo(videoId: number): Promise<{ user: AuthUser; video: Video } | null> {
  const [row] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!row || row.batchId !== null || row.autoSince === null || row.autoStop !== null) return null;
  const user = await getActiveUser(row.createdBy);
  if (!user) return null;
  try {
    return { user, video: await getVideoFor(user, videoId) };
  } catch (error) {
    if (error instanceof HttpError) return null;
    throw error;
  }
}

/**
 * Un paso del flujo automático de un vídeo suelto: pide lo siguiente que toque y vuelve. Se puede
 * repetir sin miedo (cada paso se decide por lo que hay en la base de datos; el núcleo no apunta
 * dos generaciones, ni hay dos desgloses ni dos montajes a la vez). `deps`: Higgsfield simulado.
 */
export async function advanceVideo(videoId: number, deps: GenDeps = {}): Promise<void> {
  const found = await autoVideo(videoId);
  if (!found) return;
  const { user, video } = found;

  // 1. Referencia y lo obligatorio (quién sale, la foto del artículo, la adaptación): lo pregunta la pantalla.
  if (video.referenceStatus !== "ready" || referenceOutdated(video)) return;
  const brief = briefOf(await withProductNotes(video));
  if ((await missingForAnalysis(user, video, brief)) !== null) return;

  // 2. Desglose: sin uno que valga para esta referencia y estas indicaciones, se pide (una vez).
  const [latest] = await getDb()
    .select({ status: schema.videoAnalyses.status })
    .from(schema.videoAnalyses)
    .where(eq(schema.videoAnalyses.videoId, video.id))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  if (latest && ACTIVE_ANALYSIS.includes(latest.status)) return;
  const done = await latestDoneAnalysis(video);
  if (!done || done.staleReason !== null) {
    // Un desglose que falló no se repite solo (cuesta): la pantalla lo enseña con «Repetir desglose».
    if (latest?.status === "failed") return;
    try {
      await requestAnalysis(user, video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.status !== 409) await stop(video.id, error.message);
    }
    return;
  }

  // 3. Imagen inicial: se pide sola; luego espera la aprobación visual.
  const { frames, clips } = await generationsOf(video.id);
  const frame = frameStageOf(video, frames);
  if (frame === "need") return requestAuto(user, video, "frame", deps);
  if (frame === "failed" || frame === "maxed") return stop(video.id, frameStopReason(frame, frames));
  if (frame !== "approved") return;

  // 4. Clip, en cuanto la imagen está aprobada.
  const clip = clipStageOf(clips);
  if (clip === "need") return requestAuto(user, video, "clip", deps);
  if (clip === "failed" || clip === "maxed") return stop(video.id, clipStopReason(clip, clips));
  if (clip !== "done") return;

  // 5. Subida a 1080p con Topaz (orden de Emmanuel, 24/11/2026, como Codex: antes del montaje). Un
  // fallo se repite solo; tras 3, se monta con el de 480p.
  if (video.editStatus !== null) return;
  const upscales = (await getDb().select().from(schema.generations).where(and(eq(schema.generations.videoId, video.id), eq(schema.generations.kind, "upscale"))).orderBy(asc(schema.generations.id)));
  const lastUpscale = upscales.at(-1);
  if (lastUpscale && ["intent", "submitting", "submitted", "unknown"].includes(lastUpscale.status)) return;
  const failedUpscales = upscales.filter((g) => g.status === "failed" || g.status === "not_sent").length;
  if (lastUpscale?.status !== "done" && failedUpscales < 3) return requestAuto(user, video, "upscale", deps);

  // 6. Montaje, en cuanto el clip está subido (una vez: «Volver a montar» es cosa de la persona).
  const { startEdit, ALREADY_RUNNING } = await import("@/server/videos/edits");
  try {
    await startEdit(user, video.id);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.message !== ALREADY_RUNNING) await stop(video.id, error.message);
  }
}

function frameStopReason(stage: Stage, frames: Generation[]): string {
  if (stage === "maxed") return "La imagen ha llegado al máximo de regeneraciones. Empieza un vídeo nuevo para probar otra.";
  return frames.at(-1)?.error ?? "Higgsfield no ha podido generar la imagen.";
}

function clipStopReason(stage: Stage, clips: Generation[]): string {
  if (stage === "maxed") return "El clip ha llegado al máximo de regeneraciones. Empieza un vídeo nuevo para probar otro.";
  return clips.at(-1)?.error ?? "Higgsfield no ha podido generar el clip.";
}

// ───────────────────────── Avisar, armar y seguir ─────────────────────────

/** Encola un paso del flujo automático de un vídeo suelto, o avisa a su lote. Nunca lanza. */
export async function kickVideo(videoId: number): Promise<void> {
  try {
    const [row] = await getDb()
      .select({ batchId: schema.videos.batchId, createdBy: schema.videos.createdBy, productId: schema.videos.productId, autoSince: schema.videos.autoSince })
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId));
    if (!row) return;
    if (row.batchId !== null) return await kickBatchOfVideo(videoId);
    if (row.autoSince === null) return;
    await enqueueJob(AUTO_JOB, { userId: row.createdBy, productId: row.productId }, { videoId });
  } catch (error) {
    console.error(`[videos] No se pudo avisar al flujo automático del vídeo ${videoId}:`, error);
  }
}

/** Tras terminar una generación: el vídeo (o su lote) sigue sin esperar al seguimiento. Nunca lanza. */
export async function kickVideoOfGeneration(generationId: number): Promise<void> {
  try {
    const [row] = await getDb().select({ videoId: schema.generations.videoId }).from(schema.generations).where(eq(schema.generations.id, generationId));
    if (row) await kickVideo(row.videoId);
  } catch (error) {
    console.error(`[videos] No se pudo avisar del final de la generación ${generationId}:`, error);
  }
}

/** Tras un desglose: el vídeo sigue solo. Nunca lanza. */
export async function kickVideoOfAnalysis(analysisId: number): Promise<void> {
  try {
    const [row] = await getDb().select({ videoId: schema.videoAnalyses.videoId }).from(schema.videoAnalyses).where(eq(schema.videoAnalyses.id, analysisId));
    if (row) await kickVideo(row.videoId);
  } catch (error) {
    console.error(`[videos] No se pudo avisar del final del desglose ${analysisId}:`, error);
  }
}

/**
 * Al abrir un vídeo suelto de antes del flujo automático, quien lo creó lo pone a andar solo
 * (así publicar no gasta créditos en vídeos viejos que nadie mira). Nunca lanza.
 */
export async function armOnOpen(user: AuthUser, videoId: number): Promise<void> {
  try {
    const armed = await getDb()
      .update(schema.videos)
      .set({ autoSince: new Date() })
      .where(and(eq(schema.videos.id, videoId), eq(schema.videos.createdBy, user.id), isNull(schema.videos.batchId), isNull(schema.videos.autoSince)))
      .returning({ id: schema.videos.id });
    if (armed.length > 0) await kickVideo(videoId);
  } catch (error) {
    console.error(`[videos] No se pudo poner en automático el vídeo ${videoId}:`, error);
  }
}

/**
 * «Seguir»: la respuesta a la pregunta con la que se paró (recargó saldo, quiere reintentar un
 * fallo…). Quita la parada y pide el paso siguiente, también lo que falló. Solo quien creó el vídeo.
 */
export async function resumeVideo(user: AuthUser, videoId: number, deps: GenDeps = {}): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (video.batchId !== null) return kickBatchOfVideo(video.id);
  await getDb().update(schema.videos).set({ autoStop: null, autoSince: video.autoSince ?? new Date() }).where(eq(schema.videos.id, video.id));
  const found = await autoVideo(video.id);
  if (!found) return;
  // Un fallo que ya se dio por visto: se pide otra ronda directamente (el núcleo pone el máximo de rondas).
  const { frames, clips } = await generationsOf(video.id);
  if (frameStageOf(found.video, frames) === "failed") return requestAuto(found.user, found.video, "frame", deps);
  if (found.video.approvedFrameResultId !== null && clipStageOf(clips) === "failed") return requestAuto(found.user, found.video, "clip", deps);
  await advanceVideo(video.id, deps);
}

/** Cualquier cambio de quien creó el vídeo responde a la pregunta con la que se paró: sigue solo. */
export async function clearStop(videoId: number): Promise<void> {
  await getDb().update(schema.videos).set({ autoStop: null }).where(and(eq(schema.videos.id, videoId), isNotNull(schema.videos.autoStop)));
}

/** Para el seguimiento de cada minuto: un paso de cada vídeo suelto que va solo y no ha terminado. */
export async function advanceSoloVideos(now: Date = new Date(), deps: GenDeps = {}): Promise<void> {
  const rows = await getDb()
    .select({ id: schema.videos.id })
    .from(schema.videos)
    .where(
      and(
        isNull(schema.videos.batchId),
        isNotNull(schema.videos.autoSince),
        isNull(schema.videos.autoStop),
        isNull(schema.videos.editStatus),
        eq(schema.videos.referenceStatus, "ready"),
        gte(sql`greatest(${schema.videos.updatedAt}, ${schema.videos.autoSince})`, new Date(now.getTime() - SWEEP_WINDOW_MS)),
      ),
    )
    .orderBy(desc(schema.videos.updatedAt))
    .limit(SWEEP_LIMIT);
  for (const { id } of rows) {
    try {
      await advanceVideo(id, deps);
    } catch (error) {
      console.error(`[videos] No se pudo avanzar el vídeo ${id}:`, error);
    }
  }
}

// ───────────────────────── Para la pantalla ─────────────────────────

/** Qué está haciendo el flujo automático con un vídeo (no pide nada). */
export async function autoStatusOf(user: AuthUser, video: Video): Promise<AutoStatus> {
  if (video.batchId !== null) return { state: "lote" };
  if (video.autoSince === null) return { state: "off" };
  if (video.autoStop !== null) return { state: "question", text: video.autoStop, retry: true };
  if (video.editStatus === "hecho") return { state: "done" };
  if (video.editStatus !== null) return { state: "working", step: "montaje" };
  if (video.referenceStatus !== "ready" || referenceOutdated(video)) return { state: "working", step: "desglose" };
  const missing = await missingForAnalysis(user, video, briefOf(await withProductNotes(video)));
  if (missing) return { state: "question", text: missing, retry: false };
  const done = await latestDoneAnalysis(video);
  if (!done || done.staleReason !== null) {
    const [latest] = await getDb()
      .select({ status: schema.videoAnalyses.status, error: schema.videoAnalyses.error })
      .from(schema.videoAnalyses)
      .where(eq(schema.videoAnalyses.videoId, video.id))
      .orderBy(desc(schema.videoAnalyses.version))
      .limit(1);
    // Se resuelve con «Repetir desglose», en el propio paso.
    if (latest?.status === "failed") return { state: "question", text: latest.error ?? "El desglose falló.", retry: false };
    return { state: "working", step: "desglose" };
  }
  const { frames, clips } = await generationsOf(video.id);
  const frame = frameStageOf(video, frames);
  if (frame === "done") return { state: "review" };
  if (frame === "failed" || frame === "maxed") return { state: "question", text: frameStopReason(frame, frames), retry: frame === "failed" };
  if (frame !== "approved") return { state: "working", step: "imagen" };
  const clip = clipStageOf(clips);
  if (clip === "failed" || clip === "maxed") return { state: "question", text: clipStopReason(clip, clips), retry: clip === "failed" };
  if (clip !== "done") return { state: "working", step: "clip" };
  return { state: "working", step: "montaje" };
}
