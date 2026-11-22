import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { TASK_TOO_OLD } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { detectAudioType } from "@/server/media/detect";
import { MAX_SONG_BYTES, saveSongFromLink, type SongInfo } from "@/server/songs";
import { CHUNK_BYTES, uploadPath } from "@/server/videos/upload";

/**
 * Canciones por enlace («Pegar enlace» en Canciones): el Mac del dueño descarga el audio como MP3
 * y lo entrega por trozos, como la referencia de un vídeo, pero sin vídeo: la sesión de subida es
 * la propia tarea (`agent_tasks.upload_id`, nueva en cada reserva, y `upload_received`). El
 * archivo se escribe en la carpeta temporal de subidas (la limpieza de 24 h de las subidas también
 * lo alcanza) y, al terminar, se guarda como canción (`saveSongFromLink`) y se borra.
 *
 * El protocolo (reserva, latido, máximos de tiempo, ficha) es el de `src/server/agent.ts`, que
 * llama aquí según el tipo de la tarea. Este módulo no importa `agent.ts`.
 */

export const SONG_TASK = "song_download";
/** Lo que se sigue enseñando de un enlace ya terminado (fallido o hecho). */
const SHOWN_MS = 24 * 60 * 60_000;
const MAX_ERROR = 500;

/** Lo que ve el dueño cuando el Mac no consigue traer la canción. Nunca el detalle técnico. */
export const SONG_LINK_FAILED = "No se pudo descargar la canción.";
export const SONG_LINK_TOO_SLOW = "El Mac no trajo la canción a tiempo.";

const TASK_LOST = "Esta tarea ya no es tuya.";
const BAD_CHUNK = "Trozo no válido.";
const MISSING_CHUNKS = "Faltan trozos anteriores.";
const TOO_BIG = "La canción pesa demasiado (máximo 25 MB).";
const NOT_MP3 = "El Mac tiene que mandar un MP3.";
const FILE_GONE = "La subida se ha interrumpido.";
const INCOMPLETE = "La canción no ha llegado entera.";
const NO_DETAIL = "El Mac no dio detalles.";

const agentTasks = schema.agentTasks;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const taskLost = () => new HttpError(409, TASK_LOST);
const clip = (value: unknown, length: number) => (typeof value === "string" ? value.trim().slice(0, length) : "");

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

/** Borra el archivo de la subida propia de una tarea (canción o montaje), si el identificador tiene la forma de una. */
export async function removeSongFile(uploadId: string | null): Promise<void> {
  if (!uploadId) return;
  let file: string;
  try {
    file = uploadPath(uploadId);
  } catch {
    return;
  }
  await fs.rm(file, { force: true });
}

/**
 * Abre la sesión de subida propia de una reserva (canción o montaje), dentro de la transacción que reserva la tarea (ya
 * bloqueada): un identificador nuevo y cero trozos. Devuelve el nuevo y el de la reserva anterior,
 * cuyo archivo hay que borrar al confirmar.
 */
export async function openSongUpload(tx: Tx, taskId: number): Promise<{ uploadId: string; previous: string | null }> {
  const [task] = await tx.select({ uploadId: agentTasks.uploadId }).from(agentTasks).where(eq(agentTasks.id, taskId));
  const uploadId = crypto.randomBytes(24).toString("base64url");
  await tx.update(agentTasks).set({ uploadId, uploadReceived: 0 }).where(eq(agentTasks.id, taskId));
  return { uploadId, previous: task?.uploadId ?? null };
}

/** Lo que se exige al archivo que entrega una tarea por su subida propia. */
export interface TaskFileRules {
  /** Tamaño máximo del archivo entero. */
  maxBytes: number;
  /** Si los primeros bytes son del tipo que se espera. */
  accepts: (head: Buffer) => boolean;
  /** Mensajes (400) si no lo son o si pasa del máximo. */
  badType: string;
  tooBig: string;
}

const SONG_RULES: TaskFileRules = {
  maxBytes: MAX_SONG_BYTES,
  accepts: (head) => detectAudioType(head) === "audio/mpeg",
  badType: NOT_MP3,
  tooBig: TOO_BIG,
};

/**
 * Añade el trozo `index` al archivo de una tarea con subida propia (canción o montaje), con la
 * sesión `uploadId` de su reserva en curso (quien llama ya comprobó quién la tiene y prolongó la
 * reserva). Con la tarea bloqueada: el trozo que toca se escribe; uno ya recibido responde sin
 * escribir; uno adelantado, 409. El primero tiene que ser del tipo esperado (`rules.accepts`);
 * ninguno pasa del máximo.
 */
export async function appendTaskFileChunk(
  taskId: number,
  kind: string,
  uploadId: string,
  index: number,
  bytes: Buffer,
  rules: TaskFileRules,
): Promise<{ received: number }> {
  const maxChunks = Math.ceil(rules.maxBytes / CHUNK_BYTES);
  return getDb().transaction(async (tx) => {
    const [task] = await tx
      .select({ received: agentTasks.uploadReceived })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, kind), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, uploadId)))
      .for("update");
    if (!task) throw taskLost();
    if (!Number.isSafeInteger(index) || index < 0) throw new HttpError(400, BAD_CHUNK);
    if (index >= maxChunks) throw new HttpError(400, rules.tooBig);
    if (index < task.received) return { received: task.received };
    if (index > task.received) throw new HttpError(409, MISSING_CHUNKS);
    if (bytes.length === 0 || bytes.length > CHUNK_BYTES) throw new HttpError(400, BAD_CHUNK);

    const file = uploadPath(uploadId);
    if (index === 0) {
      if (!rules.accepts(bytes.subarray(0, 16))) throw new HttpError(400, rules.badType);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, bytes, { mode: 0o600 });
    } else {
      const offset = index * CHUNK_BYTES;
      const size = await fileSize(file);
      if (size === null) throw new HttpError(410, FILE_GONE);
      // Un trozo anterior más corto era el último: detrás no cabe otro.
      if (size < offset) throw new HttpError(400, BAD_CHUNK);
      if (size > offset) await fs.truncate(file, offset);
      await fs.appendFile(file, bytes);
    }
    await tx.update(agentTasks).set({ uploadReceived: index + 1 }).where(eq(agentTasks.id, taskId));
    return { received: index + 1 };
  });
}

/** Un trozo de la canción de una tarea (`appendTaskFileChunk` con las reglas de una canción: MP3, 25 MB). */
export function appendSongChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, SONG_TASK, uploadId, index, bytes, SONG_RULES);
}

/**
 * Si el archivo de la sesión `uploadId` llegó entero: `expected` bytes (entre 1 y `maxBytes`), en
 * los trozos que tocan, y con ese tamaño en disco. Devuelve la ruta del archivo o `null`.
 */
export async function completeTaskFile(uploadId: string, received: number, expected: unknown, maxBytes: number): Promise<string | null> {
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected <= 0 || expected > maxBytes) return null;
  const file = uploadPath(uploadId);
  if (received < Math.ceil(expected / CHUNK_BYTES) || (await fileSize(file)) !== expected) return null;
  return file;
}

/** Lo que el Mac dice al terminar una canción. */
export type SongTaskResult =
  | { ok: true; uploadId: string; totalBytes: number; title?: string }
  | { ok: false; uploadId: string; error: string };

/**
 * El Mac termina la tarea de una canción. Si fue bien, el archivo tiene que haber llegado entero
 * (`totalBytes`) y se guarda como canción, con el título que dio yt-dlp y sin drop; repetirlo no
 * hace nada. Un archivo que no es audio deja la tarea fallida (400). Si no pudo, el detalle
 * (recortado) queda en la tarea. Solo quien tiene la reserva y con la sesión de esa reserva (409).
 * El archivo se borra siempre al cerrar.
 */
export async function finishSongTask(agentId: number, taskId: number, result: SongTaskResult, now: Date = new Date()): Promise<void> {
  const outcome = await getDb().transaction(async (tx): Promise<{ file: string | null; rejected?: string }> => {
    const [task] = await tx.select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, SONG_TASK))).for("update");
    if (!task || task.agentId !== agentId) throw taskLost();
    if (task.status === "done" && result.ok) return { file: null };
    if (task.status !== "leased" || task.uploadId !== result.uploadId) throw taskLost();
    const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
      tx
        .update(agentTasks)
        .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
        .where(eq(agentTasks.id, task.id));

    if (!result.ok) {
      await close({ status: "failed", error: clip(result.error, MAX_ERROR) || NO_DETAIL });
      return { file: task.uploadId };
    }

    const file = await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes, MAX_SONG_BYTES);
    if (file === null) throw new HttpError(400, INCOMPLETE);
    const owner = await getActiveUser(task.createdBy);
    if (owner?.role !== "dueno") throw taskLost();
    let song: SongInfo;
    try {
      ({ song } = await saveSongFromLink(owner, await fs.readFile(file), result.title, tx));
    } catch (error) {
      // No es audio (o pesa de más): la tarea falla con el motivo; reintentar no lo arregla.
      if (error instanceof HttpError && (error.status === 400 || error.status === 413)) {
        await close({ status: "failed", error: clip(error.message, MAX_ERROR) });
        return { file: task.uploadId, rejected: error.message };
      }
      throw error;
    }
    await close({ status: "done", songId: song.id, error: null });
    return { file: task.uploadId };
  });
  await removeSongFile(outcome.file);
  if (outcome.rejected) throw new HttpError(400, outcome.rejected);
}

// ───────────────────────── Lo que ve el dueño ─────────────────────────

/** Un enlace de canción tal como lo enseña «Canciones». */
export interface SongLink {
  id: number;
  url: string;
  /** `queued`: esperando al Mac; `downloading`: un Mac lo tiene; `failed`: no se pudo; `done`: ya es la canción `songId`. */
  status: "queued" | "downloading" | "failed" | "done";
  /** Por qué falló, apto para el dueño; `null` si no ha fallado. */
  error: string | null;
  /** La canción que trajo (con `done`); `null` si aún no, o si se borró. */
  songId: number | null;
  createdAt: Date;
}

const STATUS: Record<string, SongLink["status"]> = { queued: "queued", leased: "downloading", failed: "failed", done: "done" };

/**
 * Los enlaces de canción del dueño: los que esperan o se están descargando y los que terminaron
 * (bien o mal) en las últimas 24 horas, en el orden en que se pegaron. Para otra persona, ninguno.
 */
export async function listSongLinks(user: AuthUser, now: Date = new Date()): Promise<SongLink[]> {
  if (user.role !== "dueno") return [];
  const rows = await getDb()
    .select({
      id: agentTasks.id,
      url: agentTasks.url,
      status: agentTasks.status,
      error: agentTasks.error,
      songId: agentTasks.songId,
      createdAt: agentTasks.createdAt,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.kind, SONG_TASK),
        eq(agentTasks.createdBy, user.id),
        or(inArray(agentTasks.status, ["queued", "leased"]), gte(agentTasks.updatedAt, new Date(now.getTime() - SHOWN_MS))),
      ),
    )
    .orderBy(asc(agentTasks.id));
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    status: STATUS[row.status],
    error: row.status === "failed" ? (row.error === TASK_TOO_OLD ? SONG_LINK_TOO_SLOW : SONG_LINK_FAILED) : null,
    songId: row.status === "done" ? row.songId : null,
    createdAt: row.createdAt,
  }));
}

/** Quita de la lista un enlace de canción que ya terminó (fallido o hecho). Solo el dueño; si no, 404. */
export async function dismissSongLink(user: AuthUser, taskId: number): Promise<void> {
  if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const removed =
    Number.isSafeInteger(taskId) && taskId > 0
      ? await getDb()
          .delete(agentTasks)
          .where(
            and(
              eq(agentTasks.id, taskId),
              eq(agentTasks.kind, SONG_TASK),
              eq(agentTasks.createdBy, user.id),
              inArray(agentTasks.status, ["failed", "done"]),
            ),
          )
          .returning({ id: agentTasks.id })
      : [];
  if (removed.length === 0) throw new HttpError(404, "Enlace no encontrado.");
}
