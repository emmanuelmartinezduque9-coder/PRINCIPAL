import { and, eq, inArray, type SQL } from "drizzle-orm";
import fs from "node:fs/promises";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { macOwnerId } from "@/server/agent-tasks";
import { HttpError } from "@/server/http";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile, type TaskFileRules } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";

/**
 * Búsquedas en Pinterest (tabla `pinterest_searches`). La nube busca directamente en el buscador
 * de pines de Pinterest (la misma petición que hace su web, sin sesión). Si Pinterest no la deja
 * (bloqueo, captcha, respuesta rara), la consulta se pide al Mac del dueño: tarea
 * `pinterest_search`, que solo recogen Macs que dicen `puede: ["pinterest"]` (agente 1.6.0). El
 * Mac hace la misma petición desde su conexión y entrega la respuesta tal cual (JSON, por trozos
 * como un perfil); aquí se lee con el mismo `candidatesOf`.
 */

export const PINTEREST_TASK = "pinterest_search";
/** Lo más que pesa la respuesta de Pinterest que entrega el Mac. */
export const MAX_SEARCH_BYTES = 6 * 1024 * 1024;
/** Una búsqueda guardada vale una semana; después se vuelve a pedir. */
export const SEARCH_TTL_MS = 7 * 24 * 60 * 60_000;
/** Veces que el Mac puede fallar una consulta antes de darla por fallida. */
export const MAX_SEARCH_FAILURES = 3;
const PAGE_SIZE = 25;
const MAX_ERROR = 500;
const TASK_LOST = "Esta tarea ya no es tuya.";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const searches = schema.pinterestSearches;
const agentTasks = schema.agentTasks;
type Row = typeof searches.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Un pin candidato: la foto original, una miniatura para mirarla y lo poco que dice Pinterest. */
export interface PinCandidate {
  pinId: string;
  /** La imagen a tamaño original (i.pinimg.com/originals/...). */
  imageUrl: string;
  /** Miniatura (474 px de ancho) para que Claude la mire. */
  thumbUrl: string;
  /** Una versión intermedia (736 px) por si la original no baja. */
  mediumUrl: string | null;
  width: number | null;
  height: number | null;
  title: string;
}

/** Pinterest no dejó buscar desde aquí (bloqueo, captcha, otra respuesta). */
export class PinterestBlockedError extends Error {}

const PINIMG = /^https:\/\/i\.pinimg\.com\//;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Normaliza una consulta para guardarla una sola vez (espacios y mayúsculas). */
export const normalizeQuery = (query: string) => query.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200);

/** La dirección del buscador de pines (la misma que pide la web de Pinterest con «Buscar»). */
export function pinterestSearchUrl(query: string): string {
  const data = JSON.stringify({ options: { query, scope: "pins", page_size: PAGE_SIZE, rs: "typed" }, context: {} });
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  return `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}`;
}

/** Las cabeceras con las que se pide (las de la web de Pinterest). */
export const PINTEREST_HEADERS: Record<string, string> = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8,es;q=0.7",
  "X-Requested-With": "XMLHttpRequest",
  "X-Pinterest-PWS-Handler": "www/search/[scope].js",
  "User-Agent": USER_AGENT,
};

/**
 * Los pines de foto de una respuesta del buscador (sin vídeos, sin anuncios, sin «ideas» ni
 * colecciones), con sus direcciones de i.pinimg.com. Lanza `PinterestBlockedError` si no tiene la
 * forma de una respuesta del buscador.
 */
export function candidatesOf(raw: unknown): PinCandidate[] {
  const data = (raw as { resource_response?: { data?: unknown } } | null)?.resource_response?.data;
  const results = Array.isArray(data) ? data : Array.isArray((data as { results?: unknown })?.results) ? (data as { results: unknown[] }).results : null;
  if (!results) throw new PinterestBlockedError("Pinterest no devolvió resultados de búsqueda.");
  const out: PinCandidate[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const pin = item as Record<string, unknown>;
    if (pin.type !== "pin" || pin.is_promoted === true || pin.videos || pin.story_pin_data) continue;
    const images = (pin.images ?? {}) as Record<string, { url?: unknown; width?: unknown; height?: unknown }>;
    const orig = str(images.orig?.url);
    const thumb = str(images["474x"]?.url) || str(images["236x"]?.url);
    if (!PINIMG.test(orig) || !PINIMG.test(thumb)) continue;
    if (/\.gif($|\?)/i.test(orig) || seen.has(orig)) continue;
    seen.add(orig);
    const medium = str(images["736x"]?.url);
    out.push({
      pinId: str(pin.id).slice(0, 100),
      imageUrl: orig,
      thumbUrl: thumb,
      mediumUrl: PINIMG.test(medium) ? medium : null,
      width: num(images.orig?.width),
      height: num(images.orig?.height),
      title: (str(pin.grid_title) || str(pin.title) || str(pin.description)).replace(/\s+/g, " ").trim().slice(0, 160),
    });
  }
  return out;
}

/** Busca desde aquí (la nube). `PinterestBlockedError` si Pinterest no deja. */
export async function searchFromServer(query: string, fetchImpl: typeof fetch = fetch): Promise<PinCandidate[]> {
  let response: Response;
  try {
    response = await fetchImpl(pinterestSearchUrl(query), { headers: PINTEREST_HEADERS, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new PinterestBlockedError(`Sin respuesta de Pinterest: ${error instanceof Error ? error.message : "error"}`);
  }
  if (!response.ok) throw new PinterestBlockedError(`Pinterest respondió ${response.status}.`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new PinterestBlockedError("Pinterest no respondió con datos de búsqueda.");
  }
  return candidatesOf(json);
}

// ───────────────────────── Caché y puente con el Mac ─────────────────────────

export type SearchState =
  | { status: "ready"; candidates: PinCandidate[]; via: "servidor" | "mac" }
  | { status: "waiting_mac" }
  | { status: "failed"; error: string };

async function rowOf(query: string): Promise<Row | null> {
  const [row] = await getDb().select().from(searches).where(eq(searches.query, query));
  return row ?? null;
}

async function saveReady(query: string, candidates: PinCandidate[], via: "servidor" | "mac", now: Date): Promise<void> {
  await getDb()
    .insert(searches)
    .values({ query, status: "ready", via, results: candidates, error: null, failures: 0, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: searches.query, set: { status: "ready", via, results: candidates, error: null, failures: 0, updatedAt: now } });
}

/**
 * Los pines de una consulta: los guardados (de menos de una semana); si no, los busca la nube; y
 * si Pinterest no la deja, se piden al Mac del dueño (`waiting_mac`: el seguimiento vuelve cuando
 * el Mac contesta). Sin Mac del dueño, o con el Mac fallando varias veces, `failed`.
 */
export async function searchPins(query: string, deps: { fetch?: typeof fetch; now?: Date } = {}): Promise<SearchState> {
  const now = deps.now ?? new Date();
  const key = normalizeQuery(query);
  const row = await rowOf(key);
  if (row?.status === "ready" && Array.isArray(row.results) && now.getTime() - row.updatedAt.getTime() < SEARCH_TTL_MS) {
    return { status: "ready", candidates: row.results as PinCandidate[], via: row.via === "mac" ? "mac" : "servidor" };
  }
  if (row?.status === "pending" && row.agentTaskId !== null) {
    const [task] = await getDb().select({ status: agentTasks.status }).from(agentTasks).where(eq(agentTasks.id, row.agentTaskId));
    if (task && (task.status === "queued" || task.status === "leased")) return { status: "waiting_mac" };
  }
  if (row?.status === "failed" && row.failures >= MAX_SEARCH_FAILURES) return { status: "failed", error: row.error ?? "Pinterest no respondió." };
  try {
    const candidates = await searchFromServer(key, deps.fetch);
    await saveReady(key, candidates, "servidor", now);
    return { status: "ready", candidates, via: "servidor" };
  } catch (error) {
    if (!(error instanceof PinterestBlockedError)) throw error;
    console.warn(`[pinterest] La nube no pudo buscar «${key}» (${error.message}): se pide al Mac.`);
    const asked = await requestSearchFromMac(key, now);
    if (!asked) {
      const message = `Pinterest no deja buscar a la nube (${error.message}) y no hay Mac del dueño conectado a la web.`;
      await getDb()
        .insert(searches)
        .values({ query: key, status: "failed", error: message, failures: MAX_SEARCH_FAILURES, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: searches.query, set: { status: "failed", error: message, failures: MAX_SEARCH_FAILURES, updatedAt: now } });
      return { status: "failed", error: message };
    }
    return { status: "waiting_mac" };
  }
}

/** Pide la consulta al Mac del dueño (una tarea viva por consulta). `false` si no hay Mac del dueño. */
export async function requestSearchFromMac(query: string, now: Date = new Date()): Promise<boolean> {
  const ownerId = await macOwnerId();
  if (ownerId === null) return false;
  const url = pinterestSearchUrl(query);
  await getDb().transaction(async (tx) => {
    const [active] = await tx
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.kind, PINTEREST_TASK), eq(agentTasks.url, url), inArray(agentTasks.status, ["queued", "leased"])));
    const taskId =
      active?.id ??
      (await tx.insert(agentTasks).values({ kind: PINTEREST_TASK, url, createdBy: ownerId, createdAt: now, updatedAt: now }).returning({ id: agentTasks.id }))[0].id;
    await tx
      .insert(searches)
      .values({ query, status: "pending", agentTaskId: taskId, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: searches.query, set: { status: "pending", agentTaskId: taskId, updatedAt: now } });
  });
  return true;
}

/** La consulta de una dirección del buscador (la que lleva la tarea del Mac). */
export function queryOfSearchUrl(url: string): string | null {
  try {
    const data = JSON.parse(new URL(url).searchParams.get("data") ?? "null") as { options?: { query?: unknown } } | null;
    return typeof data?.options?.query === "string" ? data.options.query : null;
  } catch {
    return null;
  }
}

// ───────────────────────── Protocolo con el Mac ─────────────────────────

const SEARCH_RULES: TaskFileRules = {
  maxBytes: MAX_SEARCH_BYTES,
  accepts: (head) => head.subarray(0, 1).toString() === "{",
  badType: "El Mac tiene que mandar la respuesta de Pinterest en JSON.",
  tooBig: "La respuesta de Pinterest pesa demasiado (máximo 6 MB).",
};

export interface ClaimedPinterestSearch {
  taskId: number;
  kind: "pinterest";
  /** La dirección del buscador que hay que pedir, con las cabeceras de `headers`. */
  url: string;
  headers: Record<string, string>;
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

/** Reserva la tarea si sigue en cola, con una sesión de subida nueva; `null` si otro Mac se la llevó. */
export async function claimPinterestTask(
  taskId: number,
  queued: SQL | undefined,
  lease: PgUpdateSetSource<typeof agentTasks>,
): Promise<ClaimedPinterestSearch | null> {
  const claimed = await getDb().transaction(async (tx: Tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, PINTEREST_TASK), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(lease).where(eq(agentTasks.id, task.id));
    const result: ClaimedPinterestSearch = {
      taskId: task.id,
      kind: "pinterest",
      url: task.url,
      headers: PINTEREST_HEADERS,
      uploadId,
      chunkBytes: CHUNK_BYTES,
      maxBytes: MAX_SEARCH_BYTES,
    };
    return { task: result, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
}

export function appendPinterestChunk(taskId: number, uploadId: string, index: number, bytes: Buffer): Promise<{ received: number }> {
  return appendTaskFileChunk(taskId, PINTEREST_TASK, uploadId, index, bytes, SEARCH_RULES);
}

export type PinterestSearchResult = { ok: true; uploadId: string; totalBytes: number } | { ok: false; uploadId: string; error: string };

/** El Mac termina una búsqueda: bien, se guardan los pines; mal, la consulta suma un fallo con el motivo. */
export async function finishPinterestTask(agentId: number, taskId: number, result: PinterestSearchResult, now: Date = new Date()): Promise<void> {
  const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, PINTEREST_TASK)));
  if (!task || task.agentId !== agentId) throw new HttpError(409, TASK_LOST);
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased" || task.uploadId !== result.uploadId) throw new HttpError(409, TASK_LOST);
  const query = normalizeQuery(queryOfSearchUrl(task.url) ?? "");
  const close = (changes: Partial<typeof agentTasks.$inferInsert>) =>
    getDb()
      .update(agentTasks)
      .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, result.uploadId)));
  const fail = async (detail: string) => {
    await close({ status: "failed", error: detail });
    await markFailed(query, detail, now);
  };
  try {
    if (!result.ok) {
      const detail = (typeof result.error === "string" ? result.error.trim().slice(0, MAX_ERROR) : "") || "El Mac no dio detalles.";
      return await fail(detail);
    }
    const file = await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes, MAX_SEARCH_BYTES);
    if (file === null) throw new HttpError(400, "La respuesta de Pinterest no ha llegado entera.");
    let candidates: PinCandidate[] | null = null;
    try {
      candidates = candidatesOf(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      candidates = null;
    }
    if (!candidates) return await fail("Lo que mandó el Mac no es una respuesta del buscador de Pinterest.");
    await close({ status: "done", error: null });
    if (query) await saveReady(query, candidates, "mac", now);
  } finally {
    await removeSongFile(task.uploadId);
  }
}

async function markFailed(query: string, detail: string, now: Date): Promise<void> {
  if (!query) return;
  const row = await rowOf(query);
  if (!row) return;
  await getDb()
    .update(searches)
    .set({ status: "failed", error: detail.slice(0, MAX_ERROR), failures: row.failures + 1, updatedAt: now })
    .where(eq(searches.id, row.id));
}

/** Cierra como fallida una tarea de búsqueda (reserva caducada, sin Mac…). */
export async function failPinterestTask(task: { id: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  const [before] = await getDb().select({ uploadId: agentTasks.uploadId, url: agentTasks.url }).from(agentTasks).where(eq(agentTasks.id, task.id));
  const [closed] = await getDb()
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(and(eq(agentTasks.id, task.id), condition))
    .returning({ id: agentTasks.id });
  if (!closed) return;
  await removeSongFile(before?.uploadId ?? null);
  if (before) await markFailed(normalizeQuery(queryOfSearchUrl(before.url) ?? ""), `Mac: ${reason}`, now);
}
