import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveUser } from "@/server/auth";

/**
 * Lo poco de las tareas del Mac que necesita la capa de vídeos (`src/server/videos/`): cancelar
 * el enlace pendiente cuando la persona sube un archivo, y leer el enlace de un vídeo para
 * enseñarlo. Va aparte de `src/server/agent.ts` (el protocolo del agente), que importa la capa de
 * vídeos: así no hay ciclo de importaciones. No sabe nada de vídeos: solo filas de tareas.
 */

/**
 * Lo que ve la persona cuando el enlace no llega (el Mac no pudo, tras los reintentos automáticos,
 * o se pasó del tiempo): un estado neutro, con «Reintentar» y «Cambiar enlace» al lado. Nunca el
 * detalle técnico, y nunca pedirle que suba el archivo.
 */
export const LINK_FAILED = "Enlace no disponible";
/** Motivo (interno, en la tarea) de una tarea que se pasó del tiempo máximo. */
export const TASK_TOO_OLD = "La tarea superó el tiempo máximo.";

const agentTasks = schema.agentTasks;
const ACTIVE = ["queued", "leased"];
/** Tipo (en la base de datos) de la tarea que trae el enlace de referencia de un vídeo. */
export const LINK_TASK = "link_download";
/** Tipo de la tarea que monta un vídeo en el Mac. */
export const MONTAJE_TASK = "montaje";

type Db = ReturnType<typeof getDb>;

/**
 * Cierra los enlaces vivos (en cola o reservados) de un vídeo porque otra cosa los sustituye: otro
 * enlace o un archivo subido. Un montaje del vídeo no se toca. El Mac que tuviera una se entera en su siguiente paso (409). Quien
 * llama tiene el vídeo bloqueado (cerrojos: el vídeo, después la tarea).
 */
export async function cancelLinkTasks(executor: Pick<Db, "update">, videoId: number, reason: string, now: Date = new Date()): Promise<void> {
  await executor
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, updatedAt: now })
    .where(and(eq(agentTasks.videoId, videoId), eq(agentTasks.kind, LINK_TASK), inArray(agentTasks.status, ACTIVE)));
}

/** El enlace de un vídeo tal como lo enseña su pantalla. */
export interface LinkState {
  url: string;
  /** `queued`: esperando al Mac; `downloading`: un Mac lo tiene; `failed`: no se pudo traer. */
  status: "queued" | "downloading" | "failed";
  /** Por qué falló, en español y apto para la persona; `null` si no ha fallado. */
  error: string | null;
}

function stateOf(task: { url: string; status: string; error: string | null }): LinkState | null {
  if (task.status === "queued") return { url: task.url, status: "queued", error: null };
  if (task.status === "leased") return { url: task.url, status: "downloading", error: null };
  if (task.status === "failed") return { url: task.url, status: "failed", error: LINK_FAILED };
  return null;
}

/** El estado del enlace de varias tareas a la vez (para el tablero de un lote), por identificador de tarea. */
export async function linkStatesOf(taskIds: number[]): Promise<Map<number, LinkState>> {
  const states = new Map<number, LinkState>();
  if (taskIds.length === 0) return states;
  const rows = await getDb()
    .select({ id: agentTasks.id, url: agentTasks.url, status: agentTasks.status, error: agentTasks.error })
    .from(agentTasks)
    .where(inArray(agentTasks.id, taskIds));
  for (const row of rows) {
    const state = stateOf(row);
    if (state) states.set(row.id, state);
  }
  return states;
}

/** El estado del enlace de la tarea `taskId` (el `linkTaskId` de un vídeo), o `null` si no hay nada que enseñar. */
export async function linkStateOf(taskId: number | null): Promise<LinkState | null> {
  if (taskId === null) return null;
  return (await linkStatesOf([taskId])).get(taskId) ?? null;
}

/** La dirección del enlace de una tarea, para apuntarla en la referencia que trajo. */
export async function linkUrlOfTask(taskId: number): Promise<string | null> {
  const [task] = await getDb().select({ url: agentTasks.url }).from(agentTasks).where(eq(agentTasks.id, taskId));
  return task?.url ?? null;
}

// ───────────────────────── Montaje ─────────────────────────

/**
 * El dueño cuyo Mac monta: un dueño activo con al menos un Mac con ficha en vigor (el que dio
 * señales más recientemente). `null` si no hay ninguno. No hace falta que esté conectado ahora: la
 * tarea espera en su cola.
 */
export async function macOwnerId(): Promise<number | null> {
  const rows = await getDb()
    .select({ createdBy: schema.agents.createdBy })
    .from(schema.agents)
    .where(isNull(schema.agents.revokedAt))
    .orderBy(desc(schema.agents.lastSeenAt), desc(schema.agents.id));
  for (const { createdBy } of rows) {
    if ((await getActiveUser(createdBy))?.role === "dueno") return createdBy;
  }
  return null;
}

/**
 * Pone en cola el montaje de un vídeo para el Mac de `ownerId`, dentro de la transacción de quien
 * llama (que tiene el vídeo bloqueado). La ficha se hace con el número de la tarea (`payload`).
 * Devuelve el número, o `null` si el vídeo ya tiene un montaje vivo (índice único parcial).
 */
export async function queueMontajeTask(
  tx: Pick<Db, "insert" | "update" | "select">,
  input: { videoId: number; ownerId: number; url: string; payload: (taskId: number) => unknown },
  now: Date = new Date(),
): Promise<number | null> {
  const [active] = await tx
    .select({ id: agentTasks.id })
    .from(agentTasks)
    .where(and(eq(agentTasks.videoId, input.videoId), eq(agentTasks.kind, MONTAJE_TASK), inArray(agentTasks.status, ACTIVE)));
  if (active) return null;
  const [task] = await tx
    .insert(agentTasks)
    .values({ kind: MONTAJE_TASK, videoId: input.videoId, url: input.url, createdBy: input.ownerId, createdAt: now, updatedAt: now })
    .returning({ id: agentTasks.id });
  await tx.update(agentTasks).set({ payload: input.payload(task.id) }).where(eq(agentTasks.id, task.id));
  return task.id;
}

/** En qué punto están varias tareas de montaje: `queued`, `leased`, `done` o `failed`, por número de tarea. */
export async function taskStatusesOf(taskIds: number[]): Promise<Map<number, string>> {
  if (taskIds.length === 0) return new Map();
  const rows = await getDb().select({ id: agentTasks.id, status: agentTasks.status }).from(agentTasks).where(inArray(agentTasks.id, taskIds));
  return new Map(rows.map((row) => [row.id, row.status]));
}
