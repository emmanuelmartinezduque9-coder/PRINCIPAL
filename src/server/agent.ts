import crypto from "node:crypto";
import { and, asc, eq, gte, isNull, lt, max, notExists, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cancelLinkTasks, LINK_FAILED, linkFailureMessage, TASK_TOO_OLD } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor } from "@/server/products";
import {
  agentUploadId,
  appendChunk,
  expectLinkReference,
  failLinkReference,
  finishUpload,
  lockVideoReference,
  removeUploadFiles,
  requireHiggsfieldConnected,
  startAgentUpload,
} from "@/server/videos/upload";
import { createVideo, getVideoFor, MAX_REFERENCE_BYTES, requireVideoOwner, type NewVideoExtras, type Video } from "@/server/videos/videos";

/**
 * El agente del Mac: un programa pequeño en el Mac del dueño que descarga los enlaces pegados
 * (Instagram, TikTok…), a los que la nube no llega, y entrega el archivo por la misma subida por
 * trozos que usa el navegador. Todas las conexiones salen del Mac: pregunta si hay tareas, se
 * lleva una reservándola, la mantiene con latidos y entrega el archivo o dice que no pudo.
 *
 * - Entra con una ficha que se enseña una sola vez; aquí solo queda su huella SHA-256. La ficha
 *   solo abre las rutas `/api/agente/…`: no es una sesión de persona.
 * - El Mac es de quien creó su ficha (hoy, solo el dueño) y solo atiende sus enlaces: descarga con
 *   la sesión de Instagram de ese Mac. Quien no tiene Mac sube el archivo.
 * - El enlace que un vídeo espera está apuntado en el vídeo (`linkTaskId`). Una referencia que ya
 *   estaba lista sigue lista hasta que el archivo del Mac llega entero, y también si el enlace falla.
 * - Una tarea reservada sin latido en 5 minutos vuelve a la cola; a los 3 intentos falla. Ninguna
 *   reserva dura más de 30 minutos, con latidos o sin ellos. En la cola espera hasta 6 horas
 *   mientras su Mac siga dando señales (un lote de muchos enlaces se atiende de uno en uno); si su
 *   Mac calla 10 minutos, falla. El detalle técnico se queda en la tarea, para el dueño; a la
 *   persona se le enseña un texto fijo.
 *
 * Orden de los cerrojos: el vídeo, después la tarea, después la sesión de subida. Las tablas de
 * vídeo solo las toca `src/server/videos/`; aquí, las de agentes y tareas.
 */

export const AGENT_ONLINE_MS = 90_000;
export const LEASE_MS = 5 * 60_000;
export const MAX_TASK_ATTEMPTS = 3;
/**
 * Una tarea en cola se da por perdida si lleva este tiempo esperando y, en ese mismo tiempo, su
 * Mac no ha dado señales. Con el Mac vivo y ocupado en otros enlaces, sigue esperando.
 */
export const QUEUE_WAIT_MS = 10 * 60_000;
/** Lo más que dura una reserva desde que el Mac se la llevó, aunque siga dando latidos (una descarga colgada). */
export const MAX_LEASE_AGE_MS = 30 * 60_000;
/**
 * Lo más que espera una tarea en la cola desde que se pegó el enlace, con el Mac vivo: da para que
 * el Mac atienda de uno en uno un lote de muchos enlaces.
 */
export const MAX_QUEUE_AGE_MS = 6 * 60 * 60_000;
/** Sitios de los que se admite un enlace, con sus subdominios. */
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"] as const;

const MAX_LINK_LENGTH = 2000;
const MAX_NAME = 60;
const MAX_INFO = 40;
const MAX_ERROR = 500;
const TOKEN_PREFIX = "pra_";
/** `Bearer <ficha>`: el nombre del esquema no distingue mayúsculas; la ficha, sí (por su huella). */
const BEARER = /^Bearer +(pra_[A-Za-z0-9_-]{43})$/i;
/** Veces que `claimTask` prueba con la siguiente tarea si otra petición se le adelanta. */
const CLAIM_ROUNDS = 5;

const OWNER_ONLY = "Solo el dueño puede hacer esto.";
const BAD_TOKEN = "Ficha del Mac no válida.";
const BAD_LINK = "Solo se admiten enlaces de Instagram, TikTok, YouTube o Facebook.";
const MAC_OFFLINE = "El Mac no está conectado ahora mismo. Sube el archivo del vídeo.";
const TASK_LOST = "Esta tarea ya no es tuya.";
// Motivos que se apuntan en la tarea (solo los ve el dueño).
const SUPERSEDED = "Sustituida por otro enlace.";
const NOT_EXPECTED = "El vídeo ya no esperaba este enlace.";
const NO_HEARTBEAT = "El Mac dejó de dar señales con la tarea reservada.";
const UNCLAIMED = "El Mac se desconectó antes de recoger la tarea.";
const NO_DETAIL = "El Mac no dio detalles.";

const agents = schema.agents;
const agentTasks = schema.agentTasks;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const isId = (value: number) => Number.isSafeInteger(value) && value > 0;
const taskLost = () => new HttpError(409, TASK_LOST);
const clip = (value: unknown, length: number) => (typeof value === "string" ? value.trim().slice(0, length) : "");
const isOnline = (lastSeenAt: Date | null, now: Date) => lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() <= AGENT_ONLINE_MS;

function requireOwner(user: AuthUser): void {
  if (user.role !== "dueno") throw new HttpError(403, OWNER_ONLY);
}

/** La tarea `taskId` mientras `agentId` la tenga reservada. */
const leasedBy = (agentId: number, taskId: number) => and(eq(agentTasks.id, taskId), eq(agentTasks.agentId, agentId), eq(agentTasks.status, "leased"));

// ───────────────────────── Fichas ─────────────────────────

/**
 * Crea la ficha de un Mac. Solo el dueño. La ficha se devuelve aquí y nunca más: se guarda su
 * huella. El Mac queda a nombre de quien la crea.
 */
export async function createAgentToken(owner: AuthUser, name: string): Promise<{ agentId: number; token: string }> {
  requireOwner(owner);
  const cleanName = clip(name, MAX_NAME);
  if (!cleanName) throw new HttpError(400, "Ponle un nombre al Mac.");
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
  const [row] = await getDb().insert(agents).values({ name: cleanName, tokenHash: sha256(token), createdBy: owner.id }).returning({ id: agents.id });
  return { agentId: row.id, token };
}

/**
 * Revoca la ficha de un Mac propio: deja de valer al momento, y lo que tuviera reservado vuelve a
 * la cola sin esperar a que caduque (otro Mac suyo, o el mismo con otra ficha, puede seguir). Solo
 * el dueño.
 */
export async function revokeAgent(owner: AuthUser, agentId: number, now: Date = new Date()): Promise<void> {
  requireOwner(owner);
  if (!isId(agentId)) throw new HttpError(404, "Mac no encontrado.");
  await getDb().transaction(async (tx) => {
    const revoked = await tx
      .update(agents)
      .set({ revokedAt: now })
      .where(and(eq(agents.id, agentId), eq(agents.createdBy, owner.id), isNull(agents.revokedAt)))
      .returning({ id: agents.id });
    if (revoked.length === 0) throw new HttpError(404, "Mac no encontrado.");
    await tx
      .update(agentTasks)
      .set({ status: "queued", leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(agentTasks.agentId, agentId), eq(agentTasks.status, "leased")));
  });
}

export interface AgentInfo {
  id: number;
  name: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  online: boolean;
  version: string | null;
  ytDlp: string | null;
}

/** Los Mac del dueño con ficha en vigor, para Ajustes. Nunca incluye la ficha ni su huella. */
export async function listAgents(owner: AuthUser, now: Date = new Date()): Promise<AgentInfo[]> {
  requireOwner(owner);
  const rows = await getDb()
    .select({ id: agents.id, name: agents.name, createdAt: agents.createdAt, lastSeenAt: agents.lastSeenAt, info: agents.info })
    .from(agents)
    .where(and(eq(agents.createdBy, owner.id), isNull(agents.revokedAt)))
    .orderBy(asc(agents.id));
  return rows.map(({ info, ...row }) => ({
    ...row,
    online: isOnline(row.lastSeenAt, now),
    version: info?.version || null,
    ytDlp: info?.ytDlp ?? null,
  }));
}

/**
 * El Mac que hace la petición, por su ficha (`Authorization: Bearer …`). Sin ficha, con una
 * inventada o revocada, o si quien la creó ya no es un dueño activo: 401. La ficha se busca por
 * su huella y la huella se compara en tiempo constante. Toda petición con una ficha válida cuenta
 * como señal de vida del Mac, no solo el latido.
 */
export async function requireAgent(request: Request, now: Date = new Date()): Promise<{ agentId: number }> {
  const invalid = new HttpError(401, BAD_TOKEN);
  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  if (!match) throw invalid;
  const tokenHash = sha256(match[1]);
  const db = getDb();
  const [agent] = await db
    .select({ id: agents.id, tokenHash: agents.tokenHash, createdBy: agents.createdBy })
    .from(agents)
    .where(and(eq(agents.tokenHash, tokenHash), isNull(agents.revokedAt)));
  if (!agent) throw invalid;
  const stored = Buffer.from(agent.tokenHash, "hex");
  const given = Buffer.from(tokenHash, "hex");
  if (stored.length !== given.length || !crypto.timingSafeEqual(stored, given)) throw invalid;
  const owner = await getActiveUser(agent.createdBy);
  if (owner?.role !== "dueno") throw invalid;
  await db.update(agents).set({ lastSeenAt: now }).where(eq(agents.id, agent.id));
  return { agentId: agent.id };
}

// ───────────────────────── Conectado ─────────────────────────

/** Latido del programa (cada 30 s): está vivo, y con qué versiones. */
export async function agentHeartbeat(agentId: number, info: { version: string; ytDlp: string | null }, now: Date = new Date()): Promise<void> {
  await getDb()
    .update(agents)
    .set({ lastSeenAt: now, info: { version: clip(info.version, MAX_INFO), ytDlp: clip(info.ytDlp, MAX_INFO) || null } })
    .where(eq(agents.id, agentId));
}

/** Si `user` tiene un Mac conectado: uno suyo, con ficha en vigor y una señal en los últimos 90 segundos. */
export async function agentStatus(user: AuthUser, now: Date = new Date()): Promise<{ online: boolean; lastSeenAt: Date | null }> {
  const [row] = await getDb()
    .select({ lastSeenAt: max(agents.lastSeenAt) })
    .from(agents)
    .where(and(eq(agents.createdBy, user.id), isNull(agents.revokedAt)));
  const lastSeenAt = row?.lastSeenAt ?? null;
  return { online: isOnline(lastSeenAt, now), lastSeenAt };
}

// ───────────────────────── Enlaces ─────────────────────────

/**
 * El enlace tal como se guarda y se le da al Mac, o `null` si no se admite: solo `https`, sin
 * usuario ni puerto, y de uno de los sitios de `LINK_HOSTS` o un subdominio suyo.
 */
export function linkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!LINK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
  return url.href.length <= MAX_LINK_LENGTH ? url.href : null;
}

/**
 * Lo que hace falta para pegar un enlace, antes de tocar nada: un enlace admitido (400), el
 * Higgsfield de `user` conectado (los 409 de una subida) y un Mac suyo conectado (409). Devuelve
 * el enlace ya normalizado.
 */
export async function checkLinkRequest(user: AuthUser, url: unknown, now: Date = new Date()): Promise<string> {
  const link = linkOf(url);
  if (!link) throw new HttpError(400, BAD_LINK);
  await requireHiggsfieldConnected(user.id);
  if (!(await agentStatus(user, now)).online) throw new HttpError(409, MAC_OFFLINE);
  return link;
}

/**
 * Pone en cola la descarga de `link` (ya comprobado con `checkLinkRequest`) para un vídeo propio.
 * La tarea y el apunte en el vídeo se guardan juntos; un enlace anterior del mismo vídeo queda
 * sustituido, lo tenga ya un Mac o no. No mientras otra referencia se prepara (409).
 */
export async function startLinkDownload(user: AuthUser, video: Video, link: string, now: Date = new Date()): Promise<{ taskId: number }> {
  requireVideoOwner(user, video);
  if (linkOf(link) !== link) throw new HttpError(400, BAD_LINK);
  const { taskId, discarded } = await getDb().transaction(async (tx) => {
    // Con el vídeo bloqueado, dos peticiones del mismo vídeo van una detrás de otra.
    if (!(await lockVideoReference(tx, video.id))) throw new HttpError(404, "Vídeo no encontrado.");
    await cancelLinkTasks(tx, video.id, SUPERSEDED, now);
    const [task] = await tx
      .insert(agentTasks)
      .values({ kind: "link_download", videoId: video.id, url: link, createdBy: user.id, createdAt: now, updatedAt: now })
      .returning({ id: agentTasks.id });
    return { taskId: task.id, discarded: await expectLinkReference(tx, video.id, task.id) };
  });
  await removeUploadFiles(discarded);
  return { taskId };
}

/**
 * Pide al Mac que traiga `url` como referencia del vídeo. Exige lo mismo que una subida (vídeo
 * propio y Higgsfield conectado, con sus mismos mensajes), un enlace admitido y un Mac de `user`
 * conectado. Una referencia que ya estaba lista sigue lista hasta que llegue la nueva; un vídeo
 * sin referencia queda «subiendo».
 */
export async function requestLinkDownload(user: AuthUser, videoId: number, url: unknown, now: Date = new Date()): Promise<{ taskId: number }> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const link = await checkLinkRequest(user, url, now);
  return startLinkDownload(user, video, link, now);
}

/**
 * Crea un vídeo cuya referencia es un enlace pegado (un vídeo suelto o, con `extras`, el de un
 * lote). Todo lo del enlace se comprueba antes de crear nada: un enlace que no vale o un Mac
 * desconectado no dejan un vídeo a medias.
 */
export async function createVideoFromLink(user: AuthUser, productId: number, url: unknown, extras: NewVideoExtras = {}, now: Date = new Date()): Promise<Video> {
  // Un producto que no se ve da su 404 antes que cualquier fallo del enlace.
  await getProductFor(user, productId);
  const link = await checkLinkRequest(user, url, now);
  const video = await createVideo(user, productId, extras);
  await startLinkDownload(user, video, link, now);
  return getVideoFor(user, video.id);
}

// ───────────────────────── Tareas: reserva y latido ─────────────────────────

export interface ClaimedTask {
  taskId: number;
  url: string;
  /** La sesión de subida de esta reserva: hay que mandarla con cada trozo y al terminar. */
  uploadId: string;
  chunkBytes: number;
  maxBytes: number;
}

/**
 * El Mac se lleva la tarea más antigua de la cola de su dueño, o `null` si no hay: las de varios
 * enlaces pegados a la vez salen una detrás de otra, en el orden en que se pegaron. Reservarla y
 * abrir su sesión de subida van en la misma transacción; con `for update skip locked`, dos Macs
 * que preguntan a la vez no se llevan la misma (el segundo prueba con la siguiente).
 */
export async function claimTask(agentId: number, now: Date = new Date()): Promise<ClaimedTask | null> {
  const db = getDb();
  const [agent] = await db.select({ createdBy: agents.createdBy }).from(agents).where(and(eq(agents.id, agentId), isNull(agents.revokedAt)));
  if (!agent) return null;
  const queued = and(eq(agentTasks.status, "queued"), eq(agentTasks.createdBy, agent.createdBy));
  for (let round = 0; round < CLAIM_ROUNDS; round++) {
    const [candidate] = await db.select({ id: agentTasks.id, videoId: agentTasks.videoId }).from(agentTasks).where(queued).orderBy(asc(agentTasks.id)).limit(1);
    if (!candidate) return null;
    const claimed = await db.transaction(async (tx): Promise<ClaimedTask | null> => {
      await lockVideoReference(tx, candidate.videoId);
      const [task] = await tx
        .select({ id: agentTasks.id, videoId: agentTasks.videoId, url: agentTasks.url })
        .from(agentTasks)
        .where(and(eq(agentTasks.id, candidate.id), queued))
        .for("update", { skipLocked: true });
      // Otro Mac se la llevó o se canceló mientras tanto: a por la siguiente.
      if (!task) return null;
      const upload = await startAgentUpload(task.id, task.videoId, tx);
      if (!upload) {
        await tx.update(agentTasks).set({ status: "failed", error: NOT_EXPECTED, updatedAt: now }).where(eq(agentTasks.id, task.id));
        return null;
      }
      await tx
        .update(agentTasks)
        .set({
          status: "leased",
          agentId,
          leasedAt: now,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          attempts: sql`${agentTasks.attempts} + 1`,
          updatedAt: now,
        })
        .where(eq(agentTasks.id, task.id));
      return { taskId: task.id, url: task.url, ...upload, maxBytes: MAX_REFERENCE_BYTES };
    });
    if (claimed) return claimed;
  }
  return null;
}

/** Latido de la tarea (cada 60 s mientras descarga): la reserva dura 5 minutos más. Si ya no la tiene, 409. */
export async function extendLease(agentId: number, taskId: number, now: Date = new Date()): Promise<void> {
  const extended = isId(taskId)
    ? await getDb()
        .update(agentTasks)
        .set({ leaseExpiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now })
        .where(leasedBy(agentId, taskId))
        .returning({ id: agentTasks.id })
    : [];
  if (extended.length === 0) throw taskLost();
}

/**
 * Un trozo del archivo descargado, por la misma subida por trozos que el navegador (mismos
 * límites y mismas respuestas). Solo quien tiene la reserva, y con la sesión de **esa** reserva
 * (`uploadId`): un trozo rezagado de un intento anterior, aunque sea del mismo Mac, da 409. Cada
 * trozo prolonga la reserva.
 */
export async function appendTaskChunk(
  agentId: number,
  taskId: number,
  uploadId: string,
  index: number,
  bytes: Buffer,
  now: Date = new Date(),
): Promise<{ received: number }> {
  await extendLease(agentId, taskId, now);
  try {
    return await appendChunk(uploadId, index, bytes, { agentTaskId: taskId });
  } catch (error) {
    // Esa sesión ya no existe o no es de esta tarea.
    if (error instanceof HttpError && error.status === 404) throw taskLost();
    throw error;
  }
}

/** Lo que el Mac dice al terminar; `uploadId` es la sesión que recibió al reservar la tarea. */
export type TaskResult = { ok: true; uploadId: string; totalBytes: number } | { ok: false; uploadId: string; error: string };

/**
 * El Mac termina la tarea. Si fue bien, dice cuánto pesa lo que entregó y el vídeo entra en el
 * mismo procesado que una subida (`finishUpload`); repetirlo no hace nada. Si no pudo, se borra
 * lo que hubiera llegado, el detalle (recortado) se guarda en la tarea y el vídeo lo dice con el
 * texto fijo (una referencia que ya estaba lista sigue lista). Solo quien tiene la reserva y con
 * la sesión de esa reserva.
 */
export async function finishTask(agentId: number, taskId: number, result: TaskResult, now: Date = new Date()): Promise<void> {
  if (!isId(taskId)) throw taskLost();
  const db = getDb();
  const [task] = await db
    .select({ id: agentTasks.id, videoId: agentTasks.videoId, status: agentTasks.status, agentId: agentTasks.agentId })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));
  if (!task || task.agentId !== agentId) throw taskLost();
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased") throw taskLost();

  if (!result.ok) {
    await db.transaction(async (tx) => {
      await lockVideoReference(tx, task.videoId);
      if ((await agentUploadId(task.id, tx)) !== result.uploadId) throw taskLost();
      const closed = await tx
        .update(agentTasks)
        .set({ status: "failed", error: clip(result.error, MAX_ERROR) || NO_DETAIL, leaseExpiresAt: null, updatedAt: now })
        .where(leasedBy(agentId, task.id))
        .returning({ id: agentTasks.id });
      if (closed.length === 0) throw taskLost();
      await failLinkReference(tx, task.videoId, task.id, LINK_FAILED);
    });
    return;
  }

  try {
    await finishUpload(result.uploadId, { agentTaskId: task.id }, task.videoId, result.totalBytes);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw taskLost();
    throw error;
  }
  await db.update(agentTasks).set({ status: "done", leaseExpiresAt: null, updatedAt: now }).where(leasedBy(agentId, task.id));
}

/** Cierra como fallida una tarea que sigue cumpliendo `condition` y lo refleja en su vídeo. */
async function failTask(task: { id: number; videoId: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  await getDb().transaction(async (tx) => {
    await lockVideoReference(tx, task.videoId);
    const closed = await tx
      .update(agentTasks)
      .set({ status: "failed", error: reason, leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), condition))
      .returning({ id: agentTasks.id });
    // Si entretanto cambió (llegó un latido, alguien la reservó), se queda como está.
    if (closed.length > 0) await failLinkReference(tx, task.videoId, task.id, linkFailureMessage(reason));
  });
}

/**
 * Seguimiento de las tareas (dentro de `videoSweep`, cada minuto). Fallan, y el vídeo lo dice: la
 * reserva de más de 30 minutos (aunque lata), la tarea que lleva 6 horas en la cola (aunque su
 * Mac siga vivo), la reserva caducada en su tercer intento y la que lleva 10 minutos en la cola
 * sin señales de ningún Mac de quien la pidió. Una reserva sin latido en 5 minutos, con intentos
 * por delante, vuelve a la cola.
 */
export async function expireLeases(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const waitLimit = new Date(now.getTime() - QUEUE_WAIT_MS);
  const expired = and(eq(agentTasks.status, "leased"), lt(agentTasks.leaseExpiresAt, now));
  const macSeen = db
    .select({ one: sql`1` })
    .from(agents)
    .where(and(eq(agents.createdBy, agentTasks.createdBy), isNull(agents.revokedAt), gte(agents.lastSeenAt, waitLimit)));
  const failures: Array<{ condition: SQL | undefined; reason: string }> = [
    { condition: and(eq(agentTasks.status, "leased"), lt(agentTasks.leasedAt, new Date(now.getTime() - MAX_LEASE_AGE_MS))), reason: TASK_TOO_OLD },
    { condition: and(eq(agentTasks.status, "queued"), lt(agentTasks.createdAt, new Date(now.getTime() - MAX_QUEUE_AGE_MS))), reason: TASK_TOO_OLD },
    { condition: and(expired, gte(agentTasks.attempts, MAX_TASK_ATTEMPTS)), reason: NO_HEARTBEAT },
    { condition: and(eq(agentTasks.status, "queued"), lt(agentTasks.updatedAt, waitLimit), notExists(macSeen)), reason: UNCLAIMED },
  ];
  for (const { condition, reason } of failures) {
    const tasks = await db.select({ id: agentTasks.id, videoId: agentTasks.videoId }).from(agentTasks).where(condition);
    for (const task of tasks) await failTask(task, condition, reason, now);
  }
  await db
    .update(agentTasks)
    .set({ status: "queued", leaseExpiresAt: null, updatedAt: now })
    .where(and(expired, lt(agentTasks.attempts, MAX_TASK_ATTEMPTS)));
}
