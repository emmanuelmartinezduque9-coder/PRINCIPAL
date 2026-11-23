import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import { linkStatesOf } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { activeAvatarSummaries, type AvatarSummary } from "@/server/avatars";
import { listProductPhotos, type PhotoInfo } from "@/server/photos";
import { listSongs } from "@/server/songs";
import { listVariants, type VariantInfo } from "@/server/variants";
import { missingForAnalysis, requestAnalysis, type Analysis } from "@/server/videos/analysis";
import { getBatchFor, type Batch } from "@/server/videos/batches";
import { briefOf, type OwnerAnswer } from "@/server/videos/brief";
import { estimateClipCredits } from "@/server/videos/clip";
import { PINTEREST_PENDING } from "@/server/videos/pinterest";
// Registra el constructor de la imagen inicial (`frame`) en las generaciones.
import "@/server/videos/frame";
import { MAX_REGENERATIONS, quoteGeneration, requestGeneration, type GenDeps, type GenerationKind } from "@/server/videos/generations";
import { getVideoFor, setVideoSong, referenceOutdated, REFERENCE_OUTDATED, staleness, updateVideoChoices, withProductNotes, type Video } from "@/server/videos/videos";

/**
 * «Enviar lote»: el dueño envía el lote una vez y no se le molesta más.
 *
 * 1. `sendBatch`: pide el desglose de cada vídeo que no tenga uno que valga y pasa a `preguntas`.
 * 2. «Preguntas del lote» (`batchQuestions` / `answerQuestion`): todo lo que hay que decidir, de
 *    todos los vídeos a la vez y ANTES de generar nada: las preguntas de Claude en el desglose y
 *    las de la aplicación (falta la foto del artículo, quién sale, un enlace que falló, un desglose
 *    fallido, un riesgo que bloquea…). Las respuestas se guardan en el vídeo y vuelven a Claude: al
 *    quedar respondidas, el desglose se repite con ellas (`answersText` en `brief.ts`).
 * 3. Presupuesto: con todo respondido, el avance lo autoriza solo (`autoConfirmBatch`, regla fija
 *    del dueño del 23/11/2026: sin botones de «¿generar?»): todas las imágenes (1 por vídeo salvo
 *    que pida más) + una estimación de todos los clips; se guarda lo autorizado (`budget_credits`).
 *    Sin saldo para todo, o si algo no se puede presupuestar, se para con ese único motivo. Los
 *    lotes de antes (`auto_confirm` = false) siguen con su «Confirmar» (`quoteBatch` / `confirmBatch`).
 * 4. `advanceBatch` (trabajo `lote.avanzar` y el seguimiento de cada minuto): pide cada imagen y,
 *    cuando TODAS están aprobadas, cada clip. Siempre por `requestGeneration` (el núcleo del
 *    dinero: su precio fresco, `expectedCredits`, su instantánea y su envío único), como mucho 2 a
 *    la vez. Si un precio supera lo previsto, el total pasaría de lo autorizado, falta saldo o algo
 *    falla, el lote queda `pausado` con el motivo y no se envía nada más hasta «Continuar».
 * 5. «Revisar imágenes» sigue siendo el paso humano; un rechazo se regenera solo (dentro de sus
 *    rondas y del presupuesto).
 * 6. Con todos los clips hechos, `listo` (y `onBatchReady`: el montaje en el Mac, `edits.ts`); con
 *    todos los montajes terminados (o fallidos con su motivo), `montado`.
 */

export const BATCH_STATUSES = ["borrador", "preguntas", "imagenes", "revision_imagenes", "clips", "listo", "montado", "pausado"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
/** Estados en los que el lote avanza solo. */
const RUNNING: BatchStatus[] = ["preguntas", "imagenes", "revision_imagenes", "clips"];

export const ADVANCE_JOB = "lote.avanzar";
/** Generaciones en marcha a la vez en un lote, como mucho. */
export const AUTO_PARALLEL = 2;
/** Reserva de un avance: si el proceso se cae a mitad, pasado esto otro puede avanzar. */
const ADVANCE_LEASE_MS = 5 * 60 * 1000;
/** «Saltar este vídeo». */
export const SKIP = "__saltar__";
/** «Seguir así» ante un riesgo: cierra la pregunta sin cambiar el desglose. */
export const KEEP = "__seguir__";
/** «Repetir desglose». */
export const RETRY = "__repetir__";
const MAX_ANSWER = 2_000;
/** Una referencia «subiéndose» sin novedades desde hace más que esto se da por interrumpida. */
const UPLOAD_WAIT_MS = 15 * 60 * 1000;

/** Riesgos del desglose que no dejan generar sin que el dueño decida. */

const NOT_DRAFT = "Este lote ya se ha enviado.";
const NO_ROWS = "El lote no tiene vídeos que enviar.";
const NOT_ASKING = "El lote no está esperando respuestas.";
const NOT_READY = "Quedan preguntas por responder o desgloses en marcha.";
const NOT_PAUSED = "El lote no está en pausa.";
const NO_QUESTION = "Esa pregunta ya no está abierta.";
const BAD_ANSWER = `Escribe la respuesta (máximo ${MAX_ANSWER} caracteres).`;
const BAD_EXTRA = "Confirma los créditos de más antes de continuar.";
const ONLY_CREATOR = "Solo quien creó el lote puede enviarlo.";
const VIDEO_NOT_IN_BATCH = "Vídeo no encontrado.";

const priceChanged = (total: number) => `El precio ha cambiado: ahora son ${total} créditos. Revísalo y confirma de nuevo.`;

type Generation = typeof schema.generations.$inferSelect;
type AnalysisRow = typeof schema.videoAnalyses.$inferSelect;
export type BatchPause = NonNullable<Batch["pause"]>;

// ───────────────────────── Filas del lote ─────────────────────────

interface Row {
  video: Video;
  frames: Generation[];
  clips: Generation[];
  /** Del más reciente al más antiguo. */
  analyses: AnalysisRow[];
}

/**
 * Los vídeos del lote que el envío automático lleva: los de quien creó el lote, de productos que
 * sigue viendo y sin «Saltar». Con sus generaciones (de la más antigua a la más reciente) y sus
 * desgloses.
 */
async function rowsOf(user: AuthUser, batch: Batch, options: { withSkipped?: boolean } = {}): Promise<Row[]> {
  const db = getDb();
  const list = await db
    .select()
    .from(schema.videos)
    .where(and(eq(schema.videos.batchId, batch.id), eq(schema.videos.createdBy, batch.createdBy)))
    .orderBy(asc(schema.videos.id));
  const visible: Video[] = [];
  for (const video of list) {
    if (video.autoSkipped && !options.withSkipped) continue;
    try {
      visible.push(await getVideoFor(user, video.id));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
  }
  if (visible.length === 0) return [];
  const ids = visible.map((video) => video.id);
  const gens = await db.select().from(schema.generations).where(inArray(schema.generations.videoId, ids)).orderBy(asc(schema.generations.id));
  const analyses = await db
    .select()
    .from(schema.videoAnalyses)
    .where(inArray(schema.videoAnalyses.videoId, ids))
    .orderBy(desc(schema.videoAnalyses.version));
  return visible.map((video) => ({
    video,
    frames: gens.filter((g) => g.videoId === video.id && g.kind === "frame"),
    clips: gens.filter((g) => g.videoId === video.id && g.kind === "clip"),
    analyses: analyses.filter((a) => a.videoId === video.id),
  }));
}

const ACTIVE_ANALYSIS = ["queued", "running", "paused"];
const BUSY_GENERATION = ["intent", "submitting", "submitted", "unknown"];
const SPENT = ["submitted", "done", "failed"];

/**
 * En qué punto está un tipo de generación de una fila:
 * - `need`: hay que pedirla (no hay ninguna, se rechazó y quedan rondas, o falló antes del último
 *   «Continuar»);
 * - `busy`: apuntada, enviándose, enviada o en duda;
 * - `failed`: falló (o no se envió) después del último «Continuar»: pausa;
 * - `maxed`: rechazada sin rondas: pausa;
 * - `done`: terminada sin rechazar (la imagen, por revisar); `approved`: imagen aprobada.
 */
export type Stage = "need" | "busy" | "failed" | "maxed" | "done" | "approved";

export function stageOf(gens: readonly Pick<Generation, "status" | "rejectReason" | "finishedAt" | "intentAt">[], approved: boolean, retryAfter: Date): Stage {
  const last = gens.at(-1);
  if (approved) return "approved";
  if (!last) return "need";
  if (BUSY_GENERATION.includes(last.status)) return "busy";
  const spent = gens.filter((g) => SPENT.includes(g.status)).length;
  const roundsLeft = spent < 1 + MAX_REGENERATIONS;
  if (last.status === "done" && !last.rejectReason) return "done";
  if (last.rejectReason) return roundsLeft ? "need" : "maxed";
  // `not_sent` o `failed` sin rechazar.
  if ((last.finishedAt ?? last.intentAt).getTime() > retryAfter.getTime()) return "failed";
  return roundsLeft || last.status === "not_sent" ? "need" : "maxed";
}

function retryAfterOf(batch: Batch): Date {
  const times = [batch.confirmedAt, batch.resumedAt].filter((d): d is Date => d !== null).map((d) => d.getTime());
  return new Date(times.length > 0 ? Math.max(...times) : 0);
}

const frameStage = (row: Row, batch: Batch) => stageOf(row.frames, row.video.approvedFrameResultId !== null, retryAfterOf(batch));
const clipStage = (row: Row, batch: Batch) => stageOf(row.clips, false, retryAfterOf(batch));

// ───────────────────────── Preguntas ─────────────────────────

export interface QuestionOption {
  value: string;
  label: string;
  /** Una foto del producto (avatar) para enseñarla en la opción. */
  photoId?: number;
  /** Un avatar de la biblioteca para enseñarlo en la opción. */
  avatarId?: number;
}

export interface BatchQuestion {
  videoId: number;
  key: string;
  kind: "claude" | "riesgo" | "cancion" | "avatar" | "biblioteca" | "variante" | "articulo" | "referencia" | "adaptacion" | "desglose";
  text: string;
  options: QuestionOption[];
  /** Se puede responder escribiendo. */
  freeText: boolean;
  /** A dónde ir para arreglarlo (la ficha del producto o el vídeo). */
  href: string | null;
}

type RowAsk = { state: "ready" } | { state: "waiting" } | { state: "questions"; questions: BatchQuestion[] } | { state: "needsAnalysis" };

const videoHref = (video: Video) => `/productos/${video.productId}/videos/${video.id}`;
const skipOption: QuestionOption = { value: SKIP, label: "Saltar este vídeo" };

/** Lo que necesitan las preguntas de avatar y variante del desglose. */
interface AskContext {
  library: AvatarSummary[];
  variants: VariantInfo[];
  songs: Array<{ id: number; label: string }>;
}

/** Valores de las opciones de las preguntas `avatar` y `variante` del desglose. */
const LIBRARY_PREFIX = "bib:";
const VARIANT_PREFIX = "var:";
const SONG_PREFIX = "song:";
const ORIGINAL_AUDIO = "audio:original";
const NO_VARIANT = "var:todas";

/**
 * Las preguntas de avatar y variante que añade el desglose (`analysisExtras`) se responden eligiendo:
 * un avatar de la biblioteca (primero los que sugiere, después los demás) o una variante (o las
 * fotos de siempre). La respuesta cambia el vídeo (`answerQuestion`).
 */
function choiceQuestion(video: Video, key: string, question: { id: string; text: string; options?: string[] }, context: AskContext): BatchQuestion | null {
  if (question.id === "avatar") {
    const suggested = question.options ?? [];
    const rank = (name: string) => (suggested.includes(name) ? suggested.indexOf(name) : suggested.length);
    const avatars = [...context.library].sort((a, b) => rank(a.name) - rank(b.name));
    return {
      videoId: video.id,
      key,
      kind: "biblioteca",
      text: question.text,
      options: [...avatars.map((avatar) => ({ value: `${LIBRARY_PREFIX}${avatar.id}`, label: avatar.name, avatarId: avatar.id })), skipOption],
      freeText: false,
      href: null,
    };
  }
  if (question.id === "variante" && context.variants.length > 0) {
    return {
      videoId: video.id,
      key,
      kind: "variante",
      text: question.text,
      options: [
        ...context.variants.map((variant) => ({ value: `${VARIANT_PREFIX}${variant.id}`, label: variant.name, photoId: variant.articlePhotoIds[0] })),
        { value: NO_VARIANT, label: "Fotos de siempre" },
      ],
      freeText: false,
      href: null,
    };
  }
  return null;
}

/** Las preguntas de Claude que siguen abiertas en un desglose hecho (ni por su clave ni por su texto respondidas). */
function openClaudeQuestions(video: Video, analysis: AnalysisRow, context: AskContext): BatchQuestion[] {
  const result = analysis.result as Analysis | null;
  const answers = video.ownerAnswers ?? [];
  const keys = new Set(answers.map((a) => a.key));
  const texts = new Set(answers.map((a) => a.question.trim()));
  const questions: BatchQuestion[] = [];
  for (const question of result?.questions ?? []) {
    const key = `c${analysis.id}:${question.id}`;
    if (keys.has(key) || texts.has(question.text.trim())) continue;
    const choice = choiceQuestion(video, key, question, context);
    if (choice) {
      questions.push(choice);
      continue;
    }
    // Solo preguntas que el dueño tiene que decidir (avatar, variante); ni preguntas libres de
    // Claude ni riesgos: el dueño no quiere que se le cuestione el lote (22/11).
  }
  return questions;
}

/**
 * Lo que pasa con una fila en «Preguntas»: lista para el presupuesto, esperando (subida,
 * enlace o desglose en marcha), con preguntas, o con el desglose por pedir (nada falta y no hay
 * uno que valga). Las preguntas de la aplicación salen de lo mismo que comprueba el desglose.
 */
async function askRow(user: AuthUser, row: Row, photos: PhotoInfo[], linkFailed: string | null, linkPending: boolean, context: AskContext): Promise<RowAsk> {
  const { video } = row;
  const ask = (q: Omit<BatchQuestion, "videoId">[]): RowAsk => ({ state: "questions", questions: q.map((x) => ({ ...x, videoId: video.id })) });

  // La referencia: mientras se sube, se prepara o el Mac trae un enlace, se espera.
  const uploadingNow = video.referenceStatus === "uploading" && video.updatedAt.getTime() > Date.now() - UPLOAD_WAIT_MS;
  if (linkPending || video.referenceStatus === "processing" || uploadingNow) return { state: "waiting" };
  if (video.referenceStatus !== "ready" || referenceOutdated(video)) {
    const text =
      linkFailed ??
      (video.referenceStatus === "failed"
        ? (video.referenceError ?? "No se pudo preparar el vídeo de referencia.")
        : video.referenceStatus === "uploading"
          ? "La subida no terminó. Vuelve a elegir el vídeo en su página."
          : referenceOutdated(video)
            ? REFERENCE_OUTDATED
            : "Falta el vídeo de referencia.");
    return ask([{ key: "sys:referencia", kind: "referencia", text, options: [skipOption], freeText: false, href: videoHref(video) }]);
  }

  const questions: Omit<BatchQuestion, "videoId">[] = [];
  const avatars = photos.filter((photo) => photo.role === "avatar");
  const missingPhoto = video.avatarMode === "elegido" && !avatars.some((photo) => photo.id === video.avatarPhotoId);
  const missingLibrary = video.avatarMode === "biblioteca" && video.avatarLibraryId === null;
  if (missingPhoto || missingLibrary) {
    questions.push({
      key: "sys:avatar",
      kind: "avatar",
      text: "¿Quién sale?",
      options: [
        ...avatars.map((photo) => ({ value: `foto:${photo.id}`, label: "Avatar", photoId: photo.id })),
        ...(context.library.length > 0 ? [{ value: "automatico", label: "Automático" }] : []),
        { value: "sin_sustitucion", label: "Sin sustitución" },
        { value: "nadie", label: "No aparece nadie" },
      ],
      freeText: false,
      href: null,
    });
  }
  if (!photos.some((photo) => photo.role === "articulo")) {
    questions.push({
      key: "sys:articulo",
      kind: "articulo",
      text: "Falta una foto del artículo.",
      options: [skipOption],
      freeText: false,
      href: `/productos/${video.productId}`,
    });
  }
  // La música no se pregunta: «Audio original» en la tarjeta es una elección (el audio de la referencia).
  if (video.kind === "adaptacion_concepto" && !video.adaptation?.trim()) {
    questions.push({ key: "sys:adaptacion", kind: "adaptacion", text: "¿Qué adaptación quieres?", options: [], freeText: true, href: null });
  }
  if (questions.length > 0) return ask(questions);

  const [latest] = row.analyses;
  if (latest && ACTIVE_ANALYSIS.includes(latest.status)) {
    if (latest.status !== "paused") return { state: "waiting" };
    return ask([{ key: "sys:desglose", kind: "desglose", text: latest.error ?? "El desglose está en pausa.", options: [skipOption], freeText: false, href: null }]);
  }
  const done = row.analyses.find((a) => a.status === "done");
  const notes = await withProductNotes(video);
  const doneStale = done ? staleness(done, notes).staleReason : "reference";
  // Lo que Claude preguntó (aunque las respuestas ya dejen el desglose por repetir).
  if (done && doneStale !== "reference") {
    const open = openClaudeQuestions(video, done, context);
    if (open.length > 0) return { state: "questions", questions: open };
  }
  if (done && doneStale === null) return { state: "ready" };
  // Un desglose que falló no se repite solo (cada intento cuesta): lo decide el dueño.
  if (latest?.status === "failed") {
    return ask([
      {
        key: "sys:desglose",
        kind: "desglose",
        text: latest.error ?? "El desglose falló.",
        options: [{ value: RETRY, label: "Repetir desglose" }, skipOption],
        freeText: false,
        href: null,
      },
    ]);
  }
  return { state: "needsAnalysis" };
}

/** Lo que pasa con cada fila del lote en «Preguntas». */
async function askRows(user: AuthUser, rows: Row[]): Promise<Map<number, RowAsk>> {
  const photosOf = new Map<number, PhotoInfo[]>();
  const variantsOf = new Map<number, VariantInfo[]>();
  for (const productId of new Set(rows.map((row) => row.video.productId))) {
    photosOf.set(productId, await listProductPhotos(user, productId));
    variantsOf.set(productId, await listVariants(user, productId));
  }
  const library = await activeAvatarSummaries();
  const songs = (await listSongs()).map((song) => ({ id: song.id, label: song.number === null ? song.title : `${song.number} · ${song.title}` }));
  const links = await linkStatesOf(rows.flatMap((row) => (row.video.linkTaskId === null ? [] : [row.video.linkTaskId])));
  const result = new Map<number, RowAsk>();
  for (const row of rows) {
    const link = row.video.linkTaskId === null ? null : (links.get(row.video.linkTaskId) ?? null);
    result.set(
      row.video.id,
      await askRow(user, row, photosOf.get(row.video.productId) ?? [], link?.status === "failed" ? link.error : null, link !== null && link.status !== "failed", {
        library,
        variants: variantsOf.get(row.video.productId) ?? [],
        songs,
      }),
    );
  }
  return result;
}

/** Las preguntas abiertas de un lote que `user` creó (vacío fuera de «Preguntas»). */
export async function batchQuestions(user: AuthUser, batchId: number): Promise<BatchQuestion[]> {
  const batch = await ownBatch(user, batchId);
  if (batch.status !== "preguntas") return [];
  const asks = await askRows(user, await rowsOf(user, batch));
  return [...asks.values()].flatMap((ask) => (ask.state === "questions" ? ask.questions : []));
}

function cleanAnswer(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, BAD_ANSWER);
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text || text.length > MAX_ANSWER) throw new HttpError(400, BAD_ANSWER);
  return text;
}

/**
 * Responde una pregunta abierta de un vídeo del lote (`key` y `value`). Las de Claude (y lo que se
 * escriba ante un riesgo) se guardan en el vídeo y llegan al desglose: cuando el vídeo ya no tiene
 * preguntas, el avance lo vuelve a desglosar con ellas. «Quién sale» y «Qué adaptación quieres»
 * cambian el vídeo (como en su pantalla); «Saltar este vídeo» lo deja fuera del envío; «Repetir
 * desglose» lo pide. Solo quien creó el lote y solo en «Preguntas».
 */
export async function answerQuestion(user: AuthUser, batchId: number, input: { videoId: unknown; key: unknown; value: unknown }): Promise<void> {
  const batch = await ownBatch(user, batchId);
  if (batch.status !== "preguntas") throw new HttpError(409, NOT_ASKING);
  const videoId = typeof input.videoId === "number" ? input.videoId : Number.NaN;
  const video = await getVideoFor(user, videoId);
  if (video.batchId !== batch.id || video.createdBy !== user.id || video.autoSkipped) throw new HttpError(404, VIDEO_NOT_IN_BATCH);
  const [row] = (await rowsOf(user, batch)).filter((r) => r.video.id === video.id);
  const ask = row ? (await askRows(user, [row])).get(video.id) : undefined;
  const question = ask?.state === "questions" ? ask.questions.find((q) => q.key === input.key) : undefined;
  if (!question) throw new HttpError(409, NO_QUESTION);
  const value = cleanAnswer(input.value);

  if (value === SKIP) {
    if (!question.options.some((o) => o.value === SKIP)) throw new HttpError(400, BAD_ANSWER);
    await getDb().update(schema.videos).set({ autoSkipped: true, updatedAt: new Date() }).where(eq(schema.videos.id, video.id));
  } else if (question.kind === "avatar") {
    if (!question.options.some((o) => o.value === value)) throw new HttpError(400, BAD_ANSWER);
    const photoId = value.startsWith("foto:") ? Number(value.slice(5)) : null;
    await updateVideoChoices(user, video.id, photoId !== null ? { avatarPhotoId: photoId } : { avatarMode: value });
  } else if (question.kind === "biblioteca" || question.kind === "variante") {
    if (!question.options.some((o) => o.value === value)) throw new HttpError(400, BAD_ANSWER);
    // Cambia el vídeo (el desglose queda por repetir y el avance lo repite) y cierra la pregunta.
    if (question.kind === "biblioteca") await updateVideoChoices(user, video.id, { avatarLibraryId: Number(value.slice(LIBRARY_PREFIX.length)) });
    else await updateVideoChoices(user, video.id, { variantId: value === NO_VARIANT ? null : Number(value.slice(VARIANT_PREFIX.length)) });
    const label = question.options.find((o) => o.value === value)?.label ?? value;
    await saveAnswer(video.id, { key: question.key, question: question.text, answer: label, inBrief: false });
  } else if (question.kind === "cancion") {
    if (!question.options.some((o) => o.value === value)) throw new HttpError(400, BAD_ANSWER);
    if (value !== ORIGINAL_AUDIO) await setVideoSong(user, video.id, Number(value.slice(SONG_PREFIX.length)));
    const label = question.options.find((o) => o.value === value)?.label ?? value;
    await saveAnswer(video.id, { key: question.key, question: question.text, answer: label, inBrief: false });
  } else if (question.kind === "adaptacion") {
    await updateVideoChoices(user, video.id, { adaptation: value });
  } else if (question.kind === "desglose") {
    if (value !== RETRY || !question.options.some((o) => o.value === RETRY)) throw new HttpError(400, BAD_ANSWER);
    await requestAnalysis(user, video.id);
  } else if (question.kind === "claude" || question.kind === "riesgo") {
    const keep = question.kind === "riesgo" && value === KEEP;
    if (value === KEEP && !keep) throw new HttpError(400, BAD_ANSWER);
    const answer: OwnerAnswer = { key: question.key, question: question.text, answer: keep ? "Seguir así" : value, inBrief: !keep };
    await saveAnswer(video.id, answer);
  } else {
    // «Falta la foto del artículo» y la referencia solo se cierran arreglándolo (o saltando el vídeo).
    throw new HttpError(400, BAD_ANSWER);
  }
  await kickBatch(batch);
}

/** Guarda una respuesta en el vídeo, con el cerrojo de la fila: dos respuestas a la vez no se pisan. */
async function saveAnswer(videoId: number, answer: OwnerAnswer): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [current] = await tx.select({ answers: schema.videos.ownerAnswers }).from(schema.videos).where(eq(schema.videos.id, videoId)).for("update");
    const answers = (current?.answers ?? []).filter((a) => a.key !== answer.key);
    await tx.update(schema.videos).set({ ownerAnswers: [...answers, answer], updatedAt: new Date() }).where(eq(schema.videos.id, videoId));
  });
}

// ───────────────────────── Enviar y confirmar ─────────────────────────

async function ownBatch(user: AuthUser, batchId: number): Promise<Batch> {
  const batch = await getBatchFor(user, batchId);
  if (batch.createdBy !== user.id) throw new HttpError(403, ONLY_CREATOR);
  return batch;
}

/** Encola `lote.avanzar` (sin producto: el lote es de varios). Si no se puede, ya lo hará el seguimiento. */
export async function kickBatch(batch: Pick<Batch, "id" | "createdBy">): Promise<void> {
  try {
    await enqueueJob(ADVANCE_JOB, { userId: batch.createdBy, productId: null }, { batchId: batch.id });
  } catch (error) {
    console.error(`[lotes] No se pudo encolar el avance del lote ${batch.id}:`, error);
  }
}

/** Tras aprobar o rechazar una imagen: el lote de ese vídeo, si va solo, sigue sin esperar al seguimiento. */
export async function kickBatchOfVideo(videoId: number): Promise<void> {
  const [row] = await getDb()
    .select({ id: schema.batches.id, createdBy: schema.batches.createdBy, status: schema.batches.status })
    .from(schema.videos)
    .innerJoin(schema.batches, eq(schema.batches.id, schema.videos.batchId))
    .where(eq(schema.videos.id, videoId));
  if (row && RUNNING.includes(row.status as BatchStatus)) await kickBatch(row);
}

/** Tras terminar una generación (`video.finalizar`): avisa a su lote. Nunca lanza. */
export async function kickBatchOfGeneration(generationId: number): Promise<void> {
  try {
    const [row] = await getDb()
      .select({ videoId: schema.generations.videoId })
      .from(schema.generations)
      .where(eq(schema.generations.id, generationId));
    if (row) await kickBatchOfVideo(row.videoId);
  } catch (error) {
    console.error(`[lotes] No se pudo avisar al lote de la generación ${generationId}:`, error);
  }
}

/**
 * «Enviar lote»: pide el desglose de cada vídeo que no tiene uno que valga (sin ninguno, fallido o
 * de otra referencia u otras indicaciones) y al que no le falta nada, y pasa el lote a
 * «Preguntas». Lo que falte lo pregunta la pantalla. Solo quien creó el lote, una vez.
 */
export async function sendBatch(user: AuthUser, batchId: number): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  if (batch.status !== "borrador") throw new HttpError(409, NOT_DRAFT);
  const rows = await rowsOf(user, batch);
  if (rows.length === 0) throw new HttpError(400, NO_ROWS);
  for (const row of rows) {
    const [latest] = row.analyses;
    if (latest && ACTIVE_ANALYSIS.includes(latest.status)) continue;
    const done = row.analyses.find((a) => a.status === "done");
    const notes = await withProductNotes(row.video);
    if (done && staleness(done, notes).staleReason === null) continue;
    if ((await missingForAnalysis(user, row.video, briefOf(notes))) !== null) continue;
    try {
      await requestAnalysis(user, row.video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
  }
  const [updated] = await getDb()
    .update(schema.batches)
    .set({ status: "preguntas", sentAt: new Date() })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "borrador")))
    .returning();
  if (!updated) throw new HttpError(409, NOT_DRAFT);
  await kickBatch(updated);
  return updated;
}

export interface BatchQuote {
  rows: Array<{ videoId: number; frame: number | null; clip: number | null; error: string | null }>;
  /** Imágenes (presupuesto de Higgsfield) + clips (estimación de Seedance). */
  total: number;
  frames: number;
  clips: number;
  balance: number | null;
}

/** De 2 en 2, en orden. */
async function inPairs<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AUTO_PARALLEL, items.length) }, worker));
  return out;
}

async function readyRows(user: AuthUser, batch: Batch): Promise<Row[]> {
  if (batch.status !== "preguntas") throw new HttpError(409, NOT_ASKING);
  const rows = await rowsOf(user, batch);
  if (rows.length === 0) throw new HttpError(400, NO_ROWS);
  const asks = await askRows(user, rows);
  if (rows.some((row) => asks.get(row.video.id)?.state !== "ready")) throw new HttpError(409, NOT_READY);
  return rows;
}

async function quoteRows(user: AuthUser, rows: Row[], deps: GenDeps): Promise<BatchQuote> {
  let balance: number | null = null;
  const quoted = await inPairs(rows, async (row) => {
    try {
      const frame = await quoteGeneration(user, row.video.id, "frame", deps);
      balance = frame.balance;
      const clip = await estimateClipCredits(user, row.video, deps);
      return { videoId: row.video.id, frame: frame.credits, clip, error: null };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return { videoId: row.video.id, frame: null, clip: null, error: error.message };
    }
  });
  const frames = quoted.reduce((sum, r) => sum + (r.frame ?? 0), 0);
  const clips = quoted.reduce((sum, r) => sum + (r.clip ?? 0), 0);
  return { rows: quoted, frames, clips, total: frames + clips, balance };
}

/**
 * El presupuesto del lote con todo respondido: cada imagen con su presupuesto de Higgsfield y
 * cada clip con su estimación (`estimateClipCredits`), de 2 en 2, y el saldo. No gasta nada.
 */
export async function quoteBatch(user: AuthUser, batchId: number, deps: GenDeps = {}): Promise<BatchQuote> {
  const batch = await ownBatch(user, batchId);
  return quoteRows(user, await readyRows(user, batch), deps);
}

/**
 * «Generar lote · ~X créditos»: la única confirmación. Vuelve a presupuestar; si algo no se puede
 * presupuestar o el total pasa de lo que vio el dueño (`expectedCredits`), 409 y nada cambia. Si
 * no, guarda lo autorizado (`budget_credits` = `expectedCredits`) y lo previsto de cada vídeo, y
 * pasa a «Imágenes».
 */
export async function confirmBatch(user: AuthUser, batchId: number, input: { expectedCredits: unknown }, deps: GenDeps = {}): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  const expected = input.expectedCredits;
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) throw new HttpError(400, "Confirma el precio antes de generar.");
  const quote = await quoteRows(user, await readyRows(user, batch), deps);
  const failed = quote.rows.find((r) => r.error !== null);
  if (failed) throw new HttpError(409, failed.error!);
  if (quote.total > expected) throw new HttpError(409, priceChanged(quote.total));
  const estimates = Object.fromEntries(quote.rows.map((r) => [String(r.videoId), { frame: r.frame!, clip: r.clip! }]));
  const [updated] = await getDb()
    .update(schema.batches)
    .set({ status: "imagenes", budgetCredits: expected, estimates, confirmedAt: new Date(), pause: null })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "preguntas")))
    .returning();
  if (!updated) throw new HttpError(409, NOT_ASKING);
  await kickBatch(updated);
  return updated;
}

/**
 * «Continuar» en un lote en pausa. Con `skip`, el vídeo que la causó queda fuera del envío. Si la
 * pausa pedía créditos de más (precio o presupuesto), hay que confirmar exactamente esos
 * (`extraCredits`): se suman a lo autorizado (y, si es por precio, ese vídeo pasa a tener previsto
 * el precio nuevo). Vuelve al estado de antes y lo que falló se puede volver a pedir.
 */
export async function resumeBatch(user: AuthUser, batchId: number, input: { extraCredits?: unknown; skip?: unknown }): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  const pause = batch.pause;
  if (batch.status !== "pausado" || !pause) throw new HttpError(409, NOT_PAUSED);
  const skip = input.skip === true && pause.videoId !== null;
  let budget = batch.budgetCredits ?? 0;
  const estimates = { ...(batch.estimates ?? {}) };
  if (skip) {
    await getDb().update(schema.videos).set({ autoSkipped: true, updatedAt: new Date() }).where(eq(schema.videos.id, pause.videoId!));
  } else if (pause.extraCredits > 0) {
    if (input.extraCredits !== pause.extraCredits) throw new HttpError(400, BAD_EXTRA);
    budget += pause.extraCredits;
    if (pause.kind === "precio" && pause.videoId !== null && pause.kindOf && pause.quoted !== null) {
      const current = estimates[String(pause.videoId)] ?? { frame: 0, clip: 0 };
      estimates[String(pause.videoId)] = { ...current, [pause.kindOf]: pause.quoted };
    }
  }
  const [updated] = await getDb()
    .update(schema.batches)
    .set({ status: pause.from, pause: null, budgetCredits: budget, estimates, resumedAt: new Date() })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "pausado")))
    .returning();
  if (!updated) throw new HttpError(409, NOT_PAUSED);
  await kickBatch(updated);
  return updated;
}

// ───────────────────────── Avanzar (trabajo y seguimiento) ─────────────────────────

/** Lo que el lote ya lleva comprometido desde la confirmación: cada generación con su precio (menos las que no se enviaron). */
async function committedCredits(batch: Batch): Promise<number> {
  if (!batch.confirmedAt) return 0;
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.generations.quotedCredits}), 0)::bigint`.mapWith(Number) })
    .from(schema.generations)
    .innerJoin(schema.videos, eq(schema.videos.id, schema.generations.videoId))
    .where(
      and(
        eq(schema.videos.batchId, batch.id),
        ne(schema.generations.status, "not_sent"),
        gte(schema.generations.intentAt, batch.confirmedAt),
      ),
    );
  return row?.total ?? 0;
}

const readyHooks: Array<(batchId: number) => Promise<void>> = [];

/**
 * Enganche para cuando un lote queda `listo` (lo usa el montaje, `edits.ts`). Cada uno corre en su
 * propio `try`: un fallo no deshace el `listo`.
 */
export function onBatchReady(hook: (batchId: number) => Promise<void>): void {
  readyHooks.push(hook);
}

async function runReadyHooks(batchId: number): Promise<void> {
  for (const hook of readyHooks) {
    try {
      await hook(batchId);
    } catch (error) {
      console.error(`[lotes] Falló un enganche del lote ${batchId} listo:`, error);
    }
  }
}

/** Pasa el lote de `from` a `to` (si sigue en `from`). */
async function moveBatch(batch: Batch, to: BatchStatus, extra: Partial<typeof schema.batches.$inferInsert> = {}): Promise<Batch | null> {
  const [updated] = await getDb()
    .update(schema.batches)
    .set({ status: to, ...extra })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, batch.status)))
    .returning();
  return updated ?? null;
}

class Paused extends Error {}

async function pauseBatch(batch: Batch, pause: Omit<BatchPause, "from" | "extraCredits" | "videoId" | "kindOf" | "quoted"> & Partial<BatchPause>): Promise<never> {
  await moveBatch(batch, "pausado", {
    pause: { extraCredits: 0, videoId: null, kindOf: null, quoted: null, ...pause, from: batch.status },
  });
  throw new Paused(pause.reason);
}

const KIND_WORD: Record<GenerationKind, string> = { frame: "la imagen", clip: "el clip" };

/** «Buscando referencias de Pinterest…» o «se vuelven a buscar»: no es un fallo, se espera (regla fija: nunca sin ellas). */
const isPinterestWait = (message: string) => message === PINTEREST_PENDING || message.startsWith("No se encontraron referencias de Pinterest");

/** Un error del núcleo al presupuestar o pedir: qué hacer con él. */
async function onRequestError(batch: Batch, row: Row, kind: GenerationKind, error: unknown): Promise<"skip"> {
  if (!(error instanceof HttpError)) throw error;
  const { message, status } = error;
  // Otra petición se adelantó o el seguimiento aún comprueba un envío dudoso: se mira en el siguiente avance.
  if (status === 409 && (message.startsWith("Ya hay una generación") || message.startsWith("Estamos comprobando"))) return "skip";
  // Aún se buscan las referencias de Pinterest de la imagen (o se vuelven a buscar): el siguiente avance lo repite.
  if (status === 409 && isPinterestWait(message)) return "skip";
  // El precio subió entre el presupuesto y el apunte: el siguiente avance vuelve a presupuestar.
  if (status === 409 && message.startsWith("El precio ha cambiado")) return "skip";
  if (status === 409 && message.startsWith("No tienes créditos suficientes")) {
    return pauseBatch(batch, { kind: "saldo", reason: message, videoId: row.video.id, kindOf: kind });
  }
  const general = error.code === HIGGSFIELD_CONNECT || status === 503;
  return pauseBatch(batch, {
    kind: "fallo",
    reason: general ? message : `${row.video.title}: ${message}`,
    videoId: general ? null : row.video.id,
    kindOf: kind,
  });
}

/**
 * Pide una generación de una fila: su presupuesto fresco; si pasa de lo previsto para ella, si el
 * total comprometido (más lo que aún queda por pedir del lote) pasaría de lo autorizado o si no
 * hay saldo, pausa el lote sin enviar nada. Si no, `requestGeneration` con ese precio como
 * `expectedCredits` (el núcleo vuelve a presupuestar, compara, y apunta una sola vez).
 */
async function requestFor(user: AuthUser, batch: Batch, rows: Row[], row: Row, kind: GenerationKind, deps: GenDeps): Promise<boolean> {
  let quote: Awaited<ReturnType<typeof quoteGeneration>>;
  try {
    quote = await quoteGeneration(user, row.video.id, kind, deps);
  } catch (error) {
    await onRequestError(batch, row, kind, error);
    return false;
  }
  const estimates = batch.estimates ?? {};
  const own = estimates[String(row.video.id)] ?? { frame: quote.credits, clip: 0 };
  if (quote.credits > own[kind]) {
    await pauseBatch(batch, {
      kind: "precio",
      reason: `${row.video.title}: ${KIND_WORD[kind]} cuesta ${quote.credits} créditos (previsto ${own[kind]}).`,
      extraCredits: quote.credits - own[kind],
      videoId: row.video.id,
      kindOf: kind,
      quoted: quote.credits,
    });
  }
  // Lo que aún queda por pedir del lote (con lo previsto), sin contar lo que se pide ahora.
  let reserve = kind === "frame" && ["need", "failed"].includes(clipStage(row, batch)) ? own.clip : 0;
  for (const other of rows) {
    if (other.video.id === row.video.id) continue;
    const est = estimates[String(other.video.id)] ?? { frame: 0, clip: 0 };
    if (["need", "failed"].includes(frameStage(other, batch))) reserve += est.frame;
    if (["need", "failed"].includes(clipStage(other, batch))) reserve += est.clip;
  }
  const committed = await committedCredits(batch);
  const budget = batch.budgetCredits ?? 0;
  if (committed + quote.credits + reserve > budget) {
    const extra = committed + quote.credits + reserve - budget;
    await pauseBatch(batch, {
      kind: "presupuesto",
      reason: `El lote pasaría de lo autorizado (${budget} créditos): hacen falta ${extra} más.`,
      extraCredits: extra,
      videoId: row.video.id,
      kindOf: kind,
    });
  }
  if (quote.balance < quote.credits) {
    await pauseBatch(batch, {
      kind: "saldo",
      reason: `No tienes créditos suficientes en Higgsfield: hacen falta ${quote.credits} y tienes ${quote.balance}.`,
      videoId: row.video.id,
      kindOf: kind,
    });
  }
  try {
    await requestGeneration(user, row.video.id, kind, { expectedCredits: quote.credits }, deps);
    return true;
  } catch (error) {
    await onRequestError(batch, row, kind, error);
    return false;
  }
}

/**
 * Con todo respondido y desglosado: autoriza el presupuesto solo y pasa a «Imágenes» (como
 * `confirmBatch`, sin botón). Si algo no se puede presupuestar o no hay saldo para todo, se para
 * con ese motivo (la única pregunta: «Continuar» o «Saltar este vídeo»).
 */
async function autoConfirmBatch(user: AuthUser, batch: Batch, rows: Row[], deps: GenDeps): Promise<void> {
  const quote = await quoteRows(user, rows, deps);
  // Aún se buscan las referencias de Pinterest de alguna imagen (regla fija): se espera a la siguiente pasada.
  if (quote.rows.some((r) => r.error !== null && isPinterestWait(r.error))) return;
  const failed = quote.rows.find((r) => r.error !== null);
  if (failed) {
    const row = rows.find((r) => r.video.id === failed.videoId)!;
    await pauseBatch(batch, { kind: "fallo", reason: `${row.video.title}: ${failed.error}`, videoId: row.video.id, kindOf: "frame" });
  }
  if (quote.balance !== null && quote.balance < quote.total) {
    await pauseBatch(batch, {
      kind: "saldo",
      reason: `No tienes créditos suficientes en Higgsfield para el lote: hacen falta unos ${quote.total} y tienes ${quote.balance}.`,
    });
  }
  const estimates = Object.fromEntries(quote.rows.map((r) => [String(r.videoId), { frame: r.frame!, clip: r.clip! }]));
  const updated = await moveBatch(batch, "imagenes", { budgetCredits: quote.total, estimates, confirmedAt: new Date(), pause: null });
  if (updated) await kickBatch(updated);
}

/** «Preguntas»: pide el desglose de lo que ya no tiene nada pendiente (p. ej. tras responder) y, con todo listo, sigue solo. */
async function advanceQuestions(user: AuthUser, batch: Batch, rows: Row[], deps: GenDeps): Promise<void> {
  const asks = await askRows(user, rows);
  if (batch.autoConfirm && rows.length > 0 && rows.every((row) => asks.get(row.video.id)?.state === "ready")) {
    return autoConfirmBatch(user, batch, rows, deps);
  }
  for (const row of rows) {
    if (asks.get(row.video.id)?.state !== "needsAnalysis") continue;
    const notes = await withProductNotes(row.video);
    if ((await missingForAnalysis(user, row.video, briefOf(notes))) !== null) continue;
    try {
      await requestAnalysis(user, row.video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      console.warn(`[lotes] No se pudo pedir el desglose del vídeo ${row.video.id}: ${error.message}`);
    }
  }
}

/** Imágenes, revisión y clips: pasa de estado cuando toca y pide lo que falte, como mucho 2 en marcha. */
async function advanceGenerations(user: AuthUser, start: Batch, deps: GenDeps): Promise<void> {
  let batch = start;
  let rows = await rowsOf(user, batch);
  const frames = () => rows.map((row) => frameStage(row, batch));
  if (batch.status === "imagenes" && frames().every((s) => s === "done" || s === "approved")) {
    batch = (await moveBatch(batch, "revision_imagenes")) ?? batch;
  }
  if (batch.status === "revision_imagenes" && frames().every((s) => s === "approved")) {
    batch = (await moveBatch(batch, "clips")) ?? batch;
  }
  if (batch.status === "clips" && rows.every((row) => clipStage(row, batch) === "done")) {
    const done = await moveBatch(batch, "listo");
    if (done) await runReadyHooks(done.id);
    return;
  }
  if (!["imagenes", "revision_imagenes", "clips"].includes(batch.status)) return;

  const kind: GenerationKind = batch.status === "clips" ? "clip" : "frame";
  const stage = (row: Row) => (kind === "frame" ? frameStage(row, batch) : clipStage(row, batch));
  for (const row of rows) {
    const s = stage(row);
    const list = kind === "frame" ? row.frames : row.clips;
    if (s === "failed") {
      const last = list.at(-1)!;
      await pauseBatch(batch, {
        kind: "fallo",
        reason: `${row.video.title}: ${last.error ?? "Higgsfield no ha podido generarlo."}`,
        videoId: row.video.id,
        kindOf: kind,
      });
    }
    if (s === "maxed") {
      await pauseBatch(batch, {
        kind: "fallo",
        reason: `${row.video.title}: ${KIND_WORD[kind]} ha llegado al máximo de ${MAX_REGENERATIONS} regeneraciones.`,
        videoId: row.video.id,
        kindOf: kind,
      });
    }
  }
  const busy = () => rows.filter((row) => row.frames.concat(row.clips).some((g) => BUSY_GENERATION.includes(g.status))).length;
  let slots = AUTO_PARALLEL - busy();
  for (const row of rows) {
    if (slots <= 0) break;
    if (stage(row) !== "need") continue;
    // El clip solo con la imagen aprobada (en «Clips» lo están todas).
    if (kind === "clip" && row.video.approvedFrameResultId === null) continue;
    if (await requestFor(user, batch, rows, row, kind, deps)) {
      slots -= 1;
      // Lo recién apuntado cuenta para el presupuesto y para los huecos de la siguiente fila.
      rows = await rowsOf(user, batch);
    }
  }
}

/**
 * Avanza un lote que va solo. Un solo avance a la vez (reserva `advancing_at`); si otro lo tiene,
 * no hace nada. Repetirlo nunca envía dos veces: cada fila se decide por lo que hay en la base de
 * datos, y el núcleo (`requestGeneration`) no apunta una segunda generación mientras haya una en
 * marcha. `deps` es para las pruebas (Higgsfield simulado).
 */
export async function advanceBatch(batchId: number, deps: GenDeps = {}): Promise<void> {
  const now = new Date();
  const [batch] = await getDb()
    .update(schema.batches)
    .set({ advancingAt: now })
    .where(
      and(
        eq(schema.batches.id, batchId),
        inArray(schema.batches.status, RUNNING),
        or(isNull(schema.batches.advancingAt), lt(schema.batches.advancingAt, new Date(now.getTime() - ADVANCE_LEASE_MS))),
      ),
    )
    .returning();
  if (!batch) return;
  try {
    const user = await getActiveUser(batch.createdBy);
    if (!user) return;
    if (batch.status === "preguntas") await advanceQuestions(user, batch, await rowsOf(user, batch), deps);
    else await advanceGenerations(user, batch, deps);
  } catch (error) {
    if (!(error instanceof Paused)) throw error;
  } finally {
    await getDb()
      .update(schema.batches)
      .set({ advancingAt: null })
      .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.advancingAt, now)));
  }
}

/** Para el seguimiento de cada minuto: avanza cada lote que va solo, uno detrás de otro. */
export async function advanceRunningBatches(deps: GenDeps = {}): Promise<void> {
  const ids = await getDb().select({ id: schema.batches.id }).from(schema.batches).where(inArray(schema.batches.status, RUNNING));
  for (const { id } of ids) {
    try {
      await advanceBatch(id, deps);
    } catch (error) {
      console.error(`[lotes] No se pudo avanzar el lote ${id}:`, error);
    }
  }
}

// ───────────────────────── Para el tablero ─────────────────────────

export interface AutoView {
  status: BatchStatus;
  pause: BatchPause | null;
  budgetCredits: number | null;
  /** Lo comprometido desde la confirmación. */
  committedCredits: number;
  /** Vídeos que lleva el envío (sin los saltados). */
  total: number;
  skipped: number;
  steps: { preguntas: number; imagenes: number; revision: number; clips: number; montaje: number };
  /** Preguntas abiertas (solo en «Preguntas»). */
  questions: number;
  /** Todo respondido y desglosado: falta confirmar el presupuesto (solo en lotes de antes del flujo automático). */
  readyToConfirm: boolean;
  /** El presupuesto se autoriza solo al quedar todo respondido. */
  autoConfirm: boolean;
}

/** El estado del envío automático para el tablero (`GET /api/lotes/[id]`). */
export async function autoView(user: AuthUser, batch: Batch): Promise<AutoView> {
  const creator = batch.createdBy === user.id ? user : await getActiveUser(batch.createdBy);
  const all = creator ? await rowsOf(creator, batch, { withSkipped: true }) : [];
  const rows = all.filter((row) => !row.video.autoSkipped);
  const asks = batch.status === "preguntas" && creator ? await askRows(creator, rows) : new Map<number, RowAsk>();
  const asked = [...asks.values()];
  const countIf = (fn: (row: Row) => boolean) => rows.filter(fn).length;
  const started = !["borrador", "preguntas"].includes(batch.status);
  return {
    status: batch.status as BatchStatus,
    pause: batch.pause ?? null,
    budgetCredits: batch.budgetCredits,
    committedCredits: await committedCredits(batch),
    total: rows.length,
    skipped: all.length - rows.length,
    steps: {
      preguntas: started ? rows.length : asked.filter((a) => a.state === "ready").length,
      imagenes: countIf((row) => ["done", "approved"].includes(frameStage(row, batch))),
      revision: countIf((row) => row.video.approvedFrameResultId !== null),
      clips: countIf((row) => clipStage(row, batch) === "done"),
      montaje: countIf((row) => row.video.editStatus === "hecho"),
    },
    questions: asked.reduce((n, a) => n + (a.state === "questions" ? a.questions.length : 0), 0),
    readyToConfirm: !batch.autoConfirm && batch.status === "preguntas" && rows.length > 0 && asked.every((a) => a.state === "ready"),
    autoConfirm: batch.autoConfirm,
  };
}
