import type { PhotoInfo, PhotoRole } from "@/server/photos";
import type { Video } from "@/server/videos/videos";

/**
 * Qué referencias acompañan a la imagen inicial y al clip, y en qué orden. El orden lo decide el
 * código, no el modelo: los prompts citan cada referencia por su número («image 3», `@Image3`) y
 * ese número tiene que ser el de la referencia que de verdad se envía.
 *
 * Las fotos de artículo y de embalaje entran en el orden en que se subieron, o en el de la variante
 * elegida. El avatar y el entorno son los elegidos en el vídeo, y solo si la foto sigue existiendo
 * con ese papel; el avatar puede ser también uno de la biblioteca.
 */

export type FrameUse = "start_image" | "contextual_reference";
export const FRAME_USES: readonly FrameUse[] = ["start_image", "contextual_reference"];

export const MAX_ARTICLE_REFS = 4;
export const MAX_PACKAGING_REFS = 2;

/**
 * Si `start_image` cuenta como @Image1 al numerar. Supuesto; se confirma en la PUERTA de la
 * Tarea 11. Con `true`, la imagen aprobada es siempre `@Image1`, se use como primer fotograma o
 * como referencia de contexto. Con `false`, cuando el vídeo la usa como primer fotograma va sin
 * etiqueta (`START_IMAGE_TAG`) y las fotos empiezan en `@Image1`.
 */
export const START_IMAGE_IS_IMAGE1 = true;

/** Etiqueta de la imagen aprobada cuando va como primer fotograma y no se numera: el prompt no la cita. */
export const START_IMAGE_TAG = "start_image";

export interface ManifestItem {
  /**
   * El número de la etiqueta (`image 3` → 3, `@Image3` → 3, `@Video1` → 1); empieza en 1. La
   * imagen aprobada sin numerar (`START_IMAGE_TAG`) lleva 0.
   */
  index: number;
  /** Imagen: `"image 1"`…; clip: `"@Video1"`, `"@Image1"`… (o `START_IMAGE_TAG`). */
  tag: string;
  source:
    | { kind: "reference_frame" }
    | { kind: "reference_video" }
    | { kind: "approved_frame" }
    | { kind: "photo"; photoId: number }
    /** Un avatar de la biblioteca (`biblioteca`, o el que eligió el desglose con `automatico`). */
    | { kind: "avatar"; avatarId: number }
    /** Con `automatico`, el sitio del avatar que aún no está elegido (o no encontró ninguno). */
    | { kind: "avatar_pending" }
    /** Una foto de Pinterest guardada (por su huella), como referencia de entorno y realismo. */
    | { kind: "pinterest"; sha256: string };
  role: "composicion" | "video_referencia" | "imagen_aprobada" | "pinterest" | PhotoRole;
}

/**
 * Lo que necesita el manifiesto además del vídeo: las fotos del producto, la variante elegida (sus
 * fotos de artículo en orden y su embalaje) y el avatar de la biblioteca que toca (`library`), o
 * su sitio vacío con «Automático» (`pending`); `null` en los demás modos.
 */
export interface ManifestRefs {
  photos: PhotoInfo[];
  variant: { articlePhotoIds: number[]; packagingPhotoId: number | null } | null;
  avatar: { kind: "library"; avatarId: number } | { kind: "pending" } | null;
  /**
   * Las fotos de Pinterest listas para la imagen inicial (huellas, en orden). Regla fija del dueño:
   * van siempre, salvo que el vídeo lleve una foto de entorno puesta a mano.
   */
  pinterest?: string[];
}

/** Solo fotos (sin variante ni avatar de la biblioteca) o todo. */
const refsOf = (refs: ManifestRefs | PhotoInfo[]): ManifestRefs => (Array.isArray(refs) ? { photos: refs, variant: null, avatar: null } : refs);

type Ref = { source: ManifestItem["source"]; role: PhotoRole };

function chosen(photos: PhotoInfo[], photoId: number | null, role: PhotoRole): Ref[] {
  const photo = photoId === null ? undefined : photos.find((p) => p.id === photoId && p.role === role);
  return photo ? [{ source: { kind: "photo", photoId: photo.id }, role }] : [];
}

function firstOf(photos: PhotoInfo[], role: PhotoRole, max: number): Ref[] {
  return photos
    .filter((p) => p.role === role)
    .slice(0, max)
    .map((p): Ref => ({ source: { kind: "photo", photoId: p.id }, role }));
}

/** Las fotos de la variante que siguen existiendo, en su orden, con el papel del hueco que ocupan. */
function ofVariant(photos: PhotoInfo[], ids: number[], role: PhotoRole, max: number): Ref[] {
  const existing = new Set(photos.map((p) => p.id));
  return ids
    .filter((id) => existing.has(id))
    .slice(0, max)
    .map((photoId): Ref => ({ source: { kind: "photo", photoId }, role }));
}

function avatarRefs(video: Video, refs: ManifestRefs): Ref[] {
  if (video.avatarMode === "elegido") return chosen(refs.photos, video.avatarPhotoId, "avatar");
  if (video.avatarMode !== "biblioteca" && video.avatarMode !== "automatico") return [];
  if (refs.avatar?.kind === "library") return [{ source: { kind: "avatar", avatarId: refs.avatar.avatarId }, role: "avatar" }];
  // Con «Automático» el sitio existe siempre (los prompts ya lo citan); con «biblioteca» sin avatar, no.
  return video.avatarMode === "automatico" ? [{ source: { kind: "avatar_pending" }, role: "avatar" }] : [];
}

/**
 * Avatar (con `elegido`, la foto; con `biblioteca` o `automatico`, el de la biblioteca; con «sin
 * sustitución» las personas salen de la referencia y con «nadie» no hay), artículo (≤ 4) y
 * embalaje (≤ 2). Con variante, solo sus fotos: las de artículo en su orden y su embalaje.
 */
function productRefs(video: Video, refs: ManifestRefs): Ref[] {
  const { photos, variant } = refs;
  return [
    ...avatarRefs(video, refs),
    ...(variant ? ofVariant(photos, variant.articlePhotoIds, "articulo", MAX_ARTICLE_REFS) : firstOf(photos, "articulo", MAX_ARTICLE_REFS)),
    ...(variant
      ? ofVariant(photos, variant.packagingPhotoId === null ? [] : [variant.packagingPhotoId], "embalaje", MAX_PACKAGING_REFS)
      : firstOf(photos, "embalaje", MAX_PACKAGING_REFS)),
  ];
}

/**
 * 1 = primer fotograma de la referencia (composición); después avatar (si hay), artículo (≤ 4),
 * embalaje (≤ 2), entorno puesto a mano (si hay) y, si no lo hay, las fotos de Pinterest (al final:
 * así no cambian los números que ya cita el prompt del desglose).
 */
export function imageManifest(video: Video, input: ManifestRefs | PhotoInfo[]): ManifestItem[] {
  const refs = refsOf(input);
  const environment = chosen(refs.photos, video.environmentPhotoId, "entorno");
  const all = [...productRefs(video, refs), ...environment];
  const items: ManifestItem[] = [
    { index: 1, tag: "image 1", source: { kind: "reference_frame" }, role: "composicion" },
    ...all.map((ref, i): ManifestItem => ({ index: i + 2, tag: `image ${i + 2}`, source: ref.source, role: ref.role })),
  ];
  // Con una referencia de entorno puesta a mano no va Pinterest (excepción del dueño).
  if (environment.length === 0) {
    for (const sha256 of refs.pinterest ?? []) {
      const index = items.length + 1;
      items.push({ index, tag: `image ${index}`, source: { kind: "pinterest", sha256 }, role: "pinterest" });
    }
  }
  return items;
}

/**
 * @Video1 = referencia; @Image1 = imagen aprobada; después avatar (si hay), artículo (≤ 4),
 * embalaje (≤ 2). El entorno no va aparte: ya está en la imagen aprobada. Si el primer fotograma
 * no cuenta al numerar (`startImageIsImage1 = false`, solo con `frameUse = "start_image"`), la
 * imagen aprobada va sin número y las fotos empiezan en `@Image1`.
 */
export function clipManifest(
  video: Video,
  input: ManifestRefs | PhotoInfo[],
  startImageIsImage1: boolean = START_IMAGE_IS_IMAGE1,
): ManifestItem[] {
  const refs = refsOf(input);
  const numbered = startImageIsImage1 || video.frameUse !== "start_image";
  const first = numbered ? 2 : 1;
  return [
    { index: 1, tag: "@Video1", source: { kind: "reference_video" }, role: "video_referencia" },
    numbered
      ? { index: 1, tag: "@Image1", source: { kind: "approved_frame" }, role: "imagen_aprobada" }
      : { index: 0, tag: START_IMAGE_TAG, source: { kind: "approved_frame" }, role: "imagen_aprobada" },
    ...productRefs(video, refs).map((ref, i): ManifestItem => ({ index: i + first, tag: `@Image${i + first}`, source: ref.source, role: ref.role })),
  ];
}
