import { christmasTvLine, lastWasBlocked } from "@/server/videos/tele-navidad";
import { preferencesFor } from "@/server/videos/aprendizaje/preferencias";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  getHiggsfield,
  higgsfieldFakeMode,
  type HfMediaRef,
  type HfUpscaleRequest,
  type HfVideoRequest,
} from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { readAvatarImage } from "@/server/avatars";
import { readProductPhoto } from "@/server/photos";
import { christmasTvSeen, readPinterestImage, readyPinterestRefs, requirePinterestRefs, ownerEnvironmentParagraph } from "@/server/videos/pinterest";
import { resolveClipModel, SEEDANCE, sourceProblem, wanDurationSeconds, type ClipModel } from "@/lib/clip-models";
import { getProductFor } from "@/server/products";
import { listReferences } from "@/server/videos/referencias";
import { fileSlug } from "@/server/videos/filename";
import { asHttp, registerRequestBuilder, type GenDeps, type RequestBuilder } from "@/server/videos/generations";
import { clipManifest, clipPromptFor, remapPeopleReferences, importedPeoplePrompt, MAX_IMAGE_REFS, genjutsuImageTag, type ManifestItem } from "@/server/videos/manifest";
import { learnedSuffix } from "@/server/videos/mejoras/corrections";
import { checkVideoPrompt, PROMPT_ERROR } from "@/server/videos/prompt-check";
import { tramosOf, shortPlacePrompt } from "@/server/videos/tramos";
import {
  BRIEF_CHANGED,
  clipDurationSeconds,
  getVideoFor,
  latestDoneAnalysis,
  manifestRefsFor,
  NO_AUTO_AVATAR,
  readVideoFrame,
  REFERENCE_OUTDATED,
  referenceOutdated,
  requireVideoOwner,
  videoSnapshot,
  type Video,
} from "@/server/videos/videos";

export { CLIP_RESOLUTIONS, clipDurationSeconds, DEFAULT_CLIP_RESOLUTION, type ClipResolution } from "@/server/videos/videos";

/**
 * El clip, con el modelo que resuelve el vídeo (`resolveClipModel`: el elegido en la tarjeta o en el
 * grupo del lote, o «Automático» = Genjutsu Motion Transfer, como en Codex):
 *
 * - Seedance 2.5 en modo `omni_reference`. `@Video1` es la referencia (solo estructura: cámara,
 *   ritmo y acción; lo dice el prompt), `@Image1` la imagen inicial aprobada (como primer fotograma
 *   o como referencia de la escena, según `frameUse`) y después las fotos del producto en el orden
 *   del manifiesto. Vertical, sin audio (`generate_audio: false` siempre explícito),
 *   `bitrate_mode: "high"`, a la resolución del vídeo (480p por defecto) y con la duración del tramo
 *   (con «Solo gancho», el tramo es el gancho; Seedance no baja de 4 s, así que un gancho de 2 o 3 s
 *   sale de 4: el desglose le dice a Claude que la acción cabe en el gancho y que el resto solo
 *   mantiene el final, y el paso «Clip» enseña «Gancho N s» para saber dónde recortar).
 * - Genjutsu (Motion Transfer u Object Swap) y Wan 3.0 Prime, como los enviaba Codex
 *   (`genjutsu.parametros`): el vídeo fuente entero y las imágenes (`image [1]` = la aprobada); Wan
 *   con la duración entera del tramo, `aspect_ratio: auto` y su propio audio. Genjutsu conserva el
 *   audio del original.
 *
 * Al importar este módulo se registra el constructor `"clip"` en las generaciones: lo importan las
 * rutas que piden precio o generan.
 */

/** El modelo de Seedance (el de los vídeos de antes de poder elegir). */
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
  "clipModel",
  "environmentPhotoId",
] as const satisfies ReadonlyArray<keyof Video>;

/**
 * La petición del clip. Antes de subir nada: referencia lista, desglose hecho sobre esa misma
 * referencia, imagen aprobada y prompt sin errores. Las fotos se suben al Higgsfield de quien creó
 * el vídeo (una sola vez por archivo: `ensureMedia`); si Higgsfield falla al subir, la respuesta la
 * pone `generations.ts` (la misma que al presupuestar).
 */
/**
 * Los cambios concretos que el desglose escribió para un sitio (pomerania → corgi, bandera → manta lisa, calle de
 * EE. UU. → Berlín…), que antes iban en su tramo y se perdían al pasar a un solo clip (lote 10, vídeo 49). En el
 * prompt del tramo, image [1] era la apertura de ese sitio: aquí es su foto de entorno (`first`).
 */
export function placeChanges(videoPrompt: string | undefined, first: number, startMs: number, endMs: number): string {
  const sentences = (videoPrompt ?? "").split(/(?<=\.)\s+/).filter((s) => /^(Replace|Erase|Make|Change)\b/.test(s) && !/\bcaptions?\b/i.test(s));
  if (!sentences.length) return "";
  const text = sentences.join(" ").replace(/image\s*\[\s*1\s*\]/gi, `image [${first}]`);
  return ` Changes from ${startMs / 1000}s to ${endMs / 1000}s, in every shot of that part: ${text}`;
}

/**
 * Un solo clip con la referencia entera (orden del 25/11/2026): los prompts escritos con el sistema de tramos
 * hablan de «los primeros 6 s» y el cambio de producto se quedaba en ese trozo (EisWerk, lote 10).
 */
export function wholeVideoPreamble(model: ClipModel, segmentMs: number | null): string {
  if (model === SEEDANCE) return "";
  const total = segmentMs ? ` (0 s to ${Math.round(segmentMs / 100) / 10} s)` : "";
  return `The source video is the WHOLE reference${total}; any mention below of a shorter segment or stretch is outdated: apply every instruction to the whole video, every shot, until the last frame. Each shot keeps the TYPE of place it has in the source (an office stays an office, a kitchen stays a kitchen), only redesigned and localized; a place named for one part (a store, a supermarket) and every environment reference apply only to the shots of that same type of place.\n\n`;
}

/**
 * Orden de Emmanuel (26/11/2026): la variante que elige es la de TODO el vídeo. Si la referencia es la máquina rosa y
 * elige la amarilla, en ningún momento aparece la rosa.
 */
export function productEverywhere(model: ClipModel, manifest: ManifestItem[], variant: boolean): string {
  if (model === SEEDANCE) return "";
  const article = manifest.filter((item) => item.role === "articulo").map((item) => item.tag);
  if (!article.length) return "";
  const tags = article.length === 1 ? article[0] : `${article.slice(0, -1).join(", ")} and ${article.at(-1)}`;
  return `\n\nThroughout the WHOLE video, in every shot after every cut and in every moment until the last frame, every instance of the product is the exact ${variant ? "chosen variant" : "selected product"} in ${tags}, with its exact colour, pattern, finish and shape; the product, colour or variant of the source never appears, not even for a single frame.`;
}

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

  const model = resolveClipModel(video.clipModel, video.segmentDurationMs);
  const problem = model === SEEDANCE ? null : sourceProblem(model, video.segmentDurationMs);
  if (problem) throw new HttpError(409, problem);
  const refs = await manifestRefsFor(user, video);
  const manifest = clipManifest(video, refs, undefined, model);
  // Las frases de papel de lo de siempre (apertura, persona, producto…), antes de añadir las fotos de cada
  // entorno: esas llevan su propio párrafo con sus tiempos (nunca «sustituye todo el sitio»).
  const beforeCast = clipManifest(video, { ...refs, people: undefined, autoAvatars: undefined, importedOpening: false }, undefined, model);
  const adaptedPrompt = refs.people?.length || refs.importedOpening
    ? remapPeopleReferences(video.videoPrompt ?? "", beforeCast, manifest, refs.importedOpening) : video.videoPrompt ?? "";
  const basePrompt = clipPromptFor(adaptedPrompt, manifest) + (refs.importedOpening ? importedPeoplePrompt(refs.people) : "");
  const places = await tramosOf(video);
  const paragraphs: string[] = [];
  const manual = (await listReferences(video.id)).filter((ref) => ref.role === "fondo");
  for (const place of places ?? []) {
    if (place.index === 0) continue;
    const approved = video.tramoApprovals?.[`frame:${place.index}`];
    if (place.shortPlaces?.length) {
      paragraphs.push(shortPlacePrompt(place));
      continue;
    }
    if (model === SEEDANCE) continue;
    const sources: ManifestItem["source"][] = [];
    if (approved) {
      const [frame] = await getDb().select({ jobId: schema.generationResults.jobId }).from(schema.generationResults)
        .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
        .where(and(eq(schema.generationResults.id, approved), eq(schema.generationResults.ok, true),
          eq(schema.generations.videoId, video.id), eq(schema.generations.kind, `frame:${place.index}`)));
      if (frame) sources.push({ kind: "environment_frame", jobId: frame.jobId });
    }
    if (!sources.length && place.ownerEnvironment) {
      if (video.environmentPhotoId !== null) sources.push({ kind: "photo", photoId: video.environmentPhotoId });
      else sources.push(...manual.map((ref): ManifestItem["source"] => ({ kind: "pinterest", sha256: ref.sha256 })));
    }
    if (!sources.length) {
      await requirePinterestRefs(video.id, place.index);
      sources.push(...(await readyPinterestRefs(video.id, place.index)).map((sha256): ManifestItem["source"] => ({ kind: "pinterest", sha256 })));
    }
    const first = manifest.length;
    for (const source of sources) {
      const index = manifest.length; // includes source video: first additional image gets the next image number
      if (index > MAX_IMAGE_REFS[model]) break;
      manifest.push({ index, tag: genjutsuImageTag(index), source, role: "entorno", ownerSelected: place.ownerEnvironment || !!approved });
    }
    if (place.ownerEnvironment && manifest.length > first) paragraphs.push(`From ${place.startMs / 1000}s to ${place.endMs / 1000}s: ${ownerEnvironmentParagraph(genjutsuImageTag(first))}`);
    if (manifest.length > first) paragraphs.push(`From ${place.startMs / 1000}s to ${place.endMs / 1000}s the scene takes place in ${place.place}: rebuild that setting from images [${first}]..[${manifest.length - 1}] (real photos of it), localized to the target country; keep the action (${place.action}) and ${place.keepObjects.join(", ")}. Image [1] only supplies the opening cast, the product, the outfit and the look; follow the per-person identity schedule for later entrants; do not carry its background there.${placeChanges(place.videoPrompt, first, place.startMs, place.endMs)}`);
  }
  // La foto del producto funcionando (su efecto: la proyección de FalterPfote), como la adjuntaba Codex al clip
  // de Object Swap: sin ella, Genjutsu conserva el efecto de la fuente o lo inventa (lote 10, 25/11/2026).
  if (model !== SEEDANCE && !manifest.some((item) => item.role === "funcionamiento")) {
    const working = refs.photos.find((photo) => photo.role === "funcionamiento");
    if (working && manifest.length <= MAX_IMAGE_REFS[model]) {
      const index = manifest.length;
      manifest.push({ index, tag: genjutsuImageTag(index), source: { kind: "photo", photoId: working.id }, role: "funcionamiento" });
      paragraphs.push(`${genjutsuImageTag(index)} shows the exact selected product working: whenever the product works in the source, its effect is exactly the one in ${genjutsuImageTag(index)} (same shape, colours and light), replacing the original effect completely; never physical objects, floating graphics or pasted flat artwork. Do not copy the animal, person or background of ${genjutsuImageTag(index)}.`);
    }
  }
  const [lastClip] = await getDb().select({ reason: schema.generations.rejectReason }).from(schema.generations)
    .where(and(eq(schema.generations.videoId, video.id), eq(schema.generations.kind, "clip")))
    .orderBy(desc(schema.generations.id)).limit(1);
  if (lastClip?.reason) paragraphs.push(`Owner correction for this new clip: ${lastClip.reason}`);
  const settingPrompt = paragraphs.length ? `\n\n${paragraphs.join("\n\n")}` : "";
  if (manifest.some((item) => item.source.kind === "avatar_pending")) throw new HttpError(409, NO_AUTO_AVATAR);
  // Correcciones aprendidas de los reportes («Mejoras», `src/server/videos/mejoras/`): van literales al final.
  // Regla del dueño (26/11/2026): salón navideño con tele → encendida con una película de Navidad
  // (genérica si Higgsfield bloqueó el clip anterior); el entorno del dueño manda (`tele-navidad.ts`).
  const tv = christmasTvLine(`${video.videoPrompt ?? ""} ${video.imagePrompt ?? ""}`, {
    ownerRoom: video.environmentPhotoId !== null || manifest.some((item) => item.ownerSelected),
    blockedBefore: await lastWasBlocked(video.id, "clip"),
    seen: await christmasTvSeen(video.id),
  });
  const prompt = `${wholeVideoPreamble(model, video.segmentDurationMs)}${basePrompt + settingPrompt}${tv ? `\n\n${tv}` : ""}${productEverywhere(model, manifest, video.variantId !== null)}${await learnedSuffix("clip", video.productId)}${(await preferencesFor("clip", { videoId: video.id, tramo: 0 })).text}`;
  const error = checkVideoPrompt(prompt, manifest).find((issue) => issue.level === "error");
  if (error) throw new HttpError(400, error.message, PROMPT_ERROR);

  const medias: HfMediaRef[] = [];
  // Una a una y en orden: así la numeración de `@ImageN` / `image [N]` es la del manifiesto.
  for (const item of manifest) medias.push(await mediaRef(user, video, item, model, approvedJobId, deps));

  return { request: clipRequest(model, video, prompt, medias), count: 1, snapshot: videoSnapshot(video, CLIP_SNAPSHOT) };
};

/** La entrada de una referencia del manifiesto del clip, subiendo la foto si hace falta (una vez por archivo). */
async function mediaRef(user: AuthUser, video: Video, item: ManifestItem, model: ClipModel, approvedJobId: string, deps: GenDeps): Promise<HfMediaRef> {
  const { source } = item;
  if (source.kind === "reference_video") return { role: "video_references", value: video.referenceMediaId! };
  if (source.kind === "environment_frame") return { role: "image_references", value: source.jobId };
  if (source.kind === "approved_frame") {
    // Genjutsu y Wan (con referencias) no admiten `start_image`: la aprobada va como referencia (Codex).
    return { role: model === SEEDANCE && video.frameUse === "start_image" ? "start_image" : "image_references", value: approvedJobId };
  }
  if (source.kind === "photo") {
    const photo = await readProductPhoto(user, source.photoId);
    const file = { bytes: photo.data, filename: `foto-${source.photoId}.${EXTENSIONS[photo.mime] ?? "jpg"}`, contentType: photo.mime, type: "image" as const };
    return { role: "image_references", value: await ensureMedia(video.createdBy, file, deps) };
  }
  if (source.kind === "avatar") {
    const avatar = await readAvatarImage(source.avatarId);
    const file = { bytes: avatar.data, filename: `avatar-${source.avatarId}.${EXTENSIONS[avatar.mime] ?? "jpg"}`, contentType: avatar.mime, type: "image" as const };
    return { role: "image_references", value: await ensureMedia(video.createdBy, file, deps) };
  }
  if (source.kind === "pinterest") {
    const image = await readPinterestImage(source.sha256);
    const file = { bytes: image.data, filename: `pinterest-${source.sha256.slice(0, 16)}.jpg`, contentType: image.mime, type: "image" as const };
    return { role: "image_references", value: await ensureMedia(video.createdBy, file, deps) };
  }
  throw new Error(`Referencia del clip no esperada: ${source.kind}.`);
}

/** La petición del modelo, con los parámetros que enviaba Codex para cada uno. */
function clipRequest(model: ClipModel, video: Video, prompt: string, medias: HfMediaRef[]): HfVideoRequest {
  const resolution = video.clipResolution as HfVideoRequest["resolution"];
  if (model === "wan3_0_prime") {
    return { model, prompt, resolution, duration: wanDurationSeconds(video.segmentDurationMs!), aspectRatio: "auto", generateAudio: true, enableThinking: false, medias };
  }
  if (model === "hf_mult_motion_control" || model === "hf_mult_replace_object") return { model, prompt, resolution, medias };
  return {
    model: CLIP_MODEL,
    mode: "omni_reference",
    prompt,
    aspectRatio: "9:16",
    duration: clipDurationSeconds(video.segmentDurationMs!),
    resolution,
    generateAudio: false,
    bitrateMode: "high",
    medias,
  };
}

registerRequestBuilder("clip", buildClipRequest);

/** El clip hecho que se sube a 1080p: el aprobado o, si no hay, el último bueno; `null` si no hay. */
async function finishedClip(video: Video): Promise<{ jobId: string } | null> {
  const kind = "clip";
  const results = await getDb()
    .select({ id: schema.generationResults.id, jobId: schema.generationResults.jobId })
    .from(schema.generationResults)
    .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
    .where(and(eq(schema.generations.videoId, video.id), eq(schema.generations.kind, kind), eq(schema.generations.status, "done"), eq(schema.generationResults.ok, true)))
    .orderBy(desc(schema.generations.id), asc(schema.generationResults.index));
  return results.find((result) => result.id === video.approvedClipResultId) ?? results[0] ?? null;
}

const NO_FINISHED_CLIP = "Todavía no hay clip que subir a 1080p.";

/**
 * Topaz a 1080p sobre el clip hecho (orden de Emmanuel, 24/11/2026: todos los clips a 480p y luego
 * a 1080p, como en Codex, pedido 54): `topaz_video`, 1080p, `aspect_ratio: auto`, mejora `thd-3`,
 * sin interpolación. La entrada es el trabajo del clip. Higgsfield no lo presupuesta: va la
 * previsión (`estimateSeconds` → `upscaleEstimate`).
 */
export const buildUpscaleRequest: RequestBuilder = async (user, video) => {
  requireVideoOwner(user, video);
  const clip = await finishedClip(video);
  if (!clip) throw new HttpError(409, NO_FINISHED_CLIP);
  const request: HfUpscaleRequest & { estimateSeconds: number } = {
    model: "topaz_video",
    prompt: "",
    resolution: "1080p",
    aspectRatio: "auto",
    enhancement: { model: "thd-3", astra_params: null, params: null },
    frameInterpolation: null,
    medias: [{ role: "video_references", value: clip.jobId }],
    estimateSeconds: Math.round((video.segmentDurationMs ?? 15_000) / 1000),
  };
  return { request, count: 1 };
};

registerRequestBuilder("upscale", buildUpscaleRequest);

/**
 * Estimación del clip ANTES de tener la imagen aprobada (para el presupuesto de «Enviar lote»):
 * el presupuesto del modelo del vídeo (`estimate_video_cost`) con la duración y la resolución del
 * vídeo, su prompt y la referencia. Sin la imagen ni las fotos (aún no existe la imagen); el precio
 * depende del modelo, la duración y la resolución. Genjutsu y Wan exigen al menos una imagen: va el
 * primer fotograma de la referencia en su lugar (subirlo no gasta). No gasta nada. Cuando se pida de verdad, el clip se
 * presupuesta otra vez con la petición completa (`requestGeneration`) y se compara con esto.
 */
export async function estimateClipCredits(user: AuthUser, video: Video, deps: GenDeps = {}): Promise<number> {
  requireVideoOwner(user, video);
  if (video.referenceStatus !== "ready" || !video.referenceMediaId || !video.segmentDurationMs) throw new HttpError(409, NO_REFERENCE);
  const model = resolveClipModel(video.clipModel, video.segmentDurationMs);
  const problem = model === SEEDANCE ? null : sourceProblem(model, video.segmentDurationMs);
  if (problem) throw new HttpError(409, problem);
  const medias: HfMediaRef[] = [{ role: "video_references", value: video.referenceMediaId }];
  if (model !== SEEDANCE) {
    const frame = await readVideoFrame(user, video.id, 0);
    const file = { bytes: frame.data, filename: `fotograma-${video.id}.jpg`, contentType: frame.mime, type: "image" as const };
    medias.push({ role: "image_references", value: await ensureMedia(video.createdBy, file, deps) });
  }
  const request = clipRequest(model, video, video.videoPrompt ?? "", medias);
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
export async function clipDownload(user: AuthUser, videoId: number): Promise<{ url: string; jobId: string | null; filename: string }> {
  const video = await getVideoFor(user, videoId);
  const product = await getProductFor(user, video.productId);
  const chosen = await downloadableClip(video);
  if (!chosen) throw new HttpError(404, NO_CLIP);
  const { url, jobId } = chosen;
  return { url, jobId, filename: `${fileSlug(product.name, "producto")}-video-${video.id}.mp4` };
}

/**
 * La dirección del clip que se descargaría de un vídeo ya comprobado con `getVideoFor`: el aprobado
 * o, si no hay (o no se puede servir), el último terminado bien; `null` si no hay ninguno.
 */
export async function downloadableClipUrl(video: Video): Promise<string | null> {
  return (await downloadableClip(video))?.url ?? null;
}

/** Como `downloadableClipUrl`, con el trabajo de Higgsfield (para buscar su copia en el almacén propio). */
export async function downloadableClip(video: Video): Promise<{ url: string; jobId: string } | null> {
  const kind = "clip";
  const approvedId = video.approvedClipResultId;
  const results = await getDb()
    .select({ id: schema.generationResults.id, url: schema.generationResults.url, jobId: schema.generationResults.jobId })
    .from(schema.generationResults)
    .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
    .where(
      and(
        eq(schema.generations.videoId, video.id),
        eq(schema.generations.kind, kind),
        eq(schema.generations.status, "done"),
        eq(schema.generationResults.ok, true),
      ),
    )
    .orderBy(desc(schema.generations.id), asc(schema.generationResults.index));
  const approved = results.find((result) => result.id === approvedId);
  const chosen = [approved, ...results].find((result) => result && servableClipUrl(result.url));
  if (!chosen?.url) return null;
  // El montaje y la descarga van con el clip subido a 1080p con Topaz, si ya está (orden de Emmanuel,
  // 24/11/2026); si Topaz no pudo, con el de 480p.
  return (await upscaledOf(video, chosen.jobId)) ?? { url: chosen.url, jobId: chosen.jobId };
}

/** La subida a 1080p (Topaz) terminada de ese clip, o `null`. */
async function upscaledOf(video: Video, clipJobId: string): Promise<{ url: string; jobId: string } | null> {
  const rows = await getDb()
    .select({ url: schema.generationResults.url, jobId: schema.generationResults.jobId, request: schema.generations.request })
    .from(schema.generationResults)
    .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
    .where(
      and(
        eq(schema.generations.videoId, video.id),
        eq(schema.generations.kind, "upscale"),
        eq(schema.generations.status, "done"),
        eq(schema.generationResults.ok, true),
      ),
    )
    .orderBy(desc(schema.generations.id));
  const found = rows.find(
    (row) => servableClipUrl(row.url) && (row.request as { medias?: Array<{ value: string }> } | null)?.medias?.[0]?.value === clipJobId,
  );
  return found?.url ? { url: found.url, jobId: found.jobId } : null;
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
