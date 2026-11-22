import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
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
 * Estados de un paso: `running` (en marcha), `done` (hecho), `failed` (falló; se puede reintentar
 * mientras le queden intentos), `paused_cap` (esperando saldo; no cuenta como intento) y `queued`
 * (su trabajo se ha vuelto a encolar y aún no ha llegado a este paso). `pending` se acepta como
 * «aún sin empezar», aunque nada de este módulo lo escribe.
 *
 * Regla del dinero: quien se hace con un paso que no está en marcha da por gastadas las reservas
 * que ese paso dejó sin cerrar (`settleInterruptedSpend`); nunca se liberan.
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
 * proceso que lo llevaba se cayó). Mientras el proceso vive renueva la señal cada `HEARTBEAT_MS`,
 * así que un paso largo que sigue en marcha nunca se da por interrumpido, dure lo que dure.
 */
export const STALE_RUNNING_MS = 15 * 60 * 1000;

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

const steps = schema.jobSteps;

// ───────────────────────── Clave del paso ─────────────────────────

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

const staleSince = (now: Date) => new Date(now.getTime() - STALE_RUNNING_MS);

/**
 * Condición «en marcha pero sin señales de vida desde hace demasiado»: se da por interrumpido.
 * La última señal es el latido; una fila sin latido cuenta desde que empezó.
 */
const interrupted = (staleBefore: Date) =>
  and(
    eq(steps.status, "running"),
    or(
      lt(steps.heartbeatAt, staleBefore),
      and(isNull(steps.heartbeatAt), or(isNull(steps.startedAt), lt(steps.startedAt, staleBefore))),
    ),
  );

/** Condición «a este paso le toca reintento»: falló o se interrumpió, y le quedan intentos. */
export const retryableStep = (now: Date) =>
  and(lt(steps.attempts, MAX_ATTEMPTS), or(eq(steps.status, "failed"), interrupted(staleSince(now))));

/**
 * Deja el paso como fallido sin ejecutarlo porque la persona no puede: sin datos para reencolar
 * (nadie lo reintentará solo) y sin gastar intentos (si la persona recupera el acceso, o lo lanza
 * otra que sí lo tiene, se puede ejecutar). No toca un paso hecho, ni uno en marcha, ni el de otra
 * persona.
 */
async function stopStep(ctx: JobContext, key: string, reason: string): Promise<void> {
  const now = new Date();
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
        finishedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: steps.key,
        set: { status: "failed", error: reason, payload: null, finishedAt: now, updatedAt: now },
        setWhere: and(
          eq(steps.userId, ctx.userId),
          or(
            inArray(steps.status, WAITING),
            and(eq(steps.status, "failed"), lt(steps.attempts, MAX_ATTEMPTS)),
            interrupted(staleSince(now)),
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
 * Pasos interrumpidos (sin señales de vida) que ya habían gastado todos sus intentos: quedan fallidos
 * y su reserva pendiente cuenta como gastada. Con `key`, solo ese paso. Devuelve cuántos.
 */
export async function failExhaustedSteps(now: Date = new Date(), key?: string): Promise<number> {
  return getDb().transaction(async (tx) => {
    const failed = await tx
      .update(steps)
      .set({ status: "failed", error: INTERRUPTED, finishedAt: now, updatedAt: now })
      .where(
        and(
          interrupted(staleSince(now)),
          gte(steps.attempts, MAX_ATTEMPTS),
          key === undefined ? undefined : eq(steps.key, key),
        ),
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
    const now = new Date();
    const staleBefore = staleSince(now);
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
          startedAt: now,
          heartbeatAt: now,
          updatedAt: now,
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
            startedAt: now,
            heartbeatAt: now,
            finishedAt: null,
            updatedAt: now,
          },
          setWhere: or(inArray(steps.status, WAITING), retryableStep(now)),
        })
        .returning({ attempts: steps.attempts });
      if (!row) return null;
      // Lo que el paso dejó reservado y sin cerrar (se cayó a mitad, o falló sin liquidar) pudo
      // llegar a cobrarse: cuenta como gastado antes de volver a ejecutarlo.
      await settleInterruptedSpend([key], tx);
      return row;
    });
    if (claimed) return { claim: { key, attempts: claimed.attempts, startedAt: now } };

    const [row] = await db
      .select({
        status: steps.status,
        attempts: steps.attempts,
        startedAt: steps.startedAt,
        heartbeatAt: steps.heartbeatAt,
        error: steps.error,
      })
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
      const lastSeen = row.heartbeatAt ?? row.startedAt;
      const stale = lastSeen === null || lastSeen < staleBefore;
      if (!stale) throw new StepBusyError();
      if (row.attempts >= MAX_ATTEMPTS && (await failExhaustedSteps(now, key)) > 0) {
        throw new StepFailedError(INTERRUPTED);
      }
    }
  }
  throw new StepBusyError();
}

/**
 * Mientras el paso está en marcha, renueva su señal de vida cada `HEARTBEAT_MS`. Devuelve cómo
 * pararlo. Si un latido no se puede escribir no pasa nada: hacen falta muchos seguidos para que
 * el paso se dé por interrumpido.
 */
function startHeartbeat(claim: Claim): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await getDb().update(steps).set({ heartbeatAt: new Date() }).where(stillMine(claim));
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
 * Guarda el resultado de un paso ya ejecutado (y quizá ya pagado). Si la base de datos falla un
 * momento se reintenta el guardado, no el paso. Se guarda aunque entre tanto otro proceso haya
 * dado el paso por interrumpido: así el reintento lo encuentra hecho y no paga otra vez. Solo si
 * otro ya lo dejó hecho se respeta su resultado, que es el que se devuelve.
 */
async function saveResult(key: string, result: unknown): Promise<unknown> {
  const waits = [200, 1_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      const now = new Date();
      const saved = await getDb()
        .update(steps)
        .set({ status: "done", result, error: null, finishedAt: now, updatedAt: now })
        .where(and(eq(steps.key, key), ne(steps.status, "done")))
        .returning({ key: steps.key });
      if (saved.length > 0) return result;
      const stored = await storedResult(key);
      // Sin fila (alguien la borró) no hay nada que respetar: vale el resultado propio.
      return stored ? stored.result : result;
    } catch (error) {
      if (attempt >= waits.length) throw error;
      await delay(waits[attempt]);
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

function markFailed(claim: Claim, message: string, definitive: boolean): Promise<void> {
  const now = new Date();
  return mark(claim, {
    status: "failed",
    error: message,
    finishedAt: now,
    updatedAt: now,
    ...(definitive ? { attempts: MAX_ATTEMPTS } : {}),
  });
}

function markPaused(claim: Claim): Promise<void> {
  // La pausa no es un intento fallido: se deshace el incremento de la reclamación.
  return mark(claim, {
    status: "paused_cap",
    attempts: sql`greatest(${steps.attempts} - 1, 0)`,
    error: null,
    updatedAt: new Date(),
  });
}

/** El resultado tal como se guarda y como se devolverá al repetir: lo que cabe en JSON. */
function toStored(value: unknown): unknown {
  const json = JSON.stringify(value);
  return json === undefined ? null : JSON.parse(json);
}

/**
 * Ejecuta un paso una sola vez por clave.
 *
 * - Hecho → devuelve el resultado guardado, sin ejecutar `fn`.
 * - En marcha y dando señales de vida → `StepBusyError` («Este paso ya está en marcha.»).
 * - Sin empezar, en pausa, fallido con intentos, o en marcha pero sin señales de vida desde hace
 *   más de 15 minutos (se interrumpió) → se ejecuta, y cuenta un intento.
 * - Fallido sin intentos → `StepFailedError` con el error guardado, sin ejecutar `fn`.
 *
 * Si `fn` lanza un error de tope de gasto, el paso queda en pausa (`JobPausedError`) sin contar el
 * intento. Antes de nada se comprueba que la persona sigue activa y sigue viendo el producto: si
 * no, el paso queda fallido sin ejecutarse.
 *
 * El resultado tiene que caber en JSON y se devuelve tal como queda guardado (una fecha vuelve
 * como texto), la primera vez igual que al repetir.
 */
export async function runStep<T>(ctx: JobContext, key: string, fn: () => Promise<T>): Promise<T> {
  if (!key) throw new Error("Falta la clave del paso.");
  if (!validContext(ctx)) throw new StepFailedError(INVALID_CONTEXT);

  const denial = await accessDenial(ctx);
  if (denial) {
    await stopStep(ctx, key, denial);
    throw new StepFailedError(denial);
  }

  const outcome = await claimStep(ctx, key, currentJob.getStore()?.payload ?? null);
  if ("done" in outcome) return outcome.done as T;
  const { claim } = outcome;

  let value: T;
  const stopHeartbeat = startHeartbeat(claim);
  try {
    value = await fn();
  } catch (error) {
    stopHeartbeat();
    // También si la pausa viene de un paso ejecutado dentro de este.
    if (error instanceof SpendCapError || error instanceof LlmCapReachedError || error instanceof JobPausedError) {
      await markPaused(claim);
      throw new JobPausedError(error.scope);
    }
    await markFailed(claim, messageOf(error), error instanceof StepFailedError);
    throw error;
  }
  stopHeartbeat();

  let stored: unknown;
  try {
    stored = toStored(value);
  } catch {
    // Repetir el paso daría otro resultado igual de imposible de guardar, y lo pagaría de nuevo.
    await markFailed(claim, UNSAVEABLE, true);
    throw new StepFailedError(UNSAVEABLE);
  }
  return (await saveResult(key, stored)) as T;
}

// ───────────────────────── Trabajos en pausa ─────────────────────────

export interface PausedJob {
  jobName: string;
  productId: number | null;
  userId: number;
  since: Date;
}

/**
 * Trabajos que esperan saldo. El dueño ve los de todos; un colaborador, solo los suyos. Un
 * trabajo con varios pasos en pausa sale una sola vez, desde el más antiguo.
 */
export async function listPausedJobs(user: AuthUser): Promise<PausedJob[]> {
  const since = sql<Date>`min(${steps.updatedAt})`.mapWith(steps.updatedAt);
  const rows = await getDb()
    .select({ jobName: steps.jobName, productId: steps.productId, userId: steps.userId, since })
    .from(steps)
    .where(and(eq(steps.status, "paused_cap"), user.role === "dueno" ? undefined : eq(steps.userId, user.id)))
    .groupBy(steps.jobName, steps.productId, steps.userId, steps.payload)
    .orderBy(since);
  return rows;
}
