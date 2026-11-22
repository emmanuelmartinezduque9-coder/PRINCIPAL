import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { MAX_EDIT_BYTES, MAX_EDIT_TEXT } from "@/db/schema";
import { macOwnerId, queueMontajeTask, taskStatusesOf } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, type Product } from "@/server/products";
import { parseRange, songSummaries } from "@/server/songs";
import type { Analysis } from "@/server/videos/analysis";
import { bodiesOfVideo } from "@/server/videos/bodies";
import { downloadableClipUrl, servableClipUrl } from "@/server/videos/clip";
import { fileSlug } from "@/server/videos/filename";
import { canChooseSong, effectiveEditReferenceUrl, getVideoFor, hookTiming, type Video } from "@/server/videos/videos";

/**
 * Montaje automático (el paso que sigue a los clips): cada vídeo se monta en el Mac del dueño, que
 * siempre está encendido, con el montador (`montador/montar_auto.py`). Aquí se hace la «ficha de
 * montaje» (`EditSpec`: los clips, la canción con su drop, los rótulos, la referencia de edición),
 * se pone la tarea en la cola del Mac (`agent_tasks`, tipo `montaje`) y se guarda el MP4 que
 * vuelve (`edits`, una versión por montaje), que se sirve con `Range`.
 *
 * - Al quedar un lote `listo`, se monta cada vídeo suyo (`startBatchEdits`, enganchado con
 *   `onBatchReady` en `src/jobs/video-jobs.ts`, donde corre el avance de los lotes), solo si hay un Mac del
 *   dueño; si no, el vídeo queda «Montaje: necesita el Mac». Cuando todos han terminado (bien o
 *   con su motivo), el lote pasa a `montado`.
 * - «Montar» / «Volver a montar» a mano: quien creó el vídeo o el dueño (`canChooseSong`).
 * - El protocolo con el Mac (reserva, trozos, cierre) está en `src/server/montaje-tasks.ts`, que
 *   llama aquí para guardar o dar por fallido el montaje. Este módulo no importa el del agente.
 */

export const NEEDS_MAC = "Montaje: necesita el Mac";
export const NO_CLIP = "El vídeo aún no tiene clip.";
export const CLIP_NOT_SERVABLE = "El clip no se puede descargar.";
export const BODY_NOT_SERVABLE = "Un cuerpo no se puede descargar.";
export const ALREADY_RUNNING = "Este vídeo ya se está montando.";
const CANNOT_START = "Solo quien creó este vídeo o el dueño pueden montarlo.";
const CANNOT_EDIT_TEXTS = "Solo quien creó este vídeo o el dueño pueden cambiar sus rótulos.";
const BAD_TEXT = `Cada rótulo tiene que tener entre 1 y ${MAX_EDIT_TEXT} caracteres.`;
const NO_EDIT = "Este vídeo aún no está montado.";
const MAX_ERROR = 300;

export { MAX_EDIT_BYTES };

const videos = schema.videos;
const edits = schema.edits;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ───────────────────────── Ficha de montaje ─────────────────────────

/** Lo que el Mac recibe para montar un vídeo (va tal cual en `agent_tasks.payload`). */
export interface EditSpec {
  version: 1;
  videoId: number;
  title: string;
  kind: string;
  product: { name: string; language: string };
  /**
   * Los clips en orden: con «Solo gancho», el gancho (`hook`) y detrás sus cuerpos (`body`); con los
   * otros tipos, el clip aprobado (`clip`). Siempre direcciones de Higgsfield (`servableClipUrl`).
   */
  clips: Array<{ role: "hook" | "body" | "clip"; url: string }>;
  /** Con «Solo gancho», lo que dura de verdad el gancho (el clip generado puede ser más largo). */
  hookMs: number | null;
  /**
   * La canción: `url` es una ruta de la web que el Mac pide con su ficha mientras tiene la tarea.
   * `null`: audio original.
   */
  song: { url: string; id: number; title: string; dropMs: number | null; startMs: number; durationMs: number } | null;
  /**
   * «Audio original» (sin canción): el audio del vídeo de REFERENCIA, desde 0 y recortado a lo que
   * dure el montaje (los clips de Seedance salen mudos). `web`: la pista guardada al preparar la
   * referencia, por la ruta de esta tarea (`referenceAudioRouteOf`), que el Mac pide con su ficha.
   * `enlace`: si no se guardó, el enlace de la referencia, que el Mac trae con yt-dlp. `null`: con
   * canción, o sin ninguna de las dos.
   */
  referenceAudio: { url: string; source: "web" | "enlace" } | null;
  texts: { main: string; cta: string };
  editReferenceUrl: string | null;
}

/** El CTA de siempre del dueño, en el idioma del anuncio. */
export function standardCta(productName: string, language: string): string {
  if (language === "it") return `Commenta “${productName}” se ne vuoi uno anche tu! 🤩`;
  return `Kommentiere „${productName}“, wenn du auch eine willst! 🤩`;
}

const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= MAX_EDIT_TEXT ? text : null;
};

/** Un rótulo pedido en las indicaciones del vídeo: una línea «Texto: …» o «Rótulo: …». */
function noteText(note: string | null): string | null {
  for (const line of (note ?? "").split("\n")) {
    const match = /^\s*(?:texto|rótulo|rotulo|text)\s*:\s*(.+)$/i.exec(line);
    if (match) return cleanText(match[1]);
  }
  return null;
}

/**
 * Los rótulos que lleva el montaje: los guardados en el vídeo; si no hay, los que propuso Claude en
 * el desglose (`editTexts`); si tampoco, los que salen de las indicaciones (una línea «Texto: …»
 * o, si no hay, el nombre del producto) y el CTA de siempre del dueño.
 */
export function editTextsFor(
  video: Pick<Video, "editMainText" | "editCtaText" | "note">,
  product: Pick<Product, "name" | "language">,
  analysis: Pick<Analysis, "editTexts"> | null,
): { main: string; cta: string } {
  const proposed = analysis?.editTexts ?? null;
  return {
    main: cleanText(video.editMainText) ?? cleanText(proposed?.main) ?? noteText(video.note) ?? `${product.name.toUpperCase()} 😍`,
    cta: cleanText(video.editCtaText) ?? cleanText(proposed?.cta) ?? standardCta(product.name, product.language),
  };
}

/** El resultado del último desglose hecho del vídeo, o `null`. */
async function latestAnalysisResult(videoId: number): Promise<Analysis | null> {
  const [row] = await getDb()
    .select({ result: schema.videoAnalyses.result })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  return (row?.result as Analysis | null) ?? null;
}

/** La ruta de la canción de una tarea de montaje, que el Mac pide con su ficha. */
export const songRouteOf = (taskId: number) => `/api/agente/tareas/${taskId}/cancion`;
/** La ruta del audio de la referencia de una tarea de montaje, que el Mac pide con su ficha. */
export const referenceAudioRouteOf = (taskId: number) => `/api/agente/tareas/${taskId}/audio-referencia`;

/** El audio de la referencia guardado para `videoId`, o `null`. */
export async function readReferenceAudio(videoId: number): Promise<{ mime: string; data: Buffer } | null> {
  const [row] = await getDb()
    .select({ mime: schema.videoReferenceAudio.mime, data: schema.videoReferenceAudio.data })
    .from(schema.videoReferenceAudio)
    .where(eq(schema.videoReferenceAudio.videoId, videoId));
  return row ?? null;
}

/** De dónde sale «Audio original» en la ficha (ver `EditSpec.referenceAudio`); `null` con canción. */
async function referenceAudioSource(video: Video): Promise<"web" | { link: string } | null> {
  if (video.songId !== null) return null;
  const [stored] = await getDb()
    .select({ videoId: schema.videoReferenceAudio.videoId })
    .from(schema.videoReferenceAudio)
    .where(eq(schema.videoReferenceAudio.videoId, video.id));
  if (stored) return "web";
  if (video.referenceSource === "link" && video.referenceUrl) return { link: video.referenceUrl };
  return null;
}

/**
 * Lo que necesita la ficha y no depende de la tarea: los clips (409 si falta alguno o no se puede
 * descargar), la canción, los rótulos y el resto. Se calcula antes de abrir la transacción.
 */
async function specParts(
  video: Video,
  product: Product,
): Promise<Omit<EditSpec, "song" | "referenceAudio"> & { songOf: (taskId: number) => EditSpec["song"]; referenceAudioOf: (taskId: number) => EditSpec["referenceAudio"] }> {
  const clipUrl = await downloadableClipUrl(video);
  if (!clipUrl) throw new HttpError(409, NO_CLIP);
  const clips: EditSpec["clips"] = [];
  if (video.kind === "solo_gancho") {
    clips.push({ role: "hook", url: clipUrl });
    for (const body of await bodiesOfVideo(video)) {
      if (!servableClipUrl(body.videoUrl)) throw new HttpError(409, BODY_NOT_SERVABLE);
      clips.push({ role: "body", url: body.videoUrl });
    }
  } else {
    clips.push({ role: "clip", url: clipUrl });
  }
  const song = video.songId === null ? null : ((await songSummaries([video.songId])).get(video.songId) ?? null);
  const original = await referenceAudioSource(video);
  return {
    version: 1,
    videoId: video.id,
    title: video.title,
    kind: video.kind,
    product: { name: product.name, language: product.language },
    clips,
    hookMs: hookTiming(video)?.hookMs ?? null,
    songOf: (taskId) =>
      song ? { url: songRouteOf(taskId), id: song.id, title: song.title, dropMs: song.dropMs, startMs: song.startMs, durationMs: song.durationMs } : null,
    referenceAudioOf: (taskId) =>
      original === "web" ? { url: referenceAudioRouteOf(taskId), source: "web" } : original ? { url: original.link, source: "enlace" } : null,
    texts: editTextsFor(video, product, await latestAnalysisResult(video.id)),
    // La del vídeo o, si no tiene, la de su producto en el lote.
    editReferenceUrl: await effectiveEditReferenceUrl(video),
  };
}

/** Bloquea la fila del vídeo hasta el final de la transacción (orden de cerrojos: el vídeo, después la tarea). */
async function lockVideo(tx: Tx, videoId: number): Promise<Video | null> {
  const [row] = await tx.select().from(videos).where(eq(videos.id, videoId)).for("update");
  return row ?? null;
}

/**
 * Pone en cola el montaje de `video` (de `product`) en el Mac de `ownerId`, con su ficha. Los
 * rótulos que no estaban guardados quedan guardados en el vídeo (para que se puedan cambiar). 409
 * si ya hay uno en marcha o si falta algún clip.
 */
async function queueEdit(video: Video, product: Product, ownerId: number, now: Date): Promise<{ taskId: number }> {
  const { songOf, referenceAudioOf, ...parts } = await specParts(video, product);
  return getDb().transaction(async (tx) => {
    const locked = await lockVideo(tx, video.id);
    if (!locked) throw new HttpError(404, "Vídeo no encontrado.");
    const taskId = await queueMontajeTask(
      tx,
      { videoId: video.id, ownerId, url: parts.clips[0].url, payload: (id): EditSpec => ({ ...parts, song: songOf(id), referenceAudio: referenceAudioOf(id) }) },
      now,
    );
    if (taskId === null) throw new HttpError(409, ALREADY_RUNNING);
    await tx
      .update(videos)
      .set({
        editStatus: "en_marcha",
        editError: null,
        editTaskId: taskId,
        editMainText: locked.editMainText ?? parts.texts.main,
        editCtaText: locked.editCtaText ?? parts.texts.cta,
      })
      .where(eq(videos.id, video.id));
    return { taskId };
  });
}

/**
 * «Montar» / «Volver a montar» un vídeo que `user` ve: quien lo creó o el dueño (403 si no). Hace
 * falta un Mac del dueño (409 «Montaje: necesita el Mac») y el clip hecho (409). Si ya hay un
 * montaje en marcha, 409.
 */
export async function startEdit(user: AuthUser, videoId: number, now: Date = new Date()): Promise<{ taskId: number }> {
  const video = await getVideoFor(user, videoId);
  if (!canChooseSong(user, video)) throw new HttpError(403, CANNOT_START);
  const ownerId = await macOwnerId();
  if (ownerId === null) throw new HttpError(409, NEEDS_MAC);
  const product = await getProductFor(user, video.productId);
  return queueEdit(video, product, ownerId, now);
}

/** El vídeo queda con el montaje fallido y su motivo (sin tocar el montaje anterior, si lo hay). */
async function markFailed(executor: Pick<Db, "update">, videoId: number, reason: string, taskId?: number): Promise<void> {
  await executor
    .update(videos)
    .set({ editStatus: "fallido", editError: reason.slice(0, MAX_ERROR) })
    .where(taskId === undefined ? eq(videos.id, videoId) : and(eq(videos.id, videoId), eq(videos.editTaskId, taskId)));
}

/** Los vídeos de un lote que lleva su envío automático: los de quien lo creó, sin «Saltar». */
async function batchVideos(batch: { id: number; createdBy: number }): Promise<Video[]> {
  return getDb()
    .select()
    .from(videos)
    .where(and(eq(videos.batchId, batch.id), eq(videos.createdBy, batch.createdBy), eq(videos.autoSkipped, false)))
    .orderBy(videos.id);
}

/**
 * Enganche de `listo`: pone en cola el montaje de cada vídeo del lote que aún no tiene uno (ni en
 * marcha ni hecho). Sin Mac del dueño, cada uno queda «Montaje: necesita el Mac»; si un vídeo no se
 * puede montar (le falta un clip descargable), queda fallido con el motivo. Repetirlo no duplica nada.
 */
export async function startBatchEdits(batchId: number, now: Date = new Date()): Promise<void> {
  const [batch] = await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId));
  if (!batch) return;
  const creator = await getActiveUser(batch.createdBy);
  const ownerId = await macOwnerId();
  for (const video of await batchVideos(batch)) {
    if (video.editStatus === "en_marcha" || video.editStatus === "hecho") continue;
    if (ownerId === null || creator === null) {
      await markFailed(getDb(), video.id, NEEDS_MAC);
      continue;
    }
    try {
      const product = await getProductFor(creator, video.productId);
      await queueEdit(video, product, ownerId, now);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.message !== ALREADY_RUNNING) await markFailed(getDb(), video.id, error.message);
    }
  }
  await settleBatch(batch.id);
}

/**
 * Un lote `listo` cuyos vídeos han terminado todos su montaje (hecho o fallido con su motivo)
 * pasa a `montado`. Se llama al cerrar cada montaje y en el seguimiento.
 */
export async function settleBatch(batchId: number | null): Promise<void> {
  if (batchId === null) return;
  const [batch] = await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId));
  if (batch?.status !== "listo") return;
  const list = await batchVideos(batch);
  if (list.length === 0 || !list.every((video) => video.editStatus === "hecho" || video.editStatus === "fallido")) return;
  await getDb()
    .update(schema.batches)
    .set({ status: "montado" })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "listo")));
}

/** Para el seguimiento de cada minuto: los lotes `listo` que ya pueden quedar `montado`. */
export async function settleEditedBatches(): Promise<void> {
  const ids = await getDb().select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.status, "listo"));
  for (const { id } of ids) await settleBatch(id);
}

// ───────────────────────── Lo que devuelve el Mac ─────────────────────────

/** Lo que se guarda de la autocomprobación del montador (lo demás se descarta). */
export interface EditSelfCheck {
  ok: boolean;
  avisos: string[];
  planos: number | null;
  cortesEnBeat: string | null;
  intentos: number | null;
  referencia: boolean;
}

const asCount = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

/** La autocomprobación tal como la manda el Mac, recortada a lo que se enseña (`null` si no vale). */
export function cleanSelfCheck(value: unknown): EditSelfCheck | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const avisos = Array.isArray(raw.avisos) ? raw.avisos.filter((a): a is string => typeof a === "string").slice(0, 20).map((a) => a.slice(0, 300)) : [];
  return {
    ok: raw.ok === true,
    avisos,
    planos: asCount(raw.planos),
    cortesEnBeat: typeof raw.cortesEnBeat === "string" ? raw.cortesEnBeat.slice(0, 20) : null,
    intentos: asCount(raw.intentos),
    referencia: raw.referencia === true,
  };
}

/**
 * Guarda el MP4 de un montaje terminado como versión nueva del vídeo, dentro de la transacción de
 * quien cierra la tarea `taskId`, y el vídeo queda «hecho» (si ese montaje sigue siendo el suyo).
 */
export async function saveEdit(
  tx: Tx,
  input: { videoId: number; taskId: number; bytes: Buffer; durationMs: number; selfCheck: EditSelfCheck | null },
  now: Date = new Date(),
): Promise<{ version: number }> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_EDIT_BYTES) throw new HttpError(400, "El vídeo montado no es válido.");
  await lockVideo(tx, input.videoId);
  const [{ last }] = await tx.select({ last: max(edits.version) }).from(edits).where(eq(edits.videoId, input.videoId));
  const version = (last ?? 0) + 1;
  await tx.insert(edits).values({
    videoId: input.videoId,
    version,
    size: input.bytes.length,
    data: input.bytes,
    durationMs: Math.max(1, Math.round(input.durationMs)),
    selfCheck: input.selfCheck,
    taskId: input.taskId,
    createdAt: now,
  });
  await tx
    .update(videos)
    .set({ editStatus: "hecho", editError: null })
    .where(and(eq(videos.id, input.videoId), eq(videos.editTaskId, input.taskId)));
  return { version };
}

/**
 * El montaje de la tarea `taskId` no se pudo hacer: el vídeo lo dice con `reason` (si ese montaje
 * sigue siendo el suyo). Dentro de la transacción de quien cierra la tarea.
 */
export async function failEdit(tx: Tx, videoId: number, taskId: number, reason: string): Promise<void> {
  await lockVideo(tx, videoId);
  await markFailed(tx, videoId, reason, taskId);
}

/** El lote de un vídeo (para `settleBatch` después de cerrar su montaje). */
export async function batchOfVideo(videoId: number): Promise<number | null> {
  const [row] = await getDb().select({ batchId: videos.batchId }).from(videos).where(eq(videos.id, videoId));
  return row?.batchId ?? null;
}

// ───────────────────────── Lo que ven las pantallas ─────────────────────────

export type EditStatus = "none" | "en_cola" | "montando" | "hecho" | "fallido";

export interface EditView {
  status: EditStatus;
  /** Por qué falló el último montaje (apto para la persona), o `null`. */
  error: string | null;
  /** La última versión montada (aunque después falle otro intento), o `null`. */
  latest: { version: number; durationMs: number; size: number; createdAt: Date; selfCheck: EditSelfCheck | null } | null;
  /** Quien mira puede pedir «Montar» / «Volver a montar» (quien lo creó o el dueño, con clip y sin otro en marcha). */
  canStart: boolean;
}

/** El montaje de varios vídeos ya comprobados (`getVideoFor`), por id. `clipReady`: si cada uno tiene clip. */
export async function editViews(user: AuthUser, list: Array<Video & { clipReady: boolean }>): Promise<Map<number, EditView>> {
  const result = new Map<number, EditView>();
  if (list.length === 0) return result;
  const ids = list.map((video) => video.id);
  const latest = await getDb()
    .selectDistinctOn([edits.videoId], {
      videoId: edits.videoId,
      version: edits.version,
      durationMs: edits.durationMs,
      size: edits.size,
      createdAt: edits.createdAt,
      selfCheck: edits.selfCheck,
    })
    .from(edits)
    .where(inArray(edits.videoId, ids))
    .orderBy(edits.videoId, desc(edits.version));
  const latestOf = new Map(latest.map((row) => [row.videoId, row]));
  const tasks = await taskStatusesOf(list.flatMap((video) => (video.editStatus === "en_marcha" && video.editTaskId !== null ? [video.editTaskId] : [])));
  for (const video of list) {
    const last = latestOf.get(video.id);
    const status: EditStatus =
      video.editStatus === "en_marcha"
        ? tasks.get(video.editTaskId ?? 0) === "leased"
          ? "montando"
          : "en_cola"
        : video.editStatus === "hecho" || video.editStatus === "fallido"
          ? video.editStatus
          : "none";
    result.set(video.id, {
      status,
      error: status === "fallido" ? video.editError : null,
      latest: last
        ? { version: last.version, durationMs: last.durationMs, size: last.size, createdAt: last.createdAt, selfCheck: cleanSelfCheck(last.selfCheck) }
        : null,
      canStart: canChooseSong(user, video) && video.clipReady && status !== "en_cola" && status !== "montando",
    });
  }
  return result;
}

/** Los rótulos del montaje de un vídeo que `user` ve (los guardados o los que llevaría) y si los puede cambiar. */
export async function editTextsView(user: AuthUser, video: Video): Promise<{ main: string; cta: string; editable: boolean }> {
  const product = await getProductFor(user, video.productId);
  return { ...editTextsFor(video, product, await latestAnalysisResult(video.id)), editable: canChooseSong(user, video) };
}

/**
 * Cambia los rótulos del montaje (`{ main, cta }`, cada uno de 1 a 200 caracteres): quien creó el
 * vídeo o el dueño (403). Sirven para el siguiente «Montar»; el montaje ya hecho no cambia.
 */
export async function setEditTexts(user: AuthUser, videoId: number, input: { main?: unknown; cta?: unknown }): Promise<{ main: string; cta: string }> {
  const video = await getVideoFor(user, videoId);
  if (!canChooseSong(user, video)) throw new HttpError(403, CANNOT_EDIT_TEXTS);
  const changes: { editMainText?: string; editCtaText?: string } = {};
  if (input.main !== undefined) {
    const main = cleanText(input.main);
    if (main === null) throw new HttpError(400, BAD_TEXT);
    changes.editMainText = main;
  }
  if (input.cta !== undefined) {
    const cta = cleanText(input.cta);
    if (cta === null) throw new HttpError(400, BAD_TEXT);
    changes.editCtaText = cta;
  }
  if (Object.keys(changes).length > 0) await getDb().update(videos).set(changes).where(eq(videos.id, video.id));
  const { main, cta } = await editTextsView(user, { ...video, ...changes });
  return { main, cta };
}

/**
 * El vídeo montado de un vídeo que `user` ve (la última versión, o `version`), entero o el trozo
 * `Range`; con `download`, como adjunto `<producto>-video-<id>-editado.mp4`. Solo se lee de la
 * base de datos el trozo pedido. 404 si no hay.
 */
export async function editVideoResponse(
  user: AuthUser,
  videoId: number,
  rangeHeader: string | null,
  options: { download?: boolean; version?: number | null } = {},
): Promise<Response> {
  const video = await getVideoFor(user, videoId);
  const where =
    options.version != null
      ? and(eq(edits.videoId, video.id), eq(edits.version, options.version))
      : eq(edits.videoId, video.id);
  const db = getDb();
  const [edit] = await db
    .select({ id: edits.id, version: edits.version, size: edits.size })
    .from(edits)
    .where(where)
    .orderBy(desc(edits.version))
    .limit(1);
  if (!edit) throw new HttpError(404, NO_EDIT);
  const common: Record<string, string> = {
    "Accept-Ranges": "bytes",
    // Una versión no cambia nunca de contenido.
    "Cache-Control": "private, max-age=3600",
    ETag: `"edit-${edit.id}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (options.download) {
    const product = await getProductFor(user, video.productId);
    const filename = `${fileSlug(product.name, "producto")}-video-${video.id}-editado.mp4`;
    common["Content-Disposition"] = `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  // La descarga va entera; el reproductor pide trozos.
  const range = options.download ? null : parseRange(rangeHeader, edit.size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...common, "Content-Range": `bytes */${edit.size}` } });
  const start = range?.start ?? 0;
  const length = (range ? range.end + 1 : edit.size) - start;
  const headers: Record<string, string> = { ...common, "Content-Type": "video/mp4", "Content-Length": String(length) };
  const body = streamEdit(edit.id, start, length);
  if (!range) return new Response(body, { status: 200, headers });
  headers["Content-Range"] = `bytes ${start}-${start + length - 1}/${edit.size}`;
  return new Response(body, { status: 206, headers });
}

/** Trozo que se lee de la base de datos de cada vez al mandar un vídeo montado. */
const STREAM_SLICE = 2 * 1024 * 1024;

/** `length` bytes del vídeo montado `editId` desde `start`, leídos de la base de datos a trozos (nunca entero en memoria). */
function streamEdit(editId: number, start: number, length: number): ReadableStream<Uint8Array> {
  let offset = start;
  const end = start + length;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= end) {
        controller.close();
        return;
      }
      const size = Math.min(STREAM_SLICE, end - offset);
      const [slice] = await getDb()
        .select({ data: sql<Buffer>`substring(${edits.data} from ${offset + 1} for ${size})` })
        .from(edits)
        .where(eq(edits.id, editId));
      if (!slice || slice.data.length === 0) {
        controller.error(new Error(NO_EDIT));
        return;
      }
      offset += slice.data.length;
      controller.enqueue(new Uint8Array(slice.data));
    },
  });
}
