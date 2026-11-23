import { and, eq, notInArray } from "drizzle-orm";
import type { HfMediaRef } from "@/connectors/higgsfield";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { readAvatarImage } from "@/server/avatars";
import { readProductPhoto } from "@/server/photos";
import {
  approveResult,
  registerRequestBuilder,
  rejectRound,
  type GenDeps,
  type GenerationGuard,
  type RequestBuilder,
} from "@/server/videos/generations";
import { imageManifest, type ManifestItem } from "@/server/videos/manifest";
import { addApprovedToBank, framePromptFor, hasManualEnvironment, readPinterestImage, requirePinterestRefs } from "@/server/videos/pinterest";
import { checkImagePrompt, PROMPT_ERROR } from "@/server/videos/prompt-check";
import {
  BRIEF_CHANGED,
  DEFAULT_FRAME_COUNT,
  isFrameCount,
  latestDoneAnalysis,
  manifestRefsFor,
  NO_AUTO_AVATAR,
  readVideoFrame,
  REFERENCE_OUTDATED,
  referenceOutdated,
  videoSnapshot,
  type Video,
} from "@/server/videos/videos";

/**
 * Imagen inicial: la petición a Nano Banana (1 imagen por defecto, 2K, 9:16) con las referencias en el
 * orden del manifiesto, y aprobar o rechazar con motivo. El dinero (presupuesto, envío único,
 * seguimiento) lo pone `generations.ts`; este módulo registra el constructor `frame` al importarse,
 * así que lo importan las rutas que piden una imagen.
 */

export const IMAGE_MODELS = ["nano_banana_pro", "nano_banana_2_1"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
/** El que usa el dueño (decisión del 22/11): Nano Banana 2.1, siempre a 2K. */
export const DEFAULT_IMAGE_MODEL: ImageModel = "nano_banana_2_1";
export const IMAGE_MODEL_SETTING = "video.imageModel";
/**
 * Regla fija del dueño (23/11/2026, como el motor de Codex: un frame por clip): **una imagen por
 * vídeo** salvo que pida más en la tarjeta (`videos.frame_count`) o en el lote (`batches.frame_count`).
 */
export { DEFAULT_FRAME_COUNT, isFrameCount, MAX_FRAME_COUNT } from "@/server/videos/videos";

/** Cuántas imágenes pide cada ronda de este vídeo: la de la tarjeta, si no la del lote, si no 1. */
export async function frameCountOf(video: Pick<Video, "frameCount" | "batchId">): Promise<number> {
  if (isFrameCount(video.frameCount)) return video.frameCount;
  if (video.batchId !== null) {
    const [batch] = await getDb().select({ frameCount: schema.batches.frameCount }).from(schema.batches).where(eq(schema.batches.id, video.batchId));
    if (batch && isFrameCount(batch.frameCount)) return batch.frameCount;
  }
  return DEFAULT_FRAME_COUNT;
}

/** Nombre de cada modelo en pantalla. */
export const IMAGE_MODEL_NAMES: Record<ImageModel, string> = {
  nano_banana_pro: "Nano Banana Pro",
  nano_banana_2_1: "Nano Banana 2.1",
};

const ONLY_OWNER = "Solo el dueño puede hacer esto.";
const BAD_MODEL = "Modelo de imagen no disponible.";
const ANALYSIS_FIRST = "Haz primero el desglose.";
const CLIP_SENT = "Ya se ha generado un clip con esta imagen.";

const isImageModel = (value: unknown): value is ImageModel => IMAGE_MODELS.includes(value as ImageModel);

// ───────────────────────── Modelo de imagen ─────────────────────────

/** El modelo de imagen elegido por el dueño. Si lo guardado ya no está en la lista, el de por defecto. */
export async function getImageModel(): Promise<ImageModel> {
  const value = await getSetting<unknown>(IMAGE_MODEL_SETTING);
  if (value === null || isImageModel(value)) return value ?? DEFAULT_IMAGE_MODEL;
  console.warn(`[imagen] Modelo de imagen guardado no disponible (${JSON.stringify(value)}): se usa ${DEFAULT_IMAGE_MODEL}.`);
  return DEFAULT_IMAGE_MODEL;
}

/** Cambia el modelo de imagen. Solo el dueño (403) y solo a uno de la lista (400). */
export async function setImageModel(owner: AuthUser, model: string): Promise<void> {
  if (owner.role !== "dueno") throw new HttpError(403, ONLY_OWNER);
  if (!isImageModel(model)) throw new HttpError(400, BAD_MODEL);
  await setSetting(IMAGE_MODEL_SETTING, model);
}

// ───────────────────────── La petición ─────────────────────────

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Sin prompt de imagen o sin un último desglose terminado de la referencia actual, 400 «Haz primero
 * el desglose.»; si es de otras indicaciones (tipo, adaptación, cambios o quién sale), 400 también.
 */
async function requireAnalysisDone(video: Video): Promise<void> {
  if (referenceOutdated(video)) throw new HttpError(400, REFERENCE_OUTDATED);
  if (video.imagePrompt === null || video.referenceMediaId === null) throw new HttpError(400, ANALYSIS_FIRST);
  const done = await latestDoneAnalysis(video);
  if (!done || done.staleReason === "reference") throw new HttpError(400, ANALYSIS_FIRST);
  if (done.staleReason === "brief") throw new HttpError(400, BRIEF_CHANGED);
}

/** El `media_id` en Higgsfield de una referencia del manifiesto, subiéndola tal como está guardada si hace falta. */
async function mediaOf(user: AuthUser, video: Video, item: ManifestItem, deps: GenDeps): Promise<string> {
  const { source } = item;
  if (source.kind === "reference_frame") {
    const frame = await readVideoFrame(user, video.id, 0);
    return ensureMedia(user.id, { bytes: frame.data, filename: `fotograma-${video.id}.jpg`, contentType: frame.mime, type: "image" }, deps);
  }
  if (source.kind === "photo") {
    const photo = await readProductPhoto(user, source.photoId);
    const filename = `foto-${source.photoId}.${EXTENSIONS[photo.mime] ?? "jpg"}`;
    return ensureMedia(user.id, { bytes: photo.data, filename, contentType: photo.mime, type: "image" }, deps);
  }
  if (source.kind === "avatar") {
    const avatar = await readAvatarImage(source.avatarId);
    const filename = `avatar-${source.avatarId}.${EXTENSIONS[avatar.mime] ?? "jpg"}`;
    return ensureMedia(user.id, { bytes: avatar.data, filename, contentType: avatar.mime, type: "image" }, deps);
  }
  if (source.kind === "pinterest") {
    const image = await readPinterestImage(source.sha256);
    return ensureMedia(user.id, { bytes: image.data, filename: `pinterest-${source.sha256.slice(0, 16)}.jpg`, contentType: image.mime, type: "image" }, deps);
  }
  throw new Error(`Referencia de la imagen inicial no esperada: ${source.kind}.`);
}

/**
 * La petición de la imagen inicial: el modelo del ajuste, el prompt del vídeo tal cual, 2K vertical
 * y las referencias en el orden del manifiesto (composición, avatar, artículo, embalaje, entorno
 * puesto a mano o, si no hay, las fotos de Pinterest con su papel añadido al prompt).
 * Sin desglose hecho de la referencia actual, o con errores en el prompt, 400 antes de subir nada.
 * Cada archivo se sube una sola vez por persona (`ensureMedia`), aunque se regenere.
 */
/**
 * Columnas del vídeo en las que se apoya la petición de la imagen (desglose de la referencia,
 * prompt y manifiesto). Si cambian entre el presupuesto y el apunte (otra pestaña), 409 y no se
 * apunta nada.
 */
const FRAME_SNAPSHOT = [
  "referenceStatus",
  "referenceMediaId",
  "imagePrompt",
  "avatarPhotoId",
  "avatarLibraryId",
  "variantId",
  "environmentPhotoId",
  "avatarMode",
  "kind",
  "adaptation",
  "hookSeconds",
  "note",
  "frameCount",
] as const satisfies ReadonlyArray<keyof Video>;

export const buildFrameRequest: RequestBuilder = async (user, video, deps) => {
  await requireAnalysisDone(video);
  const refs = await manifestRefsFor(user, video);
  // Regla fija del dueño: sin referencia de entorno puesta a mano, siempre con fotos de Pinterest
  // (también al regenerar). Si aún no están, se buscan y esto espera (409).
  if (!hasManualEnvironment(imageManifest(video, { ...refs, pinterest: [] }))) await requirePinterestRefs(video.id);
  const manifest = imageManifest(video, await manifestRefsFor(user, video));
  // Con la sala elegida, el prompt reescrito con el método aprobado (la sala descrita elemento a elemento).
  const prompt = await framePromptFor(video.id, video.imagePrompt!, manifest);
  if (manifest.some((item) => item.source.kind === "avatar_pending")) throw new HttpError(400, NO_AUTO_AVATAR);
  const errors = checkImagePrompt(prompt, manifest).filter((issue) => issue.level === "error");
  if (errors.length > 0) throw new HttpError(400, errors.map((issue) => issue.message).join(" "), PROMPT_ERROR);

  const model = await getImageModel();
  const medias: HfMediaRef[] = [];
  // Una detrás de otra: el orden de las referencias es el del manifiesto.
  for (const item of manifest) medias.push({ role: "image_references", value: await mediaOf(user, video, item, deps) });
  return {
    request: { model, prompt, aspectRatio: "9:16", resolution: "2k", medias },
    count: await frameCountOf(video),
    snapshot: videoSnapshot(video, FRAME_SNAPSHOT),
  };
};

registerRequestBuilder("frame", buildFrameRequest);

// ───────────────────────── Aprobar y rechazar ─────────────────────────

/** Un clip que no llegó o que falló no ata la imagen: se puede cambiar antes de volver a pedir el clip. */
const CLIP_RELEASES_FRAME = ["not_sent", "failed"];

/**
 * Con un clip apuntado, enviándose, enviado, en duda o generado, la imagen aprobada ya no cambia
 * (409). Corre dentro de aprobar o rechazar, con el cerrojo del vídeo que también toma apuntar el
 * clip: o el clip se apunta antes y esto lo ve, o el cambio de imagen va antes y el clip ve en su
 * instantánea que la imagen aprobada cambió.
 */
const noClip: GenerationGuard = async (tx, video) => {
  const [clip] = await tx
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.videoId, video.id),
        eq(schema.generations.kind, "clip"),
        notInArray(schema.generations.status, CLIP_RELEASES_FRAME),
      ),
    )
    .limit(1);
  if (clip) throw new HttpError(409, CLIP_SENT);
};

/** Aprueba una de las candidatas de la imagen inicial. */
export async function approveFrame(user: AuthUser, videoId: number, resultId: number): Promise<void> {
  await approveResult(user, videoId, "frame", resultId, { guard: noClip });
  // Lo que él aprueba alimenta el banco de referencias (su entorno puesto a mano, si lo llevaba).
  await addApprovedToBank(user, videoId).catch((error) => console.error(`[imagen] No se pudo añadir al banco la referencia del vídeo ${videoId}:`, error));
}

/** Rechaza la última ronda de la imagen inicial con un motivo de una línea (y deja de estar aprobada). */
export async function rejectFrame(user: AuthUser, videoId: number, reason: string): Promise<void> {
  await rejectRound(user, videoId, "frame", reason, { guard: noClip });
}
