import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

/**
 * Lo poco de las tareas del Mac que necesita la capa de vídeos (`src/server/videos/`): cancelar
 * el enlace pendiente cuando la persona sube un archivo, y leer el enlace de un vídeo para
 * enseñarlo. Va aparte de `src/server/agent.ts` (el protocolo del agente), que importa la capa de
 * vídeos: así no hay ciclo de importaciones. No sabe nada de vídeos: solo filas de tareas.
 */

/** Lo que ve la persona cuando el Mac no consigue traer un enlace. Nunca el detalle técnico. */
export const LINK_FAILED = "No se pudo descargar el enlace. Sube el archivo del vídeo.";
/** Lo que ve la persona cuando la tarea se pasó del tiempo máximo. */
export const LINK_TOO_SLOW = "El Mac no trajo el enlace a tiempo. Pégalo otra vez o sube el archivo del vídeo.";
/** Motivo (interno, en la tarea) de una tarea que se pasó del tiempo máximo. */
export const TASK_TOO_OLD = "La tarea superó el tiempo máximo.";

const agentTasks = schema.agentTasks;
const ACTIVE = ["queued", "leased"];

type Db = ReturnType<typeof getDb>;

/** Lo que se le dice a la persona de una tarea fallida, según el motivo apuntado en ella. */
export function linkFailureMessage(error: string | null): string {
  return error === TASK_TOO_OLD ? LINK_TOO_SLOW : LINK_FAILED;
}

/**
 * Cierra las tareas vivas (en cola o reservadas) de un vídeo porque otra cosa las sustituye: otro
 * enlace o un archivo subido. El Mac que tuviera una se entera en su siguiente paso (409). Quien
 * llama tiene el vídeo bloqueado (cerrojos: el vídeo, después la tarea).
 */
export async function cancelLinkTasks(executor: Pick<Db, "update">, videoId: number, reason: string, now: Date = new Date()): Promise<void> {
  await executor
    .update(agentTasks)
    .set({ status: "failed", error: reason, leaseExpiresAt: null, updatedAt: now })
    .where(and(eq(agentTasks.videoId, videoId), inArray(agentTasks.status, ACTIVE)));
}

/** El enlace de un vídeo tal como lo enseña su pantalla. */
export interface LinkState {
  url: string;
  /** `queued`: esperando al Mac; `downloading`: un Mac lo tiene; `failed`: no se pudo traer. */
  status: "queued" | "downloading" | "failed";
  /** Por qué falló, en español y apto para la persona; `null` si no ha fallado. */
  error: string | null;
}

/** El estado del enlace de la tarea `taskId` (el `linkTaskId` de un vídeo), o `null` si no hay nada que enseñar. */
export async function linkStateOf(taskId: number | null): Promise<LinkState | null> {
  if (taskId === null) return null;
  const [task] = await getDb()
    .select({ url: agentTasks.url, status: agentTasks.status, error: agentTasks.error })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));
  if (!task) return null;
  if (task.status === "queued") return { url: task.url, status: "queued", error: null };
  if (task.status === "leased") return { url: task.url, status: "downloading", error: null };
  if (task.status === "failed") return { url: task.url, status: "failed", error: linkFailureMessage(task.error) };
  return null;
}

/** La dirección del enlace de una tarea, para apuntarla en la referencia que trajo. */
export async function linkUrlOfTask(taskId: number): Promise<string | null> {
  const [task] = await getDb().select({ url: agentTasks.url }).from(agentTasks).where(eq(agentTasks.id, taskId));
  return task?.url ?? null;
}
