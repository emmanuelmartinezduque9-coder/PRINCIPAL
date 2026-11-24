import { claimPhoneTask, appendPhoneChunk, finishPhoneTask, failPhoneTask, type ClaimedPhoneTask } from "@/server/phone-agent";
import { appendMarketChunk, claimMarketTask, failMarketTask, finishMarketTask, MARKET_TASK, type ClaimedMarketData, type MarketResult } from "@/server/market-data";
import { appendProfileChunk, claimProfileTask, failProfileTask, finishProfileTask, PROFILE_TASK, type ClaimedProfileFetch, type ProfileFetchResult } from "@/server/link-profiles";
import {
  appendPinterestChunk,
  claimPinterestTask,
  failPinterestTask,
  finishPinterestTask,
  PINTEREST_TASK,
  type ClaimedPinterestSearch,
  type PinterestSearchResult,
} from "@/server/pinterest-searches";
import { CLAUDE_CODE_TASK, claimClaudeCodeTask, failClaudeCodeTask, finishClaudeCodeTask, type ClaimedClaudeCode, type ClaudeCodeResult } from "@/server/claude-mac";
import crypto from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, lte, max, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cancelLinkTasks, LINK_FAILED, TASK_TOO_OLD } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor } from "@/server/products";
import { LINK_HOSTS, linkOf, songLinkOf } from "@/lib/links";
import {
  appendMediaFetchChunk,
  claimMediaFetchTask,
  failMediaFetchTask,
  finishMediaFetchTask,
  MEDIA_FETCH_TASK,
  type ClaimedMediaFetch,
  type MediaFetchResult,
} from "@/server/link-media";
import { appendSongChunk, finishSongTask, openSongUpload, removeSongFile, SONG_TASK } from "@/server/song-downloads";
import { MAX_SONG_BYTES } from "@/server/songs";
import {
  agentUploadId,
  appendChunk,
  CHUNK_BYTES,
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
 * Los tipos de tarea que un Mac puede pedir además de enlaces y canciones (los que dice que sabe
 * hacer al reclamar): `enlace_medio` = traer el vídeo de un enlace para el montaje en la nube
 * (programa 1.4.0); `perfil` = leer el perfil de una cuenta de Instagram o TikTok para el alta de
 * productos (1.5.0); `pinterest` = buscar en Pinterest las referencias de una imagen cuando Pinterest
 * no deja a la nube (1.6.0). El montaje en el Mac (`montaje`, 1.3.x) se retiró el 23/11/2026: ahora monta la nube.
 */
export const OPTIONAL_TASKS = ["enlace_medio", "perfil", "pinterest", "datos", "movil"] as const;
export type OptionalTask = (typeof OPTIONAL_TASKS)[number];
/**
 * Lo más que espera una tarea en la cola desde que se pegó el enlace, con el Mac vivo: da para que
 * el Mac atienda de uno en uno un lote de muchos enlaces.
 */
export const MAX_QUEUE_AGE_MS = 6 * 60 * 60_000;
/**
 * Cuando el Mac dice que no pudo traer el enlace de una referencia, el servidor lo vuelve a poner
 * en cola solo, el mismo enlace, hasta 3 veces, cada una unos 2 minutos después del fallo. Solo
 * después el vídeo enseña «Enlace no disponible».
 */
export const MAX_LINK_RETRIES = 3;
export const LINK_RETRY_DELAY_MS = 2 * 60_000;
// Qué enlaces se admiten está en `@/lib/links` (lo comparten las pantallas); se reexporta aquí.
export { LINK_HOSTS, linkOf };

const MAX_NAME = 60;
const MAX_INFO = 40;
const MAX_ERROR = 500;
const TOKEN_PREFIX = "pra_";
/** `Bearer <ficha>`: el nombre del esquema no distingue mayúsculas; la ficha, sí (por su huella). */
const BEARER = /^Bearer +(pra_[A-Za-z0-9_-]{43})$/i;
/** Veces que `claimTask` prueba con la siguiente tarea si otra petición se le adelanta. */
const CLAIM_ROUNDS = 5;

type Tx = Parameters<typeof lockVideoReference>[0];

const OWNER_ONLY = "Solo el dueño puede hacer esto.";
const NO_UPLOAD = "Falta la sesión de la reserva (`subida`).";
const BAD_TOKEN = "Ficha del Mac no válida.";
const BAD_LINK = "Solo se admiten enlaces de Instagram, TikTok, YouTube o Facebook.";
const BAD_SONG_LINK = "Solo se admiten enlaces de YouTube, TikTok, Instagram, Facebook o SoundCloud.";
const MAC_OFFLINE = "El Mac no está conectado ahora mismo.";
const SONG_MAC_OFFLINE = "El Mac no está conectado ahora mismo. Importa el archivo de la canción.";
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
  /** Claude Code con sesión en ese Mac (versión), o `null`. */
  claude: string | null;
  codex: string | null;
  /** Por qué Claude Code no está listo (sin sesión, ficha rechazada…), apto para el dueño; `null` si lo está. */
  claudeMotivo: string | null;
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
    claude: info?.claude ?? null,
    codex: info?.codex ?? null,
    claudeMotivo: info?.claude ? null : (info?.claudeMotivo ?? null),
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
export async function agentHeartbeat(
  agentId: number,
  info: { version: string; ytDlp: string | null; claude?: string | null; claudeMotivo?: string | null; codex?: string | null },
  now: Date = new Date(),
): Promise<{ claudeReady: boolean }> {
  const claude = clip(info.claude, MAX_INFO) || null;
  const codex = clip(info.codex, MAX_INFO) || null;
  const [before] = await getDb().select({ info: agents.info }).from(agents).where(eq(agents.id, agentId));
  await getDb()
    .update(agents)
    .set({ lastSeenAt: now, info: { version: clip(info.version, MAX_INFO), ytDlp: clip(info.ytDlp, MAX_INFO) || null, claude, codex, claudeMotivo: claude ? null : clip(info.claudeMotivo, 300) || null } })
    .where(eq(agents.id, agentId));
  // Claude Code acaba de tener sesión en el Mac (primera vez, o tras volver a conectarlo): los
  // trabajos en pausa (sin saldo en la API, «Solo Mac»…) se reanudan ya y van al Mac, sin esperar a
  // la pasada de cada hora.
  const claudeReady = (claude !== null || codex !== null) && !before?.info?.claude && !before?.info?.codex;
  if (claudeReady) {
    try {
      const { resumePausedJobs } = await import("@/jobs/boss");
      await resumePausedJobs(now);
      // Y los montajes que esperaban a Claude para leer la edición de su referencia.
      const { wakeRunsWaitingForClaude } = await import("@/server/videos/montaje-nube");
      await wakeRunsWaitingForClaude(now);
    } catch (error) {
      console.error(`[agente] No se pudieron reanudar los trabajos en pausa: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { claudeReady };
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
  const { taskId, discarded } = await getDb().transaction((tx) => queueLink(tx, user, video, link, now));
  await removeUploadFiles(discarded);
  return { taskId };
}

/** El cuerpo de `startLinkDownload`, dentro de la transacción de quien llama. */
async function queueLink(tx: Tx, user: AuthUser, video: Video, link: string, now: Date): Promise<{ taskId: number; discarded: string[] }> {
  requireVideoOwner(user, video);
  if (linkOf(link) !== link) throw new HttpError(400, BAD_LINK);
  // Con el vídeo bloqueado, dos peticiones del mismo vídeo van una detrás de otra.
  if (!(await lockVideoReference(tx, video.id))) throw new HttpError(404, "Vídeo no encontrado.");
  await cancelLinkTasks(tx, video.id, SUPERSEDED, now);
  const [task] = await tx
    .insert(agentTasks)
    .values({ kind: "link_download", videoId: video.id, url: link, createdBy: user.id, createdAt: now, updatedAt: now })
    .returning({ id: agentTasks.id });
  return { taskId: task.id, discarded: await expectLinkReference(tx, video.id, task.id) };
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
 * lote). Todo lo del enlace se comprueba antes de crear nada, y el vídeo y su tarea se guardan en
 * la misma transacción: un enlace que no vale, un Mac desconectado o un fallo al encolar no dejan
 * un vídeo a medias.
 */
export async function createVideoFromLink(user: AuthUser, productId: number, url: unknown, extras: NewVideoExtras = {}, now: Date = new Date()): Promise<Video> {
  // Un producto que no se ve da su 404 antes que cualquier fallo del enlace.
  await getProductFor(user, productId);
  const link = await checkLinkRequest(user, url, now);
  const video = await createVideo(user, productId, extras, async (tx, created) => {
    await queueLink(tx, user, created, link, now);
  });
  return getVideoFor(user, video.id);
}

/**
 * «Pegar enlace» en Canciones: pide al Mac del dueño el audio de `url` (los sitios de los vídeos y
 * SoundCloud) como MP3. Solo el dueño (403), con un enlace admitido (400) y un Mac suyo conectado
 * (409). El mismo enlace pegado dos veces mientras el primero sigue en marcha no crea otra tarea:
 * devuelve la que ya hay (`created: false`). La canción se crea al llegar el archivo, sin drop.
 */
export async function requestSongDownload(user: AuthUser, url: unknown, now: Date = new Date()): Promise<{ taskId: number; created: boolean }> {
  requireOwner(user);
  const link = songLinkOf(url);
  if (!link) throw new HttpError(400, BAD_SONG_LINK);
  if (!(await agentStatus(user, now)).online) throw new HttpError(409, SONG_MAC_OFFLINE);
  const db = getDb();
  for (let round = 0; round < CLAIM_ROUNDS; round++) {
    const [task] = await db
      .insert(agentTasks)
      .values({ kind: SONG_TASK, url: link, createdBy: user.id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: agentTasks.id });
    if (task) return { taskId: task.id, created: true };
    const [active] = await db
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.kind, SONG_TASK), eq(agentTasks.createdBy, user.id), eq(agentTasks.url, link), inArray(agentTasks.status, ["queued", "leased"])));
    // Si entretanto terminó, se vuelve a intentar crearla.
    if (active) return { taskId: active.id, created: false };
  }
  throw new HttpError(409, "Inténtalo de nuevo.");
}

// ───────────────────────── Tareas: reserva y latido ─────────────────────────

export type ClaimedTask =
  | {
      taskId: number;
      /** `referencia`: el vídeo de referencia (MP4); `cancion`: el audio de una canción (MP3). */
      kind: "referencia" | "cancion";
      url: string;
      /** La sesión de subida de esta reserva: hay que mandarla con cada trozo y al terminar. */
      uploadId: string;
      chunkBytes: number;
      maxBytes: number;
    }
  /** `enlace_medio`: traer el vídeo de un enlace que necesita el montaje en la nube y entregarlo. */
  | ClaimedPhoneTask
  | ClaimedMediaFetch
  /** `perfil`: leer el perfil de una cuenta (Instagram con Brave, TikTok con yt-dlp) y entregarlo en JSON. */
  | ClaimedProfileFetch
  /** `datos`: datos de mercado reales (Amazon, anuncios de Meta, TikTok, YouTube) de unas consultas. */
  | ClaimedMarketData
  /** `pinterest`: pedir una búsqueda de Pinterest desde el Mac y entregar la respuesta (JSON). */
  | ClaimedPinterestSearch
  /** `claude_code`: una llamada a Claude del dueño, hecha con el Claude Code del Mac (1.8.0). */
  | ClaimedClaudeCode;

/**
 * El Mac se lleva la tarea más antigua de la cola de su dueño, o `null` si no hay: las de varios
 * enlaces pegados a la vez salen una detrás de otra, en el orden en que se pegaron. Reservarla y
 * abrir su sesión de subida van en la misma transacción; con `for update skip locked`, dos Macs
 * que preguntan a la vez no se llevan la misma (el segundo prueba con la siguiente).
 */
export async function claimTask(
  agentId: number,
  now: Date = new Date(),
  options: { can?: readonly OptionalTask[]; solo?: typeof CLAUDE_CODE_TASK } = {},
): Promise<ClaimedTask | null> {
  const db = getDb();
  const [agent] = await db.select({ createdBy: agents.createdBy }).from(agents).where(and(eq(agents.id, agentId), isNull(agents.revokedAt)));
  if (!agent) return null;
  // Las llamadas a Claude van por su propia cola (`solo: "claude_code"`, varias a la vez); nunca por la de los enlaces.
  if (options.solo === CLAUDE_CODE_TASK) return claimClaudeCodeTask(agent.createdBy, leaseValues(agentId, now), now);
  // Un Mac que no dice que sabe traer vídeos de enlaces para el montaje (anterior a 1.4.0) no se los lleva.
  const kinds = and(
    ne(agentTasks.kind, CLAUDE_CODE_TASK),
    ne(agentTasks.kind, "phone_screen"),
    options.can?.includes("movil") ? undefined : ne(agentTasks.kind, "phone_publish"),
    options.can?.includes("enlace_medio") ? undefined : ne(agentTasks.kind, MEDIA_FETCH_TASK),
    // Ni leer perfiles (anterior a 1.5.0).
    options.can?.includes("perfil") ? undefined : ne(agentTasks.kind, PROFILE_TASK),
    // Ni buscar en Pinterest (anterior a 1.6.0).
    options.can?.includes("pinterest") ? undefined : ne(agentTasks.kind, PINTEREST_TASK),
    // Ni datos de mercado (anterior a 1.7.0).
    options.can?.includes("datos") ? undefined : ne(agentTasks.kind, MARKET_TASK),
  );
  // Un reintento automático espera a su hora.
  const queued = and(
    eq(agentTasks.status, "queued"),
    eq(agentTasks.createdBy, agent.createdBy),
    kinds,
    sql`(${agentTasks.kind} <> 'phone_publish' or exists (select 1 from publications p join phones m on m.id = p.phone_id where p.agent_task_id = ${agentTasks.id} and not m.paused))`,
    or(isNull(agentTasks.availableAt), lte(agentTasks.availableAt, now)),
  );
  for (let round = 0; round < CLAIM_ROUNDS; round++) {
    const [candidate] = await db
      .select({ id: agentTasks.id, videoId: agentTasks.videoId, kind: agentTasks.kind })
      .from(agentTasks)
      .where(queued)
      .orderBy(asc(agentTasks.id))
      .limit(1);
    if (!candidate) return null;
    if (candidate.kind === "phone_publish") {
      const phone = await claimPhoneTask(candidate.id, queued, leaseValues(agentId, now));
      if (phone) return phone;
      return null;
    }
    if (candidate.kind === MEDIA_FETCH_TASK) {
      const fetched = await claimMediaFetchTask(candidate.id, queued, leaseValues(agentId, now));
      if (fetched) return fetched;
      continue;
    }
    if (candidate.kind === MARKET_TASK) {
      const market = await claimMarketTask(candidate.id, queued, leaseValues(agentId, now));
      if (market) return market;
      continue;
    }
    if (candidate.kind === PROFILE_TASK) {
      const profile = await claimProfileTask(candidate.id, queued, leaseValues(agentId, now));
      if (profile) return profile;
      continue;
    }
    if (candidate.kind === PINTEREST_TASK) {
      const search = await claimPinterestTask(candidate.id, queued, leaseValues(agentId, now));
      if (search) return search;
      continue;
    }
    if (candidate.videoId === null) {
      // Una canción: sin vídeo que bloquear.
      const song = await claimSongTask(agentId, candidate.id, queued, now);
      if (song) return song;
      continue;
    }
    const videoId = candidate.videoId;
    const claimed = await db.transaction(async (tx): Promise<ClaimedTask | null> => {
      await lockVideoReference(tx, videoId);
      const [task] = await tx
        .select({ id: agentTasks.id, videoId: agentTasks.videoId, url: agentTasks.url })
        .from(agentTasks)
        .where(and(eq(agentTasks.id, candidate.id), queued))
        .for("update", { skipLocked: true });
      // Otro Mac se la llevó o se canceló mientras tanto: a por la siguiente.
      if (!task) return null;
      const upload = await startAgentUpload(task.id, videoId, tx);
      if (!upload) {
        await tx.update(agentTasks).set({ status: "failed", error: NOT_EXPECTED, updatedAt: now }).where(eq(agentTasks.id, task.id));
        return null;
      }
      await tx.update(agentTasks).set(leaseValues(agentId, now)).where(eq(agentTasks.id, task.id));
      return { taskId: task.id, kind: "referencia", url: task.url, ...upload, maxBytes: MAX_REFERENCE_BYTES };
    });
    if (claimed) return claimed;
  }
  return null;
}

/** Lo que se apunta en una tarea al reservarla. */
const leaseValues = (agentId: number, now: Date) => ({
  status: "leased",
  agentId,
  leasedAt: now,
  leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
  attempts: sql`${agentTasks.attempts} + 1`,
  updatedAt: now,
});

/**
 * Reserva la tarea de canción `taskId` si sigue en cola, con una sesión de subida nueva (la de una
 * reserva anterior deja de valer y su archivo se borra); `null` si otro Mac se la llevó.
 */
async function claimSongTask(agentId: number, taskId: number, queued: SQL | undefined, now: Date): Promise<ClaimedTask | null> {
  const claimed = await getDb().transaction(async (tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, url: agentTasks.url })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), queued))
      .for("update", { skipLocked: true });
    if (!task) return null;
    const { uploadId, previous } = await openSongUpload(tx, task.id);
    await tx.update(agentTasks).set(leaseValues(agentId, now)).where(eq(agentTasks.id, task.id));
    const claimedTask: ClaimedTask = { taskId: task.id, kind: "cancion", url: task.url, uploadId, chunkBytes: CHUNK_BYTES, maxBytes: MAX_SONG_BYTES };
    return { task: claimedTask, previous };
  });
  if (!claimed) return null;
  await removeSongFile(claimed.previous);
  return claimed.task;
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
 * (`uploadId`): un trozo rezagado de un intento anterior, aunque sea del mismo Mac, da 409 y no
 * prolonga nada; sin `uploadId`, 400. Cada trozo válido prolonga la reserva.
 */
export async function appendTaskChunk(
  agentId: number,
  taskId: number,
  uploadId: string,
  index: number,
  bytes: Buffer,
  now: Date = new Date(),
): Promise<{ received: number }> {
  if (typeof uploadId !== "string" || uploadId === "") throw new HttpError(400, NO_UPLOAD);
  // Primero, que la reserva y su sesión sean las de quien llama; solo entonces se prolonga.
  if (!isId(taskId)) throw taskLost();
  const [held] = await getDb().select({ kind: agentTasks.kind, uploadId: agentTasks.uploadId }).from(agentTasks).where(leasedBy(agentId, taskId));
  if (held?.kind === "phone_publish") {
    if (held.uploadId !== uploadId) throw taskLost();
    await extendLease(agentId, taskId, now);
    return appendPhoneChunk(taskId, uploadId, index, bytes);
  }
  if (held?.kind === SONG_TASK || held?.kind === MEDIA_FETCH_TASK || held?.kind === PROFILE_TASK || held?.kind === MARKET_TASK || held?.kind === PINTEREST_TASK) {
    // Una canción, un vídeo de enlace para el montaje o un perfil: su sesión es la de la propia tarea.
    if (held.uploadId !== uploadId) throw taskLost();
    await extendLease(agentId, taskId, now);
    if (held.kind === PROFILE_TASK) return appendProfileChunk(taskId, uploadId, index, bytes);
    if (held.kind === MARKET_TASK) return appendMarketChunk(taskId, uploadId, index, bytes);
    if (held.kind === PINTEREST_TASK) return appendPinterestChunk(taskId, uploadId, index, bytes);
    return held.kind === SONG_TASK ? appendSongChunk(taskId, uploadId, index, bytes) : appendMediaFetchChunk(taskId, uploadId, index, bytes);
  }
  if (!held || (await agentUploadId(taskId)) !== uploadId) throw taskLost();
  await extendLease(agentId, taskId, now);
  try {
    return await appendChunk(uploadId, index, bytes, { agentTaskId: taskId });
  } catch (error) {
    // Esa sesión ya no existe o no es de esta tarea.
    if (error instanceof HttpError && error.status === 404) throw taskLost();
    throw error;
  }
}

/**
 * Lo que el Mac dice al terminar; `uploadId` es la sesión que recibió al reservar la tarea. Con
 * una canción, `title` es el título que dio yt-dlp.
 */
export type TaskResult =
  | { ok: true; uploadId: string; totalBytes: number; title?: string }
  | { ok: false; uploadId: string; error: string }
  | ClaudeCodeResult;

/**
 * El Mac termina la tarea. Si fue bien, dice cuánto pesa lo que entregó y el vídeo entra en el
 * mismo procesado que una subida (`finishUpload`); repetirlo no hace nada. Si no pudo, se borra
 * lo que hubiera llegado, el detalle (recortado) se guarda en la tarea y el vídeo lo dice con el
 * texto fijo (una referencia que ya estaba lista sigue lista). Solo quien tiene la reserva y con
 * la sesión de esa reserva.
 */
export async function finishTask(agentId: number, taskId: number, result: TaskResult, now: Date = new Date()): Promise<void> {
  if (typeof result.uploadId !== "string" || result.uploadId === "") throw new HttpError(400, NO_UPLOAD);
  if (!isId(taskId)) throw taskLost();
  const db = getDb();
  const [found] = await db
    .select({ id: agentTasks.id, videoId: agentTasks.videoId, status: agentTasks.status, agentId: agentTasks.agentId, kind: agentTasks.kind })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));
  if (!found || found.agentId !== agentId) throw taskLost();
  // Una llamada a Claude se cierra (y se guarda) en `claude-mac`.
  if (found.kind === "phone_publish") return finishPhoneTask(agentId, taskId, result, now);
  if (found.kind === CLAUDE_CODE_TASK) return finishClaudeCodeTask(agentId, taskId, result as ClaudeCodeResult, now);
  if (!("totalBytes" in result) && result.ok) throw new HttpError(400, "Resultado no válido.");
  // Un vídeo de enlace para el montaje se cierra (y se guarda) en `link-media`.
  if (found.kind === MEDIA_FETCH_TASK) return finishMediaFetchTask(agentId, taskId, result as MediaFetchResult, { now: () => now });
  // Un perfil se cierra (y se guarda) en `link-profiles`.
  if (found.kind === PROFILE_TASK) return finishProfileTask(agentId, taskId, result as ProfileFetchResult, now);
  if (found.kind === MARKET_TASK) return finishMarketTask(agentId, taskId, result as MarketResult, now);
  // Una búsqueda de Pinterest se cierra (y se guarda) en `pinterest-searches`.
  if (found.kind === PINTEREST_TASK) return finishPinterestTask(agentId, taskId, result as PinterestSearchResult, now);
  // Una canción se cierra (y se guarda) en `song-downloads`.
  if (found.videoId === null) return finishSongTask(agentId, taskId, result, now);
  const task = { ...found, videoId: found.videoId };
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased") throw taskLost();

  if (!result.ok) {
    const discarded = await db.transaction(async (tx) => {
      await lockVideoReference(tx, task.videoId);
      if ((await agentUploadId(task.id, tx)) !== result.uploadId) throw taskLost();
      const closed = await tx
        .update(agentTasks)
        .set({ status: "failed", error: clip(result.error, MAX_ERROR) || NO_DETAIL, leaseExpiresAt: null, updatedAt: now })
        .where(leasedBy(agentId, task.id))
        .returning({ id: agentTasks.id });
      if (closed.length === 0) throw taskLost();
      return retryOrFailLink(tx, task.id, task.videoId, now);
    });
    await removeUploadFiles(discarded);
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

/**
 * La tarea de enlace `taskId` acaba de fallar porque el Mac no pudo traerlo. Si el vídeo sigue
 * esperándola y le quedan reintentos automáticos, se pone en cola otra tarea con el mismo enlace,
 * reservable dentro de `LINK_RETRY_DELAY_MS`, y el vídeo pasa a esperarla (sigue «en cola»). Si
 * no, el vídeo dice «Enlace no disponible» (`failLinkReference`). Devuelve las sesiones de subida
 * descartadas, cuyo archivo se borra fuera de la transacción.
 */
async function retryOrFailLink(tx: Tx, taskId: number, videoId: number, now: Date): Promise<string[]> {
  const [task] = await tx
    .select({ url: agentTasks.url, createdBy: agentTasks.createdBy, autoRetry: agentTasks.autoRetry })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));
  const video = await lockVideoReference(tx, videoId);
  const waiting = video !== null && video.linkTaskId === taskId && video.referenceStatus !== "processing";
  if (!task || !waiting || task.autoRetry >= MAX_LINK_RETRIES) {
    await failLinkReference(tx, videoId, taskId, LINK_FAILED);
    return [];
  }
  const [retry] = await tx
    .insert(agentTasks)
    .values({
      kind: "link_download",
      videoId,
      url: task.url,
      createdBy: task.createdBy,
      autoRetry: task.autoRetry + 1,
      availableAt: new Date(now.getTime() + LINK_RETRY_DELAY_MS),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: agentTasks.id });
  return expectLinkReference(tx, videoId, retry.id);
}

/**
 * Cierra como fallida una tarea que sigue cumpliendo `condition` y lo refleja en su vídeo. La de
 * una canción no tiene vídeo: se borra lo que hubiera llegado.
 */
async function failTask(task: { id: number; videoId: number | null; kind: string }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  if (task.kind === "phone_publish") return failPhoneTask(task.id, condition, reason, now);
  const { videoId } = task;
  if (task.kind === CLAUDE_CODE_TASK) return failClaudeCodeTask(task, condition, reason, now);
  if (task.kind === MEDIA_FETCH_TASK) return failMediaFetchTask(task, condition, reason, now);
  if (task.kind === PROFILE_TASK) return failProfileTask(task, condition, reason, now);
  if (task.kind === MARKET_TASK) return failMarketTask(task, condition, reason, now);
  if (task.kind === PINTEREST_TASK) return failPinterestTask(task, condition, reason, now);
  if (videoId === null) {
    const [before] = await getDb().select({ uploadId: agentTasks.uploadId }).from(agentTasks).where(eq(agentTasks.id, task.id));
    const [closed] = await getDb()
      .update(agentTasks)
      .set({ status: "failed", error: reason, leaseExpiresAt: null, uploadId: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), condition))
      .returning({ id: agentTasks.id });
    if (closed) await removeSongFile(before?.uploadId ?? null);
    return;
  }
  await getDb().transaction(async (tx) => {
    await lockVideoReference(tx, videoId);
    const closed = await tx
      .update(agentTasks)
      .set({ status: "failed", error: reason, leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(agentTasks.id, task.id), condition))
      .returning({ id: agentTasks.id });
    // Si entretanto cambió (llegó un latido, alguien la reservó), se queda como está.
    if (closed.length > 0) await failLinkReference(tx, videoId, task.id, LINK_FAILED);
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
  const phoneExpired = await db.select({ id: agentTasks.id }).from(agentTasks).where(and(expired, eq(agentTasks.kind, "phone_publish")));
  for (const task of phoneExpired) await failPhoneTask(task.id, expired, "Se perdió la conexión durante la publicación; comprueba la cuenta antes de repetir.", now);
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
    const tasks = await db.select({ id: agentTasks.id, videoId: agentTasks.videoId, kind: agentTasks.kind }).from(agentTasks).where(condition);
    for (const task of tasks) await failTask(task, condition, reason, now);
  }
  await db
    .update(agentTasks)
    .set({ status: "queued", leaseExpiresAt: null, updatedAt: now })
    .where(and(expired, lt(agentTasks.attempts, MAX_TASK_ATTEMPTS)));
}
