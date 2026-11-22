import { and, asc, desc, eq } from "drizzle-orm";
import {
  getHiggsfield,
  higgsfieldFakeMode,
  type HfMediaRef,
  type HfVideoRequest,
} from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { readAvatarImage } from "@/server/avatars";
import { readProductPhoto } from "@/server/photos";
import { getProductFor } from "@/server/products";
import { fileSlug } from "@/server/videos/filename";
import { asHttp, registerRequestBuilder, type GenDeps, type RequestBuilder } from "@/server/videos/generations";
import { clipManifest } from "@/server/videos/manifest";
import { checkVideoPrompt } from "@/server/videos/prompt-check";
import {
  BRIEF_CHANGED,
  clipDurationSeconds,
  getVideoFor,
  latestDoneAnalysis,
  manifestRefsFor,
  NO_AUTO_AVATAR,
  REFERENCE_OUTDATED,
  referenceOutdated,
  requireVideoOwner,
  videoSnapshot,
  type Video,
} from "@/server/videos/videos";

export { CLIP_RESOLUTIONS, clipDurationSeconds, DEFAULT_CLIP_RESOLUTION, type ClipResolution } from "@/server/videos/videos";

/**
 * El clip: Seedance 2.5 en modo `omni_reference`. `@Video1` es la referencia (solo estructura:
 * cámara, ritmo y acción; lo dice el prompt), `@Image1` la imagen inicial aprobada (como primer
 * fotograma o como referencia de la escena, según `frameUse`) y después las fotos del producto
 * en el orden del manifiesto. Vertical, sin audio (`generate_audio: false` siempre explícito),
 * `bitrate_mode: "high"`, a la resolución del vídeo (480p por defecto) y con la duración del tramo
 * (con «Solo gancho», el tramo es el gancho; Seedance no baja de 4 s, así que un gancho de 2 o 3 s
 * sale de 4: el desglose le dice a Claude que la acción cabe en el gancho y que el resto solo
 * mantiene el final, y el paso «Clip» enseña «Gancho N s» para saber dónde recortar).
 *
 * Al importar este módulo se registra el constructor `"clip"` en las generaciones: lo importan las
 * rutas que piden precio o generan.
 */

export const CLIP_MODEL = "seedance_2_5";

const NO_FRAME = "Aprueba primero la imagen inicial.";
const NO_REFERENCE = "Sube primero el vídeo de referencia.";
const NO_ANALYSIS = "Haz primero el desglose.";
const REFERENCE_CHANGED = "La referencia cambió; vuelve a pedir el desglose.";
const NO_CLIP = "Todavía no hay clip.";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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
  "avatarLibraryId",
  "variantId",
  "avatarMode",
  "kind",
  "adaptation",
  "hookSeconds",
  "note",
] as const satisfies ReadonlyArray<keyof Video>;

/**
 * La petición del clip. Antes de subir nada: referencia lista, desglose hecho sobre esa misma
 * referencia, imagen aprobada y prompt sin errores. Las fotos se suben al Higgsfield de quien creó
 * el vídeo (una sola vez por archivo: `ensureMedia`); si Higgsfield falla al subir, la respuesta la
 * pone `generations.ts` (la misma que al presupuestar).
 */
export const buildClipRequest: RequestBuilder = async (user, video, deps) => {
  requireVideoOwner(user, video);
  if (video.referenceStatus !== "ready" || !video.referenceMediaId || !video.segmentDurationMs) throw new HttpError(409, NO_REFERENCE);
  if (referenceOutdated(video)) throw new HttpError(409, REFERENCE_OUTDATED);
  const analysis = await latestDoneAnalysis(video);
  if (!analysis) throw new HttpError(409, NO_ANALYSIS);
  if (analysis.staleReason === "reference") throw new HttpError(409, REFERENCE_CHANGED);
  if (analysis.staleReason === "brief") throw new HttpError(409, BRIEF_CHANGED);
  const approvedJobId = await approvedFrameJobId(video);
  if (!approvedJobId) throw new HttpError(409, NO_FRAME);

  const prompt = video.videoPrompt ?? "";
  const manifest = clipManifest(video, await manifestRefsFor(user, video));
  if (manifest.some((item) => item.source.kind === "avatar_pending")) throw new HttpError(409, NO_AUTO_AVATAR);
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
      const mediaId = await ensureMedia(video.createdBy, file, deps);
      medias.push({ role: "image_references", value: mediaId });
    } else if (item.source.kind === "avatar") {
      const avatar = await readAvatarImage(item.source.avatarId);
      const file = {
        bytes: avatar.data,
        filename: `avatar-${item.source.avatarId}.${EXTENSIONS[avatar.mime] ?? "jpg"}`,
        contentType: avatar.mime,
        type: "image" as const,
      };
      medias.push({ role: "image_references", value: await ensureMedia(video.createdBy, file, deps) });
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

/**
 * Estimación del clip ANTES de tener la imagen aprobada (para el presupuesto de «Enviar lote»):
 * el presupuesto de Seedance (`estimate_video_cost`) con la duración y la resolución del vídeo, su
 * prompt y la referencia. Sin la imagen ni las fotos (aún no existe la imagen); el precio depende
 * del modelo, la duración y la resolución. No gasta nada. Cuando se pida de verdad, el clip se
 * presupuesta otra vez con la petición completa (`requestGeneration`) y se compara con esto.
 */
export async function estimateClipCredits(user: AuthUser, video: Video, deps: GenDeps = {}): Promise<number> {
  requireVideoOwner(user, video);
  if (video.referenceStatus !== "ready" || !video.referenceMediaId || !video.segmentDurationMs) throw new HttpError(409, NO_REFERENCE);
  const request: HfVideoRequest = {
    model: CLIP_MODEL,
    mode: "omni_reference",
    prompt: video.videoPrompt ?? "",
    aspectRatio: "9:16",
    duration: clipDurationSeconds(video.segmentDurationMs),
    resolution: video.clipResolution as HfVideoRequest["resolution"],
    generateAudio: false,
    bitrateMode: "high",
    medias: [{ role: "video_references", value: video.referenceMediaId }],
  };
  const port = deps.higgsfield ?? getHiggsfield();
  const { credits } = await port.quoteVideo(video.createdBy, request).catch(asHttp);
  return credits;
}

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

/**
 * Qué se descarga del clip de un vídeo que `user` ve: el aprobado o, si no hay (o su dirección no
 * se puede servir, `servableClipUrl`), el último terminado bien. Nombre `<producto>-video-<id>.mp4`.
 */
export async function clipDownload(user: AuthUser, videoId: number): Promise<{ url: string; filename: string }> {
  const video = await getVideoFor(user, videoId);
  const product = await getProductFor(user, video.productId);
  const url = await downloadableClipUrl(video);
  if (!url) throw new HttpError(404, NO_CLIP);
  return { url, filename: `${fileSlug(product.name, "producto")}-video-${video.id}.mp4` };
}

/**
 * La dirección del clip que se descargaría de un vídeo ya comprobado con `getVideoFor`: el aprobado
 * o, si no hay (o no se puede servir), el último terminado bien; `null` si no hay ninguno.
 */
export async function downloadableClipUrl(video: Video): Promise<string | null> {
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
  return chosen?.url ?? null;
}

/** Tope para que Higgsfield empiece a responder. */
export const CLIP_CONNECT_TIMEOUT_MS = 60_000;
/** Tope de la descarga entera (también mientras pasa el archivo). */
export const CLIP_DOWNLOAD_DEADLINE_MS = 10 * 60 * 1000;
/** Un clip de 30 s a 1080p no llega ni de lejos; más que esto no se reenvía. */
export const MAX_CLIP_BYTES = 500 * 1024 * 1024;
const UNAVAILABLE = "No se pudo descargar el clip de Higgsfield. Inténtalo de nuevo.";
export const CLIP_TOO_BIG = "El clip es demasiado grande para descargarlo.";
export const CLIP_TOO_SLOW = "La descarga del clip ha tardado demasiado.";

/**
 * Deja pasar el archivo y lo corta con error si pasa de `max` bytes (por si no dice su tamaño o
 * miente) o si salta `signal` (el tope de la descarga entera) a mitad. Al cortar se cancela también
 * la descarga de Higgsfield (el error se propaga hacia atrás por la tubería).
 */
function guarded(max: number, signal: AbortSignal): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  let onAbort: (() => void) | null = null;
  const stop = () => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  };
  // `cancel` (quien descarga cortó) es del estándar y Node 22 lo llama, pero los tipos de TypeScript aún no lo traen.
  const transformer: Transformer<Uint8Array, Uint8Array> & { cancel: () => void } = {
    start(controller) {
      onAbort = () => controller.error(new Error(CLIP_TOO_SLOW));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    },
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) {
        stop();
        controller.error(new Error(CLIP_TOO_BIG));
      } else controller.enqueue(chunk);
    },
    flush: stop,
    cancel: stop,
  };
  return new TransformStream(transformer);
}

/** Solo para las pruebas: el tramo que vigila el tope de tamaño y de tiempo. */
export const guardedClipStreamForTests = guarded;

/**
 * Pide un clip a su dirección guardada (tiene que pasar `servableClipUrl`): sin seguir
 * redirecciones, con tope hasta que responda y para la descarga entera, y sin pasar de `maxBytes`
 * (por su `Content-Length` y, si no lo dice, contando). Devuelve el cuerpo en flujo y el tamaño a
 * reenviar, solo si viene sin `Content-Encoding` (comprimido, ese tamaño no es el del archivo).
 * Si Higgsfield falla, 502.
 */
export async function openClipStream(
  url: string,
  options: { fetch?: typeof fetch; connectTimeoutMs?: number; deadlineMs?: number; maxBytes?: number } = {},
): Promise<{ body: ReadableStream<Uint8Array>; length: string | null }> {
  if (!servableClipUrl(url)) throw new HttpError(404, NO_CLIP);
  const maxBytes = options.maxBytes ?? MAX_CLIP_BYTES;
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(), options.connectTimeoutMs ?? CLIP_CONNECT_TIMEOUT_MS);
  const deadline = AbortSignal.timeout(options.deadlineMs ?? CLIP_DOWNLOAD_DEADLINE_MS);
  let upstream: Response;
  try {
    upstream = await (options.fetch ?? fetch)(url, { signal: AbortSignal.any([connect.signal, deadline]), redirect: "error" });
  } catch {
    throw new HttpError(502, UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    throw new HttpError(502, UNAVAILABLE);
  }
  const declared = upstream.headers.get("content-length");
  const length = declared && /^\d+$/.test(declared) ? declared : null;
  if (length !== null && Number(length) > maxBytes) {
    await upstream.body.cancel().catch(() => {});
    throw new HttpError(502, CLIP_TOO_BIG);
  }
  return {
    body: upstream.body.pipeThrough(guarded(maxBytes, deadline)),
    length: upstream.headers.get("content-encoding") ? null : length,
  };
}
