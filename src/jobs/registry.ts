import type { JobContext } from "@/jobs/steps";

/**
 * Qué trabajos y qué tareas programadas existen. Aquí solo se apuntan; quien los ejecuta es el
 * proceso en segundo plano (`startWorker`, en `boss.ts`), que atiende lo que esté definido en el
 * momento de arrancar: los módulos que definen trabajos deben importarse antes.
 */

export type JobHandler<TData extends object = object> = (data: TData, ctx: JobContext) => Promise<void>;

export interface ScheduledTask {
  name: string;
  /** Expresión cron de cinco campos, en UTC. */
  cron: string;
  run: () => Promise<void>;
}

/** Nombres que admite la cola: letras, números, guiones, guiones bajos, puntos y barras. */
const NAME = /^[\w.\-/]+$/;

// En `globalThis` para que una recarga en caliente de desarrollo no deje dos registros distintos.
const registry = globalThis as unknown as {
  __principalJobs?: Map<string, JobHandler>;
  __principalSchedules?: Map<string, ScheduledTask>;
};
const jobs = (registry.__principalJobs ??= new Map());
const schedules = (registry.__principalSchedules ??= new Map());
const labels = new Map<string, string>();

/** Lanza si el nombre no vale para la cola. */
export function assertJobName(name: string): void {
  if (typeof name !== "string" || !NAME.test(name)) throw new Error(`Nombre de trabajo no válido: «${String(name)}».`);
}

/**
 * Define un trabajo: lo que hay que hacer cuando llega uno con ese nombre. `data` es lo que se
 * pasó a `enqueueJob`; el manejador debe hacer cada llamada externa dentro de `runStep`, porque
 * un trabajo puede ejecutarse más de una vez (al reanudarse o reintentarse). Definir otra vez el
 * mismo nombre sustituye al anterior. `label` es cómo se llama en pantalla.
 */
export function defineJob<TData extends object>(
  name: string,
  handler: (data: TData, ctx: JobContext) => Promise<void>,
  label?: string,
): void {
  assertJobName(name);
  if (schedules.has(name)) throw new Error(`«${name}» ya es una tarea programada.`);
  jobs.set(name, handler as JobHandler);
  if (label) labels.set(name, label);
}

/** Nombre legible de un trabajo para las pantallas (el que se dio al definirlo, o su nombre). */
export function jobLabel(name: string): string {
  return labels.get(name) ?? name;
}

/**
 * Define una tarea que se ejecuta sola según `cron` (cinco campos, en UTC), sin persona ni
 * producto. Si falla no se reintenta: vuelve a ejecutarse en su siguiente hora.
 */
export function defineSchedule(name: string, cron: string, run: () => Promise<void>): void {
  assertJobName(name);
  if (jobs.has(name)) throw new Error(`«${name}» ya es un trabajo.`);
  schedules.set(name, { name, cron, run });
}

export function jobHandler(name: string): JobHandler | undefined {
  return jobs.get(name);
}

export function jobNames(): string[] {
  return [...jobs.keys()];
}

export function scheduledTasks(): ScheduledTask[] {
  return [...schedules.values()];
}
