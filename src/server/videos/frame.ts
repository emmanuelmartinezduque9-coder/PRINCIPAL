import { and, eq, notInArray } from "drizzle-orm";
import type { HfMediaRef } from "@/connectors/higgsfield";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { listProductPhotos, readProductPhoto } from "@/server/photos";
import {
  approveResult,
  registerRequestBuilder,
  rejectRound,
  type GenDeps,
  type RequestBuilder,
} from "@/server/videos/generations";
import { imageManifest, type ManifestItem } from "@/server/videos/manifest";
import { checkImagePrompt } from "@/server/videos/prompt-check";
import { getVideoFor, readVideoFrame, requireVideoOwner, type Video } from "@/server/videos/videos";

/**
 * Imagen inicial: la petición a Nano Banana (2 candidatas, 2K, 9:16) con las referencias en el
 * orden del manifiesto, y aprobar o rechazar con motivo. El dinero (presupuesto, envío único,
 * seguimiento) lo pone `generations.ts`; este módulo registra el constructor `frame` al importarse,
 * así que lo importan las rutas que piden una imagen.
 */

export const IMAGE_MODELS = ["nano_banana_pro", "nano_banana_2_1"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
/** El que usa el dueño (decisión del 22/11): Nano Banana 2.1, siempre a 2K. */
export const DEFAULT_IMAGE_MODEL: ImageModel = "nano_banana_2_1";
export const IMAGE_MODEL_SETTING = "video.imageModel";
export const FRAME_CANDIDATES = 2;

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

/** ¿Hay un desglose terminado de la referencia que tiene ahora el vídeo, con su prompt de imagen? */
async function analysisDone(video: Video): Promise<boolean> {
  if (video.imagePrompt === null || video.referenceMediaId === null) return false;
  const [done] = await getDb()
    .select({ id: schema.videoAnalyses.id })
    .from(schema.videoAnalyses)
    .where(
      and(
        eq(schema.videoAnalyses.videoId, video.id),
        eq(schema.videoAnalyses.status, "done"),
        eq(schema.videoAnalyses.referenceMediaId, video.referenceMediaId),
      ),
    )
    .limit(1);
  return Boolean(done);
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
  throw new Error(`Referencia de la imagen inicial no esperada: ${source.kind}.`);
}

/**
 * La petición de la imagen inicial: el modelo del ajuste, el prompt del vídeo tal cual, 2K vertical
 * y las referencias en el orden del manifiesto (composición, avatar, artículo, embalaje, entorno).
 * Sin desglose hecho de la referencia actual, o con errores en el prompt, 400 antes de subir nada.
 * Cada archivo se sube una sola vez por persona (`ensureMedia`), aunque se regenere.
 */
export const buildFrameRequest: RequestBuilder = async (user, video, deps) => {
  if (!(await analysisDone(video))) throw new HttpError(400, ANALYSIS_FIRST);
  const prompt = video.imagePrompt!;
  const manifest = imageManifest(video, await listProductPhotos(user, video.productId));
  const errors = checkImagePrompt(prompt, manifest).filter((issue) => issue.level === "error");
  if (errors.length > 0) throw new HttpError(400, errors.map((issue) => issue.message).join(" "));

  const model = await getImageModel();
  const medias: HfMediaRef[] = [];
  // Una detrás de otra: el orden de las referencias es el del manifiesto.
  for (const item of manifest) medias.push({ role: "image_references", value: await mediaOf(user, video, item, deps) });
  return { request: { model, prompt, aspectRatio: "9:16", resolution: "2k", medias }, count: FRAME_CANDIDATES };
};

registerRequestBuilder("frame", buildFrameRequest);

// ───────────────────────── Aprobar y rechazar ─────────────────────────

/** Un clip que no llegó o que falló no ata la imagen: se puede cambiar antes de volver a pedir el clip. */
const CLIP_RELEASES_FRAME = ["not_sent", "failed"];

/** Con un clip apuntado, enviado, en duda o generado, la imagen aprobada ya no cambia (409). */
async function requireNoClip(user: AuthUser, videoId: number): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const [clip] = await getDb()
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
}

/** Aprueba una de las candidatas de la imagen inicial. */
export async function approveFrame(user: AuthUser, videoId: number, resultId: number): Promise<void> {
  await requireNoClip(user, videoId);
  await approveResult(user, videoId, "frame", resultId);
}

/** Rechaza la última ronda de la imagen inicial con un motivo de una línea (y deja de estar aprobada). */
export async function rejectFrame(user: AuthUser, videoId: number, reason: string): Promise<void> {
  await requireNoClip(user, videoId);
  await rejectRound(user, videoId, "frame", reason);
}
