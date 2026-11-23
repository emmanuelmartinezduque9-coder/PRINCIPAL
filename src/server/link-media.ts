import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { linkOf } from "@/lib/links";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { macOwnerId } from "@/server/agent-tasks";
import { HttpError } from "@/server/http";
import { detectVideoType } from "@/server/media/detect";
import { MediaError, probeVideo } from "@/server/media/ffmpeg";
import { lastLine, runProgram } from "@/server/media/programs";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile, type TaskFileRules } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";

/**
 * Vídeos de enlaces que necesita el montaje (tabla `link_media`): la referencia de edición y, con
 * «Audio original», la referencia de un vídeo que no guardó su audio. Una fila por enlace,
 * compartida por todos los montajes.
 *
 * 1. **Primero la nube**: yt-dlp en el proceso en segundo plano (TikTok y YouTube suelen dejar).
 * 2. **Si la nube no puede** (Instagram no deja entrar a los servidores), el Mac del dueño, con la
 *    sesión de Brave: tarea `media_fetch` en `agent_tasks`, entregada por trozos como una canción.
 *    Solo la recogen Macs que dicen saber hacerla (`puede: ["enlace_medio"]`, programa 1.4.0).
 * 3. El archivo va al almacén (`enlaces/<id>.<ext>`). Sin almacén no se guarda nada (el montaje
 *    sigue sin la referencia y lo avisa).
 *
 * El montaje no espera nunca de más: si el Mac no responde, monta sin la referencia (ver
 * `montaje-nube.ts`).
 */

export const MEDIA_FETCH_TASK = "media_fetch";
/** Lo más que se deja trabajar a yt-dlp en la nube con un enlace. */
export const CLOUD_FETCH_TIMEOUT_MS = 4 * 60_000;
/** Lo más que pesa un vídeo de enlace (también el que entrega el Mac). */
export const MAX_LINK_MEDIA_BYTES = 300 * 1024 * 1024;
const MAX_ERROR = 500;
/** Los mismos extractores que el programa del Mac (`agente-mac/lib.mjs`). */
export const YT_DLP_EXTRACTORS = "Instagram,TikTok,vm.tiktok,youtube,facebook,facebook:reel";
const TASK_LOST = "Esta tarea ya no es tuya.";
const INCOMPLETE = "El vídeo no ha llegado entero.";
const NO_DETAIL = "El Mac no dio detalles.";

const media = schema.linkMedia;
const agentTasks = schema.agentTasks;
type Row = typeof media.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const taskLost = () => new HttpError(409, TASK_LOST);

/** Argumentos de yt-dlp para el vídeo de `url` en `outPath` (lista; `--` delante del enlace; sin configuración). */
export function cloudYtDlpArgs(url: string, outPath: string): string[] {
  return [
    "--ignore-config", "--use-extractors", YT_DLP_EXTRACTORS,
    "--no-playlist", "--playlist-items", "1", "--max-filesize", "100M",
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
    "-o", outPath, "--", url,
  ];
}

/** La fila del enlace (la crea si no existe). `null` si el enlace no es de un sitio admitido. */
export async function ensureLinkMedia(url: string): Promise<Row | null> {
  const link = linkOf(url);
  if (!link) return null;
  await getDb().insert(media).values({ url: link }).onConflictDoNothing();
  const [row] = await getDb().select().from(media).where(eq(media.url, link));
  return row ?? null;
}

export async function linkMediaById(id: number): Promise<Row | null> {
  const [row] = await getDb().select().from(media).where(eq(media.id, id));
  return row ?? null;
}

export interface FetchDeps {
  store?: ObjectStore | null;
  /** Lanza yt-dlp (para las pruebas). Devuelve si dejó el archivo. */
  runYtDlp?: (args: string[], timeoutMs: number) => Promise<{ ok: boolean; error: string | null }>;
  now?: () => Date;
}

/** yt-dlp de verdad (`YT_DLP` o `yt-dlp` en el PATH), con tope de tiempo. */
async function runYtDlp(args: string[], timeoutMs: number): Promise<{ ok: boolean; error: string | null }> {
  const ran = await runProgram(process.env.YT_DLP || "yt-dlp", args, { timeoutMs });
  if (ran.code === 0) return { ok: true, error: null };
  return { ok: false, error: ran.timedOut ? "yt-dlp tardó demasiado" : (lastLine(ran.stderr) ?? `yt-dlp terminó con código ${ran.code}`) };
}

/** Comprueba el archivo, lo sube al almacén y deja el enlace listo. Devuelve el mensaje si no vale. */
async function storeFile(row: Row, file: string, store: ObjectStore, now: Date): Promise<string | null> {
  const handle = await fs.open(file, "r");
  const head = Buffer.alloc(16);
  try {
    await handle.read(head, 0, 16, 0);
  } finally {
    await handle.close();
  }
  const mime = detectVideoType(head);
  if (!mime) return "Lo que se descargó no es un vídeo.";
  let durationMs: number;
  try {
    durationMs = (await probeVideo(file)).durationMs;
  } catch (error) {
    if (error instanceof MediaError) return "Lo que se descargó no se puede leer.";
    throw error;
  }
  const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
  const key = `enlaces/${row.id}.${ext}`;
  const { size } = await fs.stat(file);
  await store.putFile(key, file, { contentType: mime });
  await getDb()
    .update(media)
    .set({ status: "ready", objectKey: key, mime, size, durationMs, error: null, updatedAt: now })
    .where(eq(media.id, row.id));
  return null;
}

/**
 * Intenta traer el enlace en la nube con yt-dlp (una sola vez por enlace). `true` si quedó listo.
 * Si no, queda apuntado que la nube lo intentó (para pedírselo al Mac).
 */
export async function fetchInCloud(row: Row, deps: FetchDeps = {}): Promise<boolean> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const now = deps.now?.() ?? new Date();
  if (!store || row.status === "ready" || row.cloudTriedAt) return row.status === "ready";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "enlace-"));
  try {
    const file = path.join(dir, "video.mp4");
    const ran = await (deps.runYtDlp ?? runYtDlp)(cloudYtDlpArgs(row.url, file), CLOUD_FETCH_TIMEOUT_MS);
    const exists = await fs.stat(file).then((s) => s.size > 0, () => false);
    const problem = ran.ok && exists ? await storeFile(row, file, store, now) : (ran.error ?? "yt-dlp no dejó el archivo");
    if (problem === null) return true;
    await getDb().update(media).set({ cloudTriedAt: now, error: `nube: ${problem}`.slice(0, MAX_ERROR), updatedAt: now }).where(eq(media.id, row.id));
    return false;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Pide el enlace al Mac del dueño (una tarea viva por enlace). `false` si no hay Mac del dueño
 * (ficha en vigor): entonces el enlace queda fallido para no esperar a nadie.
 */
export async function requestFromMac(row: Row, now: Date = new Date()): Promise<boolean> {
  const ownerId = await macOwnerId();
  if (ownerId === null) {
    await getDb().update(media).set({ status: "failed", error: "Sin Mac del dueño para traer el enlace.", updatedAt: now }).where(eq(media.id, row.id));
    return false;
  }
  await getDb().transaction(async (tx) => {
    const [active] = await tx
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.kind, MEDIA_FETCH_TASK), eq(agentTasks.url, row.url), inArray(agentTasks.status, ["queued", "leased"])));
    const taskId =
      active?.id ??
      (
        await tx
          .insert(agentTasks)
          .values({ kind: MEDIA_FETCH_TASK, url: row.url, createdBy: ownerId, createdAt: now, updatedAt: now })
          .returning({ id: agentTasks.id })
      )[0].id;
    await tx.update(media).set({ agentTaskId: taskId, updatedAt: now }).where(eq(media.id, row.id));
  });
  return true;
}

/** El estado de la tarea del Mac de un enlace: `queued`, `leased`, `done`, `failed` o `null` si no hay. */
export async function macTaskStatus(row: Row): Promise<string | null> {
  if (row.agentTaskId === null) return null;
  const [task] = await getDb().select({ status: agentTasks.status }).from(agentTasks).where(eq(agentTasks.id, row.agentTaskId));
  return task?.status ?? null;
}

/** Baja el vídeo de un enlace listo a `target`. */
export async function downloadLinkMedia(row: Row, target: string, deps: { store?: ObjectStore | null } = {}): Promise<boolean> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  if (!store || row.status !== "ready" || !row.objectKey) return false;
  await store.download(row.objectKey, target);
  return true;
}

/** Guarda el desglose de rea-video (o que no se pudo: no se repite). */
export async function saveBreakdown(id: number, breakdown: unknown | null, now: Date = new Date()): Promise<void> {
  await getDb()
    .update(media)
    .set({ breakdown: breakdown ?? null, breakdownStatus: breakdown ? "done" : "failed", updatedAt: now })
    .where(eq(media.id, id));
}

// ───────────────────────── Protocolo con el Mac ─────────────────────────

/** El archivo que entrega el Mac: un vídeo (MP4, MOV o WebM), como mucho 300 MB. */
const FETCH_RULES: TaskFileRules = {
  maxBytes: MAX_LINK_MEDIA_BYTES,
  accepts: (head) => detectVideoType(head) !== null,
  badType: "El Mac tiene que mandar un vídeo.",
  tooBig: "El vídeo pesa demasiado (máximo 300 MB).",
};

/** Una tarea `media_fetch` tal como se la lleva el Mac. */
export interface ClaimedMediaFetch {
  taskId: number;
  kind: "enlace_medio";
  url: string;
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

/** Reserva la tarea `taskId` si sigue en cola, con una sesión de subida nueva; `null` si otro Mac se la llevó. */
export async function claimMediaFetchTask(taskId: number, queued: SQL | undefined, lease: PgUpdateSetSource<typeof agentTasks>): Promise<ClaimedMediaFetch | null> {
  const claimed = await getDb().transaction(async (tx: Tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MEDIA_FETCH_TASK), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(lease).where(eq(agentTasks.id, task.id));
    const result: ClaimedMediaFetch = { taskId: task.id, kind: "enlace_medio", url: task.url, uploadId, chunkBytes: CHUNK_BYTES, maxBytes: MAX_LINK_MEDIA_BYTES };
    return { task: result, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
}

export function appendMediaFetchChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, MEDIA_FETCH_TASK, uploadId, index, bytes, FETCH_RULES);
}

export type MediaFetchResult = { ok: true; uploadId: string; totalBytes: number } | { ok: false; uploadId: string; error: string };

/**
 * El Mac termina de traer un enlace. Bien: el archivo tiene que haber llegado entero y ser un
 * vídeo; se sube al almacén y el enlace queda listo. Mal: el enlace queda fallido con el detalle.
 * Solo quien tiene la reserva y con su sesión (409). Repetir un final bueno no hace nada.
 */
export async function finishMediaFetchTask(agentId: number, taskId: number, result: MediaFetchResult, deps: FetchDeps = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MEDIA_FETCH_TASK)));
  if (!task || task.agentId !== agentId) throw taskLost();
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased" || task.uploadId !== result.uploadId) throw taskLost();
  const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
    getDb()
      .update(agentTasks)
      .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, result.uploadId)));
  const [row] = await getDb().select().from(media).where(eq(media.url, task.url));
  try {
    if (!result.ok) {
      const detail = (typeof result.error === "string" ? result.error.trim().slice(0, MAX_ERROR) : "") || NO_DETAIL;
      await close({ status: "failed", error: detail });
      if (row && row.status === "pending") await getDb().update(media).set({ status: "failed", error: `Mac: ${detail}`.slice(0, MAX_ERROR), updatedAt: now }).where(eq(media.id, row.id));
      return;
    }
    const file = await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes, MAX_LINK_MEDIA_BYTES);
    if (file === null) throw new HttpError(400, INCOMPLETE);
    const store = deps.store === undefined ? getObjectStore() : deps.store;
    const problem = !row ? "El enlace ya no se necesita." : !store ? "Sin almacén de archivos." : await storeFile(row, file, store, now);
    if (problem) {
      await close({ status: "failed", error: problem });
      if (row && row.status === "pending") await getDb().update(media).set({ status: "failed", error: problem, updatedAt: now }).where(eq(media.id, row.id));
      return;
    }
    await close({ status: "done", error: null });
  } finally {
    await removeSongFile(task.uploadId);
  }
}

/** Cierra como fallida una tarea del Mac (reserva caducada, sin Mac…) y su enlace, si sigue cumpliendo `condition`. */
export async function failMediaFetchTask(task: { id: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  const [before] = await getDb().select({ uploadId: agentTasks.uploadId, url: agentTasks.url }).from(agentTasks).where(eq(agentTasks.id, task.id));
  const [closed] = await getDb()
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(and(eq(agentTasks.id, task.id), condition))
    .returning({ id: agentTasks.id });
  if (!closed) return;
  await removeSongFile(before?.uploadId ?? null);
  if (before) {
    await getDb()
      .update(media)
      .set({ status: "failed", error: `Mac: ${reason}`.slice(0, MAX_ERROR), updatedAt: now })
      .where(and(eq(media.url, before.url), eq(media.status, "pending")));
  }
}
