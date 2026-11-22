import { and, asc, desc, eq } from "drizzle-orm";
import {
  higgsfieldFakeMode,
  HiggsfieldAuthError,
  HiggsfieldNotConnectedError,
  isHiggsfieldError,
  type HfMediaRef,
  type HfVideoRequest,
} from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { listProductPhotos, readProductPhoto } from "@/server/photos";
import { getProductFor } from "@/server/products";
import { registerRequestBuilder, type RequestBuilder } from "@/server/videos/generations";
import { clipManifest } from "@/server/videos/manifest";
import { checkVideoPrompt } from "@/server/videos/prompt-check";
import { getVideoFor, requireVideoOwner, videoSnapshot, type Video } from "@/server/videos/videos";

export { CLIP_RESOLUTIONS, DEFAULT_CLIP_RESOLUTION, type ClipResolution } from "@/server/videos/videos";

/**
 * El clip: Seedance 2.5 en modo `omni_reference`. `@Video1` es la referencia (solo estructura:
 * cámara, ritmo y acción; lo dice el prompt), `@Image1` la imagen inicial aprobada (como primer
 * fotograma o como referencia de la escena, según `frameUse`) y después las fotos del producto
 * en el orden del manifiesto. Vertical, sin audio (`generate_audio: false` siempre explícito),
 * `bitrate_mode: "high"`, a la resolución del vídeo (480p por defecto) y con la duración del tramo.
 *
 * Al importar este módulo se registra el constructor `"clip"` en las generaciones: lo importan las
 * rutas que piden precio o generan.
 */

export const CLIP_MODEL = "seedance_2_5";
const MIN_SECONDS = 4;
const MAX_SECONDS = 30;

const NO_FRAME = "Aprueba primero la imagen inicial.";
const NO_REFERENCE = "Sube primero el vídeo de referencia.";
const NO_ANALYSIS = "Haz primero el desglose.";
const REFERENCE_CHANGED = "La referencia cambió; vuelve a pedir el desglose.";
const NO_CLIP = "Todavía no hay clip.";

/** Segundos del clip: los del tramo redondeados, entre 4 y 30 (lo que admite Seedance). */
export function clipDurationSeconds(segmentDurationMs: number): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(segmentDurationMs / 1000)));
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Un fallo de Higgsfield al subir una foto, como respuesta para la persona. */
function uploadFailed(error: unknown): never {
  if (error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldAuthError) throw new HttpError(409, error.message);
  if (isHiggsfieldError(error)) throw new HttpError(503, error.message);
  throw error;
}

/** El `jobId` de la imagen inicial aprobada (un resultado bueno de una imagen de este vídeo), o `null`. */
async function approvedFrameJobId(video: Video): Promise<string | null> {
  if (video.approvedFrameResultId === null) return null;
  const [found] = await getDb()
    .select({ jobId: schema.generationResults.jobId })
    .from(schema.generationResults)
    .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
    .where(
      and(
        eq(schema.generationResults.id, video.approvedFrameResultId),
        eq(schema.generationResults.ok, true),
        eq(schema.generations.videoId, video.id),
        eq(schema.generations.kind, "frame"),
      ),
    );
  return found?.jobId ?? null;
}

/**
 * Columnas del vídeo en las que se apoya la petición del clip. Al apuntar la generación (con el
 * cerrojo del vídeo) se comprueba que siguen igual: si otra pestaña aprobó o rechazó la imagen, cambió
 * la referencia, el prompt, el uso de la imagen, la resolución o el avatar mientras se presupuestaba,
 * no se apunta nada (409).
 */
const CLIP_SNAPSHOT = [
  "approvedFrameResultId",
  "referenceStatus",
  "referenceMediaId",
  "segmentDurationMs",
  "videoPrompt",
  "frameUse",
  "clipResolution",
  "avatarPhotoId",
  "noPerson",
] as const satisfies ReadonlyArray<keyof Video>;

/**
 * La petición del clip. Antes de subir nada: referencia lista, desglose hecho sobre esa misma
 * referencia, imagen aprobada y prompt sin errores. Las fotos se suben al Higgsfield de quien creó
 * el vídeo (una sola vez por archivo: `ensureMedia`).
 */
export const buildClipRequest: RequestBuilder = async (user, video, deps) => {
  requireVideoOwner(user, video);
  if (video.referenceStatus !== "ready" || !video.referenceMediaId || !video.segmentDurationMs) throw new HttpError(409, NO_REFERENCE);
  const [analysis] = await getDb()
    .select({ referenceMediaId: schema.videoAnalyses.referenceMediaId })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, video.id), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  if (!analysis) throw new HttpError(409, NO_ANALYSIS);
  if (analysis.referenceMediaId !== video.referenceMediaId) throw new HttpError(409, REFERENCE_CHANGED);
  const approvedJobId = await approvedFrameJobId(video);
  if (!approvedJobId) throw new HttpError(409, NO_FRAME);

  const prompt = video.videoPrompt ?? "";
  const manifest = clipManifest(video, await listProductPhotos(user, video.productId));
  const error = checkVideoPrompt(prompt, manifest).find((issue) => issue.level === "error");
  if (error) throw new HttpError(400, error.message);

  const medias: HfMediaRef[] = [];
  // Una a una y en orden: así la numeración de `@ImageN` es la del manifiesto.
  for (const item of manifest) {
    if (item.source.kind === "reference_video") {
      medias.push({ role: "video_references", value: video.referenceMediaId });
    } else if (item.source.kind === "approved_frame") {
      medias.push({ role: video.frameUse === "start_image" ? "start_image" : "image_references", value: approvedJobId });
    } else if (item.source.kind === "photo") {
      const photo = await readProductPhoto(user, item.source.photoId);
      const file = {
        bytes: photo.data,
        filename: `foto-${item.source.photoId}.${EXTENSIONS[photo.mime] ?? "jpg"}`,
        contentType: photo.mime,
        type: "image" as const,
      };
      const mediaId = await ensureMedia(video.createdBy, file, deps).catch(uploadFailed);
      medias.push({ role: "image_references", value: mediaId });
    }
  }

  const request: HfVideoRequest = {
    model: CLIP_MODEL,
    mode: "omni_reference",
    prompt,
    aspectRatio: "9:16",
    duration: clipDurationSeconds(video.segmentDurationMs),
    resolution: video.clipResolution as HfVideoRequest["resolution"],
    generateAudio: false,
    bitrateMode: "high",
    medias,
  };
  return { request, count: 1, snapshot: videoSnapshot(video, CLIP_SNAPSHOT) };
};

registerRequestBuilder("clip", buildClipRequest);

// ───────────────────────── Descarga ─────────────────────────

/**
 * Solo direcciones `https:` guardadas y de la red de distribución de Higgsfield (`*.cloudfront.net`,
 * como en las capturas reales), y `data:` en el modo simulado, que no existe en la nube. Así la
 * descarga nunca pide a otro sitio aunque una dirección guardada fuera rara.
 */
export function servableClipUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const { protocol, hostname, username, password, port } = new URL(url);
    if (protocol === "data:") return higgsfieldFakeMode();
    return protocol === "https:" && hostname.endsWith(".cloudfront.net") && !username && !password && port === "";
  } catch {
    return false;
  }
}

/** Nombre del archivo: el producto en minúsculas, sin acentos ni signos. */
function slug(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || "producto";
}

/**
 * Qué se descarga del clip de un vídeo que `user` ve: el aprobado o, si no hay (o su dirección no
 * se puede servir, `servableClipUrl`), el último terminado bien. Nombre `<producto>-video-<id>.mp4`.
 */
export async function clipDownload(user: AuthUser, videoId: number): Promise<{ url: string; filename: string }> {
  const video = await getVideoFor(user, videoId);
  const product = await getProductFor(user, video.productId);
  const results = await getDb()
    .select({ id: schema.generationResults.id, url: schema.generationResults.url })
    .from(schema.generationResults)
    .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
    .where(
      and(
        eq(schema.generations.videoId, video.id),
        eq(schema.generations.kind, "clip"),
        eq(schema.generations.status, "done"),
        eq(schema.generationResults.ok, true),
      ),
    )
    .orderBy(desc(schema.generations.id), asc(schema.generationResults.index));
  const approved = results.find((result) => result.id === video.approvedClipResultId);
  const chosen = [approved, ...results].find((result) => result && servableClipUrl(result.url));
  if (!chosen?.url) throw new HttpError(404, NO_CLIP);
  return { url: chosen.url, filename: `${slug(product.name)}-video-${video.id}.mp4` };
}
