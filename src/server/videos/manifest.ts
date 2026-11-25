import { isClipModel, resolveClipModel, SEEDANCE, type ClipModel } from "@/lib/clip-models";
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
/** Fotos del producto funcionando o de su efecto (`funcionamiento`), solo en la imagen inicial. */
export const MAX_WORKING_REFS = 2;

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
  /** Entorno elegido o subido a mano: manda sobre cualquier sugerencia de estilo. */
  ownerSelected?: boolean;
  source:
    | { kind: "reference_frame" }
    | { kind: "reference_video" }
    | { kind: "approved_frame" }
    | { kind: "environment_frame"; jobId: string }
    | { kind: "photo"; photoId: number }
    /** Un avatar de la biblioteca (`biblioteca`, o el que eligió el desglose con `automatico`). */
    | { kind: "avatar"; avatarId: number }
    /** Con `automatico`, el sitio del avatar que aún no está elegido (o no encontró ninguno). */
    | { kind: "avatar_pending" }
    /** Una foto de Pinterest guardada (por su huella), como referencia de entorno y realismo. */
    | { kind: "pinterest"; sha256: string }
    /** Una referencia subida a mano en la tarjeta o el vídeo (ropa u otra), por su huella. */
    | { kind: "manual"; sha256: string; refRole: string };
  role: "composicion" | "video_referencia" | "imagen_aprobada" | "pinterest" | "referencia" | PhotoRole;
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
  manualEnvironmentRefs?: string[];
  clipSetting?: boolean;
  /**
   * Con sala del banco: el producto no se ve en esta toma (aún envuelto, fuera de plano). Como en
   * el método aprobado, entonces no se adjuntan sus fotos ni su caja.
   */
  productHidden?: boolean;
  /** Con el método aprobado: la caja no se ve en esta toma (entonces no se adjunta). */
  packagingHidden?: boolean;
  /** El prompt con la sala está escrito con el método aprobado: entonces va su orden de adjuntos. */
  approvedMethod?: boolean;
  /** Referencias subidas a mano que van aparte de la sala y del realismo (ropa, otra), en orden. */
  manualExtras?: Array<{ sha256: string; role: string }>;
}

/** Solo fotos (sin variante ni avatar de la biblioteca) o todo. */
const refsOf = (refs: ManifestRefs | PhotoInfo[]): ManifestRefs => (Array.isArray(refs) ? { photos: refs, variant: null, avatar: null } : refs);

type Ref = { source: ManifestItem["source"]; role: ManifestItem["role"] };

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
  const bank = environment.length === 0 ? (refs.pinterest ?? []) : [];
  if (bank.length > 0 && refs.approvedMethod) return markOwner(codexOrder(video, refs, bank), refs);
  const working = firstOf(refs.photos, "funcionamiento", MAX_WORKING_REFS);
  const all = [...productRefs(video, refs), ...working, ...environment];
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
  return markOwner(items, refs);
}

/** Marca la procedencia manual sin cambiar la numeración del método aprobado. */
function markOwner(items: ManifestItem[], refs: ManifestRefs): ManifestItem[] {
  return items.map((item) => item.role === "entorno" ||
    (item.source.kind === "pinterest" && refs.manualEnvironmentRefs?.includes(item.source.sha256))
    ? { ...item, ownerSelected: true } : item);
}

/**
 * Con sala del banco, el orden del método aprobado del sistema anterior: 1 composición, después
 * el producto y su caja solo si se ven en la toma, la sala, el avatar y, al final, la foto de
 * realismo (la segunda del banco).
 */
function codexOrder(video: Video, refs: ManifestRefs, bank: string[]): ManifestItem[] {
  const product = refs.productHidden
    ? []
    : [
        ...(refs.variant ? ofVariant(refs.photos, refs.variant.articlePhotoIds, "articulo", MAX_ARTICLE_REFS) : firstOf(refs.photos, "articulo", MAX_ARTICLE_REFS)),
        ...firstOf(refs.photos, "funcionamiento", MAX_WORKING_REFS),
        ...(refs.packagingHidden
          ? []
          : refs.variant
            ? ofVariant(refs.photos, refs.variant.packagingPhotoId === null ? [] : [refs.variant.packagingPhotoId], "embalaje", MAX_PACKAGING_REFS)
            : firstOf(refs.photos, "embalaje", MAX_PACKAGING_REFS)),
      ];
  const pin = (sha256: string): Ref => ({ source: { kind: "pinterest", sha256 }, role: "pinterest" });
  const extras = (refs.manualExtras ?? []).map((ref): Ref => ({ source: { kind: "manual", sha256: ref.sha256, refRole: ref.role }, role: "referencia" }));
  const ordered: Ref[] = [...product, pin(bank[0]), ...avatarRefs(video, refs), ...extras, ...bank.slice(1).map(pin)];
  return [
    { index: 1, tag: "image 1", source: { kind: "reference_frame" }, role: "composicion" },
    ...ordered.map((ref, i): ManifestItem => ({ index: i + 2, tag: `image ${i + 2}`, source: ref.source, role: ref.role })),
  ];
}

/** Etiqueta del vídeo fuente en el manifiesto de Genjutsu y Wan (los prompts de Codex dicen «the source video»). */
export const SOURCE_VIDEO_TAG = "source video";

/** Etiqueta de la imagen N en Genjutsu y Wan, como en los prompts de Codex: `image [N]`. */
export const genjutsuImageTag = (index: number) => `image [${index}]`;

/** ¿Es un manifiesto de Genjutsu o Wan (vídeo fuente + `image [N]`)? */
export const isSourceVideoManifest = (manifest: ManifestItem[]) => manifest.some((item) => item.tag === SOURCE_VIDEO_TAG);

/**
 * @Video1 = referencia; @Image1 = imagen aprobada; después avatar (si hay), artículo (≤ 4),
 * embalaje (≤ 2). El entorno no va aparte: ya está en la imagen aprobada. Si el primer fotograma
 * no cuenta al numerar (`startImageIsImage1 = false`, solo con `frameUse = "start_image"`), la
 * imagen aprobada va sin número y las fotos empiezan en `@Image1`.
 *
 * Con Genjutsu o Wan 3.0 Prime (`model`; por defecto el que resuelve el vídeo) va el manifiesto
 * de Codex (`genjutsuClipManifest`).
 */
export function clipManifest(
  video: Video,
  input: ManifestRefs | PhotoInfo[],
  startImageIsImage1: boolean = START_IMAGE_IS_IMAGE1,
  model: ClipModel = resolveClipModel(video.clipModel, video.segmentDurationMs),
): ManifestItem[] {
  const refs = refsOf(input);
  if (model !== SEEDANCE && isClipModel(model)) return genjutsuClipManifest(video, refs, model);
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

/** Máximo de imágenes de referencia que admite cada modelo (catálogo de Higgsfield, 23/11/2026). */
export const MAX_IMAGE_REFS: Record<Exclude<ClipModel, typeof SEEDANCE>, number> = {
  hf_mult_motion_control: 49,
  hf_mult_replace_object: 30,
  wan3_0_prime: 10,
};

/**
 * Genjutsu y Wan 3.0 Prime, como los enviaba Codex (`genjutsu.parametros`): el vídeo fuente entero
 * y, como imágenes, `image [1]` = la imagen inicial aprobada (el frame de apertura es obligatorio,
 * orden del 29/09/2026), después avatar, artículo (≤ 4) y embalaje (≤ 2), que se adjuntan aunque
 * solo se vean más tarde (orden del 29/10/2026). En Object Swap y Wan, al final, el entorno nuevo:
 * la foto de entorno puesta a mano o, si no hay, la sala del banco de referencias (la misma que
 * llevó la imagen inicial); su papel lo añade la aplicación al prompt (`clipPromptFor`).
 */
function genjutsuClipManifest(video: Video, refs: ManifestRefs, model: Exclude<ClipModel, typeof SEEDANCE>): ManifestItem[] {
  const environment = chosen(refs.photos, video.environmentPhotoId, "entorno");
  const room: Ref[] =
    refs.clipSetting === false || (refs.clipSetting === undefined && model === "hf_mult_motion_control")
      ? []
      : environment.length > 0
        ? environment
        : (refs.pinterest ?? []).slice(0, refs.clipSetting ? undefined : 1).map((sha256): Ref => ({ source: { kind: "pinterest", sha256 }, role: "pinterest" }));
  const frame: Ref = { source: { kind: "approved_frame" }, role: "imagen_aprobada" };
  const images: Ref[] = [frame, ...productRefs(video, refs), ...room].slice(0, MAX_IMAGE_REFS[model]);
  return markOwner([
    { index: 1, tag: SOURCE_VIDEO_TAG, source: { kind: "reference_video" }, role: "video_referencia" },
    ...images.map((ref, i): ManifestItem => ({ index: i + 1, tag: genjutsuImageTag(i + 1), source: ref.source, role: ref.role })),
  ], refs);
}

/** ¿El prompt cita `image [N]` (también «image N» o «Image [N]»)? */
const cites = (prompt: string, index: number) => new RegExp(`(?<![\\p{L}\\p{N}_])image\\s*\\[?\\s*${index}\\s*\\]?(?!\\d)`, "iu").test(prompt);

/**
 * La frase de Codex (`genjutsu.prompt_estandar`) que explica una imagen adjunta: la apertura
 * aprobada, la identidad, el artículo, la caja o el entorno nuevo.
 */
function roleSentence(item: ManifestItem): string | null {
  const tag = item.tag;
  switch (item.role) {
    case "imagen_aprobada":
      return `Use ${tag} as the exact human-approved clean opening frame, preserving its hand placement, camera angle, lighting and scene.`;
    case "avatar":
      return `Replace the main person with the person in ${tag}, using that portrait only for identity; preserve the original action and camera framing.`;
    case "articulo":
      return `Replace every visible instance of the unboxed physical product with ${tag}, preserving realistic size relative to the hands and surroundings.`;
    case "embalaje":
      return `Replace every visible instance of the closed retail packaging with ${tag}, preserving realistic size relative to the hands and surroundings.`;
    case "entorno":
    case "pinterest":
      return `Replace every original location with the real environment in ${tag}. Preserve the SOURCE camera angle, subject scale and action, adapting this environment rather than copying its photographic framing.`;
    default:
      return null;
  }
}

/**
 * El prompt que se envía con Genjutsu y Wan: el del vídeo y, para cada imagen adjunta que no cita,
 * la frase de Codex con su papel (como `prompt_estandar`). Así toda imagen que se adjunta va
 * citada y explicada aunque el desglose se haya dejado una (p. ej. la caja) o aún no la conociera
 * (el entorno nuevo se elige después): un olvido del prompt nunca para el vídeo ni el lote. Con
 * Seedance, el prompt tal cual.
 */
export function clipPromptFor(prompt: string, manifest: ManifestItem[], setting = false): string {
  if (!isSourceVideoManifest(manifest)) return prompt;
  // Un desglose que citó al estilo de Seedance: misma numeración de imágenes (la aprobada es la 1).
  prompt = prompt.replace(/@\s*Video\s*1\b/gi, "the source video").replace(/@\s*Image\s*(\d+)/gi, "image [$1]");
  const missing = manifest
    .filter((item) => item.tag !== SOURCE_VIDEO_TAG && !cites(prompt, item.index))
    .map((item) => setting && item.role === "imagen_aprobada" ? `Use ${item.tag} only for the person, product, outfit and look.` : setting && (item.role === "entorno" || item.role === "pinterest") ? null : roleSentence(item))
    .filter((sentence): sentence is string => sentence !== null);
  // Regla fija (lote 6, 24/11/2026): la caja que se ve, también al abrirla, es la impresa de la
  // variante; Motion Transfer si no copia la caja lisa de la fuente.
  const box = manifest.find((item) => item.role === "embalaje");
  if (box) missing.push(`Every box that appears, including while it is being opened, is the exact printed retail box of ${box.tag}: its printed design is visible on all outer walls and flaps; never a plain unprinted carton.`);
  if (missing.length === 0) return prompt;
  // Antes del cierre de textos de Codex («No text overlays, no captions.»), si lo lleva.
  const text = prompt.trim();
  const closing = /\s*No text overlays, no captions\.?\s*$/i;
  const match = closing.exec(text);
  return match ? `${text.slice(0, match.index)} ${missing.join(" ")} ${match[0].trim()}` : `${text} ${missing.join(" ")}`;
}
