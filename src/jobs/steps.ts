import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { and, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { LlmCapReachedError } from "@/llm/gateway";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor } from "@/server/products";
import { settleInterruptedSpend, SpendCapError } from "@/server/spend";

/**
 * Pasos reanudables de los trabajos en segundo plano. Cada paso que toca un servicio externo se
 * ejecuta con `runStep` bajo una clave única: la fila del paso queda confirmada en `job_steps`
 * antes de llamar, un paso hecho guarda su resultado y no se vuelve a ejecutar (ni a pagar), y un
 * paso que falla se reintenta como mucho `MAX_ATTEMPTS` veces en total.
 *
 * El trabajo entero también tiene su fila (clave `jobKey`), que escribe quien lo encola y que la
 * cola ejecuta como un paso que envuelve a los demás: así un trabajo que se queda a medias fuera
 * de un paso tampoco se pierde.
 *
 * Estados: `queued` (encolado, o vuelto a encolar, y aún sin empezar), `running` (en marcha),
 * `done` (hecho), `failed` (falló; se reintenta mientras le queden intentos) y `paused_cap`
 * (esperando saldo; no cuenta como intento). `pending` se acepta como «sin empezar», aunque nada
 * de este módulo lo escribe.
 *
 * Regla del dinero: quien se hace con un paso que no está en marcha da por gastadas las reservas
 * que ese paso dejó sin cerrar (`settleInterruptedSpend`); nunca se liberan.
 *
 * Las horas que deciden si algo lleva demasiado sin dar señales las pone y las compara la base
 * de datos (`now()`), no el reloj de cada proceso.
 */

export interface JobContext {
  jobName: string;
  userId: number;
  productId: number | null;
}

/** Intentos de un paso en total, contando el primero. */
export const MAX_ATTEMPTS = 3;

/**
 * Un paso en marcha que lleva más que esto sin dar señales de vida se da por interrumpido (el
 * proceso que lo llevaba se cayó o se reinició). Mientras el proceso vive renueva la señal cada
 * `HEARTBEAT_MS`, así que un paso largo que sigue en marcha nunca se da por interrumpido, dure
 * lo que dure. También es lo que espera un trabajo encolado antes de darse por perdido.
 */
export const STALE_RUNNING_MS = 2 * 60 * 1000;

/** Cada cuánto renueva su señal de vida un paso en marcha. */
export const HEARTBEAT_MS = 30 * 1000;

export type StepStatus = "pending" | "queued" | "running" | "done" | "failed" | "paused_cap";

const DISABLED = "Esta cuenta está desactivada.";
const BUSY = "Este paso ya está en marcha.";
const FAILED = "Este paso ha fallado.";
const INTERRUPTED = "El paso se interrumpió en su último intento.";
const UNSAVEABLE = "El resultado del paso no se puede guardar.";
const INVALID_CONTEXT = "El trabajo no dice bien de quién es o de qué producto.";
const MAX_ERROR_CHARS = 2_000;

/** Estados desde los que un paso se puede empezar sin más condiciones. */
const WAITING: StepStatus[] = ["pending", "queued", "paused_cap"];

/** El trabajo queda en pausa por tope de gasto: no es un fallo y se reanuda cuando haya saldo. */
export class JobPausedError extends Error {
  constructor(public scope: "global" | "persona") {
    super("El trabajo queda en pausa hasta que haya saldo.");
    this.name = "JobPausedError";
  }
}

/**
 * Fallo definitivo de un paso: no se reintenta. `runStep` lo lanza cuando el paso ya agotó sus
 * intentos o cuando la persona no puede ejecutarlo. Un paso también puede lanzarlo él mismo
 * cuando sabe que repetir no sirve (y costaría otra vez).
 */
export class StepFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepFailedError";
  }
}

/** Otra ejecución tiene este paso en marcha ahora mismo. */
export class StepBusyError extends Error {
  constructor() {
    super(BUSY);
    this.name = "StepBusyError";
  }
}

/**
 * El proceso se está parando y ya no empieza pasos nuevos. No es un fallo: el trabajo se queda
 * como encolado y se retoma solo cuando el proceso vuelve.
 */
export class WorkerStoppingError extends Error {
  constructor() {
    super("El proceso se está parando: el trabajo se retomará al volver.");
    this.name = "WorkerStoppingError";
  }
}

const steps = schema.jobSteps;

/** La hora de la base de datos, con la precisión que cabe en una fecha de JavaScript. */
export const dbNow = sql`date_trunc('milliseconds', now())`;

/** Antes de este momento (hora de la base de datos), la última señal ya es demasiado antigua. */
const silenceLimit = sql`now() - make_interval(secs => ${STALE_RUNNING_MS / 1000})`;

/** Sin señales desde hace demasiado; una fila sin latido cuenta desde que empezó. */
const silent = sql<boolean>`coalesce(${steps.heartbeatAt}, ${steps.startedAt}, '-infinity') < ${silenceLimit}`;

/** Condición «en marcha pero sin señales de vida»: el paso se da por interrumpido. */
export const interruptedStep = and(eq(steps.status, "running"), silent);

/** Condición «a este paso le toca reintento»: falló o se interrumpió, y le quedan intentos. */
export const retryableStep = and(
  lt(steps.attempts, MAX_ATTEMPTS),
  or(eq(steps.status, "failed"), interruptedStep),
);

/** Condición «encolado hace demasiado y nadie lo ha empezado»: su mensaje en la cola pudo perderse. */
export const forgottenStep = and(eq(steps.status, "queued"), lt(steps.updatedAt, silenceLimit));

// ───────────────────────── Claves ─────────────────────────

/** El mismo valor con las claves de sus objetos ordenadas, para que el JSON no dependa del orden. */
function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const withJson = value as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function") return canonical(withJson.toJSON());
  if (Array.isArray(value)) return value.map(canonical);
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonical(source[key])]),
  );
}

/**
 * Clave de un paso: trabajo, producto, nombre del paso y huella de su entrada. Con la misma
 * entrada sale la misma clave (aunque cambie el orden de las claves), así que repetir un trabajo
 * no repite sus pasos ya hechos. La misma clave se pasa a `LlmCall.stepKey`.
 *
 * La persona no forma parte de la clave: dos personas que piden lo mismo sobre el mismo producto
 * comparten el paso. Si el resultado es personal, la persona debe ir en `input`.
 */
export function stepKey(ctx: JobContext, stepName: string, input: unknown): string {
  const json = JSON.stringify(canonical(input)) ?? "null";
  const digest = crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
  return `${ctx.jobName}:${ctx.productId ?? "-"}:${stepName}:${digest}`;
}

/**
 * Clave de la fila del trabajo entero: el mismo trabajo, de la misma persona, sobre el mismo
 * producto y con los mismos datos es siempre la misma fila. Se puede calcular igual al encolar,
 * al ejecutar y al volver a encolar.
 */
export function jobKey(jobName: string, userId: number, productId: number | null, data: unknown): string {
  return stepKey({ jobName, userId, productId }, "@trabajo", { userId, data });
}

// ───────────────────────── Datos para reencolar ─────────────────────────

const currentJob = new AsyncLocalStorage<{ payload: object }>();

/**
 * Ejecuta `fn` como el trabajo que se encoló con `payload` (el `data` de `enqueueJob`). Los pasos
 * que se ejecuten dentro guardan ese `payload` en su fila: es lo que permite volver a encolar el
 * trabajo si un paso queda en pausa, falla o se interrumpe. Solo lo llama la cola (`boss.ts`).
 */
export function runAsJob<T>(payload: object, fn: () => Promise<T>): Promise<T> {
  return currentJob.run({ payload }, fn);
}

// ───────────────────────── Parada del proceso ─────────────────────────

let stopping = false;

/**
 * Mientras el proceso se para (`true`), `runStep` no empieza pasos nuevos: los que están en marcha
 * terminan y el trabajo se detiene entre un paso y el siguiente. Solo lo llama la cola.
 */
export function setStopping(value: boolean): void {
  stopping = value;
}

// ───────────────────────── Fallos que vienen de un paso de dentro ─────────────────────────

/**
 * Lo que un paso ya anotó sobre el error que deja pasar: `recorded` (lo contó como intento suyo)
 * o `definitive` (ya no se reintentará). El paso de fuera —el trabajo— lo lee para no contar el
 * mismo fallo dos veces y para no reintentar lo que ya no tiene arreglo.
 */
const noted = new WeakMap<object, "recorded" | "definitive">();

function note(error: unknown, outcome: "recorded" | "definitive"): void {
  if (typeof error === "object" && error !== null) noted.set(error, outcome);
}

/** ¿Este error ya quedó anotado en la fila de algún paso? */
export function isRecordedFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && noted.has(error);
}

// ───────────────────────── Quién puede ejecutar un paso ─────────────────────────

function validContext(ctx: JobContext): boolean {
  const { jobName, userId, productId } = ctx;
  return (
    typeof jobName === "string" &&
    jobName !== "" &&
    Number.isSafeInteger(userId) &&
    userId >= 0 &&
    (productId === null || (Number.isSafeInteger(productId) && productId > 0))
  );
}

/**
 * Por qué esta persona no puede ejecutar el paso, o `null` si puede. La persona tiene que seguir
 * activa (sea colaborador o dueño) y, si el trabajo es de un producto, seguir viéndolo.
 */
async function accessDenial(ctx: JobContext): Promise<string | null> {
  const user: AuthUser | null = await getActiveUser(ctx.userId);
  if (!user) return DISABLED;
  if (ctx.productId === null) return null;
  try {
    await getProductFor(user, ctx.productId);
    return null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return error.message;
    throw error;
  }
}

/**
 * Deja el paso como fallido sin ejecutarlo porque la persona no puede: sin datos para reencolar
 * (nadie lo reintentará solo) y sin gastar intentos (si la persona recupera el acceso, o lo lanza
 * otra que sí lo tiene, se puede ejecutar). No toca un paso hecho, ni uno en marcha, ni el de otra
 * persona.
 */
async function stopStep(ctx: JobContext, key: string, reason: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const stopped = await tx
      .insert(steps)
      .values({
        key,
        jobName: ctx.jobName,
        userId: ctx.userId,
        productId: ctx.productId,
        status: "failed",
        attempts: 0,
        error: reason,
        finishedAt: dbNow,
        updatedAt: dbNow,
      })
      .onConflictDoUpdate({
        target: steps.key,
        set: { status: "failed", error: reason, payload: null, finishedAt: dbNow, updatedAt: dbNow },
        setWhere: and(
          eq(steps.userId, ctx.userId),
          or(
            inArray(steps.status, WAITING),
            and(eq(steps.status, "failed"), lt(steps.attempts, MAX_ATTEMPTS)),
            interruptedStep,
          ),
        ),
      })
      .returning({ key: steps.key });
    await settleInterruptedSpend(
      stopped.map((row) => row.key),
      tx,
    );
  });
}

// ───────────────────────── Reclamar, ejecutar y guardar ─────────────────────────

/** Lo que identifica a esta ejecución del paso frente a otra que lo reclame después. */
interface Claim {
  key: string;
  attempts: number;
  startedAt: Date;
}

/** La fila sigue siendo de esta ejecución: nadie la ha reclamado después. */
const stillMine = (claim: Claim) =>
  and(
    eq(steps.key, claim.key),
    eq(steps.status, "running"),
    eq(steps.attempts, claim.attempts),
    eq(steps.startedAt, claim.startedAt),
  );

/** El resultado guardado, leído como texto: así una cadena que parece JSON vuelve como cadena. */
async function storedResult(key: string): Promise<{ status: string; result: unknown } | null> {
  const [row] = await getDb()
    .select({ status: steps.status, result: sql<string | null>`${steps.result}::text` })
    .from(steps)
    .where(eq(steps.key, key));
  if (!row) return null;
  return { status: row.status, result: row.result === null ? null : JSON.parse(row.result) };
}

/**
 * Pasos interrumpidos (sin señales de vida) que ya habían gastado todos sus intentos: quedan
 * fallidos y su reserva pendiente cuenta como gastada. Con `key`, solo ese paso. Devuelve cuántos.
 */
export async function failExhaustedSteps(key?: string): Promise<number> {
  return getDb().transaction(async (tx) => {
    const failed = await tx
      .update(steps)
      .set({ status: "failed", error: INTERRUPTED, finishedAt: dbNow, updatedAt: dbNow })
      .where(
        and(interruptedStep, gte(steps.attempts, MAX_ATTEMPTS), key === undefined ? undefined : eq(steps.key, key)),
      )
      .returning({ key: steps.key });
    await settleInterruptedSpend(
      failed.map((row) => row.key),
      tx,
    );
    return failed.length;
  });
}

/**
 * Se hace con el paso en una sola sentencia (`insert … on conflict do update … where`): dos
 * ejecuciones a la vez no pueden reclamarlo las dos. La fila queda confirmada como `running`
 * antes de que el paso haga nada. Si el paso ya está hecho devuelve su resultado.
 */
async function claimStep(
  ctx: JobContext,
  key: string,
  payload: object | null,
): Promise<{ claim: Claim } | { done: unknown }> {
  const db = getDb();
  // Más de una vuelta solo si la fila cambia entre no poder reclamarla y leerla.
  for (let round = 0; round < 3; round += 1) {
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(steps)
        .values({
          key,
          jobName: ctx.jobName,
          userId: ctx.userId,
          productId: ctx.productId,
          status: "running",
          attempts: 1,
          payload,
          startedAt: dbNow,
          heartbeatAt: dbNow,
          updatedAt: dbNow,
        })
        .onConflictDoUpdate({
          target: steps.key,
          // La fila pasa a ser de quien la ejecuta ahora, con sus datos para reencolar.
          set: {
            jobName: ctx.jobName,
            userId: ctx.userId,
            productId: ctx.productId,
            status: "running",
            attempts: sql`${steps.attempts} + 1`,
            payload,
            result: null,
            error: null,
            startedAt: dbNow,
            heartbeatAt: dbNow,
            finishedAt: null,
            updatedAt: dbNow,
          },
          setWhere: or(inArray(steps.status, WAITING), retryableStep),
        })
        .returning({ attempts: steps.attempts, startedAt: steps.startedAt });
      if (!row?.startedAt) return null;
      // Lo que el paso dejó reservado y sin cerrar (se cayó a mitad, o falló sin liquidar) pudo
      // llegar a cobrarse: cuenta como gastado antes de volver a ejecutarlo.
      await settleInterruptedSpend([key], tx);
      return { attempts: row.attempts, startedAt: row.startedAt };
    });
    if (claimed) return { claim: { key, ...claimed } };

    const [row] = await db
      .select({ status: steps.status, attempts: steps.attempts, error: steps.error, silent })
      .from(steps)
      .where(eq(steps.key, key));
    if (!row) continue;
    if (row.status === "done") {
      const stored = await storedResult(key);
      if (stored?.status === "done") return { done: stored.result };
      continue;
    }
    if (row.status === "failed" && row.attempts >= MAX_ATTEMPTS) throw new StepFailedError(row.error ?? FAILED);
    if (row.status === "running") {
      if (!row.silent) throw new StepBusyError();
      if (row.attempts >= MAX_ATTEMPTS && (await failExhaustedSteps(key)) > 0) {
        throw new StepFailedError(INTERRUPTED);
      }
    }
  }
  throw new StepBusyError();
}

/**
 * Mientras el paso está en marcha, renueva su señal de vida cada `HEARTBEAT_MS`. Devuelve cómo
 * pararlo. Si un latido no se puede escribir no pasa nada: hacen falta varios seguidos para que
 * el paso se dé por interrumpido.
 */
function startHeartbeat(claim: Claim): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await getDb().update(steps).set({ heartbeatAt: dbNow }).where(stillMine(claim));
      } catch {
        // El siguiente latido lo intentará de nuevo.
      }
    })();
  }, HEARTBEAT_MS);
  // El latido no debe mantener vivo un proceso que ya quiere terminar.
  timer.unref();
  return () => clearInterval(timer);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Guarda el resultado de un paso ya ejecutado (y quizá ya pagado). Si la base de datos no
 * responde se reintenta el guardado, no el paso, cada vez con más espera y durante tanto tiempo
 * como tarda un paso en darse por interrumpido; mientras, el paso sigue dando señales de vida.
 * Se guarda aunque entre tanto otro proceso lo haya dado por interrumpido: así el reintento lo
 * encuentra hecho y no paga otra vez. Solo si otro ya lo dejó hecho se respeta su resultado, que
 * es el que se devuelve.
 */
async function saveResult(key: string, result: unknown): Promise<unknown> {
  const giveUpAt = Date.now() + STALE_RUNNING_MS;
  for (let wait = 200; ; wait = Math.min(wait * 2, 5_000)) {
    try {
      const saved = await getDb()
        .update(steps)
        .set({ status: "done", result, error: null, finishedAt: dbNow, updatedAt: dbNow })
        .where(and(eq(steps.key, key), ne(steps.status, "done")))
        .returning({ key: steps.key });
      if (saved.length > 0) return result;
      const stored = await storedResult(key);
      // Sin fila (alguien la borró) no hay nada que respetar: vale el resultado propio.
      return stored ? stored.result : result;
    } catch (error) {
      if (Date.now() + wait > giveUpAt) throw error;
      await delay(wait);
    }
  }
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return (text || FAILED).slice(0, MAX_ERROR_CHARS);
}

/**
 * Anota cómo acabó un paso que no dio resultado. Si no se puede escribir, la fila se queda en
 * `running` y más tarde se recuperará como interrumpida: lo que importa a quien llama es el error
 * del paso, no este.
 */
async function mark(claim: Claim, values: PgUpdateSetSource<typeof steps>): Promise<void> {
  try {
    await getDb().update(steps).set(values).where(stillMine(claim));
  } catch (error) {
    console.error(`[cola] No se pudo anotar el estado del paso «${claim.key}»: ${messageOf(error)}`);
  }
}

/** Deshace el incremento de la reclamación: esta vez no cuenta como intento. */
const notCounted = sql`greatest(${steps.attempts} - 1, 0)`;

function markFailed(claim: Claim, message: string, attempts: "counted" | "notCounted" | "exhausted"): Promise<void> {
  return mark(claim, {
    status: "failed",
    error: message,
    finishedAt: dbNow,
    updatedAt: dbNow,
    ...(attempts === "exhausted" ? { attempts: MAX_ATTEMPTS } : attempts === "notCounted" ? { attempts: notCounted } : {}),
  });
}

/** El resultado tal como se guarda y como se devolverá al repetir: lo que cabe en JSON. */
function toStored(value: unknown): unknown {
  const json = JSON.stringify(value);
  return json === undefined ? null : JSON.parse(json);
}

/** Anota en la fila cómo acabó un paso cuyo `fn` lanzó `error`, y devuelve el error que debe salir. */
async function recordFailure(claim: Claim, error: unknown): Promise<unknown> {
  // Tope de gasto, también si viene de un paso ejecutado dentro de este: pausa, no intento fallido.
  if (error instanceof SpendCapError || error instanceof LlmCapReachedError || error instanceof JobPausedError) {
    await mark(claim, { status: "paused_cap", attempts: notCounted, error: null, updatedAt: dbNow });
    return new JobPausedError(error.scope);
  }
  // El proceso se para antes de empezar el siguiente paso: queda como encolado, para retomarlo.
  if (error instanceof WorkerStoppingError) {
    await mark(claim, { status: "queued", attempts: notCounted, error: null, updatedAt: dbNow });
    return error;
  }

  const inner = typeof error === "object" && error !== null ? noted.get(error) : undefined;
  const message = messageOf(error);
  if (error instanceof StepFailedError || inner === "definitive") {
    await markFailed(claim, message, "exhausted");
    note(error, "definitive");
  } else if (inner === "recorded") {
    // El fallo es de un paso de dentro, que ya lo contó: aquí no gasta otro intento.
    await markFailed(claim, message, "notCounted");
  } else {
    await markFailed(claim, message, "counted");
    note(error, claim.attempts >= MAX_ATTEMPTS ? "definitive" : "recorded");
  }
  return error;
}

/**
 * Ejecuta un paso una sola vez por clave.
 *
 * - Hecho → devuelve el resultado guardado, sin ejecutar `fn`.
 * - En marcha y dando señales de vida → `StepBusyError` («Este paso ya está en marcha.»).
 * - Sin empezar, en pausa, fallido con intentos, o en marcha pero sin señales de vida desde hace
 *   más de 2 minutos (se interrumpió) → se ejecuta, y cuenta un intento.
 * - Fallido sin intentos → `StepFailedError` con el error guardado, sin ejecutar `fn`.
 *
 * Si `fn` lanza un error de tope de gasto, el paso queda en pausa (`JobPausedError`) sin contar el
 * intento. Antes de nada se comprueba que la persona sigue activa y sigue viendo el producto: si
 * no, el paso queda fallido sin ejecutarse. Si el proceso se está parando, no empieza
 * (`WorkerStoppingError`).
 *
 * El resultado tiene que caber en JSON y se devuelve tal como queda guardado (una fecha vuelve
 * como texto), la primera vez igual que al repetir.
 */
export async function runStep<T>(ctx: JobContext, key: string, fn: () => Promise<T>): Promise<T> {
  if (!key) throw new Error("Falta la clave del paso.");
  if (!validContext(ctx)) throw new StepFailedError(INVALID_CONTEXT);
  if (stopping) throw new WorkerStoppingError();

  const denial = await accessDenial(ctx);
  if (denial) {
    await stopStep(ctx, key, denial);
    throw new StepFailedError(denial);
  }

  const outcome = await claimStep(ctx, key, currentJob.getStore()?.payload ?? null);
  if ("done" in outcome) return outcome.done as T;
  const { claim } = outcome;

  // La señal de vida sigue hasta que el resultado queda guardado: un paso ya pagado que no
  // consigue guardarse a la primera no debe parecer interrumpido.
  const stopHeartbeat = startHeartbeat(claim);
  try {
    let value: T;
    try {
      value = await fn();
    } catch (error) {
      throw await recordFailure(claim, error);
    }

    let stored: unknown;
    try {
      stored = toStored(value);
    } catch {
      // Repetir el paso daría otro resultado igual de imposible de guardar, y lo pagaría de nuevo.
      await markFailed(claim, UNSAVEABLE, "exhausted");
      const unsaveable = new StepFailedError(UNSAVEABLE);
      note(unsaveable, "definitive");
      throw unsaveable;
    }
    return (await saveResult(key, stored)) as T;
  } finally {
    stopHeartbeat();
  }
}

// ───────────────────────── Trabajos en pausa ─────────────────────────

export interface PausedJob {
  jobName: string;
  productId: number | null;
  userId: number;
  since: Date;
}

/**
 * Trabajos que esperan saldo y que se reanudarán solos cuando lo haya. El dueño ve los de todos;
 * un colaborador, solo los suyos. Un trabajo con varios pasos en pausa sale una sola vez, desde el
 * más antiguo. No salen los que nunca se reanudarán: pasos sueltos (sin datos para reencolar) y
 * trabajos de una persona desactivada.
 */
export async function listPausedJobs(user: AuthUser): Promise<PausedJob[]> {
  const since = sql<Date>`min(${steps.updatedAt})`.mapWith(steps.updatedAt);
  const rows = await getDb()
    .select({ jobName: steps.jobName, productId: steps.productId, userId: steps.userId, since })
    .from(steps)
    .where(
      and(
        eq(steps.status, "paused_cap"),
        isNotNull(steps.payload),
        user.role === "dueno" ? undefined : eq(steps.userId, user.id),
      ),
    )
    .groupBy(steps.jobName, steps.productId, steps.userId, steps.payload)
    .orderBy(since);

  const active = new Map<number, boolean>();
  for (const userId of new Set(rows.map((row) => row.userId))) {
    active.set(userId, (await getActiveUser(userId)) !== null);
  }
  return rows.filter((row) => active.get(row.userId));
}
