import { and, eq, inArray, type SQL } from "drizzle-orm";
import fs from "node:fs/promises";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { macOwnerId } from "@/server/agent-tasks";
import { HttpError } from "@/server/http";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile, type TaskFileRules } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";

/**
 * Perfiles de Instagram y TikTok (tabla `link_profiles`) que lee el Mac del dueño para el alta de
 * productos: tarea `profile_fetch`, que solo recogen Macs que dicen `puede: ["perfil"]` (1.5.0).
 * El Mac entrega un JSON (por trozos, como una canción) con la cabecera del perfil, sus enlaces y
 * sus reels con las vistas. La nube nunca entra en Instagram.
 */

export const PROFILE_TASK = "profile_fetch";
/** Lo más que pesa el JSON de un perfil. */
export const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
/** Veces que se vuelve a pedir un perfil que el Mac no pudo leer, antes de darlo por fallido. */
export const MAX_PROFILE_FAILURES = 6;
const MAX_ERROR = 500;
const TASK_LOST = "Esta tarea ya no es tuya.";

const profiles = schema.linkProfiles;
const agentTasks = schema.agentTasks;
type Row = typeof profiles.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Lo que trae el Mac de un perfil. */
export interface ProfileData {
  red: "instagram" | "tiktok";
  usuario: string;
  cabecera: string;
  descripcion: string | null;
  enlaces: string[];
  reels: Array<{ url: string; vistas: number | null; texto: string | null; miniatura: string | null }>;
}

const str = (value: unknown, max: number): string | null => (typeof value === "string" ? value.slice(0, max) : null);
const https = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

/** Comprueba y limpia el JSON del Mac; `null` si no tiene la forma de un perfil. */
export function profileDataOf(raw: unknown): ProfileData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.red !== "instagram" && r.red !== "tiktok") return null;
  if (!Array.isArray(r.reels)) return null;
  const reels = r.reels
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({
      url: https(x.url),
      vistas: typeof x.vistas === "number" && Number.isSafeInteger(x.vistas) && x.vistas >= 0 ? x.vistas : null,
      texto: str(x.texto, 1000),
      miniatura: https(x.miniatura),
    }))
    .filter((x): x is ProfileData["reels"][number] & { url: string } => x.url !== null)
    .slice(0, 30);
  return {
    red: r.red,
    usuario: str(r.usuario, 60) ?? "",
    cabecera: str(r.cabecera, 2000) ?? "",
    descripcion: str(r.descripcion, 2000),
    enlaces: (Array.isArray(r.enlaces) ? r.enlaces : []).map(https).filter((x): x is string => x !== null).slice(0, 5),
    reels,
  };
}

/** Los reels que merece la pena mirar: los más vistos (o los primeros si no hay vistas). */
export function topReels(data: ProfileData, count: number): ProfileData["reels"] {
  const withViews = data.reels.filter((r) => r.vistas !== null);
  const ordered = withViews.length >= Math.min(count, data.reels.length) ? [...data.reels].sort((a, b) => (b.vistas ?? -1) - (a.vistas ?? -1)) : data.reels;
  return ordered.slice(0, count);
}

export async function ensureLinkProfile(url: string): Promise<Row> {
  await getDb().insert(profiles).values({ url }).onConflictDoNothing();
  const [row] = await getDb().select().from(profiles).where(eq(profiles.url, url));
  return row;
}

/** Vuelve a leer un perfil la próxima vez (al pulsar «Volver a analizar»). */
export async function resetLinkProfile(url: string): Promise<void> {
  await getDb().update(profiles).set({ status: "pending", failures: 0, error: null, agentTaskId: null, updatedAt: new Date() }).where(eq(profiles.url, url));
}

export async function linkProfileById(id: number): Promise<Row | null> {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.id, id));
  return row ?? null;
}

/** El estado de la tarea del Mac del perfil: `queued`, `leased`, `done`, `failed` o `null`. */
export async function profileTaskStatus(row: Row): Promise<string | null> {
  if (row.agentTaskId === null) return null;
  const [task] = await getDb().select({ status: agentTasks.status }).from(agentTasks).where(eq(agentTasks.id, row.agentTaskId));
  return task?.status ?? null;
}

/**
 * Pide el perfil al Mac del dueño (una tarea viva por perfil). `false` si no hay Mac del dueño.
 * Un perfil fallido vuelve a `pending` para pedirse otra vez (hasta `MAX_PROFILE_FAILURES`).
 */
export async function requestProfileFromMac(row: Row, now: Date = new Date()): Promise<boolean> {
  const ownerId = await macOwnerId();
  if (ownerId === null) return false;
  await getDb().transaction(async (tx) => {
    const [active] = await tx
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.kind, PROFILE_TASK), eq(agentTasks.url, row.url), inArray(agentTasks.status, ["queued", "leased"])));
    const taskId =
      active?.id ??
      (await tx.insert(agentTasks).values({ kind: PROFILE_TASK, url: row.url, createdBy: ownerId, createdAt: now, updatedAt: now }).returning({ id: agentTasks.id }))[0].id;
    await tx.update(profiles).set({ agentTaskId: taskId, status: "pending", updatedAt: now }).where(eq(profiles.id, row.id));
  });
  return true;
}

// ───────────────────────── Protocolo con el Mac ─────────────────────────

const PROFILE_RULES: TaskFileRules = {
  maxBytes: MAX_PROFILE_BYTES,
  accepts: (head) => head.subarray(0, 1).toString() === "{",
  badType: "El Mac tiene que mandar el perfil en JSON.",
  tooBig: "El perfil pesa demasiado (máximo 2 MB).",
};

export interface ClaimedProfileFetch {
  taskId: number;
  kind: "perfil";
  url: string;
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

/** Reserva la tarea si sigue en cola, con una sesión de subida nueva; `null` si otro Mac se la llevó. */
export async function claimProfileTask(taskId: number, queued: SQL | undefined, lease: PgUpdateSetSource<typeof agentTasks>): Promise<ClaimedProfileFetch | null> {
  const claimed = await getDb().transaction(async (tx: Tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, PROFILE_TASK), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(lease).where(eq(agentTasks.id, task.id));
    const result: ClaimedProfileFetch = { taskId: task.id, kind: "perfil", url: task.url, uploadId, chunkBytes: CHUNK_BYTES, maxBytes: MAX_PROFILE_BYTES };
    return { task: result, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
}

export function appendProfileChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, PROFILE_TASK, uploadId, index, bytes, PROFILE_RULES);
}

export type ProfileFetchResult = { ok: true; uploadId: string; totalBytes: number } | { ok: false; uploadId: string; error: string };

/** El Mac termina de leer un perfil: bien, se guarda el JSON; mal, el perfil queda fallido con el motivo. */
export async function finishProfileTask(agentId: number, taskId: number, result: ProfileFetchResult, now: Date = new Date()): Promise<void> {
  const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, PROFILE_TASK)));
  if (!task || task.agentId !== agentId) throw new HttpError(409, TASK_LOST);
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased" || task.uploadId !== result.uploadId) throw new HttpError(409, TASK_LOST);
  const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
    getDb()
      .update(agentTasks)
      .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, result.uploadId)));
  const fail = async (detail: string) => {
    await close({ status: "failed", error: detail });
    await markFailed(task.url, detail, now);
  };
  try {
    if (!result.ok) {
      const detail = (typeof result.error === "string" ? result.error.trim().slice(0, MAX_ERROR) : "") || "El Mac no dio detalles.";
      return await fail(detail);
    }
    const file = await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes, MAX_PROFILE_BYTES);
    if (file === null) throw new HttpError(400, "El perfil no ha llegado entero.");
    let data: ProfileData | null = null;
    try {
      data = profileDataOf(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      data = null;
    }
    if (!data) return await fail("Lo que mandó el Mac no es un perfil.");
    await close({ status: "done", error: null });
    await getDb().update(profiles).set({ status: "ready", data, error: null, updatedAt: now }).where(eq(profiles.url, task.url));
  } finally {
    await removeSongFile(task.uploadId);
  }
}

async function markFailed(url: string, detail: string, now: Date): Promise<void> {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.url, url));
  if (!row) return;
  await getDb()
    .update(profiles)
    .set({ status: "failed", error: detail.slice(0, MAX_ERROR), failures: row.failures + 1, updatedAt: now })
    .where(eq(profiles.id, row.id));
}

/** Cierra como fallida una tarea de perfil (reserva caducada, sin Mac…). */
export async function failProfileTask(task: { id: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  const [before] = await getDb().select({ uploadId: agentTasks.uploadId, url: agentTasks.url }).from(agentTasks).where(eq(agentTasks.id, task.id));
  const [closed] = await getDb()
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(and(eq(agentTasks.id, task.id), condition))
    .returning({ id: agentTasks.id });
  if (!closed) return;
  await removeSongFile(before?.uploadId ?? null);
  if (before) await markFailed(before.url, `Mac: ${reason}`, now);
}
