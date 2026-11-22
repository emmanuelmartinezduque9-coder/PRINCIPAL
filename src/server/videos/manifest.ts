import type { PhotoInfo, PhotoRole } from "@/server/photos";
import type { Video } from "@/server/videos/videos";

/**
 * Qué referencias acompañan a la imagen inicial y al clip, y en qué orden. El orden lo decide el
 * código, no el modelo: los prompts citan cada referencia por su número («image 3», `@Image3`) y
 * ese número tiene que ser el de la referencia que de verdad se envía.
 *
 * Las fotos de artículo y de embalaje entran en el orden en que se subieron. El avatar y el
 * entorno son los elegidos en el vídeo, y solo si la foto sigue existiendo con ese papel.
 */

export type FrameUse = "start_image" | "contextual_reference";
export const FRAME_USES: readonly FrameUse[] = ["start_image", "contextual_reference"];

export const MAX_ARTICLE_REFS = 4;
export const MAX_PACKAGING_REFS = 2;

/**
 * Si `start_image` cuenta como @Image1 al numerar. Supuesto; se confirma en la PUERTA de la
 * Tarea 11. Con `true`, la imagen aprobada es siempre `@Image1`, se use como primer fotograma o
 * como referencia de contexto, y la numeración del clip no depende de `frameUse`.
 */
export const START_IMAGE_IS_IMAGE1 = true;

export interface ManifestItem {
  /** Empieza en 1: el número de la etiqueta (`image 3` → 3, `@Image3` → 3, `@Video1` → 1). */
  index: number;
  /** Imagen: `"image 1"`…; clip: `"@Video1"`, `"@Image1"`… */
  tag: string;
  source: { kind: "reference_frame" } | { kind: "reference_video" } | { kind: "approved_frame" } | { kind: "photo"; photoId: number };
  role: "composicion" | "video_referencia" | "imagen_aprobada" | PhotoRole;
}

type PhotoRef = { photoId: number; role: PhotoRole };

function chosen(photos: PhotoInfo[], photoId: number | null, role: PhotoRole): PhotoRef[] {
  const photo = photoId === null ? undefined : photos.find((p) => p.id === photoId && p.role === role);
  return photo ? [{ photoId: photo.id, role }] : [];
}

function firstOf(photos: PhotoInfo[], role: PhotoRole, max: number): PhotoRef[] {
  return photos
    .filter((p) => p.role === role)
    .slice(0, max)
    .map((p) => ({ photoId: p.id, role }));
}

/** Avatar (si hay y no es «sin persona»), artículo (≤ 4) y embalaje (≤ 2). */
function productRefs(video: Video, photos: PhotoInfo[]): PhotoRef[] {
  return [
    ...(video.noPerson ? [] : chosen(photos, video.avatarPhotoId, "avatar")),
    ...firstOf(photos, "articulo", MAX_ARTICLE_REFS),
    ...firstOf(photos, "embalaje", MAX_PACKAGING_REFS),
  ];
}

/** 1 = primer fotograma de la referencia (composición); después avatar (si hay), artículo (≤ 4), embalaje (≤ 2), entorno (si hay). */
export function imageManifest(video: Video, photos: PhotoInfo[]): ManifestItem[] {
  const refs = [...productRefs(video, photos), ...chosen(photos, video.environmentPhotoId, "entorno")];
  return [
    { index: 1, tag: "image 1", source: { kind: "reference_frame" }, role: "composicion" },
    ...refs.map((ref, i): ManifestItem => ({
      index: i + 2,
      tag: `image ${i + 2}`,
      source: { kind: "photo", photoId: ref.photoId },
      role: ref.role,
    })),
  ];
}

/**
 * @Video1 = referencia; @Image1 = imagen aprobada; después avatar (si hay), artículo (≤ 4),
 * embalaje (≤ 2). El entorno no va aparte: ya está en la imagen aprobada.
 */
export function clipManifest(video: Video, photos: PhotoInfo[]): ManifestItem[] {
  return [
    { index: 1, tag: "@Video1", source: { kind: "reference_video" }, role: "video_referencia" },
    { index: 1, tag: "@Image1", source: { kind: "approved_frame" }, role: "imagen_aprobada" },
    ...productRefs(video, photos).map((ref, i): ManifestItem => ({
      index: i + 2,
      tag: `@Image${i + 2}`,
      source: { kind: "photo", photoId: ref.photoId },
      role: ref.role,
    })),
  ];
}
