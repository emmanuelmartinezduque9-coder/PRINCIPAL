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
import { expectsEffectPass } from "@/server/videos/efecto";
// Registra el constructor de la imagen inicial (`frame`) en las generaciones.
import { approveFrame, rejectFrame } from "@/server/videos/frame";
import { BLOCKED, MAX_REGENERATIONS, upscaleEstimate, quoteGeneration, SYSTEM_REJECT_PREFIX, requestGeneration, type GenDeps, type GenerationKind } from "@/server/videos/generations";
import { clipModelProblem, getVideoFor, setVideoSong, referenceOutdated, REFERENCE_OUTDATED, staleness, updateVideoChoices, withProductNotes, type Video } from "@/server/videos/videos";
import { CLIP_MODEL_LABEL, CLIP_MODELS, resolveClipModel, SEEDANCE, sourceProblem } from "@/lib/clip-models";
import { isPromptProblem, PROMPT_ERROR } from "@/server/videos/prompt-check";

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
 *    en cuanto la de un vídeo está aprobada, su clip (sin esperar a las demás); en cuanto el clip de
 *    un vídeo está hecho, lo monta en la nube (sin esperar al lote entero). Siempre por
 *    `requestGeneration` (el núcleo del dinero: su precio fresco, `expectedCredits`, su instantánea
 *    y su envío único), como mucho 2 a la vez. Si un precio supera lo previsto, el total pasaría de
 *    lo autorizado, falta saldo o algo falla, el lote queda `pausado` con el motivo y no se envía
 *    nada más hasta «Continuar».
 * 5. «Revisar imágenes» sigue siendo el paso humano; un rechazo se regenera solo (dentro de sus
 *    rondas y del presupuesto).
 * 6. Con todos los clips hechos, `listo` (y `onBatchReady`: monta lo que quede, `edits.ts`); con
 *    todos los montajes terminados (o fallidos con su motivo), `montado`.
 */

export const BATCH_STATUSES = ["borrador", "preguntas", "imagenes", "revision_imagenes", "clips", "listo", "montado", "pausado"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
/** Estados en los que el lote avanza solo. */
const RUNNING: BatchStatus[] = ["preguntas", "imagenes", "revision_imagenes", "clips"];

export const ADVANCE_JOB = "lote.avanzar";
/**
 * Generaciones en marcha a la vez en un lote, como mucho (petición de Emmanuel, 23/11/2026: todas
 * las imágenes juntas y, al aprobar, todos los clips juntos). Cada una sigue pasando por el núcleo
 * (precio fresco, presupuesto del lote y envío único).
 */
export const AUTO_PARALLEL = 12;
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
  /** La subida a 1080p con Topaz del clip hecho. */
  upscales: Generation[];
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
    upscales: gens.filter((g) => g.videoId === video.id && g.kind === "upscale"),
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

export function stageOf(
  gens: readonly (Pick<Generation, "status" | "rejectReason" | "finishedAt" | "intentAt"> & { error?: string | null })[],
  approved: boolean,
  retryAfter: Date,
): Stage {
  const last = gens.at(-1);
  if (approved) return "approved";
  if (!last) return "need";
  if (BUSY_GENERATION.includes(last.status)) return "busy";
  // Un bloqueo del filtro de Higgsfield no es una ronda gastada: lo devuelve y tiene sus propios reintentos.
  // Tampoco un rechazo que hizo la aplicación para aplicar una corrección.
  const spent = gens.filter(
    (g) => SPENT.includes(g.status) && !(g.status === "failed" && g.error === BLOCKED) && !g.rejectReason?.startsWith(SYSTEM_REJECT_PREFIX),
  ).length;
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

/**
 * Una ronda que falló se puede repetir sola: quedan rondas y no es el bloqueo del filtro de Higgsfield
 * (ese lo repite `sanitizeAfterBlock` con el prompt reescrito).
 */
function retryable(list: readonly Generation[]): boolean {
  const last = list.at(-1);
  if (!last || (last.status !== "failed" && last.status !== "not_sent") || last.rejectReason) return false;
  if (last.error === BLOCKED) return false;
  return list.filter((g) => SPENT.includes(g.status)).length < 1 + MAX_REGENERATIONS;
}

const frameStage = (row: Row, batch: Batch) => stageOf(row.frames, row.video.approvedFrameResultId !== null, retryAfterOf(batch));

/** Intentos de Topaz por clip antes de montar con el de 480p (con aviso). */
export const MAX_UPSCALE_ATTEMPTS = 3;

/**
 * La subida a 1080p de una fila (orden de Emmanuel, 24/11/2026): `need` en cuanto el clip está
 * hecho; un fallo se repite solo; tras `MAX_UPSCALE_ATTEMPTS` fallos, `given_up` (se monta con el de
 * 480p y un aviso). `done` también si el clip no se hizo aquí (nada que subir).
 */
export type UpscaleStage = "need" | "busy" | "done" | "given_up" | "waiting";
function upscaleStage(row: Row, batch: Batch): UpscaleStage {
  if (clipStage(row, batch) !== "done") return "waiting";
  const last = row.upscales.at(-1);
  if (!last) return "need";
  if (BUSY_GENERATION.includes(last.status)) return "busy";
  if (last.status === "done") return "done";
  const failed = row.upscales.filter((g) => g.status === "failed" || g.status === "not_sent").length;
  return failed >= MAX_UPSCALE_ATTEMPTS ? "given_up" : "need";
}
const upscaleSettled = (row: Row, batch: Batch) => ["done", "given_up"].includes(upscaleStage(row, batch));

/** Clips que Higgsfield bloqueó por su filtro de contenido o de marcas (los devuelve: no cobra). */
/** El modelo con el que se pidió una generación (su petición guardada). */
const modelOf = (g: Generation) => (g.request as { model?: string } | null)?.model ?? SEEDANCE;

/**
 * Clips bloqueados por el filtro de Higgsfield (los devuelve: no cobra) con el modelo que el vídeo
 * usa ahora: los de un modelo anterior no cuentan para sus reintentos.
 */
const blockedClips = (row: Row) => {
  const current = resolveClipModel(row.video.clipModel, row.video.segmentDurationMs);
  return row.clips.filter((g) => g.status === "failed" && g.error === BLOCKED && modelOf(g) === current).length;
};

/**
 * Reintentos solos de un clip bloqueado por el filtro de Higgsfield (`nsfw` / `ip_detected`). Como
 * en Codex («Rephrase»: sin marcas, personajes ni personas reales), cada uno con el prompt reescrito.
 */
export const MAX_BLOCKED_RETRIES = 2;

/** Un clip bloqueado con reintentos libres vuelve a pedirse (con el prompt saneado) en vez de parar el lote. */
const clipStage = (row: Row, batch: Batch): Stage => {
  const stage = stageOf(row.clips, false, retryAfterOf(batch));
  const last = row.clips.at(-1);
  if (stage !== "failed" || !last || last.error !== BLOCKED) return stage;
  // Bloqueado con la imagen aprobada aún sin rehacer: primero se rehace la imagen (`sanitizeAfterBlock`).
  const frameHandled = row.video.ownerAnswers.some((answer) => answer.key === `sys:imagen-bloqueada-${row.video.approvedFrameResultId ?? 0}`);
  return !frameHandled || blockedClips(row) <= MAX_BLOCKED_RETRIES ? "need" : stage;
};

/**
 * La indicación interna para el desglose tras un bloqueo del filtro de Higgsfield, copiada de Codex
 * (`higgsfield-generate`: «nsfw / ip_detected — content policy. Rephrase»; evitar personas reales,
 * contenido sexual, marcas y personajes con marca). La segunda vez, más estricta.
 */
/** La indicación para el desglose cuando se rehace la imagen de un clip bloqueado. */
const BLOCKED_FRAME_NOTE =
  "Higgsfield bloqueó el clip por su filtro de marcas y personas conocidas: la imagen inicial llevaba en la pared un cuadro o póster con una persona. En la imagen nueva no puede haber ningún cuadro, póster, foto, ilustración ni figura con personas, personajes o caras en paredes, espejos o fondos: paredes lisas o con decoración sin personas, y nada de marcas ajenas.";

const BLOCKED_NOTES = [
  "Higgsfield bloqueó el clip por su filtro de contenido o de marcas (nsfw / ip_detected). Reescribe los dos prompts sin marcas comerciales, logotipos ni nombres de tiendas o productos ajenos, sin personajes con derechos (dibujos, películas, juegos) y sin personas famosas: descríbelos de forma genérica. Pide que se quiten o neutralicen todos los logotipos y rótulos de marcas ajenas visibles en la escena (ropa, envases, carteles), conservando nuestro producto, su embalaje y su marca. Nada sexual ni sugerente.",
  "Higgsfield volvió a bloquear el clip por su filtro de contenido o de marcas. Además de lo anterior: ninguna marca, logotipo, texto de marca ni uniforme reconocible de ninguna empresa ajena en ninguna toma (sustitúyelos por equivalentes genéricos sin marca), ropa neutra y discreta, ningún parecido con personajes ni personas conocidas. Conserva la acción, los cortes y nuestro producto.",
];

/**
 * Antes de volver a pedir un clip bloqueado: guarda la indicación de este reintento (llega al
 * desglose) y rehace el desglose. `true` mientras el prompt saneado no esté listo (se espera).
 */
async function sanitizeAfterBlock(user: AuthUser, row: Row): Promise<boolean> {
  const last = row.clips.at(-1);
  if (!last || last.status !== "failed" || last.error !== BLOCKED) return false;
  const [latest] = row.analyses;
  if (latest && ACTIVE_ANALYSIS.includes(latest.status)) return true;
  // La causa real (23/11/2026, lote 3, la encontró Emmanuel): la imagen aprobada llevaba un póster
  // con una persona famosa en la pared (de una sala del banco) y Higgsfield bloquea el clip
  // (`ip_detected`) con cualquier prompt. Lo primero es rehacer la imagen sin ese elemento: se
  // rechaza la aprobada con el motivo, se rehace el desglose (con la indicación y otra sala) y la
  // imagen nueva vuelve a la revisión del dueño. Una vez por imagen aprobada.
  const frameKey = `sys:imagen-bloqueada-${row.video.approvedFrameResultId ?? 0}`;
  if (row.video.approvedFrameResultId !== null && !row.video.ownerAnswers.some((answer) => answer.key === frameKey)) {
    await saveAnswer(row.video.id, { key: frameKey, question: "Higgsfield bloqueó el clip", answer: BLOCKED_FRAME_NOTE, inBrief: true });
    try {
      await rejectFrame(user, row.video.id, "Higgsfield bloqueó el clip: la imagen lleva un cuadro o póster con una persona o una figura reconocible; se rehace sin él.");
      await requestAnalysis(user, row.video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      console.warn(`[lotes] Vídeo ${row.video.id}: no se pudo rehacer la imagen bloqueada: ${error.message}`);
    }
    console.warn(`[lotes] Vídeo ${row.video.id}: clip bloqueado por Higgsfield; se rehace la imagen inicial sin cuadros ni pósteres con personas.`);
    return true;
  }
  const blocked = blockedClips(row);
  if (blocked === 0) return false;
  const key = `sys:bloqueo-${blocked}`;
  if (!row.video.ownerAnswers.some((answer) => answer.key === key)) {
    await saveAnswer(row.video.id, { key, question: "Higgsfield bloqueó el clip", answer: BLOCKED_NOTES[Math.min(blocked, BLOCKED_NOTES.length) - 1], inBrief: true });
    try {
      await requestAnalysis(user, row.video.id);
      console.warn(`[lotes] Vídeo ${row.video.id}: clip bloqueado por el filtro de Higgsfield (${blocked}); se reescribe el prompt y se repite.`);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
    return true;
  }
  return false;
}

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
  kind: "claude" | "riesgo" | "cancion" | "avatar" | "biblioteca" | "variante" | "articulo" | "referencia" | "adaptacion" | "desglose" | "modelo";
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
  // El modelo elegido no admite este tramo (p. ej. Object Swap con menos de 4 s): no se cambia solo
  // (Codex: «no sustituirlo; dejar pendiente y consultar»), se pregunta con qué modelo se hace.
  const modelProblem = clipModelProblem(video);
  if (modelProblem) {
    const fits = CLIP_MODELS.filter((model) => model === SEEDANCE || sourceProblem(model, video.segmentDurationMs ?? 0) === null);
    questions.push({
      key: "sys:modelo",
      kind: "modelo",
      text: modelProblem,
      options: [...fits.map((model) => ({ value: model, label: CLIP_MODEL_LABEL[model] })), skipOption],
      freeText: false,
      href: null,
    });
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
  } else if (question.kind === "modelo") {
    if (!question.options.some((o) => o.value === value)) throw new HttpError(400, BAD_ANSWER);
    await updateVideoChoices(user, video.id, { clipModel: value });
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
      // El clip y su subida a 1080p con Topaz (que Higgsfield no presupuesta: va la previsión).
      const clip = (await estimateClipCredits(user, row.video, deps)) + upscaleEstimate(Math.round((row.video.segmentDurationMs ?? 15_000) / 1000));
      // El paso del efecto del producto es una ronda de imagen más (una sola candidata): entra en el presupuesto.
      const effect = (await expectsEffectPass(row.video.id)) ? frame.credits : 0;
      return { videoId: row.video.id, frame: frame.credits + effect, clip, error: null };
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
  // Una pausa por un prompt interno no saca el vídeo del lote: eso se corrige solo (regla fija, 23/11/2026).
  const skip = input.skip === true && pause.videoId !== null && !isPromptProblem(pause.reason);
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

/**
 * «Volver a incluir»: un vídeo que quedó fuera con «Saltar» vuelve al envío automático del lote y
 * sigue donde estaba (con el presupuesto ya autorizado). Solo quien creó el lote.
 */
export async function includeBatchVideo(user: AuthUser, batchId: number, videoId: number): Promise<void> {
  const batch = await ownBatch(user, batchId);
  const video = await getVideoFor(user, videoId);
  if (video.batchId !== batch.id || video.createdBy !== user.id) throw new HttpError(404, VIDEO_NOT_IN_BATCH);
  await getDb().update(schema.videos).set({ autoSkipped: false, updatedAt: new Date() }).where(eq(schema.videos.id, video.id));
  await kickBatch(batch);
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
        // Un bloqueo del filtro de Higgsfield se devuelve (comprobado en sus movimientos, 23/11/2026).
        sql`not (${schema.generations.status} = 'failed' and ${schema.generations.error} is not distinct from ${BLOCKED})`,
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

const KIND_WORD: Record<GenerationKind, string> = { frame: "la imagen", clip: "el clip", upscale: "la subida a 1080p" };
/** Para la pausa (el tablero solo distingue imagen y clip): la subida a 1080p cuenta como clip. */
const pauseKind = (kind: GenerationKind): "frame" | "clip" => (kind === "frame" ? "frame" : "clip");

/** «Buscando referencias de Pinterest…» o «se vuelven a buscar»: no es un fallo, se espera (regla fija: nunca sin ellas). */
const isPinterestWait = (message: string) =>
  message === PINTEREST_PENDING || message.startsWith("No se encontraron referencias de Pinterest") || message.startsWith("Sin saldo en la API de Claude");

/** Desgloses que se rehacen solos por un prompt con errores antes de parar (cada uno cuesta en Claude). */
export const MAX_PROMPT_REDOS = 2;

/**
 * Rehace el desglose de un vídeo cuyo prompt no pasa la comprobación. `false` si ya se rehízo
 * `MAX_PROMPT_REDOS` veces hoy (entonces sí se para: algo no cuadra y repetir solo gastaría).
 */
async function redoPrompt(user: AuthUser, row: Row): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = row.analyses.filter((analysis) => analysis.createdAt >= since).length;
  if (recent > MAX_PROMPT_REDOS) return false;
  try {
    await requestAnalysis(user, row.video.id);
    console.warn(`[lotes] Vídeo ${row.video.id}: el prompt no pasaba la comprobación; se rehace el desglose.`);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    // Ya hay uno en marcha: se espera a que termine.
  }
  return true;
}

/** Pausa por un clip bloqueado cuya imagen aún no se ha rehecho sin el elemento sospechoso: se quita. */
async function canStillSwitch(pause: NonNullable<Batch["pause"]>): Promise<boolean> {
  if (pause.kindOf !== "clip" || pause.videoId === null || !pause.reason.includes("también con el prompt reescrito")) return false;
  const [video] = await getDb()
    .select({ frame: schema.videos.approvedFrameResultId, answers: schema.videos.ownerAnswers })
    .from(schema.videos)
    .where(eq(schema.videos.id, pause.videoId));
  // Aún no se ha rehecho la imagen de ese clip: se quita la pausa y se rehace.
  return video !== undefined && !video.answers.some((answer) => answer.key === `sys:imagen-bloqueada-${video.frame ?? 0}`);
}

/** ¿La pausa «máximo de regeneraciones» de un clip deja de serlo sin contar los bloqueos del filtro? */
async function maxedOnlyByBlocks(pause: NonNullable<Batch["pause"]>): Promise<boolean> {
  if ((pause.kindOf !== "clip" && pause.kindOf !== "frame") || pause.videoId === null || !pause.reason.includes("llegado al máximo de")) return false;
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.videoId, pause.videoId),
        eq(schema.generations.kind, pause.kindOf),
        inArray(schema.generations.status, SPENT),
        sql`not (${schema.generations.status} = 'failed' and ${schema.generations.error} is not distinct from ${BLOCKED})`,
        sql`coalesce(${schema.generations.rejectReason}, '') not like ${SYSTEM_REJECT_PREFIX + "%"}`,
      ),
    );
  return (row?.n ?? 0) < 1 + MAX_REGENERATIONS;
}

/**
 * Pausas antiguas por un error de prompt (antes de que se corrigiera solo): el lote vuelve a donde
 * estaba y sigue, sin que el dueño tenga que pulsar nada.
 */
async function resumePromptPauses(): Promise<void> {
  const paused = await getDb().select().from(schema.batches).where(eq(schema.batches.status, "pausado"));
  for (const batch of paused) {
    const pause = batch.pause;
    if (!pause || pause.kind !== "fallo") continue;
    // También un clip bloqueado por el filtro de Higgsfield: ahora se reescribe y se repite solo. Y un
    // «máximo de regeneraciones» al que solo se llegó contando bloqueos (que no son rondas gastadas).
    const internal =
      isPromptProblem(pause.reason) || pause.reason.includes(BLOCKED) || (await maxedOnlyByBlocks(pause)) || (await canStillSwitch(pause));
    if (!internal) continue;
    const [resumed] = await getDb()
      .update(schema.batches)
      .set({ status: pause.from, pause: null, resumedAt: new Date() })
      .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "pausado")))
      .returning();
    if (resumed) console.warn(`[lotes] lote ${batch.id}: reanudado solo (la pausa era un prompt interno: ${pause.reason})`);
  }
}

/** Un error del núcleo al presupuestar o pedir: qué hacer con él. */
async function onRequestError(user: AuthUser, batch: Batch, row: Row, kind: GenerationKind, error: unknown): Promise<"skip"> {
  if (!(error instanceof HttpError)) throw error;
  const { message, status } = error;
  // Un prompt interno con errores no se le pregunta al dueño (regla fija, 23/11/2026): se rehace el
  // desglose de ese vídeo (como mucho `MAX_PROMPT_REDOS` veces) y el lote sigue con los demás.
  if (error.code === PROMPT_ERROR && (await redoPrompt(user, row))) return "skip";
  // Otra petición se adelantó o el seguimiento aún comprueba un envío dudoso: se mira en el siguiente avance.
  if (status === 409 && (message.startsWith("Ya hay una generación") || message.startsWith("Estamos comprobando"))) return "skip";
  // Aún se buscan las referencias de Pinterest de la imagen (o se vuelven a buscar): el siguiente avance lo repite.
  if (status === 409 && isPinterestWait(message)) return "skip";
  // El precio subió entre el presupuesto y el apunte: el siguiente avance vuelve a presupuestar.
  if (status === 409 && message.startsWith("El precio ha cambiado")) return "skip";
  if (status === 409 && message.startsWith("No tienes créditos suficientes")) {
    return pauseBatch(batch, { kind: "saldo", reason: message, videoId: row.video.id, kindOf: pauseKind(kind) });
  }
  // La subida a 1080p que no se pudo pedir se vuelve a intentar en el siguiente avance (no para el lote).
  if (kind === "upscale") {
    console.warn(`[lotes] Vídeo ${row.video.id}: no se pudo pedir la subida a 1080p: ${message}`);
    return "skip";
  }
  // Higgsfield sin conectar o caído: eso sí lo tiene que arreglar él (para todo el lote).
  const general = error.code === HIGGSFIELD_CONNECT || status === 503;
  if (general) return pauseBatch(batch, { kind: "fallo", reason: message, videoId: null, kindOf: pauseKind(kind) });
  // Lo de un solo vídeo no para el lote: ese vídeo queda fuera con su motivo.
  await skipVideo(row.video, message);
  return "skip";
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
    await onRequestError(user, batch, row, kind, error);
    return false;
  }
  if (kind === "upscale") {
    // Topaz en todos los clips lo autoriza el dueño (24/11/2026) y Higgsfield no lo presupuesta: solo
    // se comprueba el saldo. Su previsión ya va en la del clip de los lotes nuevos.
    if (quote.balance < quote.credits) {
      await pauseBatch(batch, {
        kind: "saldo",
        reason: `No tienes créditos suficientes en Higgsfield: hacen falta ${quote.credits} y tienes ${quote.balance}.`,
        videoId: row.video.id,
        kindOf: "clip",
      });
    }
    try {
      await requestGeneration(user, row.video.id, kind, { expectedCredits: quote.credits }, deps);
      return true;
    } catch (error) {
      await onRequestError(user, batch, row, kind, error);
      return false;
    }
  }
  const estimates = batch.estimates ?? {};
  const own = estimates[String(row.video.id)] ?? { frame: quote.credits, clip: 0 };
  // Un precio más alto que lo previsto no para el lote (24/11/2026): cuenta igual contra lo
  // autorizado, que solo para si de verdad se pasa (abajo).
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
    await onRequestError(user, batch, row, kind, error);
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
    // Un prompt interno con errores se rehace solo (nunca se pregunta).
    if (isPromptProblem(failed.error!) && (await redoPrompt(user, row))) return;
    // Si no tiene arreglo, ese vídeo queda fuera con su motivo y los demás siguen (sin pausa).
    await skipVideo(row.video, failed.error!);
    return kickBatch(batch);
  }
  if (quote.balance !== null && quote.balance < quote.total) {
    await pauseBatch(batch, {
      kind: "saldo",
      reason: `No tienes créditos suficientes en Higgsfield para el lote: hacen falta unos ${quote.total} y tienes ${quote.balance}.`,
    });
  }
  const estimates = Object.fromEntries(quote.rows.map((r) => [String(r.videoId), { frame: r.frame!, clip: r.clip! }]));
  // Se autoriza también el margen de las regeneraciones permitidas: rechazar una imagen la regenera
  // sin parar el lote (el gasto real lo siguen limitando las rondas y el saldo).
  const budgetCredits = quote.total * (1 + MAX_REGENERATIONS);
  const updated = await moveBatch(batch, "imagenes", { budgetCredits, estimates, confirmedAt: new Date(), pause: null });
  if (updated) await kickBatch(updated);
}

/** «Preguntas»: pide el desglose de lo que ya no tiene nada pendiente (p. ej. tras responder) y, con todo listo, sigue solo. */
/** Desgloses fallidos de una misma referencia que se reintentan solos antes de dejar el vídeo fuera. */
const MAX_ANALYSIS_RETRIES = 2;
/**
 * Fallos del desglose que son de la API de Claude (petición rechazada, sin saldo, sin respuesta), no
 * del vídeo: no cuentan para `MAX_ANALYSIS_RETRIES` ni sacan el vídeo del lote (24/11/2026, lote 6).
 * Sí tienen un tope propio, por si fueran permanentes (cada intento rechazado no cuesta).
 */
const CLAUDE_SIDE = /petición a Claude no es válida|API de Claude|cuenta de Claude no tiene saldo|Claude no ha respondido|Claude no acepta la clave|tope (mensual )?de gasto/i;
const MAX_CLAUDE_SIDE_RETRIES = 20;
export const isClaudeSideFailure = (error: string | null) => error !== null && CLAUDE_SIDE.test(error);

/** Deja un vídeo fuera del envío con su motivo (lo enseñan el tablero y el registro), sin parar el lote. */
async function skipVideo(video: Video, reason: string): Promise<void> {
  await getDb().update(schema.videos).set({ autoSkipped: true, autoStop: reason.slice(0, 500), updatedAt: new Date() }).where(eq(schema.videos.id, video.id));
  console.warn(`[lotes] Vídeo ${video.id} fuera del lote ${video.batchId}: ${reason}`);
}

/**
 * Regla fija del dueño (24/11/2026, como Codex): desde «Enviar lote» hasta las imágenes no se le
 * pregunta nada. Lo que el lote preguntaba se resuelve aquí solo:
 * - quién sale sin elegir → «Automático» (o «Sin sustitución» sin biblioteca);
 * - las elecciones del desglose (avatar de la biblioteca, variante, canción) → la primera sugerida /
 *   las fotos de siempre / el audio original;
 * - un modelo que no admite el tramo → el primero que sí;
 * - un desglose fallido → se repite solo (hasta 2 veces) y, si sigue fallando, el vídeo queda fuera;
 * - una referencia que no se pudo preparar (enlace fallido, subida a medias) → el vídeo queda fuera.
 * Solo quedan las que de verdad decide él: falta la foto del artículo, la adaptación o el tope de gasto.
 * Devuelve si cambió algo.
 */
async function autoAnswer(user: AuthUser, batch: Batch, rows: Row[], asks: Map<number, RowAsk>): Promise<boolean> {
  let changed = false;
  for (const row of rows) {
    const ask = asks.get(row.video.id);
    if (ask?.state !== "questions") continue;
    for (const question of ask.questions) {
      const values = question.options.map((o) => o.value);
      let value: string | null = null;
      if (question.kind === "referencia") {
        await skipVideo(row.video, question.text);
        changed = true;
        break;
      }
      if (question.kind === "avatar") value = values.includes("automatico") ? "automatico" : "sin_sustitucion";
      else if (question.kind === "biblioteca" || question.kind === "modelo") value = values.find((v) => v !== SKIP) ?? null;
      else if (question.kind === "variante") value = NO_VARIANT;
      else if (question.kind === "cancion") value = ORIGINAL_AUDIO;
      else if (question.kind === "desglose" && values.includes(RETRY)) {
        const failedHere = row.analyses.filter((a) => a.status === "failed" && a.referenceMediaId === row.video.referenceMediaId);
        const failed = failedHere.filter((a) => !isClaudeSideFailure(a.error)).length;
        if (failed > MAX_ANALYSIS_RETRIES || failedHere.length > MAX_CLAUDE_SIDE_RETRIES) {
          await skipVideo(row.video, `El desglose falló ${failed} veces: ${question.text}`);
          changed = true;
          break;
        }
        value = RETRY;
      }
      if (value === null) continue;
      try {
        await answerQuestion(user, batch.id, { videoId: row.video.id, key: question.key, value });
        changed = true;
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        console.warn(`[lotes] No se pudo resolver solo «${question.text}» del vídeo ${row.video.id}: ${error.message}`);
      }
    }
  }
  return changed;
}

async function advanceQuestions(user: AuthUser, batch: Batch, rows: Row[], deps: GenDeps): Promise<void> {
  let asks = await askRows(user, rows);
  if (await autoAnswer(user, batch, rows, asks)) {
    rows = await rowsOf(user, batch);
    asks = await askRows(user, rows);
  }
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
  // «Listo» cuando cada clip está hecho y subido a 1080p (o Topaz falló del todo: se monta con el de 480p).
  if (batch.status === "clips" && rows.every((row) => clipStage(row, batch) === "done" && upscaleSettled(row, batch))) {
    const done = await moveBatch(batch, "listo");
    if (done) await runReadyHooks(done.id);
    return;
  }
  if (!["imagenes", "revision_imagenes", "clips"].includes(batch.status)) return;

  // Cada vídeo avanza por su cuenta (petición de Emmanuel, 23/11/2026): con su imagen aprobada se
  // pide su clip sin esperar a las demás, y con su clip hecho se monta sin esperar al lote entero.
  // Sin pausas por un vídeo (regla fija del dueño, 24/11/2026): lo que falla se repite solo dentro de
  // sus rondas; sin rondas, o bloqueado por el filtro también con el prompt reescrito, ese vídeo queda
  // fuera con su motivo y los demás siguen.
  const skipFor = async (row: Row, kind: GenerationKind, s: Stage) => {
    const list = kind === "frame" ? row.frames : row.clips;
    if (s === "failed" && !retryable(list)) {
      const blockedAgain = kind === "clip" && list.at(-1)?.error === BLOCKED;
      await skipVideo(
        row.video,
        blockedAgain
          ? `Higgsfield bloquea el clip por su filtro de contenido o de marcas también con el prompt reescrito (${MAX_BLOCKED_RETRIES} reintentos, sin coste).`
          : (list.at(-1)?.error ?? "Higgsfield no ha podido generarlo."),
      );
      return true;
    }
    if (s === "maxed") {
      await skipVideo(row.video, `${KIND_WORD[kind]} ha llegado al máximo de ${MAX_REGENERATIONS} regeneraciones.`);
      return true;
    }
    return false;
  };
  let skipped = false;
  for (const row of rows) {
    const frame = frameStage(row, batch);
    if (await skipFor(row, "frame", frame)) skipped = true;
    else if (frame === "approved" && (await skipFor(row, "clip", clipStage(row, batch)))) skipped = true;
  }
  if (skipped) rows = await rowsOf(user, batch);

  // Un vídeo que aún no tiene un desglose que valga (p. ej. volvió al lote tras un fallo de la API de
  // Claude): se rehace aquí, sin preguntar, y su imagen se pide cuando esté.
  const waitingAnalysis = new Set<number>();
  for (const row of rows) {
    if (frameStage(row, batch) !== "need" || row.frames.length > 0) continue;
    const done = row.analyses.find((a) => a.status === "done");
    if (done && staleness(done, await withProductNotes(row.video)).staleReason === null) continue;
    waitingAnalysis.add(row.video.id);
    const [latest] = row.analyses;
    if (latest && ACTIVE_ANALYSIS.includes(latest.status)) continue;
    const failedHere = row.analyses.filter((a) => a.status === "failed" && a.referenceMediaId === row.video.referenceMediaId);
    const failed = failedHere.filter((a) => !isClaudeSideFailure(a.error)).length;
    if (failed > MAX_ANALYSIS_RETRIES || failedHere.length > MAX_CLAUDE_SIDE_RETRIES) {
      await skipVideo(row.video, `El desglose falló ${failedHere.length} veces: ${latest?.error ?? ""}`);
      continue;
    }
    try {
      await requestAnalysis(user, row.video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      console.warn(`[lotes] No se pudo rehacer el desglose del vídeo ${row.video.id}: ${error.message}`);
    }
  }

  await startFinishedEdits(user, rows, batch);

  const all = (row: Row) => row.frames.concat(row.clips, row.upscales);
  const busy = () => rows.filter((row) => all(row).some((g) => BUSY_GENERATION.includes(g.status))).length;
  let slots = AUTO_PARALLEL - busy();
  // Primero las imágenes que faltan; después los clips de las imágenes ya aprobadas; después la
  // subida a 1080p de los clips hechos (orden de Codex: Topaz antes del montaje y del doblaje).
  for (const kind of ["frame", "clip", "upscale"] as const) {
    for (const row of rows) {
      if (slots <= 0) return;
      const wants = (s: Stage, list: Generation[]) => s === "need" || (s === "failed" && retryable(list));
      if (kind === "frame" && (!wants(frameStage(row, batch), row.frames) || waitingAnalysis.has(row.video.id))) continue;
      if (kind === "clip" && (frameStage(row, batch) !== "approved" || !wants(clipStage(row, batch), row.clips))) continue;
      if (kind === "upscale" && upscaleStage(row, batch) !== "need") continue;
      if (all(row).some((g) => BUSY_GENERATION.includes(g.status))) continue;
      // Un clip bloqueado por el filtro se repite con el prompt reescrito (cuando el desglose esté listo).
      if (kind === "clip" && (await sanitizeAfterBlock(user, row))) continue;
      if (await requestFor(user, batch, rows, row, kind, deps)) {
        slots -= 1;
        // Lo recién apuntado cuenta para el presupuesto y para los huecos de la siguiente fila.
        rows = await rowsOf(user, batch);
      }
    }
  }
}

/**
 * «Aprobar todas» en «Revisar imágenes» (lo normal: un clic): aprueba la primera imagen buena de
 * cada vídeo propio del lote que espera revisión y avisa al lote, que pide todos los clips a la
 * vez. Devuelve cuántas aprobó. Solo quien creó el lote.
 */
export async function approveAllFrames(user: AuthUser, batchId: number): Promise<{ approved: number }> {
  const batch = await ownBatch(user, batchId);
  const rows = await rowsOf(user, batch);
  let approved = 0;
  for (const row of rows) {
    if (frameStage(row, batch) !== "done") continue;
    const last = row.frames.at(-1)!;
    const [result] = await getDb()
      .select({ id: schema.generationResults.id })
      .from(schema.generationResults)
      .where(and(eq(schema.generationResults.generationId, last.id), eq(schema.generationResults.ok, true)))
      .orderBy(asc(schema.generationResults.index))
      .limit(1);
    if (!result) continue;
    try {
      await approveFrame(user, row.video.id, result.id);
      approved += 1;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      console.warn(`[lotes] No se pudo aprobar la imagen del vídeo ${row.video.id}: ${error.message}`);
    }
  }
  await kickBatch(batch);
  return { approved };
}

/** Monta cada vídeo del lote cuyo clip ya está hecho y que aún no tiene montaje (ni en marcha). */
async function startFinishedEdits(user: AuthUser, rows: Row[], batch: Batch): Promise<void> {
  // Se monta con el clip a 1080p: espera a que Topaz termine (o falle del todo; entonces con el de 480p).
  const ready = rows.filter((row) => row.video.editStatus === null && clipStage(row, batch) === "done" && upscaleSettled(row, batch));
  for (const row of ready) {
    if (upscaleStage(row, batch) === "given_up") console.warn(`[lotes] Vídeo ${row.video.id}: Topaz falló ${MAX_UPSCALE_ATTEMPTS} veces; se monta con el clip de 480p.`);
  }
  if (ready.length === 0) return;
  const { startEdit, ALREADY_RUNNING } = await import("@/server/videos/edits");
  for (const row of ready) {
    try {
      await startEdit(user, row.video.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.message !== ALREADY_RUNNING) console.warn(`[lotes] No se pudo montar el vídeo ${row.video.id}: ${error.message}`);
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

/** Última línea de diagnóstico de cada lote: solo se vuelve a escribir cuando cambia. */
const lastDiagnosis = new Map<number, string>();

/**
 * Diagnóstico para el registro (petición de Emmanuel, 23/11/2026): una línea por lote sin terminar
 * con su estado, el paso y por qué no envía (pausa, saldo, preguntas, referencias, presupuesto…).
 * Solo se escribe cuando cambia, para no llenar el registro cada minuto.
 */
async function diagnoseBatch(batch: Batch): Promise<string> {
  const creator = await getActiveUser(batch.createdBy);
  if (!creator) return `lote ${batch.id} «${batch.name}» ${batch.status}: quien lo creó ya no está activo`;
  const rows = await rowsOf(creator, batch);
  const parts = [`lote ${batch.id} «${batch.name}» ${batch.status}`, `autoConfirm=${batch.autoConfirm}`, `${rows.length} vídeos`];
  if (batch.pause) parts.push(`pausa ${batch.pause.kind}: ${batch.pause.reason}`);
  if (batch.advancingAt) parts.push(`avanzando desde ${batch.advancingAt.toISOString()}`);
  if (batch.budgetCredits !== null) parts.push(`presupuesto ${batch.budgetCredits}, comprometido ${await committedCredits(batch)}`);
  const asks = batch.status === "preguntas" ? await askRows(creator, rows) : new Map<number, RowAsk>();
  for (const row of rows) {
    const v = row.video;
    const ask = asks.get(v.id);
    const why =
      ask?.state === "questions"
        ? `preguntas: ${ask.questions.map((q) => q.text).join(" | ")}`
        : ask
          ? ask.state
          : `imagen ${frameStage(row, batch)}, clip ${clipStage(row, batch)}`;
    const analysis = row.analyses[0] ? `desglose ${row.analyses[0].status}` : "sin desglose";
    parts.push(`[vídeo ${v.id}: referencia ${v.referenceStatus}, ${analysis}, ${why}${v.editStatus ? `, montaje ${v.editStatus}` : ""}]`);
  }
  return parts.join(" · ");
}

async function logBatchStates(): Promise<void> {
  const open = await getDb()
    .select()
    .from(schema.batches)
    .where(inArray(schema.batches.status, [...RUNNING, "pausado", "borrador"]));
  for (const batch of open) {
    try {
      const line = await diagnoseBatch(batch);
      if (lastDiagnosis.get(batch.id) === line) continue;
      lastDiagnosis.set(batch.id, line);
      console.log(`[lotes] ${line}`);
    } catch (error) {
      console.error(`[lotes] No se pudo diagnosticar el lote ${batch.id}:`, error);
    }
  }
}

/**
 * Reparación (24/11/2026, lote 6): en un lote sin terminar, los vídeos que el lote sacó solo porque
 * falló la API de Claude (no el vídeo) vuelven a entrar; el avance rehace su desglose, pide su imagen
 * y se suma a la revisión. Lo autorizado sube lo que cuesta un vídeo medio del lote (con el margen de
 * regeneraciones), para que quepan sin preguntar. Un «Saltar» a mano (sin motivo) no se toca.
 */
export async function reincludeClaudeSkips(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.videos.id, batchId: schema.videos.batchId, autoStop: schema.videos.autoStop })
    .from(schema.videos)
    .innerJoin(schema.batches, eq(schema.batches.id, schema.videos.batchId))
    .where(and(eq(schema.videos.autoSkipped, true), inArray(schema.batches.status, [...RUNNING, "pausado"])));
  const back = rows.filter((row) => isClaudeSideFailure(row.autoStop));
  for (const row of back) {
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, row.batchId!));
    const estimates = batch.estimates ?? {};
    const known = Object.values(estimates);
    const average = known.length > 0 ? Math.ceil(known.reduce((sum, e) => sum + e.frame + e.clip, 0) / known.length) : 0;
    await db.transaction(async (tx) => {
      await tx.update(schema.videos).set({ autoSkipped: false, autoStop: null, updatedAt: new Date() }).where(eq(schema.videos.id, row.id));
      if (batch.budgetCredits !== null && !estimates[String(row.id)]) {
        await tx
          .update(schema.batches)
          .set({ budgetCredits: batch.budgetCredits + average * (1 + MAX_REGENERATIONS) })
          .where(eq(schema.batches.id, batch.id));
      }
    });
    console.warn(`[lotes] Vídeo ${row.id} vuelve al lote ${row.batchId}: salió por un fallo de la API de Claude (${row.autoStop}).`);
  }
  return back.length;
}

/** Para el seguimiento de cada minuto: avanza cada lote que va solo, uno detrás de otro. */
export async function advanceRunningBatches(deps: GenDeps = {}): Promise<void> {
  try {
    await reincludeClaudeSkips();
  } catch (error) {
    console.error("[lotes] No se pudieron devolver al lote los vídeos que salieron por la API de Claude:", error);
  }
  try {
    await resumePromptPauses();
  } catch (error) {
    console.error("[lotes] No se pudieron reanudar las pausas por prompt:", error);
  }
  try {
    await logBatchStates();
  } catch (error) {
    console.error("[lotes] No se pudo escribir el diagnóstico de los lotes:", error);
  }
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
