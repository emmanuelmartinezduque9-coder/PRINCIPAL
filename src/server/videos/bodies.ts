import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { mediaLinks } from "@/server/videos/archive";
import { getProductFor } from "@/server/products";
import { fileSlug } from "@/server/videos/filename";

/**
 * Cuerpos de un producto: clips de la biblioteca marcados para pegarse detrás de un gancho. Los ve
 * quien ve el producto (el dueño, todos); cada persona marca solo clips de su propia biblioteca, y
 * desmarca quien marcó o el dueño. Un cuerpo de un producto que no se ve da el mismo 404 que uno
 * que no existe.
 */

export const MAX_LABEL = 60;
/** Cuerpos que puede llevar un vídeo «Solo gancho». */
export const MAX_VIDEO_BODIES = 10;

const NOT_FOUND = "Cuerpo no encontrado.";
const CLIP_NOT_FOUND = "Clip no encontrado.";
const BAD_LABEL = `El nombre no puede tener más de ${MAX_LABEL} caracteres.`;
const NOT_YOURS = "Solo puede desmarcarlo quien lo marcó.";
const BAD_BODIES = "Elige cuerpos de este producto.";
const TOO_MANY = `Un vídeo lleva como mucho ${MAX_VIDEO_BODIES} cuerpos.`;

const bodies = schema.productBodies;
const clips = schema.libraryClips;

export interface ProductBody {
  id: number;
  productId: number;
  label: string;
  auto: boolean;
  accountName: string | null;
  thumbUrl: string | null;
  videoUrl: string;
  /** Vista ligera (MP4 pequeño sin sonido) del almacén propio; `null` si aún no está copiado. */
  previewUrl: string | null;
  /** Puede desmarcarlo quien lo marcó y el dueño. */
  canRemove: boolean;
}

/** Sustituye las direcciones de Higgsfield por las del almacén propio cuando el clip ya está copiado. */
async function withStoredLinks<T extends { jobId: string; thumbUrl: string | null; videoUrl: string }>(
  rows: T[],
): Promise<Array<Omit<T, "jobId"> & { previewUrl: string | null }>> {
  const links = await mediaLinks(rows.map((row) => row.jobId));
  return rows.map(({ jobId, ...row }) => {
    const link = links.get(jobId);
    return { ...row, thumbUrl: link?.thumb ?? row.thumbUrl, videoUrl: link?.original ?? row.videoUrl, previewUrl: link?.preview ?? null };
  });
}

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Los cuerpos de un producto que `user` ve, en el orden en que se marcaron. */
export async function listProductBodies(user: AuthUser, productId: number): Promise<ProductBody[]> {
  const product = await getProductFor(user, productId);
  const rows = await getDb()
    .select({ id: bodies.id, productId: bodies.productId, label: bodies.label, auto: bodies.auto, createdBy: bodies.createdBy, jobId: clips.jobId, thumbUrl: clips.thumbUrl, videoUrl: clips.videoUrl })
    .from(bodies)
    .innerJoin(clips, eq(clips.id, bodies.libraryClipId))
    .where(eq(bodies.productId, product.id))
    .orderBy(asc(bodies.id));
  return (await withStoredLinks(rows)).map(({ createdBy, ...row }) => ({ ...row, accountName: product.instagramAccount, canRemove: createdBy === user.id || user.role === "dueno" }));
}

/**
 * Marca un clip de la biblioteca de `user` como cuerpo de un producto que ve, con un nombre corto
 * (hasta 60 caracteres; vacío, «Cuerpo N»). Si ya lo era, le cambia el nombre. Un clip ajeno o
 * inexistente: 404 «Clip no encontrado.».
 */
export async function markBody(user: AuthUser, productId: number, input: { clipId: unknown; label?: unknown }): Promise<{ id: number; label: string }> {
  const product = await getProductFor(user, productId);
  if (input.label !== undefined && input.label !== null && typeof input.label !== "string") throw new HttpError(400, BAD_LABEL);
  const typed = (input.label ?? "").replace(/\s+/g, " ").trim();
  if (typed.length > MAX_LABEL) throw new HttpError(400, BAD_LABEL);
  if (!isId(input.clipId)) throw new HttpError(404, CLIP_NOT_FOUND);
  const db = getDb();
  const [clip] = await db
    .select({ id: clips.id })
    .from(clips)
    .where(and(eq(clips.id, input.clipId), eq(clips.userId, user.id)));
  if (!clip) throw new HttpError(404, CLIP_NOT_FOUND);

  let label = typed;
  if (!label) {
    const [{ n }] = await db.select({ n: count() }).from(bodies).where(eq(bodies.productId, product.id));
    label = `Cuerpo ${n + 1}`;
  }
  const [saved] = await db
    .insert(bodies)
    .values({ productId: product.id, libraryClipId: clip.id, label, createdBy: user.id })
    .onConflictDoUpdate({ target: [bodies.productId, bodies.libraryClipId], set: typed ? { label: typed } : { productId: product.id } })
    .returning({ id: bodies.id, label: bodies.label });
  return saved;
}

/** Un cuerpo de un producto que `user` ve, con su producto; si no, 404. */
async function getBodyFor(user: AuthUser, bodyId: number) {
  if (!isId(bodyId)) throw new HttpError(404, NOT_FOUND);
  const [body] = await getDb()
    .select({ id: bodies.id, productId: bodies.productId, label: bodies.label, auto: bodies.auto, createdBy: bodies.createdBy, jobId: clips.jobId, videoUrl: clips.videoUrl })
    .from(bodies)
    .innerJoin(clips, eq(clips.id, bodies.libraryClipId))
    .where(eq(bodies.id, bodyId));
  if (!body) throw new HttpError(404, NOT_FOUND);
  try {
    return { body, product: await getProductFor(user, body.productId) };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new HttpError(404, NOT_FOUND);
    throw error;
  }
}

/** Desmarca un cuerpo: quien lo marcó o el dueño (otra persona que ve el producto, 403). */
export async function unmarkBody(user: AuthUser, bodyId: number): Promise<void> {
  const { body } = await getBodyFor(user, bodyId);
  if (body.createdBy !== user.id && user.role !== "dueno") throw new HttpError(403, NOT_YOURS);
  await getDb().delete(bodies).where(eq(bodies.id, body.id));
}

/** Qué se descarga de un cuerpo de un producto que `user` ve: su dirección y `<producto>-cuerpo-<nombre>.mp4`. */
export async function bodyDownload(user: AuthUser, bodyId: number): Promise<{ url: string; jobId: string; filename: string }> {
  const { body, product } = await getBodyFor(user, bodyId);
  return { url: body.videoUrl, jobId: body.jobId, filename: `${fileSlug(product.name, "producto")}-cuerpo-${fileSlug(body.label, String(body.id))}.mp4` };
}

/**
 * Comprueba la lista ordenada de cuerpos que se quiere guardar en un vídeo de ese producto: ids
 * de `product_bodies` de ese mismo producto, sin repetir y como mucho 10. Si no, 400.
 */
export async function checkVideoBodies(productId: number, value: unknown): Promise<number[]> {
  if (!Array.isArray(value) || !value.every(isId) || new Set(value).size !== value.length) throw new HttpError(400, BAD_BODIES);
  if (value.length > MAX_VIDEO_BODIES) throw new HttpError(400, TOO_MANY);
  if (value.length === 0) return [];
  const found = await getDb()
    .select({ id: bodies.id })
    .from(bodies)
    .where(and(eq(bodies.productId, productId), inArray(bodies.id, value)));
  if (found.length !== value.length) throw new HttpError(400, BAD_BODIES);
  return value;
}

export interface VideoBody {
  id: number;
  label: string;
  thumbUrl: string | null;
  videoUrl: string;
  previewUrl: string | null;
  /** El trabajo de Higgsfield del clip (para el montaje). */
  jobId: string;
}

/**
 * Los cuerpos de varios vídeos ya comprobados (`getVideoFor`), cada uno en su orden. Un cuerpo que
 * se desmarcó después (o que ya no es de ese producto) deja de salir.
 */
export async function bodiesOfVideos(
  videos: Array<{ id: number; productId: number; bodyClipIds: number[] }>,
  options: { raw?: boolean } = {},
): Promise<Map<number, VideoBody[]>> {
  const ids = [...new Set(videos.flatMap((video) => video.bodyClipIds))];
  const rows =
    ids.length === 0
      ? []
      : await getDb()
          .select({ id: bodies.id, productId: bodies.productId, label: bodies.label, jobId: clips.jobId, thumbUrl: clips.thumbUrl, videoUrl: clips.videoUrl })
          .from(bodies)
          .innerJoin(clips, eq(clips.id, bodies.libraryClipId))
          .where(inArray(bodies.id, ids))
          .then(async (found) => {
            // `raw`: las direcciones de Higgsfield tal cual (el montaje busca él mismo la copia propia).
            if (options.raw) return found.map((row) => ({ ...row, previewUrl: null as string | null }));
            const linked = await withStoredLinks(found);
            return linked.map((row, i) => ({ ...row, jobId: found[i].jobId }));
          });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(
    videos.map((video) => [
      video.id,
      video.bodyClipIds.flatMap((id) => {
        const body = byId.get(id);
        return body && body.productId === video.productId ? [{ id: body.id, label: body.label, thumbUrl: body.thumbUrl, videoUrl: body.videoUrl, previewUrl: body.previewUrl, jobId: body.jobId }] : [];
      }),
    ]),
  );
}

/** Los cuerpos de un vídeo ya comprobado, en su orden. */
export async function bodiesOfVideo(video: { id: number; productId: number; bodyClipIds: number[] }, options: { raw?: boolean } = {}): Promise<VideoBody[]> {
  return (await bodiesOfVideos([video], options)).get(video.id) ?? [];
}

/**
 * Los cuerpos del producto, en el orden en que se añadieron: con «Solo gancho» y ningún cuerpo elegido en la tarjeta,
 * el montaje los usa todos (orden del dueño, 24/11/2026: un «Solo gancho» se monta con su gancho Y su cuerpo).
 */
export async function productBodyIds(productId: number): Promise<number[]> {
  const rows = await getDb().select({ id: bodies.id }).from(bodies).where(eq(bodies.productId, productId)).orderBy(asc(bodies.id));
  return rows.map((row) => row.id);
}
