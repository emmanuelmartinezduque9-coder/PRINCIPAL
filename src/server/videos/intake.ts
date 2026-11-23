import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getHiggsfield, HiggsfieldUnavailableError, isHiggsfieldError, type HfMediaFile, type HiggsfieldPort } from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { runStep, stepKey, StepFailedError, type JobContext } from "@/jobs/steps";
import { linkUrlOfTask } from "@/server/agent-tasks";
import { getActiveUser } from "@/server/auth";
import {
  detectCuts,
  extractAudio,
  extractFrames,
  frameTimesMs,
  MediaError,
  MAX_REFERENCE_AUDIO_MS,
  MIN_REFERENCE_MS,
  normalizeClip,
  probeVideo,
} from "@/server/media/ffmpeg";
import { autoRequestAnalysis } from "@/server/videos/analysis";
import { MAX_REFERENCE_AUDIO_BYTES } from "@/db/schema";
import { audioPath, clipPath, discardUpload, PREPARE_FAILED, REFERENCE_JOB, UPLOAD_GONE, uploadPath } from "@/server/videos/upload";
import { getVideoFor, segmentMsFor } from "@/server/videos/videos";

/**
 * Preparación de la referencia (trabajo `video.referencia`): del archivo subido salen la
 * duración y el tamaño, los fotogramas (a la base de datos), los cortes de plano y un recorte
 * normalizado de 30 s como mucho (con «Solo gancho», solo los segundos del gancho), que se sube al Higgsfield de quien creó el vídeo,
 * y su pista de audio (`video_reference_audio`: «Audio original» en el montaje). El vídeo entero
 * va al almacén (`videos.reference_storage_key`): sin «referencia de edición», el montaje copia su
 * edición (regla de Codex). Los archivos temporales se borran siempre al acabar, bien o mal. Un fallo deja la
 * referencia en error con el motivo en español y no se reintenta (el archivo ya no está).
 */

const TOO_SHORT = "El vídeo de referencia es demasiado corto (mínimo 2 segundos).";
const UPLOAD_ATTEMPTS = 3;
const UPLOAD_RETRY_MS = 5000;

/** Un problema de la referencia que se puede decir tal cual a la persona. */
class ReferenceProblem extends Error {}

export interface IntakeDeps {
  higgsfield?: HiggsfieldPort;
  /** Espera entre intentos de subida; las pruebas la sustituyen para no esperar. */
  sleep?: (ms: number) => Promise<void>;
  /** Almacén donde se guarda el vídeo entero (por defecto el de la aplicación; `null`: no se guarda). */
  store?: ObjectStore | null;
}

const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4", mkv: "video/x-matroska" };

/** Guarda el vídeo de referencia entero en el almacén; su clave, o `null` si no hay almacén o falla (no estropea la referencia). */
async function storeReference(store: ObjectStore | null, videoId: number, uploadId: string, file: string, formatName: string | null): Promise<string | null> {
  if (!store) return null;
  const ext = (formatName ?? "").split(",").map((f) => f.trim()).find((f) => f in VIDEO_TYPES) ?? "mp4";
  const key = `referencias/${videoId}/${uploadId}.${ext === "mov" ? "mov" : ext === "webm" ? "webm" : "mp4"}`;
  try {
    await store.putFile(key, file, { contentType: VIDEO_TYPES[ext] ?? "video/mp4" });
    return key;
  } catch (error) {
    console.warn(`[videos] No se pudo guardar la referencia entera del vídeo ${videoId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function failureMessage(error: unknown): string {
  if (error instanceof ReferenceProblem || error instanceof MediaError || isHiggsfieldError(error)) return error.message;
  console.error("[videos] Fallo inesperado al preparar la referencia:", error);
  return PREPARE_FAILED;
}

async function markFailed(videoId: number, message: string): Promise<void> {
  await getDb()
    .update(schema.videos)
    .set({ referenceStatus: "failed", referenceError: message, updatedAt: new Date() })
    .where(and(eq(schema.videos.id, videoId), eq(schema.videos.referenceStatus, "processing")));
}

/**
 * La pista de audio de la referencia para el montaje, o `null` si no trae audio, pesa demasiado o
 * no se pudo sacar: eso no estropea la referencia (el montaje cae al enlace, si lo hay).
 */
async function referenceAudio(file: string, out: string, durationMs: number): Promise<{ data: Buffer; durationMs: number } | null> {
  try {
    if (!(await extractAudio(file, out))) return null;
    const data = await fs.readFile(out);
    if (data.length === 0 || data.length > MAX_REFERENCE_AUDIO_BYTES) return null;
    return { data, durationMs: Math.min(durationMs, MAX_REFERENCE_AUDIO_MS) };
  } catch (error) {
    console.warn("[videos] No se pudo guardar el audio de la referencia:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Sube el recorte; solo si Higgsfield no responde lo vuelve a intentar (3 veces en total, cada 5 s). */
async function uploadWithRetries(higgsfield: HiggsfieldPort, userId: number, file: HfMediaFile, sleep: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await higgsfield.uploadMedia(userId, file);
    } catch (error) {
      if (!(error instanceof HiggsfieldUnavailableError) || attempt >= UPLOAD_ATTEMPTS) throw error;
      await sleep(UPLOAD_RETRY_MS);
    }
  }
}

async function prepare(ctx: JobContext, videoId: number, uploadId: string, deps: IntakeDeps): Promise<void> {
  const user = await getActiveUser(ctx.userId);
  if (!user) throw new ReferenceProblem(PREPARE_FAILED);
  const video = await getVideoFor(user, videoId);
  // Ya no se espera esta referencia (el seguimiento la dio por perdida): no se gasta nada.
  if (video.referenceStatus !== "processing") return;
  const [session] = await getDb()
    .select({ id: schema.uploadSessions.id, agentTaskId: schema.uploadSessions.agentTaskId })
    .from(schema.uploadSessions)
    .where(and(eq(schema.uploadSessions.id, uploadId), eq(schema.uploadSessions.videoId, video.id)));
  const file = uploadPath(uploadId);
  const present = await fs
    .stat(file)
    .then(() => true)
    .catch(() => false);
  if (!session || !present) throw new ReferenceProblem(UPLOAD_GONE);

  const probe = await probeVideo(file);
  if (probe.durationMs < MIN_REFERENCE_MS) throw new ReferenceProblem(TOO_SHORT);
  // Con «Solo gancho», el tramo es solo el gancho: fotogramas, cortes y recorte salen de él.
  const segmentDurationMs = segmentMsFor(video, probe.durationMs);
  const frames = await extractFrames(file, frameTimesMs(segmentDurationMs));
  const cutsMs = (await detectCuts(file, segmentDurationMs)).filter((ms) => ms > 0 && ms < segmentDurationMs);
  const clip = clipPath(uploadId);
  await normalizeClip(file, clip, segmentDurationMs);
  const audio = await referenceAudio(file, audioPath(uploadId), probe.durationMs);
  // El archivo que trajo el Mac queda con origen «enlace» y la dirección que se pegó.
  const origin =
    session.agentTaskId === null
      ? { referenceSource: "file", referenceUrl: null }
      : { referenceSource: "link", referenceUrl: await linkUrlOfTask(session.agentTaskId) };
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const storageKey = await storeReference(store, video.id, uploadId, file, null);
  const { mediaId } = await uploadWithRetries(
    deps.higgsfield ?? getHiggsfield(),
    video.createdBy,
    { bytes: await fs.readFile(clip), filename: `referencia-${video.id}.mp4`, contentType: "video/mp4", type: "video" },
    deps.sleep ?? wait,
  );

  await getDb().transaction(async (tx) => {
    // Primero el vídeo, y solo si sigue esperando esta referencia: si entretanto el seguimiento
    // la dio por perdida (y quizá ya hay otra subida en marcha), este resultado no se escribe.
    const updated = await tx
      .update(schema.videos)
      .set({
        referenceStatus: "ready",
        referenceError: null,
        ...origin,
        referenceDurationMs: probe.durationMs,
        referenceWidth: probe.width,
        referenceHeight: probe.height,
        referenceMediaId: mediaId,
        referenceStorageKey: storageKey,
        segmentDurationMs,
        cutsMs,
        // Una referencia nueva es un cambio: el desglose automático vuelve a contar con este vídeo.
        skipAutoAnalysis: false,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.videos.id, video.id), eq(schema.videos.referenceStatus, "processing")))
      .returning({ id: schema.videos.id });
    if (updated.length === 0) {
      console.warn(`[videos] La referencia del vídeo ${video.id} ya no se esperaba: su resultado no se guarda.`);
      if (store && storageKey) await store.delete(storageKey).catch(() => {});
      return;
    }
    // El audio es el de esta referencia: el de una anterior deja de valer.
    await tx.delete(schema.videoReferenceAudio).where(eq(schema.videoReferenceAudio.videoId, video.id));
    if (audio) {
      await tx
        .insert(schema.videoReferenceAudio)
        .values({ videoId: video.id, mime: "audio/mp4", size: audio.data.length, durationMs: audio.durationMs, data: audio.data });
    }
    await tx.delete(schema.videoFrames).where(eq(schema.videoFrames.videoId, video.id));
    await tx.insert(schema.videoFrames).values(
      frames.map((frame, index) => ({
        videoId: video.id,
        index,
        timeMs: frame.timeMs,
        mime: "image/jpeg",
        size: frame.jpeg.length,
        data: frame.jpeg,
      })),
    );
  });
}

/**
 * Prepara la referencia subida en `uploadId` como un paso del trabajo, con el Higgsfield de quien
 * creó el vídeo. Si el vídeo ya no existe, solo limpia. Cualquier fallo deja la referencia en
 * error y lanza `StepFailedError`. Con la referencia lista, si el vídeo es de un lote con
 * «Desglosar al subir», pide su desglose (`autoRequestAnalysis`; si no puede, lo vuelve a mirar el
 * seguimiento).
 */
export async function processReference(videoId: number, uploadId: string, deps: IntakeDeps = {}): Promise<void> {
  const [owner] = await getDb()
    .select({ createdBy: schema.videos.createdBy, productId: schema.videos.productId })
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId));
  if (!owner) {
    await discardUpload(uploadId);
    return;
  }
  const ctx: JobContext = { jobName: REFERENCE_JOB, userId: owner.createdBy, productId: owner.productId };
  try {
    await runStep(ctx, stepKey(ctx, "referencia", { videoId, uploadId }), async () => {
      try {
        await prepare(ctx, videoId, uploadId, deps);
      } catch (error) {
        const message = failureMessage(error);
        await markFailed(videoId, message);
        throw new StepFailedError(message);
      } finally {
        await discardUpload(uploadId);
      }
    });
  } catch (error) {
    // El paso no llegó a ejecutarse porque la persona ya no puede (cuenta desactivada, producto
    // retirado): tampoco se reintentará, así que la referencia queda en error y se limpia.
    if (error instanceof StepFailedError) {
      await markFailed(videoId, PREPARE_FAILED);
      await discardUpload(uploadId);
    }
    throw error;
  }
  try {
    await autoRequestAnalysis(videoId);
  } catch (error) {
    // La referencia ya está lista: un fallo aquí no la estropea; el seguimiento lo vuelve a intentar.
    console.error(`[videos] No se pudo pedir el desglose automático del vídeo ${videoId}:`, error);
  }
}
