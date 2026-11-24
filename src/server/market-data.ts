import fs from "node:fs/promises";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { macOwnerId } from "@/server/agent-tasks";
import { HttpError } from "@/server/http";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile, type TaskFileRules } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";

/**
 * Datos de mercado reales para «Buscar nicho / ángulo / audiencia» (tarea `market_data` del Mac,
 * programa 1.7.0, `puede: ["datos"]`). El Mac abre cada consulta en un navegador sin ventana y
 * trae Amazon del país (resultados, valoraciones, compras del último mes), los anuncios activos de
 * la Biblioteca de Meta, TikTok (si hay sesión) y YouTube (vistas). Se guarda en `product_research.data`.
 */

export const MARKET_TASK = "market_data";
export const MAX_MARKET_BYTES = 3 * 1024 * 1024;
const TASK_LOST = "Esta tarea ya no es tuya.";
const MAX_ERROR = 500;

const agentTasks = schema.agentTasks;
const research = schema.productResearch;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface MarketQuery {
  texto: string;
  anuncios: string;
}

/** Lo que pide la web al Mac. */
export interface MarketSpec {
  pais: string;
  consultas: MarketQuery[];
}

/** Dirección (única por búsqueda) de la tarea: la tienda del país, marcada con la búsqueda. */
export const marketTaskUrl = (researchId: number, country: string) => `https://${country === "IT" ? "www.amazon.it" : country === "US" ? "www.amazon.com" : "www.amazon.de"}/?principal=${researchId}`;

/** Pide los datos al Mac del dueño. `false` si no hay Mac. */
export async function requestMarketData(researchId: number, spec: MarketSpec, now: Date = new Date()): Promise<boolean> {
  const ownerId = await macOwnerId();
  if (ownerId === null) return false;
  const url = marketTaskUrl(researchId, spec.pais);
  await getDb().transaction(async (tx) => {
    const [active] = await tx
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.kind, MARKET_TASK), eq(agentTasks.url, url), inArray(agentTasks.status, ["queued", "leased"])));
    const taskId =
      active?.id ??
      (await tx.insert(agentTasks).values({ kind: MARKET_TASK, url, payload: spec, createdBy: ownerId, createdAt: now, updatedAt: now }).returning({ id: agentTasks.id }))[0].id;
    await tx.update(research).set({ dataTaskId: taskId, updatedAt: now }).where(eq(research.id, researchId));
  });
  return true;
}

export async function marketTaskStatus(taskId: number | null): Promise<{ status: string; error: string | null } | null> {
  if (taskId === null) return null;
  const [task] = await getDb().select({ status: agentTasks.status, error: agentTasks.error }).from(agentTasks).where(eq(agentTasks.id, taskId));
  return task ?? null;
}

// ───────────────────────── Protocolo con el Mac ─────────────────────────

const MARKET_RULES: TaskFileRules = {
  maxBytes: MAX_MARKET_BYTES,
  accepts: (head) => head.subarray(0, 1).toString() === "{",
  badType: "El Mac tiene que mandar los datos en JSON.",
  tooBig: "Los datos pesan demasiado (máximo 3 MB).",
};

export interface ClaimedMarketData {
  taskId: number;
  kind: "datos";
  url: string;
  datos: MarketSpec;
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

export async function claimMarketTask(taskId: number, queued: SQL | undefined, lease: PgUpdateSetSource<typeof agentTasks>): Promise<ClaimedMarketData | null> {
  const claimed = await getDb().transaction(async (tx: Tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url, payload: agentTasks.payload })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MARKET_TASK), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(lease).where(eq(agentTasks.id, task.id));
    const result: ClaimedMarketData = { taskId: task.id, kind: "datos", url: task.url, datos: task.payload as MarketSpec, uploadId, chunkBytes: CHUNK_BYTES, maxBytes: MAX_MARKET_BYTES };
    return { task: result, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
}

export function appendMarketChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, MARKET_TASK, uploadId, index, bytes, MARKET_RULES);
}

export type MarketResult = { ok: true; uploadId: string; totalBytes: number } | { ok: false; uploadId: string; error: string };

/** El Mac entrega los datos: se guardan en la búsqueda. Mal: la tarea queda fallida (la búsqueda la vuelve a pedir). */
export async function finishMarketTask(agentId: number, taskId: number, result: MarketResult, now: Date = new Date()): Promise<void> {
  const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, MARKET_TASK)));
  if (!task || task.agentId !== agentId) throw new HttpError(409, TASK_LOST);
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased" || task.uploadId !== result.uploadId) throw new HttpError(409, TASK_LOST);
  const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
    getDb()
      .update(agentTasks)
      .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, result.uploadId)));
  try {
    if (!result.ok) {
      await close({ status: "failed", error: (typeof result.error === "string" ? result.error : "").slice(0, MAX_ERROR) || "El Mac no dio detalles." });
      return;
    }
    const file = await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes, MAX_MARKET_BYTES);
    if (file === null) throw new HttpError(400, "Los datos no han llegado enteros.");
    let data: unknown = null;
    try {
      data = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object" || !Array.isArray((data as { consultas?: unknown }).consultas)) {
      await close({ status: "failed", error: "Lo que mandó el Mac no son datos de mercado." });
      return;
    }
    await close({ status: "done", error: null });
    await getDb().update(research).set({ data, updatedAt: now }).where(eq(research.dataTaskId, task.id));
  } finally {
    await removeSongFile(task.uploadId);
  }
}

/** Cierra como fallida una tarea de datos (reserva caducada, sin Mac…). */
export async function failMarketTask(task: { id: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  const [before] = await getDb().select({ uploadId: agentTasks.uploadId }).from(agentTasks).where(eq(agentTasks.id, task.id));
  const [closed] = await getDb()
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(and(eq(agentTasks.id, task.id), condition))
    .returning({ id: agentTasks.id });
  if (closed) await removeSongFile(before?.uploadId ?? null);
}

/** Todas las direcciones que salen en los datos (para comprobar las pruebas que cita Claude). */
export function marketUrls(data: unknown): Set<string> {
  const urls = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "url" && typeof inner === "string") urls.add(inner);
        else walk(inner);
      }
    }
  };
  walk(data);
  return urls;
}
