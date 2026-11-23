import { pinterestView, type PinterestView } from "@/server/videos/pinterest";
import { resolveClipModel, type ClipModel } from "@/lib/clip-models";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createVideoFromLink } from "@/server/agent";
import { linkStatesOf, type LinkState } from "@/server/agent-tasks";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { coverPhotoIds, listProductPhotos } from "@/server/photos";
import { listProductsFor, productDisplayName } from "@/server/products";
import { accountFileName, editFileName, editViews, openEditStream, type EditView } from "@/server/videos/edits";
import { downloadableClipUrl, servableClipUrl } from "@/server/videos/clip";
import { bodiesOfVideos, checkVideoBodies } from "@/server/videos/bodies";
import { costsOfVideo, type VideoCosts } from "@/server/videos/costs";
import { generationLock, generationView, pollVideoGenerations, type GenerationView } from "@/server/videos/generations";
import { analysisLock, type Analysis } from "@/server/videos/analysis";
import { checkKindInput, cleanNote, cleanProductNotes, isAvatarMode, type AvatarMode, type VideoKind } from "@/server/videos/brief";
import { songSummaries, type SongSummary } from "@/server/songs";
import { avatarSummaries, isChoosableAvatar } from "@/server/avatars";
import {
  audioColumns,
  canChooseSong,
  checkClipModel,
  checkEditReferenceUrl,
  checkSongChoice,
  checkVariantChoice,
  createVideo,
  DEFAULT_FRAME_COUNT,
  getVideoFor,
  isFrameCount,
  MAX_FRAME_COUNT,
  insertVideo,
  productNotesOf,
  referenceOutdated,
  staleness,
  type Video,
} from "@/server/videos/videos";

/**
 * Lotes: muchos vídeos a la vez encima del flujo de cada vídeo. Un lote es solo una lista con
 * nombre; cada vídeo sigue siendo un vídeo normal (su producto, su acceso, su dinero). Lo ve quien
 * lo creó y el dueño (todos); otro colaborador recibe el mismo 404 que si no existiera. Dentro de
 * un lote, cada persona solo ve los vídeos de los productos que ve. Añadir vídeos: solo quien lo creó.
 */

export type Batch = typeof schema.batches.$inferSelect;

const MAX_NAME = 100;

const NOT_FOUND = "Lote no encontrado.";
const NOT_CREATOR = "Solo quien creó el lote puede añadirle vídeos.";
const ONLY_CREATOR = "Solo quien creó el lote puede cambiarlo.";
const VIDEO_NOT_IN_BATCH = "Vídeo no encontrado.";
const HAS_GENERATIONS = "Este vídeo ya tiene imágenes o clips: no se puede quitar.";
const NEED_AVATAR = "Elige un avatar, «Sin sustitución» o «No aparece nadie».";
const BAD_AVATAR = "Elige una foto con papel «Avatar» de este producto.";
const BAD_LIBRARY_AVATAR = "Elige un avatar de la biblioteca.";

const batches = schema.batches;
const videos = schema.videos;

/** Ids de los productos que ve `user`: el mismo ámbito que el resto de la aplicación. */
async function visibleProducts(user: AuthUser): Promise<Map<number, string>> {
  return new Map((await listProductsFor(user, "todos")).map((product) => [product.id, productDisplayName(product)]));
}

/**
 * Crea un lote vacío con nombre (1–100 caracteres; la pantalla pone uno automático si se deja
 * vacío) y «Desglosar al subir» (encendido si no se dice).
 */
export async function createBatch(user: AuthUser, name: string, options: { autoAnalyze?: unknown; frameCount?: unknown } = {}): Promise<Batch> {
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) throw new HttpError(400, "Escribe el nombre del lote.");
  if (clean.length > MAX_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_NAME} caracteres.`);
  if (options.autoAnalyze !== undefined && typeof options.autoAnalyze !== "boolean") throw new HttpError(400, "Valor no válido.");
  if (options.frameCount !== undefined && !isFrameCount(options.frameCount)) throw new HttpError(400, BAD_FRAME_COUNT);
  const [batch] = await getDb()
    .insert(batches)
    .values({ name: clean, createdBy: user.id, autoAnalyze: options.autoAnalyze ?? true, frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT })
    .returning();
  return batch;
}

/** Un lote de `user` (404 si no lo ve, 403 si lo ve pero no lo creó: el dueño en uno ajeno). */
async function ownBatch(user: AuthUser, batchId: number, message = ONLY_CREATOR): Promise<Batch> {
  const batch = await getBatchFor(user, batchId);
  if (batch.createdBy !== user.id) throw new HttpError(403, message);
  return batch;
}

/** Enciende o apaga «Desglosar al subir». Solo quien creó el lote. */
export async function setBatchAutoAnalyze(user: AuthUser, batchId: number, autoAnalyze: unknown): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  if (typeof autoAnalyze !== "boolean") throw new HttpError(400, "Valor no válido.");
  const [updated] = await getDb().update(batches).set({ autoAnalyze }).where(eq(batches.id, batch.id)).returning();
  return updated;
}

const BAD_FRAME_COUNT = `Elige entre 1 y ${MAX_FRAME_COUNT} imágenes por vídeo.`;

/** Imágenes por vídeo del lote (1–4; por defecto 1). Solo quien creó el lote. */
export async function setBatchFrameCount(user: AuthUser, batchId: number, frameCount: unknown): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  if (!isFrameCount(frameCount)) throw new HttpError(400, BAD_FRAME_COUNT);
  const [updated] = await getDb().update(batches).set({ frameCount }).where(eq(batches.id, batch.id)).returning();
  return updated;
}

/** «Traducir el diálogo al alemán» para los vídeos del lote que no digan otra cosa. Solo quien creó el lote. */
export async function setBatchDubDialogue(user: AuthUser, batchId: number, dubDialogue: unknown): Promise<Batch> {
  const batch = await ownBatch(user, batchId);
  if (typeof dubDialogue !== "boolean") throw new HttpError(400, "Elige si se traduce el diálogo.");
  const [updated] = await getDb().update(batches).set({ dubDialogue }).where(eq(batches.id, batch.id)).returning();
  return updated;
}

/**
 * Guarda las «Indicaciones para los vídeos de {producto}» del lote (hasta 4.000 caracteres; vacío
 * las quita). Llegan al desglose de cada vídeo de ese producto en el lote, y cambiarlas deja sus
 * desgloses por repetir. Solo quien creó el lote y con un producto que ve.
 */
export async function setBatchProductNotes(user: AuthUser, batchId: number, productId: number, notes: unknown): Promise<string | null> {
  const batch = await ownBatch(user, batchId);
  const clean = cleanProductNotes(notes);
  // También comprueba que el producto es visible (404 «Producto no encontrado.» si no).
  await listProductPhotos(user, productId);
  const db = getDb();
  const where = and(eq(schema.batchProducts.batchId, batch.id), eq(schema.batchProducts.productId, productId));
  if (clean === null) {
    // Sin indicaciones: la fila sigue solo si guarda la «Edición de referencia» del grupo.
    await db.delete(schema.batchProducts).where(and(where, isNull(schema.batchProducts.editReferenceUrl), isNull(schema.batchProducts.clipModel)));
    await db.update(schema.batchProducts).set({ notes: null, updatedAt: new Date() }).where(where);
    return null;
  }
  await db
    .insert(schema.batchProducts)
    .values({ batchId: batch.id, productId, notes: clean })
    .onConflictDoUpdate({ target: [schema.batchProducts.batchId, schema.batchProducts.productId], set: { notes: clean, updatedAt: new Date() } });
  return clean;
}

/**
 * Guarda la «Edición de referencia» de un producto del lote (un enlace admitido; `null` o vacío la
 * quita) y la aplica a los vídeos de ese producto en el lote que no tienen una propia: los que no
 * tienen ninguna o tienen la que tenía el grupo hasta ahora. Un vídeo con su propio enlace no se
 * toca. Solo quien creó el lote y con un producto que ve.
 */
export async function setBatchProductEditReference(user: AuthUser, batchId: number, productId: number, url: unknown): Promise<string | null> {
  const batch = await ownBatch(user, batchId);
  const clean = checkEditReferenceUrl(url ?? null) ?? null;
  await listProductPhotos(user, productId);
  const table = schema.batchProducts;
  const where = and(eq(table.batchId, batch.id), eq(table.productId, productId));
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select({ url: table.editReferenceUrl }).from(table).where(where).for("update");
    const previous = before?.url ?? null;
    if (clean === null) {
      await tx.delete(table).where(and(where, isNull(table.notes), isNull(table.clipModel)));
      await tx.update(table).set({ editReferenceUrl: null, updatedAt: new Date() }).where(where);
    } else {
      await tx
        .insert(table)
        .values({ batchId: batch.id, productId, editReferenceUrl: clean })
        .onConflictDoUpdate({ target: [table.batchId, table.productId], set: { editReferenceUrl: clean, updatedAt: new Date() } });
    }
    const inherits = previous === null ? isNull(videos.editReferenceUrl) : or(isNull(videos.editReferenceUrl), eq(videos.editReferenceUrl, previous));
    await tx
      .update(videos)
      .set({ editReferenceUrl: clean, updatedAt: new Date() })
      .where(and(eq(videos.batchId, batch.id), eq(videos.productId, productId), inherits));
    return clean;
  });
}

/**
 * Guarda cómo se genera la réplica en un producto del lote (`auto`, un modelo o `null`: sin elección
 * del grupo) y lo aplica, como la «Edición de referencia» del grupo, a los vídeos de ese producto en
 * el lote que no tienen uno propio: los que están en «Automático» o en el que tenía el grupo hasta
 * ahora. Un vídeo con su propio modelo no se toca, ni uno que ya tiene clip pedido (lo hecho no se
 * reinterpreta). Solo quien creó el lote y con un producto que ve.
 */
export async function setBatchProductClipModel(user: AuthUser, batchId: number, productId: number, value: unknown): Promise<string | null> {
  const batch = await ownBatch(user, batchId);
  const clean = value === null || value === undefined ? null : checkClipModel(value);
  await listProductPhotos(user, productId);
  const table = schema.batchProducts;
  const where = and(eq(table.batchId, batch.id), eq(table.productId, productId));
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select({ clipModel: table.clipModel }).from(table).where(where).for("update");
    const previous = before?.clipModel ?? "auto";
    if (clean === null) {
      await tx.delete(table).where(and(where, isNull(table.notes), isNull(table.editReferenceUrl)));
      await tx.update(table).set({ clipModel: null, updatedAt: new Date() }).where(where);
    } else {
      await tx
        .insert(table)
        .values({ batchId: batch.id, productId, clipModel: clean })
        .onConflictDoUpdate({ target: [table.batchId, table.productId], set: { clipModel: clean, updatedAt: new Date() } });
    }
    const inherits = previous === "auto" ? eq(videos.clipModel, "auto") : or(eq(videos.clipModel, "auto"), eq(videos.clipModel, previous));
    await tx
      .update(videos)
      .set({ clipModel: clean ?? "auto", skipAutoAnalysis: false, updatedAt: new Date() })
      .where(
        and(
          eq(videos.batchId, batch.id),
          eq(videos.productId, productId),
          inherits,
          sql`not exists (select 1 from generations g where g.video_id = ${videos.id} and g.kind = 'clip')`,
        ),
      );
    return clean;
  });
}

const BUDGET_CONFIRMED = "El presupuesto de este lote ya está confirmado: crea otro lote para más vídeos.";

/** Con el presupuesto ya confirmado («Enviar lote»), el lote no admite vídeos nuevos: no tendrían precio previsto. */
function requireOpen(batch: Batch): void {
  if (batch.status !== "borrador" && batch.status !== "preguntas") throw new HttpError(409, BUDGET_CONFIRMED);
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
  /** De esos, cuántos están montados (vídeos terminados, listos para descargar). */
  edited: number;
  /** Portadas de sus productos (como mucho 4, en el orden de su primer vídeo): para la lista. */
  covers: number[];
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
  const inScope = and(inArray(videos.batchId, rows.map((row) => row.id)), inArray(videos.productId, products));
  const counts =
    products.length === 0
      ? []
      : await db.select({ batchId: videos.batchId, total: count() }).from(videos).where(inScope).groupBy(videos.batchId);
  // «Hecho» = tiene un clip que se puede descargar: la misma regla que `clipReady` (`downloadableClipUrl`).
  const clips =
    products.length === 0
      ? []
      : await db
          .select({ batchId: videos.batchId, videoId: videos.id, url: schema.generationResults.url })
          .from(schema.generationResults)
          .innerJoin(schema.generations, eq(schema.generations.id, schema.generationResults.generationId))
          .innerJoin(videos, eq(videos.id, schema.generations.videoId))
          .where(
            and(
              inScope,
              eq(schema.generations.kind, "clip"),
              eq(schema.generations.status, "done"),
              eq(schema.generationResults.ok, true),
            ),
          );
  const doneVideos = new Map<number, Set<number>>();
  for (const clip of clips) {
    if (clip.batchId === null || !servableClipUrl(clip.url)) continue;
    const set = doneVideos.get(clip.batchId) ?? new Set<number>();
    set.add(clip.videoId);
    doneVideos.set(clip.batchId, set);
  }
  const byBatch = new Map(counts.map((row) => [row.batchId, { total: row.total, done: doneVideos.get(row.batchId ?? 0)?.size ?? 0 }]));
  // Vídeos montados (al menos una versión en `edits`).
  const editedRows =
    products.length === 0
      ? []
      : await db
          .select({ batchId: videos.batchId, n: sql<number>`count(distinct ${videos.id})::int` })
          .from(videos)
          .innerJoin(schema.edits, eq(schema.edits.videoId, videos.id))
          .where(inScope)
          .groupBy(videos.batchId);
  const editedOf = new Map(editedRows.map((row) => [row.batchId, row.n]));
  // Los productos de cada lote, en el orden de su primer vídeo, y sus portadas.
  const pairs =
    products.length === 0
      ? []
      : await db
          .select({ batchId: videos.batchId, productId: videos.productId, first: sql<number>`min(${videos.id})` })
          .from(videos)
          .where(inScope)
          .groupBy(videos.batchId, videos.productId)
          .orderBy(sql`min(${videos.id})`);
  const covers = await coverPhotoIds(user, pairs.map((pair) => pair.productId));
  const coversOf = new Map<number, number[]>();
  for (const pair of pairs) {
    const cover = covers.get(pair.productId);
    if (pair.batchId === null || cover === undefined) continue;
    const list = coversOf.get(pair.batchId) ?? [];
    if (list.length < 4) list.push(cover);
    coversOf.set(pair.batchId, list);
  }
  return rows.map((row) => ({
    ...row,
    mine: row.createdBy === user.id,
    videos: byBatch.get(row.id)?.total ?? 0,
    done: byBatch.get(row.id)?.done ?? 0,
    edited: editedOf.get(row.id) ?? 0,
    covers: coversOf.get(row.id) ?? [],
  }));
}

/**
 * Crea un vídeo en el lote por el camino normal (`createVideo`: producto visible, «Vídeo N»), con
 * quién sale (un avatar, una foto con papel «avatar» de ese producto; «sin sustitución»; o
 * «nadie»), su tipo (con su adaptación si es «Adaptación de concepto»; con la duración del gancho y
 * sus cuerpos, de ese mismo producto, si es «Solo gancho») y sus cambios específicos opcionales. Solo quien creó el lote. Valores que no valen: 400.
 * Con `linkUrl`, la referencia del vídeo es ese enlace pegado y su descarga queda en la cola del
 * Mac de quien lo crea (`createVideoFromLink`): el enlace, su Higgsfield y su Mac se comprueban
 * antes de crear el vídeo, así que un enlace que no vale (400) o un Mac desconectado (409) no
 * dejan nada a medias.
 */
export async function addVideoToBatch(
  user: AuthUser,
  batchId: number,
  input: {
    productId: number;
    avatarPhotoId: number | null;
    /** Con `biblioteca`: el avatar de la biblioteca (no retirado). */
    avatarLibraryId?: unknown;
    avatarMode: unknown;
    /** Una variante de este producto o `null` / sin enviar (las fotos de siempre). */
    variantId?: unknown;
    kind?: unknown;
    adaptation?: unknown;
    hookSeconds?: unknown;
    bodyClipIds?: unknown;
    note?: unknown;
    linkUrl?: unknown;
    /** «Música»: una canción de la biblioteca o `null` / sin enviar («Audio original»). */
    songId?: unknown;
    /** «Referencia de edición»: un enlace admitido, o `null` / sin enviar. */
    editReferenceUrl?: unknown;
    /** Cómo se genera la réplica: `auto` (por defecto) o un modelo. */
    clipModel?: unknown;
  },
): Promise<Video> {
  const batch = await ownBatch(user, batchId, NOT_CREATOR);
  requireOpen(batch);

  const note = cleanNote(input.note);
  const editReferenceUrl = checkEditReferenceUrl(input.editReferenceUrl) ?? null;
  const clipModel = input.clipModel === undefined || input.clipModel === null ? undefined : checkClipModel(input.clipModel);
  const { kind, adaptation, hookSeconds } = checkKindInput(input);
  if (!isAvatarMode(input.avatarMode)) throw new HttpError(400, "Valor no válido.");
  const avatarMode = input.avatarMode;
  if (avatarMode !== "elegido" && input.avatarPhotoId !== null) {
    throw new HttpError(400, "Con «Sin sustitución» o «No aparece nadie» no se elige avatar.");
  }
  if (avatarMode === "elegido" && input.avatarPhotoId === null) throw new HttpError(400, NEED_AVATAR);
  const avatarLibraryId = input.avatarLibraryId ?? null;
  if (avatarMode === "biblioteca") {
    if (!(Number.isSafeInteger(avatarLibraryId) && (await isChoosableAvatar(avatarLibraryId as number)))) throw new HttpError(400, BAD_LIBRARY_AVATAR);
  } else if (avatarLibraryId !== null) {
    throw new HttpError(400, "Con ese modo no se elige un avatar de la biblioteca.");
  }

  // También comprueba que el producto es visible (404 «Producto no encontrado.» si no).
  const photos = await listProductPhotos(user, input.productId);
  if (input.avatarPhotoId !== null && !photos.some((photo) => photo.id === input.avatarPhotoId && photo.role === "avatar")) {
    throw new HttpError(400, BAD_AVATAR);
  }
  const bodyClipIds = input.bodyClipIds === undefined ? undefined : await checkVideoBodies(input.productId, input.bodyClipIds);
  const songId = (await checkSongChoice(input.songId)) ?? null;
  const variantId = input.variantId === undefined || input.variantId === null ? null : await checkVariantChoice(user, input.productId, input.variantId);
  const extras = {
    batchId: batch.id,
    note,
    avatarPhotoId: input.avatarPhotoId,
    avatarLibraryId: avatarLibraryId as number | null,
    avatarMode,
    variantId,
    kind: kind ?? "replicar",
    adaptation: adaptation ?? null,
    ...(hookSeconds === undefined ? {} : { hookSeconds }),
    ...(bodyClipIds === undefined ? {} : { bodyClipIds }),
    ...audioColumns(songId),
    editReferenceUrl,
    ...(clipModel === undefined ? {} : { clipModel }),
  };
  return input.linkUrl == null ? createVideo(user, input.productId, extras) : createVideoFromLink(user, input.productId, input.linkUrl, extras);
}

export interface BatchRow {
  id: number;
  title: string;
  productId: number;
  productName: string;
  /** «Cambios específicos». */
  note: string | null;
  /** «Referencia de edición»: el enlace cuyo montaje se quiere imitar, o `null`. */
  editReferenceUrl: string | null;
  /** Cómo se genera la réplica: la elección (`auto` o un modelo) y el modelo con el que sale. */
  clipModel: string;
  clipModelResolved: ClipModel;
  /** Fuera del envío automático del lote («Saltar»): se puede «Volver a incluir». */
  skipped: boolean;
  kind: VideoKind;
  /** Duración del gancho (solo cuenta con «Solo gancho»). */
  hookSeconds: number;
  /** Cuántos cuerpos lleva detrás del gancho (solo cuenta con «Solo gancho»). */
  bodies: number;
  /** «Adaptación de concepto» sin «Qué adaptación quieres» todavía: no se puede desglosar. */
  needsAdaptation: boolean;
  mine: boolean;
  createdAt: Date;
  updatedAt: Date;
  referenceStatus: string;
  referenceError: string | null;
  /** La referencia se preparó con otro tramo (cambió el gancho): hay que volver a subirla. */
  referenceOutdated: boolean;
  /** El enlace pegado que el Mac está trayendo, o el último que falló (como en la vista del vídeo). */
  link: LinkState | null;
  avatarPhotoId: number | null;
  avatarMode: AvatarMode;
  /** Con `biblioteca`, el avatar de la biblioteca (con su nombre). */
  libraryAvatar: { id: number; name: string } | null;
  /** Con `automatico` y el desglose hecho y vigente: el avatar que eligió; `null` si aún no hay o no encajó ninguno. */
  autoAvatar: { id: number; name: string } | null;
  /** La variante elegida, o `null` (las fotos de siempre). */
  variantId: number | null;
  /** Preguntas del último desglose hecho (avatar sin encontrar, variante dudosa). */
  questions: number;
  /** La canción elegida para el montaje, o `null` («Audio original»). */
  song: SongSummary | null;
  /** Quien mira puede cambiar la música (quien creó el vídeo o el dueño). */
  songEditable: boolean;
  /** El último desglose: su estado, su error y si ya no corresponde (otra referencia u otras indicaciones). */
  analysis: { status: string; error: string | null; stale: boolean; staleReason: "reference" | "brief" | null } | null;
  /** Los riesgos que encontró el último desglose, si está hecho (texto en pantalla, función inexistente…). */
  risks: Analysis["risks"];
  /** Sin ninguna generación todavía: se puede quitar del lote. */
  removable: boolean;
  frame: GenerationView;
  clip: GenerationView;
  costs: VideoCosts;
  /** Hay un clip que se puede descargar (el aprobado o el último terminado). */
  clipReady: boolean;
  /** El montaje en el Mac: en qué punto está, la última versión montada y si quien mira puede pedirlo. */
  edit: EditView;
  /** «Referencias de Pinterest» de la imagen inicial (`null`: sin desglose o con entorno puesto a mano). */
  pinterest: PinterestView | null;
}

/**
 * Un producto del lote: su portada, sus «Indicaciones», su «Edición de referencia» (la de los
 * vídeos del grupo sin una propia: `row.editReferenceUrl ?? group.editReferenceUrl`) y cuántos
 * vídeos suyos ve quien mira.
 */
export interface BatchGroup {
  productId: number;
  name: string;
  coverPhotoId: number | null;
  notes: string | null;
  editReferenceUrl: string | null;
  /** Cómo se genera la réplica en el grupo (pasa a sus vídeos sin una propia); `null`: sin elección. */
  clipModel: string | null;
  videos: number;
}

export interface BatchView {
  batch: { id: number; name: string; createdAt: Date; createdBy: number; mine: boolean; autoAnalyze: boolean; frameCount: number; dubDialogue: boolean };
  /** Los productos del lote, en el orden de su primer vídeo. */
  groups: BatchGroup[];
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
            kind: analyses.kind,
            avatarMode: analyses.avatarMode,
            avatarPhotoId: analyses.avatarPhotoId,
            avatarLibraryId: analyses.avatarLibraryId,
            variantId: analyses.variantId,
            autoAvatarId: analyses.autoAvatarId,
            questions: sql<number>`coalesce(jsonb_array_length(${analyses.result}->'questions'), 0)::int`,
            note: analyses.note,
            adaptation: analyses.adaptation,
            hookSeconds: analyses.hookSeconds,
            productNotes: analyses.productNotes,
            answers: analyses.answers,
            clipModel: analyses.clipModel,
            risks: sql<Analysis["risks"] | null>`${analyses.result}->'risks'`,
          })
          .from(analyses)
          .where(inArray(analyses.videoId, list.map((video) => video.id)))
          .orderBy(analyses.videoId, desc(analyses.version));
  const analysisOf = new Map(latest.map((row) => [row.videoId, row]));

  const groupIds = [...new Set(list.map((video) => video.productId))];
  const notes = await db
    .select({
      productId: schema.batchProducts.productId,
      notes: schema.batchProducts.notes,
      editReferenceUrl: schema.batchProducts.editReferenceUrl,
      clipModel: schema.batchProducts.clipModel,
    })
    .from(schema.batchProducts)
    .where(eq(schema.batchProducts.batchId, batch.id));
  const notesOf = new Map(notes.map((row) => [row.productId, row.notes]));
  const editReferenceOf = new Map(notes.map((row) => [row.productId, row.editReferenceUrl]));
  const clipModelOf = new Map(notes.map((row) => [row.productId, row.clipModel]));
  const covers = await coverPhotoIds(user, groupIds);
  const generated =
    list.length === 0
      ? []
      : await db
          .selectDistinct({ videoId: schema.generations.videoId })
          .from(schema.generations)
          .where(inArray(schema.generations.videoId, list.map((video) => video.id)));
  const withGenerations = new Set(generated.map((row) => row.videoId));
  const bodiesOf = await bodiesOfVideos(list);
  const links = await linkStatesOf(list.flatMap((video) => (video.linkTaskId === null ? [] : [video.linkTaskId])));
  const songsOf = await songSummaries(list.map((video) => video.songId));
  const avatarsOf = await avatarSummaries([...list.map((video) => video.avatarLibraryId), ...latest.map((row) => row.autoAvatarId)]);
  const named = (id: number | null) => {
    const found = id === null ? undefined : avatarsOf.get(id);
    return found ? { id: found.id, name: found.name } : null;
  };

  const clipUrls = new Map(await Promise.all(list.map(async (video) => [video.id, await downloadableClipUrl(video)] as const)));
  const editsOf = await editViews(user, list.map((video) => ({ ...video, clipReady: clipUrls.get(video.id) != null })));
  const rows = await Promise.all(
    list.map(async (video): Promise<BatchRow> => {
      const analysis = analysisOf.get(video.id);
      const fresh = analysis ? staleness(analysis, { ...video, productNotes: notesOf.get(video.productId) ?? null }) : null;
      const [frame, clip, costs, pinterest] = await Promise.all([
        generationView(video, "frame", user.id),
        generationView(video, "clip", user.id),
        costsOfVideo(video),
        video.environmentPhotoId === null ? pinterestView(video.id) : null,
      ]);
      const clipUrl = clipUrls.get(video.id) ?? null;
      return {
        id: video.id,
        title: video.title,
        productId: video.productId,
        productName: products.get(video.productId) ?? "",
        note: video.note,
        editReferenceUrl: video.editReferenceUrl,
        clipModel: video.clipModel,
        clipModelResolved: resolveClipModel(video.clipModel, video.segmentDurationMs),
        skipped: video.autoSkipped,
        kind: video.kind as VideoKind,
        hookSeconds: video.hookSeconds,
        bodies: bodiesOf.get(video.id)?.length ?? 0,
        needsAdaptation: video.kind === "adaptacion_concepto" && !video.adaptation,
        mine: video.createdBy === user.id,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        referenceStatus: video.referenceStatus,
        referenceError: video.referenceError,
        referenceOutdated: referenceOutdated(video),
        link: video.linkTaskId === null ? null : (links.get(video.linkTaskId) ?? null),
        avatarPhotoId: video.avatarPhotoId,
        avatarMode: video.avatarMode as AvatarMode,
        libraryAvatar: video.avatarMode === "biblioteca" ? named(video.avatarLibraryId) : null,
        autoAvatar:
          video.avatarMode === "automatico" && analysis?.status === "done" && fresh?.stale === false ? named(analysis.autoAvatarId) : null,
        variantId: video.variantId,
        questions: analysis?.status === "done" ? analysis.questions : 0,
        song: video.songId === null ? null : (songsOf.get(video.songId) ?? null),
        songEditable: canChooseSong(user, video),
        analysis: analysis && fresh ? { status: analysis.status, error: analysis.error, ...fresh } : null,
        risks: analysis?.status === "done" ? (analysis.risks ?? []) : [],
        removable: !withGenerations.has(video.id),
        frame,
        clip,
        costs,
        clipReady: clipUrl !== null,
        edit: editsOf.get(video.id)!,
        pinterest,
      };
    }),
  );
  const groups = groupIds.map(
    (productId): BatchGroup => ({
      productId,
      name: products.get(productId) ?? "",
      coverPhotoId: covers.get(productId) ?? null,
      notes: notesOf.get(productId) ?? null,
      editReferenceUrl: editReferenceOf.get(productId) ?? null,
      clipModel: clipModelOf.get(productId) ?? null,
      videos: list.filter((video) => video.productId === productId).length,
    }),
  );
  return { batch: { ...batch, mine: batch.createdBy === user.id }, groups, rows };
}

/** Un vídeo de este lote que `user` puede cambiar: lote suyo (403 si no) y vídeo suyo dentro de él (404 si no). */
async function ownBatchVideo(user: AuthUser, batchId: number, videoId: number): Promise<{ batch: Batch; video: Video }> {
  const batch = await ownBatch(user, batchId);
  const video = await getVideoFor(user, videoId);
  if (video.batchId !== batch.id || video.createdBy !== user.id) throw new HttpError(404, VIDEO_NOT_IN_BATCH);
  return { batch, video };
}

/**
 * «Duplicar»: un vídeo nuevo en el mismo lote con lo mismo (producto, tipo, adaptación, gancho y
 * cuerpos, cambios, quién sale, entorno, resolución, música), en una sola transacción. Si la referencia ya está lista se
 * reutiliza tal cual (el mismo recorte en Higgsfield y una copia de sus fotogramas): no hay que
 * volver a subirla. Y como el duplicado es idéntico, para no gastar en Claude antes de que se edite:
 * - si el original tiene un desglose que vale (último hecho, de esta referencia y de estas
 *   indicaciones), se copia (resultado, prompts del vídeo y uso de la imagen; sin cargo, que ya
 *   está en el original). Si después se edita el duplicado, ese desglose deja de valer como siempre;
 * - si no lo tiene, el duplicado queda fuera del desglose automático (`skipAutoAnalysis`) hasta
 *   que se cambie o alguien pulse «Desglosar».
 * Sin referencia lista, el duplicado empieza sin referencia. Nunca copia generaciones.
 */
export async function duplicateBatchVideo(user: AuthUser, batchId: number, videoId: number): Promise<Video> {
  const { batch, video } = await ownBatchVideo(user, batchId, videoId);
  requireOpen(batch);
  const ready = video.referenceStatus === "ready";
  const db = getDb();
  const [latest] = ready
    ? await db
        .select()
        .from(schema.videoAnalyses)
        .where(and(eq(schema.videoAnalyses.videoId, video.id), eq(schema.videoAnalyses.status, "done")))
        .orderBy(desc(schema.videoAnalyses.version))
        .limit(1)
    : [];
  const valid = latest && staleness(latest, { ...video, productNotes: await productNotesOf(video) }).staleReason === null ? latest : null;

  return db.transaction(async (tx) => {
    const copy = await insertVideo(tx, user, video.productId, {
      batchId: batch.id,
      note: video.note,
      editReferenceUrl: video.editReferenceUrl,
      avatarPhotoId: video.avatarPhotoId,
      avatarLibraryId: video.avatarLibraryId,
      avatarMode: video.avatarMode,
      variantId: video.variantId,
      kind: video.kind,
      adaptation: video.adaptation,
      hookSeconds: video.hookSeconds,
      bodyClipIds: video.bodyClipIds,
      environmentPhotoId: video.environmentPhotoId,
      clipResolution: video.clipResolution,
      clipModel: video.clipModel,
      songId: video.songId,
      audioMode: video.audioMode,
      ownerAnswers: video.ownerAnswers,
      ...(ready
        ? {
            referenceStatus: "ready",
            referenceSource: video.referenceSource,
            referenceUrl: video.referenceUrl,
            referenceDurationMs: video.referenceDurationMs,
            referenceWidth: video.referenceWidth,
            referenceHeight: video.referenceHeight,
            referenceMediaId: video.referenceMediaId,
            segmentDurationMs: video.segmentDurationMs,
            cutsMs: video.cutsMs,
            skipAutoAnalysis: valid === null,
          }
        : {}),
      ...(valid ? { imagePrompt: video.imagePrompt, videoPrompt: video.videoPrompt, frameUse: video.frameUse } : {}),
    });
    if (ready) {
      await tx.execute(sql`insert into video_frames (video_id, index, time_ms, mime, size, data)
        select ${copy.id}, index, time_ms, mime, size, data from video_frames where video_id = ${video.id}`);
      // Y su audio («Audio original» en el montaje).
      await tx.execute(sql`insert into video_reference_audio (video_id, mime, size, duration_ms, data)
        select ${copy.id}, mime, size, duration_ms, data from video_reference_audio where video_id = ${video.id}`);
    }
    if (valid) {
      await tx.insert(schema.videoAnalyses).values({
        videoId: copy.id,
        version: 1,
        status: "done",
        result: valid.result,
        referenceMediaId: valid.referenceMediaId,
        ruleVersions: valid.ruleVersions,
        kind: valid.kind,
        avatarMode: valid.avatarMode,
        avatarPhotoId: valid.avatarPhotoId,
        avatarLibraryId: valid.avatarLibraryId,
        variantId: valid.variantId,
        autoAvatarId: valid.autoAvatarId,
        note: valid.note,
        adaptation: valid.adaptation,
        hookSeconds: valid.hookSeconds,
        productNotes: valid.productNotes,
        clipModel: valid.clipModel,
        answers: valid.answers,
        // Sin cargo: lo que costó ya cuenta en el original.
        spendEntryId: null,
        createdBy: user.id,
      });
    }
    return copy;
  });
}

const ANALYSIS_RUNNING = "Este vídeo se está desglosando: espera a que termine para quitarlo.";

/**
 * «Quitar»: borra el vídeo del lote mientras no tenga ninguna generación (409 si la tiene: ya
 * hay créditos de por medio) ni un desglose en cola o en marcha (409). Sus desgloses se van con
 * él; su coste en Claude sigue en el libro de gasto.
 */
export async function removeBatchVideo(user: AuthUser, batchId: number, videoId: number): Promise<void> {
  const { video } = await ownBatchVideo(user, batchId, videoId);
  await getDb().transaction(async (tx) => {
    // El mismo cerrojo que apuntar una generación: o se apunta antes y aquí se ve, o se borra antes.
    await generationLock(tx, video.id);
    const [generation] = await tx
      .select({ id: schema.generations.id })
      .from(schema.generations)
      .where(eq(schema.generations.videoId, video.id))
      .limit(1);
    if (generation) throw new HttpError(409, HAS_GENERATIONS);
    // Y el de pedir un desglose: uno en cola o en marcha se está pagando.
    await tx.execute(analysisLock(video.id));
    const [running] = await tx
      .select({ id: schema.videoAnalyses.id })
      .from(schema.videoAnalyses)
      .where(and(eq(schema.videoAnalyses.videoId, video.id), inArray(schema.videoAnalyses.status, ["queued", "running"])))
      .limit(1);
    if (running) throw new HttpError(409, ANALYSIS_RUNNING);
    await tx.delete(videos).where(eq(videos.id, video.id));
  });
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

// ───────────────────────── Descargar los vídeos terminados ─────────────────────────

/** Un vídeo montado de un lote, listo para descargar o meter en un ZIP. */
export interface BatchEditFile {
  videoId: number;
  /** Número del vídeo en el lote (orden de creación, como el tablero). */
  number: number;
  productId: number;
  /** La cuenta o tienda (el nombre del producto). */
  account: string;
  /** «EisWerk - 03 - 2026-11-23.mp4». */
  fileName: string;
  version: number;
  size: number;
  /** Para leerlo (no sale de la web). */
  edit: { id: number; size: number; storageKey: string | null; createdAt: Date };
}

/**
 * Los vídeos montados (la última versión de cada uno) de un lote que `user` ve, en el orden del
 * tablero; con `productId`, solo los de esa cuenta. Solo los productos que ve quien pregunta.
 */
export async function batchEditFiles(user: AuthUser, batchId: number, productId: number | null = null): Promise<BatchEditFile[]> {
  const batch = await getBatchFor(user, batchId);
  const products = new Map((await listProductsFor(user, "todos")).map((product) => [product.id, product.name]));
  const db = getDb();
  const all = await db.select({ id: videos.id, productId: videos.productId }).from(videos).where(eq(videos.batchId, batch.id)).orderBy(asc(videos.id));
  const numbered = all.map((video, i) => ({ ...video, number: i + 1 })).filter((video) => products.has(video.productId) && (productId === null || video.productId === productId));
  if (numbered.length === 0) return [];
  const latest = await db
    .selectDistinctOn([schema.edits.videoId], {
      videoId: schema.edits.videoId,
      id: schema.edits.id,
      version: schema.edits.version,
      size: schema.edits.size,
      storageKey: schema.edits.storageKey,
      createdAt: schema.edits.createdAt,
    })
    .from(schema.edits)
    .where(inArray(schema.edits.videoId, numbered.map((video) => video.id)))
    .orderBy(schema.edits.videoId, desc(schema.edits.version));
  const editOf = new Map(latest.map((edit) => [edit.videoId, edit]));
  return numbered.flatMap((video) => {
    const edit = editOf.get(video.id);
    if (!edit) return [];
    const account = products.get(video.productId)!;
    return [
      {
        videoId: video.id,
        number: video.number,
        productId: video.productId,
        account,
        fileName: editFileName(account, video.number, edit.createdAt),
        version: edit.version,
        size: edit.size,
        edit: { id: edit.id, size: edit.size, storageKey: edit.storageKey, createdAt: edit.createdAt },
      },
    ];
  });
}

/**
 * El ZIP de los vídeos montados de un lote (o de una cuenta): sin comprimir, en flujo. Con todas
 * las cuentas, una carpeta por cuenta; con una, los vídeos sueltos. 404 si no hay ninguno.
 */
export async function batchEditsZip(user: AuthUser, batchId: number, productId: number | null): Promise<{ stream: ReadableStream<Uint8Array>; fileName: string; count: number }> {
  const files = await batchEditFiles(user, batchId, productId);
  if (files.length === 0) throw new HttpError(404, "Este lote aún no tiene vídeos montados.");
  const [batch] = await getDb().select({ name: schema.batches.name }).from(schema.batches).where(eq(schema.batches.id, batchId));
  const accounts = new Set(files.map((file) => file.productId));
  const folders = accounts.size > 1;
  const { zipStream } = await import("@/server/media/zip");
  const stream = zipStream(
    files.map((file) => ({
      name: folders ? `${accountFileName(file.account)}/${file.fileName}` : file.fileName,
      date: file.edit.createdAt,
      open: async () => openEditStream(file.edit) as unknown as AsyncIterable<Uint8Array>,
    })),
  );
  const base = accountFileName(productId !== null ? `${files[0].account} - ${batch?.name ?? "lote"}` : (batch?.name ?? "lote")).replace(/[·]/g, "-");
  return { stream, fileName: `${base}.zip`, count: files.length };
}
