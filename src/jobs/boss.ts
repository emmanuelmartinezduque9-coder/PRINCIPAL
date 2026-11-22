import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { fromDrizzle, PgBoss, type Job } from "pg-boss";
import { databaseUrl, getDb, schema } from "@/db/client";
import {
  assertJobName,
  defineSchedule,
  jobHandler,
  jobNames,
  scheduledTasks,
  type ScheduledTask,
} from "@/jobs/registry";
import { failExhaustedSteps, JobPausedError, retryableStep, runAsJob, type JobContext } from "@/jobs/steps";
import { hasRoom, settleInterruptedSpend } from "@/server/spend";

/**
 * Cola de trabajos sobre PostgreSQL (pg-boss, en su propio esquema `pgboss` de la misma base de
 * datos). La web solo encola; el proceso en segundo plano (`startWorker`) ejecuta los trabajos y
 * las tareas programadas.
 *
 * La cola no reintenta nada por su cuenta: los reintentos los cuenta `runStep` en `job_steps`.
 * Cuando un paso queda en pausa, falla o se interrumpe, su fila guarda con qué se encoló el
 * trabajo (`payload`), y desde aquí se vuelve a encolar: la fila pasa a `queued` en la misma
 * transacción en la que el trabajo entra en la cola, así que cada uno se reencola una sola vez.
 */

const SCHEMA = "pgboss";

/** Tiempo que la cola da a un trabajo antes de darlo por colgado. */
const JOB_EXPIRE_SECONDS = 2 * 60 * 60;

/** Sin reintentos de la cola: un trabajo que lanza un error no vuelve a ejecutarse solo. */
const NO_RETRIES = { retryLimit: 0, expireInSeconds: JOB_EXPIRE_SECONDS };

/** Al parar, lo que se espera a que terminen los trabajos en marcha. */
const STOP_TIMEOUT_MS = 10_000;

const RESUME_TASK = "reanudar-pausados";
const RECOVER_TASK = "recuperar-pasos";

/** Lo que viaja en la cola: de quién es el trabajo y los datos con los que se encoló. */
interface QueuedJob {
  userId: number;
  productId: number | null;
  data: object;
}

interface Runtime {
  boss: PgBoss;
  /** `true` en el proceso en segundo plano; `false` si esta instancia solo encola. */
  worker: boolean;
  queues: Set<string>;
}

// Una sola instancia por proceso, también entre recargas en caliente de desarrollo.
const holder = globalThis as unknown as { __principalBoss?: Promise<Runtime> | null };

const steps = schema.jobSteps;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function open(worker: boolean): Promise<Runtime> {
  const boss = new PgBoss({
    connectionString: databaseUrl(),
    schema: SCHEMA,
    max: worker ? 6 : 2,
    instanceName: worker ? "principal-worker" : "principal-web",
    // Solo el proceso en segundo plano programa tareas y hace el mantenimiento de la cola.
    schedule: worker,
    supervise: worker,
  });
  boss.on("error", (error) => console.error("[cola]", error.message));
  await boss.start();
  return { boss, worker, queues: new Set() };
}

/** Abre la cola de este proceso. Si no arranca, no se queda guardado el fallo: la siguiente vez se reintenta. */
function openAs(worker: boolean): Promise<Runtime> {
  const opening: Promise<Runtime> = open(worker).catch((error) => {
    if (holder.__principalBoss === opening) holder.__principalBoss = null;
    throw error;
  });
  holder.__principalBoss = opening;
  return opening;
}

function runtime(): Promise<Runtime> {
  return holder.__principalBoss ?? openAs(false);
}

/** La cola de este proceso; si aún no hay, abre una que solo encola. Para pruebas y diagnóstico. */
export async function getBoss(): Promise<PgBoss> {
  return (await runtime()).boss;
}

async function ensureQueue(current: Runtime, name: string): Promise<void> {
  if (current.queues.has(name)) return;
  // Si la cola ya existe no cambia nada.
  await current.boss.createQueue(name, NO_RETRIES);
  current.queues.add(name);
}

function isId(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Encola un trabajo para que lo ejecute el proceso en segundo plano. `data` es lo único que el
 * trabajo recibirá, y también lo que cada uno de sus pasos guarda en `job_steps.payload` para
 * poder volver a encolarlo: lo fija quien encola y nadie lo cambia después. Tiene que ser un
 * objeto que quepa en JSON y no debe llevar secretos (se guarda en claro). Devuelve el
 * identificador del trabajo en la cola.
 *
 * No comprueba permisos: quien encola ya sabe quién es la persona; `runStep` vuelve a comprobar
 * que sigue activa y sigue viendo el producto antes de cada paso.
 */
export async function enqueueJob<TData extends object>(
  name: string,
  ctx: Omit<JobContext, "jobName">,
  data: TData,
): Promise<string> {
  assertJobName(name);
  if (!isId(ctx.userId, 0)) throw new Error("El trabajo no dice bien de quién es.");
  if (ctx.productId !== null && !isId(ctx.productId, 1)) throw new Error("El trabajo no dice bien de qué producto es.");
  if (!isPlainObject(data)) throw new Error("Los datos del trabajo deben ser un objeto.");
  let payload: object;
  try {
    payload = JSON.parse(JSON.stringify(data)) as object;
  } catch {
    throw new Error("Los datos del trabajo deben caber en JSON.");
  }

  const current = await runtime();
  await ensureQueue(current, name);
  const job: QueuedJob = { userId: ctx.userId, productId: ctx.productId, data: payload };
  const id = await current.boss.send(name, job, NO_RETRIES);
  if (!id) throw new Error("No se pudo encolar el trabajo.");
  return id;
}

/** Ejecuta un trabajo de la cola. En pausa por tope termina bien: su fila `paused_cap` lo reanudará. */
async function runJob(name: string, job: Job<QueuedJob>): Promise<void> {
  try {
    const handler = jobHandler(name);
    const queued = job.data;
    if (!handler) throw new Error("No hay nada definido para este trabajo.");
    if (!isPlainObject(queued) || !isPlainObject(queued.data)) throw new Error("El trabajo llegó sin datos válidos.");
    const ctx: JobContext = { jobName: name, userId: queued.userId, productId: queued.productId };
    await runAsJob(queued.data, () => handler(queued.data, ctx));
  } catch (error) {
    if (error instanceof JobPausedError) return;
    const message = messageOf(error);
    console.error(`[cola] El trabajo «${name}» no ha terminado: ${message}`);
    // A la cola solo llega el mensaje: el error original puede llevar detalles que no deben guardarse.
    throw new Error(message);
  }
}

async function runTask(task: ScheduledTask): Promise<void> {
  try {
    await task.run();
  } catch (error) {
    const message = messageOf(error);
    console.error(`[cola] La tarea «${task.name}» ha fallado: ${message}`);
    throw new Error(message);
  }
}

/**
 * Arranca el proceso en segundo plano: atiende los trabajos definidos con `defineJob`, programa
 * las tareas periódicas y recupera lo que quedó a medias si el proceso anterior se cayó.
 */
export async function startWorker(): Promise<void> {
  const previous = holder.__principalBoss ? await holder.__principalBoss.catch(() => null) : null;
  if (previous?.worker) return;
  // Si este proceso ya había encolado algo, su instancia (que solo encola) se cambia por la completa.
  if (previous) await previous.boss.stop({ graceful: false });
  const current = await openAs(true);
  const { boss } = current;

  defineSchedule(RESUME_TASK, "5 * * * *", async () => {
    await resumePausedJobs();
  });
  // Cada 5 minutos y no solo al arrancar: un paso se da por interrumpido a los 15 minutos, y al
  // arrancar tras una caída todavía no ha pasado ese tiempo.
  defineSchedule(RECOVER_TASK, "*/5 * * * *", async () => {
    await recoverInterruptedSteps();
  });

  for (const name of jobNames()) {
    await ensureQueue(current, name);
    await boss.work<QueuedJob>(name, ([job]) => runJob(name, job));
  }

  const tasks = scheduledTasks();
  for (const task of tasks) {
    await ensureQueue(current, task.name);
    await boss.work(task.name, () => runTask(task));
    await boss.schedule(task.name, task.cron, null, { ...NO_RETRIES, tz: "UTC" });
  }
  // Una tarea que ya no está definida dejaría trabajos en una cola que nadie atiende.
  const defined = new Set(tasks.map((task) => task.name));
  for (const schedule of await boss.getSchedules()) {
    if (!defined.has(schedule.name)) await boss.unschedule(schedule.name, schedule.key);
  }

  await recoverInterruptedSteps();
}

/** Para la cola de este proceso; espera unos segundos a que terminen los trabajos en marcha. */
export async function stopWorker(): Promise<void> {
  const pending = holder.__principalBoss;
  holder.__principalBoss = null;
  if (!pending) return;
  const current = await pending.catch(() => null);
  await current?.boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
}

// ───────────────────────── Volver a encolar ─────────────────────────

interface StalledJob {
  jobName: string;
  userId: number;
  productId: number | null;
  data: object;
  /** Claves de los pasos de ese trabajo que están esperando. */
  keys: string[];
}

/** Agrupa pasos por el trabajo del que son: mismo nombre, persona, producto y datos. */
function groupByJob(
  rows: Array<{ key: string; jobName: string; userId: number; productId: number | null; payload: unknown }>,
): StalledJob[] {
  const groups = new Map<string, StalledJob>();
  for (const row of rows) {
    if (!isPlainObject(row.payload)) continue;
    const id = JSON.stringify([row.jobName, row.userId, row.productId, row.payload]);
    const group = groups.get(id);
    if (group) group.keys.push(row.key);
    else {
      groups.set(id, {
        jobName: row.jobName,
        userId: row.userId,
        productId: row.productId,
        data: row.payload,
        keys: [row.key],
      });
    }
  }
  return [...groups.values()];
}

const stalledColumns = {
  key: steps.key,
  jobName: steps.jobName,
  userId: steps.userId,
  productId: steps.productId,
  payload: steps.payload,
};

/**
 * Vuelve a encolar un trabajo. En una sola transacción: sus pasos que sigan cumpliendo `waiting`
 * pasan a `queued`, lo que dejaron reservado sin cerrar cuenta como gastado, y el trabajo entra en
 * la cola. Si otro proceso se adelantó no queda ninguna fila que cambiar y no se encola nada.
 */
async function requeue(job: StalledJob, waiting: SQL | undefined): Promise<boolean> {
  const current = await runtime();
  await ensureQueue(current, job.jobName);
  return getDb().transaction(async (tx) => {
    const moved = await tx
      .update(steps)
      .set({ status: "queued", updatedAt: new Date() })
      .where(and(inArray(steps.key, job.keys), waiting))
      .returning({ key: steps.key });
    if (moved.length === 0) return false;
    await settleInterruptedSpend(
      moved.map((row) => row.key),
      tx,
    );
    const queued: QueuedJob = { userId: job.userId, productId: job.productId, data: job.data };
    const id = await current.boss.send(job.jobName, queued, { ...NO_RETRIES, db: fromDrizzle(tx, sql) });
    if (!id) throw new Error("La cola no aceptó el trabajo.");
    return true;
  });
}

/** Reencola cada trabajo; si uno no se puede, se anota y se sigue con los demás. */
async function requeueAll(jobs: StalledJob[], waiting: SQL | undefined): Promise<number> {
  let count = 0;
  for (const job of jobs) {
    try {
      if (await requeue(job, waiting)) count += 1;
    } catch (error) {
      console.error(`[cola] No se pudo volver a encolar «${job.jobName}»: ${messageOf(error)}`);
    }
  }
  return count;
}

/**
 * Vuelve a encolar los trabajos en pausa por tope cuya persona vuelve a tener saldo (porque subió
 * un tope o cambió el mes). Devuelve cuántos. Cada trabajo se reanuda una sola vez: al encolarlo
 * sus pasos dejan de estar en `paused_cap`, y una segunda pasada ya no los encuentra.
 */
export async function resumePausedJobs(now: Date = new Date()): Promise<number> {
  const paused = and(eq(steps.status, "paused_cap"), isNotNull(steps.payload));
  const rows = await getDb().select(stalledColumns).from(steps).where(paused).orderBy(steps.updatedAt);
  if (rows.length === 0) return 0;

  const room = new Map<number, boolean>();
  const ready: StalledJob[] = [];
  for (const job of groupByJob(rows)) {
    if (!room.has(job.userId)) room.set(job.userId, await hasRoom(job.userId, now));
    if (room.get(job.userId)) ready.push(job);
  }
  return requeueAll(ready, paused);
}

/**
 * Recupera lo que quedó a medias: vuelve a encolar los trabajos con pasos que fallaron o que se
 * interrumpieron (llevan más de 15 minutos en marcha: el proceso que los llevaba se cayó), mientras
 * les queden intentos. Lo que un paso interrumpido tenía reservado no se libera: cuenta como
 * gastado. Los que ya no tienen intentos quedan fallidos. Devuelve cuántos trabajos reencoló.
 */
export async function recoverInterruptedSteps(now: Date = new Date()): Promise<number> {
  await failExhaustedSteps(now);
  const waiting = and(retryableStep(now), isNotNull(steps.payload));
  const rows = await getDb().select(stalledColumns).from(steps).where(waiting).orderBy(steps.updatedAt);
  if (rows.length === 0) return 0;
  return requeueAll(groupByJob(rows), waiting);
}
