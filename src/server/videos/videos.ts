import { isClipModelChoice, resolveClipModel, SEEDANCE, sourceProblem, type ClipModel, type ClipModelChoice } from "@/lib/clip-models";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { linkStateOf, type LinkState } from "@/server/agent-tasks";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { MAX_SEGMENT_MS } from "@/server/media/ffmpeg";
import { avatarSummaries, isChoosableAvatar } from "@/server/avatars";
import { listProductPhotos, type PhotoRole } from "@/server/photos";
import { getProductFor } from "@/server/products";
import { songSummaries, type SongSummary } from "@/server/songs";
import type { Analysis, AnalysisQuestion } from "@/server/videos/analysis";
import { startingAvatar } from "@/lib/default-avatar";
import { linkOf } from "@/lib/links";
import { analysisStaleness, answersText, checkKindInput, cleanNote, isAvatarMode, type AvatarMode, type VideoKind } from "@/server/videos/brief";
import { bodiesOfVideo, checkVideoBodies, type VideoBody } from "@/server/videos/bodies";
import { analysisCostMicros, costsOfVideo, type VideoCosts } from "@/server/videos/costs";
import { clipManifest, imageManifest, type ManifestItem, type ManifestRefs, clipPromptFor } from "@/server/videos/manifest";
import { listReferences, referencesView } from "@/server/videos/referencias";
import { pinterestView, readyPinterest, withPinterestRoles, type PinterestView } from "@/server/videos/pinterest";
import { getVariantFor } from "@/server/variants";
import { checkImagePrompt, checkVideoPrompt, type PromptIssue } from "@/server/videos/prompt-check";
import { generationView, type GenerationView } from "@/server/videos/generations";
import type { EditView } from "@/server/videos/edits";
import type { AutoStatus } from "@/server/videos/autopilot";

/**
 * Vídeos de un producto. Toda función que recibe un `videoId` empieza por `getVideoFor`, que pasa
 * por `getProductFor`: un vídeo ajeno, inexistente o con un id mal formado da el mismo 404. Lo
 * ve quien ve su producto; lo continúa (y lo paga con su Higgsfield) solo quien lo creó.
 */

export type Video = typeof schema.videos.$inferSelect;

export const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;

/** Resoluciones del clip (Seedance 2.5). Aquí y no en `clip.ts` para no importar el clip desde aquí. */
export const CLIP_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type ClipResolution = (typeof CLIP_RESOLUTIONS)[number];
export const DEFAULT_CLIP_RESOLUTION: ClipResolution = "480p";
const BAD_RESOLUTION = "Resolución no disponible.";

/** Lo que admite Seedance 2.5: clips de 4 a 30 segundos enteros. */
const MIN_CLIP_SECONDS = 4;
const MAX_CLIP_SECONDS = 30;

/** Segundos del clip: los del tramo redondeados, entre 4 y 30 (lo que admite Seedance). */
export function clipDurationSeconds(segmentDurationMs: number): number {
  return Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, Math.round(segmentDurationMs / 1000)));
}

const BAD_CLIP_MODEL = "Modelo de vídeo no disponible.";

/** Una elección de modelo del clip válida (`auto` o un modelo), o 400. */
export function checkClipModel(value: unknown): ClipModelChoice {
  if (!isClipModelChoice(value)) throw new HttpError(400, BAD_CLIP_MODEL);
  return value;
}

/** Por qué el tramo de la referencia no sirve para el modelo del clip (la pregunta para el dueño), o `null`. */
export function clipModelProblem(video: Pick<Video, "clipModel" | "segmentDurationMs">): string | null {
  const model = resolveClipModel(video.clipModel, video.segmentDurationMs);
  return model === SEEDANCE || video.segmentDurationMs === null ? null : sourceProblem(model, video.segmentDurationMs);
}

export const isClipResolution = (value: unknown): value is ClipResolution =>
  typeof value === "string" && (CLIP_RESOLUTIONS as readonly string[]).includes(value);

const MAX_TITLE = 100;

const NOT_FOUND = "Vídeo no encontrado.";
/** La referencia se preparó con otro tramo (cambió el tipo o la duración del gancho): hay que subirla otra vez. */
export const REFERENCE_OUTDATED = "El gancho ha cambiado: vuelve a subir el vídeo de referencia.";

/**
 * El tramo de la referencia que usa un vídeo, en milisegundos: con «Solo gancho», los primeros
 * `hookSeconds` segundos; si no, hasta 30 s. Nunca más de lo que dura la referencia.
 */
export function segmentMsFor(video: Pick<Video, "kind" | "hookSeconds">, durationMs: number): number {
  return Math.min(durationMs, video.kind === "solo_gancho" ? video.hookSeconds * 1000 : MAX_SEGMENT_MS);
}

export interface HookTiming {
  /** Lo que dura el gancho, en milisegundos. */
  hookMs: number;
  /** Lo que dura el clip generado, en segundos. */
  clipSeconds: number;
}

/**
 * Los tiempos reales de un «Solo gancho» (`null` con otro tipo): el gancho dura lo que el tramo
 * de la referencia (o, si aún no hay referencia, `hookSeconds`) y el clip, ese tramo redondeado
 * con el mínimo de 4 s de Seedance.
 */
export function hookTiming(video: Pick<Video, "kind" | "hookSeconds" | "segmentDurationMs">): HookTiming | null {
  if (video.kind !== "solo_gancho") return null;
  const hookMs = Math.min(video.segmentDurationMs ?? Number.POSITIVE_INFINITY, video.hookSeconds * 1000);
  return { hookMs, clipSeconds: clipDurationSeconds(hookMs) };
}

/**
 * `true` si la referencia lista se preparó con un tramo que ya no es el del vídeo (se pasó a o
 * desde «Solo gancho», o cambió la duración del gancho, después de prepararla). El archivo
 * original no se guarda, así que no se puede recortar de nuevo: hay que volver a subirlo. Se
 * calcula, no se apunta: si se deshace el cambio, la referencia vuelve a valer.
 */
export function referenceOutdated(
  seen: Pick<Video, "kind" | "hookSeconds" | "referenceStatus" | "referenceDurationMs" | "segmentDurationMs">,
): boolean {
  // Un vídeo visto desde uno de sus sitios (`tramos.ts`) lleva la duración de ese sitio: se mira el de verdad.
  const video = (seen as { tramo?: { base: Video } }).tramo?.base ?? seen;
  if (video.referenceStatus !== "ready" || video.referenceDurationMs === null || video.segmentDurationMs === null) return false;
  return video.segmentDurationMs !== segmentMsFor(video, video.referenceDurationMs);
}
const NOT_OWNER = "Solo quien creó este vídeo puede continuarlo: se paga con su Higgsfield.";

/** Cerrojo de aviso por producto para numerar los vídeos («Vídeo N») sin repetir número. */
const titleLock = (productId: number) => sql`select pg_advisory_xact_lock(hashtextextended(${`principal.videos.title:${productId}`}, 0))`;

/** Lo que un lote fija al crear el vídeo (ya comprobado por `addVideoToBatch`). */
export interface NewVideoExtras {
  batchId?: number;
  note?: string | null;
  avatarPhotoId?: number | null;
  avatarLibraryId?: number | null;
  avatarMode?: AvatarMode;
  variantId?: number | null;
  kind?: VideoKind;
  adaptation?: string | null;
  hookSeconds?: number;
  bodyClipIds?: number[];
  /** Cómo se genera la réplica (ya comprobado con `checkClipModel`); sin él, «Automático». */
  clipModel?: ClipModelChoice;
  /** Ya comprobada (`checkSongChoice`), con su modo (`audioColumns`). */
  songId?: number | null;
  audioMode?: "cancion" | "original";
  /** Ya comprobada (`checkEditReferenceUrl`). */
  editReferenceUrl?: string | null;
}

const BAD_EDIT_REFERENCE = "La referencia de edición tiene que ser un enlace de Instagram, TikTok, YouTube o Facebook.";

/**
 * «Referencia de edición» tal como llega: `undefined` (no se toca), `null` o vacía (se quita) o un
 * enlace de los sitios admitidos (`linkOf`: https, como mucho 2.000 caracteres), que se guarda
 * normalizado. Cualquier otra cosa, 400. Solo se guarda: lo usará el montador.
 */
export function checkEditReferenceUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  const link = linkOf(value);
  if (link === null) throw new HttpError(400, BAD_EDIT_REFERENCE);
  return link;
}

/**
 * Crea un vídeo vacío en un producto visible, titulado «Vídeo N» (N = los que ya tiene + 1). Desde
 * un lote llega además su lote, su tipo, sus cambios específicos y quién sale, ya comprobados. Si
 * no se dice quién sale, empieza con el avatar habitual del producto (`startingAvatar`; sin fotos
 * de avatar, sin elegir). `inTransaction` se ejecuta con el vídeo recién creado dentro de la misma
 * transacción: si falla, el vídeo no llega a existir (lo usa crear un vídeo ya con su enlace).
 */
export async function createVideo(
  user: AuthUser,
  productId: number,
  extras: NewVideoExtras = {},
  inTransaction?: (tx: Tx, video: Video) => Promise<void>,
): Promise<Video> {
  const product = await getProductFor(user, productId);
  if (extras.avatarMode === undefined) {
    const avatars = (await listProductPhotos(user, product.id)).filter((photo) => photo.role === "avatar").map((photo) => photo.id);
    // Un vídeo suelto sin fotos de avatar en el producto empieza sin elegir: lo decide la persona.
    extras = { ...extras, ...startingAvatar(product, avatars, "elegir") };
  }
  return getDb().transaction(async (tx) => {
    const video = await insertVideo(tx, user, product.id, extras);
    await inTransaction?.(tx, video);
    return video;
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Inserta un vídeo «Vídeo N» dentro de una transacción (con el cerrojo de títulos del producto),
 * con las columnas que se le den. El producto ya está comprobado por quien llama. Lo usan
 * `createVideo` y duplicar un vídeo del lote, que hace más cosas en la misma transacción.
 */
export async function insertVideo(
  tx: Tx,
  user: AuthUser,
  productId: number,
  values: Partial<typeof schema.videos.$inferInsert> = {},
): Promise<Video> {
  await tx.execute(titleLock(productId));
  const [{ n }] = await tx.select({ n: count() }).from(schema.videos).where(eq(schema.videos.productId, productId));
  const [video] = await tx
    .insert(schema.videos)
    .values({ ...values, productId, createdBy: user.id, title: `Vídeo ${n + 1}` })
    .returning();
  return video;
}

/**
 * Vídeos de un producto visible, los más recientes primero; `mine` dice cuáles creó `user` y
 * `creatorName` es el nombre de quien lo creó (`null` si esa cuenta no existe, como el uso local
 * sin inicio de sesión).
 */
export async function listVideosFor(
  user: AuthUser,
  productId: number,
): Promise<
  Array<{
    id: number;
    title: string;
    createdBy: number;
    creatorName: string | null;
    referenceStatus: string;
    kind: string;
    hookSeconds: number;
    editStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
    mine: boolean;
  }>
> {
  const product = await getProductFor(user, productId);
  const rows = await getDb()
    .select({
      id: schema.videos.id,
      title: schema.videos.title,
      createdBy: schema.videos.createdBy,
      creatorName: schema.users.name,
      referenceStatus: schema.videos.referenceStatus,
      kind: schema.videos.kind,
      hookSeconds: schema.videos.hookSeconds,
      editStatus: schema.videos.editStatus,
      createdAt: schema.videos.createdAt,
      updatedAt: schema.videos.updatedAt,
    })
    .from(schema.videos)
    .leftJoin(schema.users, eq(schema.users.id, schema.videos.createdBy))
    .where(eq(schema.videos.productId, product.id))
    .orderBy(desc(schema.videos.createdAt), desc(schema.videos.id));
  return rows.map((row) => ({ ...row, mine: row.createdBy === user.id }));
}

/** Nombre de quien creó un vídeo, o `null` si esa cuenta no existe. */
async function creatorNameOf(video: Video): Promise<string | null> {
  const [row] = await getDb().select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, video.createdBy));
  return row?.name ?? null;
}

/** Un vídeo cuyo producto ve `user`. Si no existe, no es visible o el id no vale: 404 «Vídeo no encontrado.». */
export async function getVideoFor(user: AuthUser, videoId: number): Promise<Video> {
  if (!Number.isSafeInteger(videoId) || videoId <= 0) throw new HttpError(404, NOT_FOUND);
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video) throw new HttpError(404, NOT_FOUND);
  try {
    await getProductFor(user, video.productId);
  } catch (error) {
    // Mismo mensaje que si el vídeo no existiera.
    if (error instanceof HttpError && error.status === 404) throw new HttpError(404, NOT_FOUND);
    throw error;
  }
  return video;
}

/**
 * Las columnas `keys` del vídeo tal como estaban, para la instantánea de un constructor de
 * peticiones (`RequestBuilder.snapshot`): se vuelven a comparar al apuntar la generación.
 */
export function videoSnapshot<K extends keyof Video>(video: Video, keys: readonly K[]): Pick<Video, K> {
  return Object.fromEntries(keys.map((key) => [key, video[key]])) as Pick<Video, K>;
}

/** Solo quien creó el vídeo puede continuarlo (se paga con su Higgsfield): si no, 403. */
export function requireVideoOwner(user: AuthUser, video: Video): void {
  if (video.createdBy !== user.id) throw new HttpError(403, NOT_OWNER);
}

const ROLE_MESSAGE: Record<"avatar" | "entorno", string> = {
  avatar: "Elige una foto con papel «Avatar» de este producto.",
  entorno: "Elige una foto con papel «Entorno» de este producto.",
};

function checkPhoto(photos: Array<{ id: number; role: PhotoRole }>, photoId: number | null, role: "avatar" | "entorno"): number | null {
  if (photoId === null) return null;
  if (!photos.some((photo) => photo.id === photoId && photo.role === role)) throw new HttpError(400, ROLE_MESSAGE[role]);
  return photoId;
}

const BAD_LIBRARY_AVATAR = "Elige un avatar de la biblioteca.";
const BAD_VARIANT = "Elige una variante de este producto.";
const isIdValue = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Quién sale, tal como llega (`avatarMode`, `avatarPhotoId`, `avatarLibraryId`), en columnas: una
 * foto del producto pasa a `elegido` y un avatar de la biblioteca (no retirado) a `biblioteca`; los
 * demás modos quitan la foto y el avatar. Pedir una foto o un avatar con otro modo, o los dos a la
 * vez, es un 400. Lo que no viene no se toca.
 */
export async function checkAvatarInput(
  user: AuthUser,
  productId: number,
  input: { avatarMode?: unknown; avatarPhotoId?: number | null; avatarLibraryId?: unknown },
): Promise<{ avatarMode?: AvatarMode; avatarPhotoId?: number | null; avatarLibraryId?: number | null }> {
  const changes: { avatarMode?: AvatarMode; avatarPhotoId?: number | null; avatarLibraryId?: number | null } = {};
  if (input.avatarMode !== undefined && !isAvatarMode(input.avatarMode)) throw new HttpError(400, "Valor no válido.");
  const mode = input.avatarMode as AvatarMode | undefined;
  const photo = typeof input.avatarPhotoId === "number";
  const library = input.avatarLibraryId !== undefined && input.avatarLibraryId !== null;
  if (library && !isIdValue(input.avatarLibraryId)) throw new HttpError(400, BAD_LIBRARY_AVATAR);
  if (photo && library) throw new HttpError(400, "Elige una foto o un avatar de la biblioteca, no los dos.");
  if (photo && mode !== undefined && mode !== "elegido") throw new HttpError(400, "Con «Sin sustitución» o «No aparece nadie» no se elige avatar.");
  if (library && mode !== undefined && mode !== "biblioteca") throw new HttpError(400, "Con ese modo no se elige un avatar de la biblioteca.");

  if (input.avatarPhotoId !== undefined) changes.avatarPhotoId = checkPhoto(await listProductPhotos(user, productId), input.avatarPhotoId, "avatar");
  if (library) {
    if (!(await isChoosableAvatar(input.avatarLibraryId as number))) throw new HttpError(400, BAD_LIBRARY_AVATAR);
    changes.avatarLibraryId = input.avatarLibraryId as number;
  } else if (input.avatarLibraryId === null) {
    changes.avatarLibraryId = null;
  }
  if (mode !== undefined) changes.avatarMode = mode;
  if (typeof changes.avatarPhotoId === "number") changes.avatarMode = "elegido";
  if (typeof changes.avatarLibraryId === "number") changes.avatarMode = "biblioteca";
  if (changes.avatarMode !== undefined && changes.avatarMode !== "elegido") changes.avatarPhotoId = null;
  if (changes.avatarMode !== undefined && changes.avatarMode !== "biblioteca") changes.avatarLibraryId = null;
  return changes;
}

/** `variantId` tal como llega: `undefined` (no se toca), `null` (las fotos de siempre) o una variante de este producto (400 si no). */
export async function checkVariantChoice(user: AuthUser, productId: number, value: unknown): Promise<number | null> {
  if (value === null) return null;
  if (!isIdValue(value)) throw new HttpError(400, BAD_VARIANT);
  try {
    return (await getVariantFor(user, productId, value)).id;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404 && error.message !== "Producto no encontrado.") throw new HttpError(400, BAD_VARIANT);
    throw error;
  }
}

/** Lo que se puede cambiar de un vídeo con `updateVideoChoices` (sin comprobar aún). */
/** Una imagen por vídeo salvo que el dueño pida más (regla fija, 23/11/2026). */
export const DEFAULT_FRAME_COUNT = 1;
export const MAX_FRAME_COUNT = 4;
export const isFrameCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_FRAME_COUNT;
const BAD_FRAME_COUNT = `Elige entre 1 y ${MAX_FRAME_COUNT} imágenes.`;

export interface VideoChoicesInput {
  title?: string;
  avatarPhotoId?: number | null;
  /** Un avatar de la biblioteca (pasa a `biblioteca`) o `null`. */
  avatarLibraryId?: unknown;
  environmentPhotoId?: number | null;
  avatarMode?: unknown;
  /** Una variante de este producto o `null` (las fotos de siempre). */
  variantId?: unknown;
  clipResolution?: string;
  /** Cómo se genera la réplica: `auto` o un modelo (`CLIP_MODEL_CHOICES`). */
  clipModel?: unknown;
  kind?: unknown;
  adaptation?: unknown;
  hookSeconds?: unknown;
  /** Lista ordenada de cuerpos (`product_bodies.id`) de este producto. */
  bodyClipIds?: unknown;
  note?: unknown;
  /** «Referencia de edición»: un enlace admitido, o `null` / vacío para quitarla. */
  editReferenceUrl?: unknown;
  /** Imágenes por ronda (1–4), o `null` para la del lote (o 1). */
  frameCount?: unknown;
  /** «Traducir el diálogo al alemán»: `true`/`false`, o `null` para lo del lote. */
  dubDialogue?: unknown;
}

/**
 * Cambia título, avatar, entorno, quién sale (`avatarMode`), la resolución del clip, el tipo, la
 * adaptación o los cambios específicos; lo que no se envía se queda igual. Solo quien creó el
 * vídeo. El avatar y el entorno tienen que ser fotos de ese producto con ese papel; la resolución,
 * una de `CLIP_RESOLUTIONS`; el tipo y quién sale, de sus listas (400 si no).
 * «Sin sustitución» y «nadie» quitan el avatar y elegir un avatar pasa a `elegido`; pedir un avatar
 * con otro modo es un 400. La adaptación solo se escribe con «Adaptación de concepto». La
 * duración del gancho va de 2 a 8 s y los cuerpos tienen que ser de este producto. Cambiar el tipo
 * a o desde «Solo gancho», o la duración del gancho, con la referencia ya lista no la borra, pero
 * deja de valer hasta que se vuelva a subir (`referenceOutdated`).
 */
export async function updateVideoChoices(user: AuthUser, videoId: number, input: VideoChoicesInput): Promise<Video> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const changes: Partial<typeof schema.videos.$inferInsert> = {};

  if (input.clipResolution !== undefined) {
    if (!isClipResolution(input.clipResolution)) throw new HttpError(400, BAD_RESOLUTION);
    changes.clipResolution = input.clipResolution;
  }
  // El modelo del clip llega al desglose: el prompt del clip se escribe para él.
  if (input.clipModel !== undefined) changes.clipModel = checkClipModel(input.clipModel);

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new HttpError(400, "Escribe el título del vídeo.");
    if (title.length > MAX_TITLE) throw new HttpError(400, `El título no puede tener más de ${MAX_TITLE} caracteres.`);
    changes.title = title;
  }

  Object.assign(changes, checkKindInput(input, video));
  if (input.note !== undefined) changes.note = cleanNote(input.note);
  if (input.bodyClipIds !== undefined) changes.bodyClipIds = await checkVideoBodies(video.productId, input.bodyClipIds);

  Object.assign(changes, await checkAvatarInput(user, video.productId, input));
  if (input.environmentPhotoId !== undefined) {
    changes.environmentPhotoId = checkPhoto(await listProductPhotos(user, video.productId), input.environmentPhotoId, "entorno");
  }
  if (input.variantId !== undefined) changes.variantId = await checkVariantChoice(user, video.productId, input.variantId);
  // La referencia de edición no llega al desglose: cambiarla sola no despierta el desglose automático.
  const briefChanged = Object.keys(changes).length > 0;
  const editReferenceUrl = checkEditReferenceUrl(input.editReferenceUrl);
  if (editReferenceUrl !== undefined) changes.editReferenceUrl = editReferenceUrl;
  // Cuántas imágenes: tampoco llega al desglose.
  if (input.frameCount !== undefined) {
    if (input.frameCount !== null && !isFrameCount(input.frameCount)) throw new HttpError(400, BAD_FRAME_COUNT);
    changes.frameCount = input.frameCount;
  }
  // Traducir el diálogo: solo cambia el montaje.
  if (input.dubDialogue !== undefined) {
    if (input.dubDialogue !== null && typeof input.dubDialogue !== "boolean") throw new HttpError(400, "Elige si se traduce el diálogo.");
    changes.dubDialogue = input.dubDialogue;
  }

  if (Object.keys(changes).length === 0) return video;
  const [updated] = await getDb()
    .update(schema.videos)
    // Un duplicado que esperaba a que lo cambiaran ya puede tener su desglose automático.
    // Un cambio de quien lo creó responde a la pregunta con la que se paró el flujo automático: sigue solo.
    .set({ ...changes, ...(briefChanged ? { skipAutoAnalysis: false } : {}), autoStop: null, updatedAt: new Date() })
    .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)))
    .returning();
  if (!updated) throw new HttpError(404, NOT_FOUND);
  return updated;
}

const SONG_NOT_FOUND = "Canción no encontrada.";

/**
 * `songId` tal como llega: `undefined` (no se toca), `null` («Audio original») o el id de una
 * canción que existe (400 si no es un id; 404 si la canción no existe).
 */
export async function checkSongChoice(value: unknown): Promise<number | null | undefined> {
  if (value === undefined || value === null) return value;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new HttpError(400, "Canción no válida.");
  if (!(await songSummaries([value as number])).has(value as number)) throw new HttpError(404, SONG_NOT_FOUND);
  return value as number;
}

/** Las columnas de audio para una elección: la canción elegida manda (`cancion`); sin canción, `original`. */
export function audioColumns(songId: number | null): { songId: number | null; audioMode: "cancion" | "original" } {
  return { songId, audioMode: songId === null ? "original" : "cancion" };
}

const isForeignKeyError = (error: unknown) =>
  (error as { code?: string }).code === "23503" || (error as { cause?: { code?: string } }).cause?.code === "23503";

/**
 * Quién elige la «Música» de un vídeo: quien lo creó y el dueño (en cualquier vídeo que ve: la
 * música la decide él). No gasta nada, así que no hace falta ser quien paga.
 */
export const canChooseSong = (user: AuthUser, video: Pick<Video, "createdBy">) => video.createdBy === user.id || user.role === "dueno";

/**
 * «Música» del vídeo: una canción de la biblioteca o `null` («Audio original»). Es para el montaje:
 * no cambia el desglose ni la generación, así que no deja nada por repetir. Quien creó el vídeo o
 * el dueño (`canChooseSong`).
 */
export async function setVideoSong(user: AuthUser, videoId: number, songId: unknown): Promise<Video> {
  const video = await getVideoFor(user, videoId);
  if (!canChooseSong(user, video)) throw new HttpError(403, "Solo quien creó este vídeo o el dueño pueden elegir su música.");
  const chosen = await checkSongChoice(songId);
  if (chosen === undefined) return video;
  try {
    const [updated] = await getDb()
      .update(schema.videos)
      .set(audioColumns(chosen))
      .where(eq(schema.videos.id, video.id))
      .returning();
    if (!updated) throw new HttpError(404, NOT_FOUND);
    return updated;
  } catch (error) {
    // La canción se borró justo entre la comprobación y el guardado.
    if (isForeignKeyError(error)) throw new HttpError(404, SONG_NOT_FOUND);
    throw error;
  }
}

/** Un fotograma de la referencia (JPEG), para quien ve el vídeo. */
export async function readVideoFrame(user: AuthUser, videoId: number, index: number): Promise<{ mime: string; data: Buffer }> {
  const video = await getVideoFor(user, videoId);
  const missing = new HttpError(404, "Fotograma no encontrado.");
  if (!Number.isSafeInteger(index) || index < 0) throw missing;
  const [frame] = await getDb()
    .select({ mime: schema.videoFrames.mime, data: schema.videoFrames.data })
    .from(schema.videoFrames)
    .where(and(eq(schema.videoFrames.videoId, video.id), eq(schema.videoFrames.index, index)));
  if (!frame) throw missing;
  return { mime: frame.mime, data: Buffer.from(frame.data) };
}

export interface VideoView {
  video: Video;
  /** Qué está haciendo el flujo automático (`autopilot.ts`): sin botones de «¿generar?». */
  auto: AutoStatus;
  /** Imágenes que pide cada ronda (la de la tarjeta, la del lote o 1). */
  frameCount: number;
  /** «Traducir el diálogo al alemán» para el montaje (lo de la tarjeta o, si no dice nada, lo del lote). */
  dubDialogue: boolean;
  /** «Indicaciones» del lote para el producto de este vídeo (llegan al desglose), o `null`. */
  productNotes: string | null;
  mine: boolean;
  /** Nombre de quien lo creó (para el aviso de solo lectura); `null` si esa cuenta no existe. */
  creatorName: string | null;
  frames: Array<{ index: number; timeMs: number }>;
  /** La referencia está lista pero se preparó con otro tramo: hay que volver a subirla (`referenceOutdated`). */
  referenceOutdated: boolean;
  /** Los cuerpos que van detrás del gancho, en orden (solo cuentan con «Solo gancho»). */
  bodies: VideoBody[];
  /** La canción elegida para el montaje (con `video.audioMode = "cancion"`), o `null`: audio original. */
  song: SongSummary | null;
  /** Quien mira puede cambiar la música (`canChooseSong`). */
  songEditable: boolean;
  /**
   * Con «Solo gancho»: lo que dura de verdad el gancho (el tramo: como mucho `hookSeconds`, menos
   * si la referencia es más corta) y lo que dura el clip que se genera (4 s como poco). Si el clip
   * es más largo, lo que sobra se recorta al montar. `null` con los otros tipos.
   */
  hook: HookTiming | null;
  /** El modelo con el que sale el clip (`video.clipModel` resuelto: «Automático» = Motion Transfer). */
  clipModel: ClipModel;
  /** Por qué el tramo no sirve para ese modelo (una pregunta), o `null`. */
  clipModelProblem: string | null;
  /**
   * El enlace pegado que el Mac está trayendo (`queued`, `downloading`) o el último que falló
   * (`failed`, con su motivo), o `null`. Mientras tanto la referencia que hubiera sigue valiendo.
   */
  link: LinkState | null;
  /** El último desglose (el de versión más alta), o `null` si aún no se ha pedido ninguno. */
  analysis: {
    id: number;
    version: number;
    status: string;
    error: string | null;
    result: Analysis | null;
    /** Lo que costó en Claude (todos sus intentos), en micro-dólares; `null` si no consta ningún cargo. */
    costMicros: number | null;
    /** La referencia de la que salió (recorte subido a Higgsfield). */
    referenceMediaId: string | null;
    /** Quién salía cuando se hizo. */
    avatarMode: string;
    /** Con «Automático» y hecho: el avatar que eligió («Automático → mujer 7»), o `null` si ninguno encajaba. */
    autoAvatar: { id: number; name: string } | null;
    /** Lo que hay que preguntar antes de generar (avatar sin encontrar, variante dudosa). */
    questions: AnalysisQuestion[];
    /** `true` si el desglose ya no corresponde al vídeo (otra referencia u otras indicaciones). */
    stale: boolean;
    /** Por qué no corresponde: otra referencia (`reference`) u otras indicaciones (`brief`). */
    staleReason: "reference" | "brief" | null;
  } | null;
  /** El avatar de la biblioteca elegido (con `biblioteca`), con su nombre. */
  libraryAvatar: { id: number; name: string } | null;
  imageIssues: PromptIssue[];
  videoIssues: PromptIssue[];
  imageManifest: ManifestItem[];
  clipManifest: ManifestItem[];
  /** «Referencias de Pinterest» de la imagen inicial (`null`: aún sin desglose, o con entorno puesto a mano). */
  pinterest: PinterestView | null;
  /** Las imágenes de referencia subidas a mano, con su papel y su enlace. */
  references: Array<{ sha256: string; role: string; url: string }>;
  /** La imagen inicial: ronda, regeneraciones que quedan, resultado aprobado y la generación más reciente. */
  frame: GenerationView;
  /** Las aperturas de los sitios extra de la referencia (regla del 24/11/2026, `tramos.ts`); vacío con uno solo. */
  places?: import("@/server/videos/tramos").PlaceFrameView[];
  /** El clip, igual que `frame`. */
  clip: GenerationView;
  /** Lo que lleva costado el vídeo: créditos de Higgsfield enviados y Claude de todos sus desgloses. */
  costs: VideoCosts;
  /** El montaje en el Mac (`edits.ts`). */
  edit: EditView;
  /** Los rótulos del montaje (guardados o los que llevaría) y si quien mira los puede cambiar. */
  editTexts: { main: string; cta: string; editable: boolean };
}

/** «Automático» sin avatar elegido (ningún avatar encajaba): hay que elegir uno antes de generar. */
export const NO_AUTO_AVATAR = "Ningún avatar encaja: elige uno antes de generar.";

/** Mensaje cuando el desglose es de otras indicaciones (tipo, adaptación, cambios o quién sale). */
export const BRIEF_CHANGED = "Las indicaciones del vídeo cambiaron; repite el desglose.";

/**
 * El último desglose terminado del vídeo y, si ya no corresponde, por qué (`reference` o `brief`);
 * `null` si no hay ninguno. La imagen y el clip solo se piden con uno que corresponda. Con
 * «Automático», `autoAvatarId` es el avatar que eligió (o `null` si no encontró ninguno).
 */
export async function latestDoneAnalysis(
  seen: Video,
): Promise<{ id: number; staleReason: "reference" | "brief" | null; avatarMode: string; autoAvatarId: number | null } | null> {
  // Un vídeo visto desde uno de sus sitios (`tramos.ts`): el desglose es el del vídeo de verdad.
  const video = (seen as { tramo?: { base: Video } }).tramo?.base ?? seen;
  const [done] = await getDb()
    .select()
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, video.id), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  return done
    ? { id: done.id, staleReason: analysisStaleness(done, await withProductNotes(video)), avatarMode: done.avatarMode, autoAvatarId: done.autoAvatarId }
    : null;
}

/**
 * Lo que necesitan los manifiestos del vídeo (`ManifestRefs`): las fotos del producto, las fotos
 * de su variante y el avatar de la biblioteca. Con «Automático», el que eligió el último desglose
 * hecho si sigue valiendo; si no (o durante el propio desglose, `forAnalysis`), su sitio vacío. Y
 * las fotos de Pinterest listas del último desglose hecho (`pinterest.ts`).
 */
export async function manifestRefsFor(user: AuthUser, video: Video, options: { forAnalysis?: boolean } = {}): Promise<ManifestRefs> {
  const photos = await listProductPhotos(user, video.productId);
  let variant: ManifestRefs["variant"] = null;
  if (video.variantId !== null) {
    try {
      const found = await getVariantFor(user, video.productId, video.variantId);
      variant = { articlePhotoIds: found.articlePhotoIds, packagingPhotoId: found.packagingPhotoId };
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
  }
  let avatar: ManifestRefs["avatar"] = null;
  if (video.avatarMode === "biblioteca" && video.avatarLibraryId !== null) avatar = { kind: "library", avatarId: video.avatarLibraryId };
  if (video.avatarMode === "automatico") {
    avatar = { kind: "pending" };
    if (!options.forAnalysis) {
      const done = await latestDoneAnalysis(video);
      if (done && done.staleReason === null && done.autoAvatarId !== null) avatar = { kind: "library", avatarId: done.autoAvatarId };
    }
  }
  // Las fotos de Pinterest del último desglose (no en el propio desglose: aún no existen).
  const ready = options.forAnalysis
    ? { refs: [], productHidden: false, packagingHidden: false, approvedMethod: false }
    : await readyPinterest(video.id, (video as Video & { tramo?: { index: number } }).tramo?.index ?? 0);
  return {
    photos,
    variant,
    avatar,
    pinterest: ready.refs,
    productHidden: ready.productHidden,
    packagingHidden: ready.packagingHidden,
    approvedMethod: ready.approvedMethod,
    // Las subidas a mano que no son sala ni realismo (ropa, otra): solo con el prompt del método aprobado, que las cita.
    manualExtras: ready.approvedMethod ? (await listReferences(video.id)).filter((ref) => ref.role === "ropa" || ref.role === "otro") : [],
  };
}

/** Las «Indicaciones» del lote del vídeo para su producto, o `null` (sin lote o sin indicaciones). */
export async function productNotesOf(video: Pick<Video, "batchId" | "productId">): Promise<string | null> {
  if (video.batchId === null) return null;
  const [row] = await getDb()
    .select({ notes: schema.batchProducts.notes })
    .from(schema.batchProducts)
    .where(and(eq(schema.batchProducts.batchId, video.batchId), eq(schema.batchProducts.productId, video.productId)));
  return row?.notes ?? null;
}

/**
 * La «Edición de referencia» que vale para el vídeo: la suya o, si no tiene, la del producto en su
 * lote (`batch_products.edit_reference_url`). `null` si no hay ninguna. La usa el paso de edición.
 */
export async function effectiveEditReferenceUrl(video: Pick<Video, "batchId" | "productId" | "editReferenceUrl">): Promise<string | null> {
  if (video.editReferenceUrl !== null || video.batchId === null) return video.editReferenceUrl;
  const [row] = await getDb()
    .select({ url: schema.batchProducts.editReferenceUrl })
    .from(schema.batchProducts)
    .where(and(eq(schema.batchProducts.batchId, video.batchId), eq(schema.batchProducts.productId, video.productId)));
  return row?.url ?? null;
}

/**
 * El vídeo con las indicaciones de su lote y las respuestas del dueño a las preguntas del lote: lo
 * que cuenta para el desglose (`briefOf`).
 */
export async function withProductNotes(video: Video): Promise<Video & { productNotes: string | null; answers: string | null }> {
  return { ...video, productNotes: await productNotesOf(video), answers: answersText(video.ownerAnswers) };
}

/** `stale` y su motivo, para la vista del vídeo y el tablero del lote. */
export function staleness(analysis: Parameters<typeof analysisStaleness>[0], video: Video & { productNotes: string | null }) {
  const staleReason = analysisStaleness(analysis, { ...video, answers: answersText(video.ownerAnswers) });
  return { stale: staleReason !== null, staleReason };
}

/** Avisos de los prompts guardados del vídeo frente a sus manifiestos; un prompt que aún no existe no da avisos. */
export function promptIssues(video: Video, refs: ManifestRefs): { imageIssues: PromptIssue[]; videoIssues: PromptIssue[] } {
  return {
    // El papel de las fotos de Pinterest se añade al pedir la imagen (`withPinterestRoles`): se comprueba igual.
    imageIssues: video.imagePrompt === null ? [] : checkImagePrompt(withPinterestRoles(video.imagePrompt, imageManifest(video, refs)), imageManifest(video, refs)),
    // Con Genjutsu y Wan, las imágenes que el prompt no cita las explica la aplicación al pedir el clip (`clipPromptFor`).
    videoIssues: video.videoPrompt === null ? [] : checkVideoPrompt(clipPromptFor(video.videoPrompt, clipManifest(video, refs)), clipManifest(video, refs)),
  };
}

/**
 * El vídeo con la lista de sus fotogramas (sin el contenido), si es de `user`, su último desglose,
 * los manifiestos de referencias y los avisos de sus prompts.
 */
export async function videoView(user: AuthUser, videoId: number): Promise<VideoView> {
  const video = await getVideoFor(user, videoId);
  const db = getDb();
  const frames = await db
    .select({ index: schema.videoFrames.index, timeMs: schema.videoFrames.timeMs })
    .from(schema.videoFrames)
    .where(eq(schema.videoFrames.videoId, video.id))
    .orderBy(asc(schema.videoFrames.index));
  const [latest] = await db
    .select()
    .from(schema.videoAnalyses)
    .where(eq(schema.videoAnalyses.videoId, video.id))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  const refs = await manifestRefsFor(user, video);
  const productNotes = await productNotesOf(video);
  const avatarNames = await avatarSummaries([video.avatarLibraryId, latest?.autoAvatarId ?? null]);
  const named = (id: number | null) => {
    const found = id === null ? undefined : avatarNames.get(id);
    return found ? { id: found.id, name: found.name } : null;
  };
  return {
    video,
    productNotes,
    mine: video.createdBy === user.id,
    creatorName: await creatorNameOf(video),
    frames,
    referenceOutdated: referenceOutdated(video),
    bodies: await bodiesOfVideo(video),
    song: (await songSummaries([video.songId])).get(video.songId ?? 0) ?? null,
    songEditable: canChooseSong(user, video),
    hook: hookTiming(video),
    clipModel: resolveClipModel(video.clipModel, video.segmentDurationMs),
    clipModelProblem: clipModelProblem(video),
    link: await linkStateOf(video.linkTaskId),
    analysis: latest
      ? {
          id: latest.id,
          version: latest.version,
          status: latest.status,
          error: latest.error,
          result: (latest.result as Analysis | null) ?? null,
          costMicros: await analysisCostMicros(video, latest),
          referenceMediaId: latest.referenceMediaId,
          avatarMode: latest.avatarMode,
          autoAvatar: latest.avatarMode === "automatico" && latest.status === "done" ? named(latest.autoAvatarId) : null,
          questions: ((latest.result as Analysis | null)?.questions ?? []) as AnalysisQuestion[],
          ...staleness(latest, { ...video, productNotes }),
        }
      : null,
    libraryAvatar: named(video.avatarLibraryId),
    ...promptIssues(video, refs),
    imageManifest: imageManifest(video, refs),
    clipManifest: clipManifest(video, refs),
    pinterest: video.environmentPhotoId === null ? await pinterestView(video.id) : null,
    references: await referencesView(video.id),
    frame: await generationView(video, "frame", user.id),
    places: await (await import("@/server/videos/tramos")).placeFrameViews(video, user.id),
    clip: await generationView(video, "clip", user.id),
    costs: await costsOfVideo(video),
    ...(await editParts(user, video)),
    ...(await autoParts(user, video)),
  };
}

/** El estado del flujo automático y cuántas imágenes por ronda. Se cargan al pedirlo (importan este módulo). */
async function autoParts(user: AuthUser, video: Video): Promise<Pick<VideoView, "auto" | "frameCount" | "dubDialogue">> {
  const { autoStatusOf } = await import("@/server/videos/autopilot");
  const { frameCountOf } = await import("@/server/videos/frame");
  const { dubDialogueOf } = await import("@/server/videos/doblaje");
  return { auto: await autoStatusOf(user, video), frameCount: await frameCountOf(video), dubDialogue: await dubDialogueOf(video) };
}

/** El montaje del vídeo y sus rótulos. `edits.ts` importa este módulo: se carga al pedirlo, sin ciclo al arrancar. */
async function editParts(user: AuthUser, video: Video): Promise<Pick<VideoView, "edit" | "editTexts">> {
  const { editViews, editTextsView } = await import("@/server/videos/edits");
  const { downloadableClipUrl } = await import("@/server/videos/clip");
  const clipReady = (await downloadableClipUrl(video)) !== null;
  return { edit: (await editViews(user, [{ ...video, clipReady }])).get(video.id)!, editTexts: await editTextsView(user, video) };
}
