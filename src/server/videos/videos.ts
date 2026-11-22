import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { listProductPhotos, type PhotoInfo, type PhotoRole } from "@/server/photos";
import { getProductFor } from "@/server/products";
import type { Analysis } from "@/server/videos/analysis";
import { analysisCostMicros, costsOfVideo, type VideoCosts } from "@/server/videos/costs";
import { clipManifest, imageManifest, type ManifestItem } from "@/server/videos/manifest";
import { checkImagePrompt, checkVideoPrompt, type PromptIssue } from "@/server/videos/prompt-check";
import { generationView, type GenerationView } from "@/server/videos/generations";

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

export const isClipResolution = (value: unknown): value is ClipResolution =>
  typeof value === "string" && (CLIP_RESOLUTIONS as readonly string[]).includes(value);

const MAX_TITLE = 100;

const NOT_FOUND = "Vídeo no encontrado.";
const NOT_OWNER = "Solo quien creó este vídeo puede continuarlo: se paga con su Higgsfield.";

/** Cerrojo de aviso por producto para numerar los vídeos («Vídeo N») sin repetir número. */
const titleLock = (productId: number) => sql`select pg_advisory_xact_lock(hashtextextended(${`principal.videos.title:${productId}`}, 0))`;

/** Lo que un lote fija al crear el vídeo (ya comprobado por `addVideoToBatch`). */
export interface NewVideoExtras {
  batchId?: number;
  note?: string | null;
  avatarPhotoId?: number | null;
  noPerson?: boolean;
}

/**
 * Crea un vídeo vacío en un producto visible, titulado «Vídeo N» (N = los que ya tiene + 1). Desde
 * un lote llega además su lote, su indicación y su avatar (o «sin persona»), ya comprobados.
 */
export async function createVideo(user: AuthUser, productId: number, extras: NewVideoExtras = {}): Promise<Video> {
  const product = await getProductFor(user, productId);
  return getDb().transaction(async (tx) => {
    await tx.execute(titleLock(product.id));
    const [{ n }] = await tx.select({ n: count() }).from(schema.videos).where(eq(schema.videos.productId, product.id));
    const [video] = await tx
      .insert(schema.videos)
      .values({ productId: product.id, createdBy: user.id, title: `Vídeo ${n + 1}`, ...extras })
      .returning();
    return video;
  });
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
  Array<{ id: number; title: string; createdBy: number; creatorName: string | null; referenceStatus: string; createdAt: Date; mine: boolean }>
> {
  const product = await getProductFor(user, productId);
  const rows = await getDb()
    .select({
      id: schema.videos.id,
      title: schema.videos.title,
      createdBy: schema.videos.createdBy,
      creatorName: schema.users.name,
      referenceStatus: schema.videos.referenceStatus,
      createdAt: schema.videos.createdAt,
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

/**
 * Cambia título, avatar, entorno, «sin persona» o la resolución del clip; lo que no se envía se
 * queda igual. Solo quien creó el vídeo. El avatar y el entorno tienen que ser fotos de ese
 * producto con ese papel; la resolución, una de `CLIP_RESOLUTIONS`.
 * «Sin persona» quita el avatar y elegir un avatar quita «sin persona»; pedir las dos cosas a la
 * vez es un 400.
 */
export async function updateVideoChoices(
  user: AuthUser,
  videoId: number,
  input: { title?: string; avatarPhotoId?: number | null; environmentPhotoId?: number | null; noPerson?: boolean; clipResolution?: string },
): Promise<Video> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const changes: Partial<typeof schema.videos.$inferInsert> = {};

  if (input.clipResolution !== undefined) {
    if (!isClipResolution(input.clipResolution)) throw new HttpError(400, BAD_RESOLUTION);
    changes.clipResolution = input.clipResolution;
  }

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new HttpError(400, "Escribe el título del vídeo.");
    if (title.length > MAX_TITLE) throw new HttpError(400, `El título no puede tener más de ${MAX_TITLE} caracteres.`);
    changes.title = title;
  }

  if (input.noPerson === true && typeof input.avatarPhotoId === "number") {
    throw new HttpError(400, "Con «Sin persona» no se elige avatar.");
  }
  if (input.avatarPhotoId !== undefined || input.environmentPhotoId !== undefined) {
    const photos = await listProductPhotos(user, video.productId);
    if (input.avatarPhotoId !== undefined) changes.avatarPhotoId = checkPhoto(photos, input.avatarPhotoId, "avatar");
    if (input.environmentPhotoId !== undefined) {
      changes.environmentPhotoId = checkPhoto(photos, input.environmentPhotoId, "entorno");
    }
  }
  if (input.noPerson !== undefined) changes.noPerson = input.noPerson;
  if (changes.noPerson === true) changes.avatarPhotoId = null;
  if (typeof changes.avatarPhotoId === "number") changes.noPerson = false;

  if (Object.keys(changes).length === 0) return video;
  const [updated] = await getDb()
    .update(schema.videos)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)))
    .returning();
  if (!updated) throw new HttpError(404, NOT_FOUND);
  return updated;
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
  mine: boolean;
  /** Nombre de quien lo creó (para el aviso de solo lectura); `null` si esa cuenta no existe. */
  creatorName: string | null;
  frames: Array<{ index: number; timeMs: number }>;
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
    /** `true` si el vídeo ya tiene otra referencia: el desglose no corresponde a la actual. */
    stale: boolean;
  } | null;
  imageIssues: PromptIssue[];
  videoIssues: PromptIssue[];
  imageManifest: ManifestItem[];
  clipManifest: ManifestItem[];
  /** La imagen inicial: ronda, regeneraciones que quedan, resultado aprobado y la generación más reciente. */
  frame: GenerationView;
  /** El clip, igual que `frame`. */
  clip: GenerationView;
  /** Lo que lleva costado el vídeo: créditos de Higgsfield enviados y Claude de todos sus desgloses. */
  costs: VideoCosts;
}

/** Avisos de los prompts guardados del vídeo frente a sus manifiestos; un prompt que aún no existe no da avisos. */
export function promptIssues(video: Video, photos: PhotoInfo[]): { imageIssues: PromptIssue[]; videoIssues: PromptIssue[] } {
  return {
    imageIssues: video.imagePrompt === null ? [] : checkImagePrompt(video.imagePrompt, imageManifest(video, photos)),
    videoIssues: video.videoPrompt === null ? [] : checkVideoPrompt(video.videoPrompt, clipManifest(video, photos)),
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
  const photos = await listProductPhotos(user, video.productId);
  return {
    video,
    mine: video.createdBy === user.id,
    creatorName: await creatorNameOf(video),
    frames,
    analysis: latest
      ? {
          id: latest.id,
          version: latest.version,
          status: latest.status,
          error: latest.error,
          result: (latest.result as Analysis | null) ?? null,
          costMicros: await analysisCostMicros(video, latest),
          referenceMediaId: latest.referenceMediaId,
          stale: latest.referenceMediaId !== video.referenceMediaId,
        }
      : null,
    ...promptIssues(video, photos),
    imageManifest: imageManifest(video, photos),
    clipManifest: clipManifest(video, photos),
    frame: await generationView(video, "frame", user.id),
    clip: await generationView(video, "clip", user.id),
    costs: await costsOfVideo(video),
  };
}
