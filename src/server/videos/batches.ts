import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { listProductPhotos } from "@/server/photos";
import { listProductsFor } from "@/server/products";
import { downloadableClipUrl } from "@/server/videos/clip";
import { costsOfVideo, type VideoCosts } from "@/server/videos/costs";
import { generationView, pollVideoGenerations, type GenerationView } from "@/server/videos/generations";
import { createVideo, type Video } from "@/server/videos/videos";

/**
 * Lotes: muchos vídeos a la vez encima del flujo de cada vídeo. Un lote es solo una lista con
 * nombre; cada vídeo sigue siendo un vídeo normal (su producto, su acceso, su dinero). Lo ve quien
 * lo creó y el dueño (todos); otro colaborador recibe el mismo 404 que si no existiera. Dentro de
 * un lote, cada persona solo ve los vídeos de los productos que ve. Añadir vídeos: solo quien lo creó.
 */

export type Batch = typeof schema.batches.$inferSelect;

const MAX_NAME = 100;
export const MAX_NOTE = 300;

const NOT_FOUND = "Lote no encontrado.";
const NOT_CREATOR = "Solo quien creó el lote puede añadirle vídeos.";
const NEED_AVATAR = "Elige un avatar o «No aparece nadie».";
const BAD_AVATAR = "Elige una foto con papel «Avatar» de este producto.";

const batches = schema.batches;
const videos = schema.videos;

/** Ids de los productos que ve `user`: el mismo ámbito que el resto de la aplicación. */
async function visibleProducts(user: AuthUser): Promise<Map<number, string>> {
  return new Map((await listProductsFor(user)).map((product) => [product.id, product.name]));
}

/** Crea un lote vacío con nombre (1–100 caracteres). */
export async function createBatch(user: AuthUser, name: string): Promise<Batch> {
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) throw new HttpError(400, "Escribe el nombre del lote.");
  if (clean.length > MAX_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_NAME} caracteres.`);
  const [batch] = await getDb().insert(batches).values({ name: clean, createdBy: user.id }).returning();
  return batch;
}

/** Un lote que `user` puede ver (suyo, o cualquiera si es el dueño). Si no: 404 «Lote no encontrado.». */
export async function getBatchFor(user: AuthUser, batchId: number): Promise<Batch> {
  if (!Number.isSafeInteger(batchId) || batchId <= 0) throw new HttpError(404, NOT_FOUND);
  const [batch] = await getDb().select().from(batches).where(eq(batches.id, batchId));
  if (!batch || (user.role !== "dueno" && batch.createdBy !== user.id)) throw new HttpError(404, NOT_FOUND);
  return batch;
}

export interface BatchSummary {
  id: number;
  name: string;
  createdAt: Date;
  createdBy: number;
  creatorName: string | null;
  mine: boolean;
  /** Vídeos que `user` ve dentro del lote. */
  videos: number;
  /** De esos, cuántos tienen ya un clip terminado. */
  done: number;
}

/** Los lotes que ve `user` (los suyos; el dueño, todos), los más recientes primero, con sus cuentas. */
export async function listBatchesFor(user: AuthUser): Promise<BatchSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ id: batches.id, name: batches.name, createdAt: batches.createdAt, createdBy: batches.createdBy, creatorName: schema.users.name })
    .from(batches)
    .leftJoin(schema.users, eq(schema.users.id, batches.createdBy))
    .where(user.role === "dueno" ? undefined : eq(batches.createdBy, user.id))
    .orderBy(desc(batches.createdAt), desc(batches.id));
  if (rows.length === 0) return [];

  const products = [...(await visibleProducts(user)).keys()];
  const counts =
    products.length === 0
      ? []
      : await db
          .select({
            batchId: videos.batchId,
            total: count(),
            // Con el nombre de la tabla delante: en una consulta de una sola tabla Drizzle escribe `"id"` a secas.
            done: sql<number>`count(*) filter (where exists (
              select 1 from generations g
              join generation_results r on r.generation_id = g.id
              where g.video_id = "videos"."id" and g.kind = 'clip' and g.status = 'done' and r.ok
            ))`.mapWith(Number),
          })
          .from(videos)
          .where(and(inArray(videos.batchId, rows.map((row) => row.id)), inArray(videos.productId, products)))
          .groupBy(videos.batchId);
  const byBatch = new Map(counts.map((row) => [row.batchId, row]));
  return rows.map((row) => ({
    ...row,
    mine: row.createdBy === user.id,
    videos: byBatch.get(row.id)?.total ?? 0,
    done: byBatch.get(row.id)?.done ?? 0,
  }));
}

/**
 * Crea un vídeo en el lote por el camino normal (`createVideo`: producto visible, «Vídeo N»), con su
 * avatar (una foto con papel «avatar» de ese producto) o «sin persona», y una indicación opcional de
 * una línea. Solo quien creó el lote.
 */
export async function addVideoToBatch(
  user: AuthUser,
  batchId: number,
  input: { productId: number; avatarPhotoId: number | null; noPerson: boolean; note?: string | null },
): Promise<Video> {
  const batch = await getBatchFor(user, batchId);
  if (batch.createdBy !== user.id) throw new HttpError(403, NOT_CREATOR);

  const note = (input.note ?? "").replace(/[\r\n]+/g, " ").trim();
  if (note.length > MAX_NOTE) throw new HttpError(400, `La indicación no puede tener más de ${MAX_NOTE} caracteres.`);
  if (input.noPerson && input.avatarPhotoId !== null) throw new HttpError(400, "Con «No aparece nadie» no se elige avatar.");
  if (!input.noPerson && input.avatarPhotoId === null) throw new HttpError(400, NEED_AVATAR);

  // También comprueba que el producto es visible (404 «Producto no encontrado.» si no).
  const photos = await listProductPhotos(user, input.productId);
  if (input.avatarPhotoId !== null && !photos.some((photo) => photo.id === input.avatarPhotoId && photo.role === "avatar")) {
    throw new HttpError(400, BAD_AVATAR);
  }
  return createVideo(user, input.productId, {
    batchId: batch.id,
    note: note || null,
    avatarPhotoId: input.avatarPhotoId,
    noPerson: input.noPerson,
  });
}

export interface BatchRow {
  id: number;
  title: string;
  productId: number;
  productName: string;
  note: string | null;
  mine: boolean;
  createdAt: Date;
  updatedAt: Date;
  referenceStatus: string;
  referenceError: string | null;
  avatarPhotoId: number | null;
  noPerson: boolean;
  /** El último desglose: su estado, su error y si ya no corresponde a la referencia actual. */
  analysis: { status: string; error: string | null; stale: boolean } | null;
  frame: GenerationView;
  clip: GenerationView;
  costs: VideoCosts;
  /** Hay un clip que se puede descargar (el aprobado o el último terminado). */
  clipReady: boolean;
}

export interface BatchView {
  batch: { id: number; name: string; createdAt: Date; createdBy: number; mine: boolean };
  rows: BatchRow[];
}

/** El tablero del lote: una fila por vídeo que `user` ve, en el orden en que se añadieron. */
export async function batchView(user: AuthUser, batchId: number): Promise<BatchView> {
  const batch = await getBatchFor(user, batchId);
  const products = await visibleProducts(user);
  const db = getDb();
  const list = products.size === 0
    ? []
    : await db
        .select()
        .from(videos)
        .where(and(eq(videos.batchId, batch.id), inArray(videos.productId, [...products.keys()])))
        .orderBy(asc(videos.id));

  const analyses = schema.videoAnalyses;
  const latest =
    list.length === 0
      ? []
      : await db
          .selectDistinctOn([analyses.videoId], {
            videoId: analyses.videoId,
            status: analyses.status,
            error: analyses.error,
            referenceMediaId: analyses.referenceMediaId,
          })
          .from(analyses)
          .where(inArray(analyses.videoId, list.map((video) => video.id)))
          .orderBy(analyses.videoId, desc(analyses.version));
  const analysisOf = new Map(latest.map((row) => [row.videoId, row]));

  const rows = await Promise.all(
    list.map(async (video): Promise<BatchRow> => {
      const analysis = analysisOf.get(video.id);
      const [frame, clip, costs, clipUrl] = await Promise.all([
        generationView(video, "frame", user.id),
        generationView(video, "clip", user.id),
        costsOfVideo(video),
        downloadableClipUrl(video),
      ]);
      return {
        id: video.id,
        title: video.title,
        productId: video.productId,
        productName: products.get(video.productId) ?? "",
        note: video.note,
        mine: video.createdBy === user.id,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        referenceStatus: video.referenceStatus,
        referenceError: video.referenceError,
        avatarPhotoId: video.avatarPhotoId,
        noPerson: video.noPerson,
        analysis: analysis
          ? { status: analysis.status, error: analysis.error, stale: analysis.referenceMediaId !== video.referenceMediaId }
          : null,
        frame,
        clip,
        costs,
        clipReady: clipUrl !== null,
      };
    }),
  );
  return { batch: { ...batch, mine: batch.createdBy === user.id }, rows };
}

/**
 * Antes de enseñar el tablero, pregunta a Higgsfield por las generaciones enviadas de los vídeos
 * del lote que creó `user` (como en la pantalla de cada vídeo: como mucho una vez cada 8 s por
 * generación). De uno en uno.
 */
export async function pollBatchGenerations(user: AuthUser, batchId: number): Promise<void> {
  const batch = await getBatchFor(user, batchId);
  const pending = await getDb()
    .selectDistinct({ videoId: schema.generations.videoId })
    .from(schema.generations)
    .innerJoin(videos, eq(videos.id, schema.generations.videoId))
    .where(
      and(
        eq(videos.batchId, batch.id),
        eq(videos.createdBy, user.id),
        eq(schema.generations.status, "submitted"),
      ),
    );
  for (const { videoId } of pending) {
    try {
      await pollVideoGenerations(user, videoId);
    } catch (error) {
      // Un vídeo que ya no se ve (404) o un fallo de Higgsfield no impide enseñar el tablero.
      if (!(error instanceof HttpError)) console.error(`[lotes] No se pudo consultar el vídeo ${videoId}:`, error);
    }
  }
}
