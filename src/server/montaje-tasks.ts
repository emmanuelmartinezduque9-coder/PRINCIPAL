import fs from "node:fs/promises";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { MONTAJE_TASK } from "@/server/agent-tasks";
import { HttpError } from "@/server/http";
import { readSongFile } from "@/server/songs";
import { detectVideoType } from "@/server/media/detect";
import { MediaError, probeVideo } from "@/server/media/ffmpeg";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile, type TaskFileRules } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";
import { batchOfVideo, cleanSelfCheck, failEdit, MAX_EDIT_BYTES, readReferenceAudio, referenceAudioRouteOf, saveEdit, settleBatch, type EditSpec } from "@/server/videos/edits";

/**
 * El montaje en el Mac, del lado del protocolo del agente (`src/server/agent.ts` llama aquí según
 * el tipo de la tarea): reservar una tarea `montaje` (con su ficha y una sesión de subida nueva en
 * cada reserva, como una canción), recibir el MP4 por trozos, mandar la canción al Mac que la
 * tiene y cerrar la tarea guardando el vídeo montado (`saveEdit`) o su fallo (`failEdit`).
 * La reserva, el latido y los máximos de tiempo son los de `agent.ts`.
 */

/** Lo que ve la persona cuando el Mac no termina a tiempo o no recoge el montaje. */
export const MONTAJE_TOO_SLOW = "El Mac no terminó el montaje a tiempo.";
export const MONTAJE_UNCLAIMED = "El Mac no recogió el montaje.";
const TASK_LOST = "Esta tarea ya no es tuya.";
const INCOMPLETE = "El vídeo montado no ha llegado entero.";
const NOT_A_VIDEO = "El Mac entregó un archivo que no es un vídeo.";
const NO_SONG = "Esta tarea no lleva canción.";
const NO_REFERENCE_AUDIO = "Esta tarea no lleva el audio de la referencia.";
const NO_DETAIL = "El Mac no dio detalles.";
const MAX_ERROR = 500;

const agentTasks = schema.agentTasks;
const taskLost = () => new HttpError(409, TASK_LOST);
const clip = (value: unknown, length: number) => (typeof value === "string" ? value.trim().slice(0, length) : "");

/** El MP4 que entrega el Mac: el primer trozo tiene que ser MP4 y el archivo entero, como mucho 200 MB. */
const EDIT_RULES: TaskFileRules = {
  maxBytes: MAX_EDIT_BYTES,
  accepts: (head) => detectVideoType(head) === "video/mp4",
  badType: "El Mac tiene que mandar un MP4.",
  tooBig: "El vídeo montado pesa demasiado (máximo 200 MB).",
};

/** Una tarea de montaje tal como se la lleva el Mac. */
export interface ClaimedMontaje {
  taskId: number;
  kind: "montaje";
  url: string;
  spec: EditSpec;
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Reserva la tarea de montaje `taskId` si sigue en cola (`queued`), con una sesión de subida nueva
 * (la de una reserva anterior deja de valer y su archivo se borra); `null` si otro Mac se la llevó.
 * `lease` son las columnas de la reserva (las de `agent.ts`).
 */
export async function claimMontajeTask(taskId: number, queued: SQL | undefined, lease: PgUpdateSetSource<typeof agentTasks>): Promise<ClaimedMontaje | null> {
  const claimed = await getDb().transaction(async (tx: Tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url, payload: agentTasks.payload })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MONTAJE_TASK), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(lease).where(eq(agentTasks.id, task.id));
    const result: ClaimedMontaje = {
      taskId: task.id,
      kind: "montaje",
      url: task.url,
      spec: task.payload as EditSpec,
      uploadId,
      chunkBytes: CHUNK_BYTES,
      maxBytes: MAX_EDIT_BYTES,
    };
    return { task: result, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
}

/** Un trozo del MP4 montado, con la sesión de la reserva en curso (quien llama ya comprobó la reserva). */
export function appendMontajeChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, MONTAJE_TASK, uploadId, index, bytes, EDIT_RULES);
}

/** Lo que el Mac dice al terminar un montaje. */
export type MontajeResult =
  | { ok: true; uploadId: string; totalBytes: number; selfCheck?: unknown }
  | { ok: false; uploadId: string; error: string };

/** Lo que ve la persona cuando el montador no pudo: el motivo que dio (es del montador, sin la ficha). */
export const montajeFailure = (detail: string) => `No se pudo montar: ${detail || NO_DETAIL}`;

/**
 * El Mac termina un montaje. Si fue bien, el MP4 tiene que haber llegado entero (`totalBytes`), ser
 * un vídeo que ffprobe lee (su duración se mide aquí) y se guarda como versión nueva del vídeo;
 * repetirlo no hace nada. Si no pudo, el detalle (recortado) queda en la tarea y el vídeo lo dice.
 * Solo quien tiene la reserva y con la sesión de esa reserva (409). El archivo se borra siempre al
 * cerrar. Al terminar, el lote del vídeo puede quedar `montado`.
 */
export async function finishMontajeTask(agentId: number, taskId: number, result: MontajeResult, now: Date = new Date()): Promise<void> {
  // Se mide antes de abrir la transacción (ffprobe tarda); la reserva se comprueba otra vez dentro.
  const [peek] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MONTAJE_TASK)));
  if (!peek || peek.agentId !== agentId || peek.videoId === null) throw taskLost();
  if (peek.status === "done" && result.ok) return;
  if (peek.status !== "leased" || peek.uploadId !== result.uploadId) throw taskLost();
  let measured: { file: string; durationMs: number } | { rejected: string } | null = null;
  if (result.ok) {
    const file = await completeTaskFile(result.uploadId, peek.uploadReceived, result.totalBytes, MAX_EDIT_BYTES);
    if (file === null) throw new HttpError(400, INCOMPLETE);
    try {
      measured = { file, durationMs: (await probeVideo(file)).durationMs };
    } catch (error) {
      if (!(error instanceof MediaError)) throw error;
      measured = { rejected: NOT_A_VIDEO };
    }
  }

  const videoId = peek.videoId;
  const outcome = await getDb().transaction(async (tx): Promise<{ file: string | null; rejected?: string }> => {
    const [task] = await tx.select().from(agentTasks).where(eq(agentTasks.id, taskId)).for("update");
    if (!task || task.agentId !== agentId) throw taskLost();
    if (task.status === "done" && result.ok) return { file: null };
    if (task.status !== "leased" || task.uploadId !== result.uploadId) throw taskLost();
    const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
      tx
        .update(agentTasks)
        .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
        .where(eq(agentTasks.id, task.id));

    if (!result.ok || measured === null || "rejected" in measured) {
      const detail = result.ok ? (measured as { rejected: string }).rejected : clip(result.error, MAX_ERROR);
      await close({ status: "failed", error: detail || NO_DETAIL });
      await failEdit(tx, videoId, task.id, result.ok ? detail : montajeFailure(detail));
      return { file: task.uploadId, rejected: result.ok ? detail : undefined };
    }
    // Lo que se lee es lo que se midió: el archivo no cambia mientras la tarea siga reservada con esta sesión.
    const bytes = await fs.readFile(measured.file);
    await saveEdit(tx, { videoId, taskId: task.id, bytes, durationMs: measured.durationMs, selfCheck: cleanSelfCheck(result.selfCheck) }, now);
    await close({ status: "done", error: null });
    return { file: task.uploadId };
  });
  await removeSongFile(outcome.file);
  await settleBatch(await batchOfVideo(videoId));
  if (outcome.rejected) throw new HttpError(400, outcome.rejected);
}

/**
 * Cierra como fallida una tarea de montaje que sigue cumpliendo `condition` (reserva caducada, cola
 * sin Mac…) y el vídeo lo dice con `reason`. Borra lo que hubiera llegado.
 */
export async function failMontajeTask(task: { id: number; videoId: number }, condition: SQL | undefined, internal: string, reason: string, now: Date): Promise<void> {
  const closed = await getDb().transaction(async (tx) => {
    const [before] = await tx.select({ uploadId: agentTasks.uploadId }).from(agentTasks).where(eq(agentTasks.id, task.id));
    const [row] = await tx
      .update(agentTasks)
      .set({ status: "failed", error: internal, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), condition))
      .returning({ id: agentTasks.id });
    if (!row) return null;
    await failEdit(tx, task.videoId, task.id, reason);
    return { uploadId: before?.uploadId ?? null };
  });
  if (!closed) return;
  await removeSongFile(closed.uploadId);
  await settleBatch(await batchOfVideo(task.videoId));
}

/**
 * La canción de un montaje, para el Mac que tiene reservada la tarea (409 si no la tiene): el
 * archivo entero, con su tipo. 404 si la tarea no lleva canción o la canción ya no existe.
 */
export async function montajeSongResponse(agentId: number, taskId: number): Promise<Response> {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) throw taskLost();
  const db = getDb();
  const [task] = await db
    .select({ payload: agentTasks.payload })
    .from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MONTAJE_TASK), eq(agentTasks.agentId, agentId), eq(agentTasks.status, "leased")));
  if (!task) throw taskLost();
  const songId = (task.payload as EditSpec | null)?.song?.id;
  if (typeof songId !== "number") throw new HttpError(404, NO_SONG);
  const song = await readSongFile(songId);
  if (!song) throw new HttpError(404, "Canción no encontrada.");
  const body = new Uint8Array(song.data);
  return new Response(body, {
    headers: { "Content-Type": song.mime, "Content-Length": String(body.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * El audio de la referencia de un montaje («Audio original»), para el Mac que tiene reservada la
 * tarea (409 si no la tiene, con la misma reserva que la canción). 404 si la ficha no lo lleva por
 * la web o ya no está.
 */
export async function montajeReferenceAudioResponse(agentId: number, taskId: number): Promise<Response> {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) throw taskLost();
  const [task] = await getDb()
    .select({ payload: agentTasks.payload, videoId: agentTasks.videoId })
    .from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MONTAJE_TASK), eq(agentTasks.agentId, agentId), eq(agentTasks.status, "leased")));
  if (!task) throw taskLost();
  const wanted = (task.payload as EditSpec | null)?.referenceAudio;
  if (wanted?.source !== "web" || wanted.url !== referenceAudioRouteOf(taskId) || task.videoId === null) throw new HttpError(404, NO_REFERENCE_AUDIO);
  const audio = await readReferenceAudio(task.videoId);
  if (!audio) throw new HttpError(404, NO_REFERENCE_AUDIO);
  const body = new Uint8Array(audio.data);
  return new Response(body, {
    headers: { "Content-Type": audio.mime, "Content-Length": String(body.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
