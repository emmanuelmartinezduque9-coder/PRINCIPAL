import { and, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb, getSetting, schema, setSetting, type Db } from "@/db/client";
import { authRequired, LOCAL_USER, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { listProductsFor, productNamesByIds } from "@/server/products";

/**
 * Libro de gasto y topes mensuales. Toda llamada de pago reserva aquí su coste previsto antes
 * de llamar (`reserveSpend`), y después se liquida con el coste real (`settleSpend`) o se libera
 * si no llegó a gastar (`releaseSpend`). Hay dos topes por mes natural en UTC: uno global para
 * toda la aplicación y otro por colaborador; el dueño solo tiene el global. Importes en
 * micro-dólares (1 USD = 1 000 000).
 */

export const DEFAULT_GLOBAL_CAP_MICROS = 30_000_000;
export const DEFAULT_COLLABORATOR_CAP_MICROS = 10_000_000;
export const GLOBAL_CAP_SETTING = "spend.globalCapMicros";

/**
 * Cerrojo de asesoría del libro, en la forma de dos claves `(espacio, clave)`. Las fotos y la
 * invitación del dueño usan la forma de una sola clave, que PostgreSQL guarda aparte: no chocan.
 * Todas las reservas comparten el mismo cerrojo porque el tope global es de todos.
 */
const SPEND_LOCK_NAMESPACE = 0x5350_454e; // "SPEN"
const SPEND_LOCK_KEY = 1;

export type SpendProvider = "claude" | "datos";
const PROVIDERS: readonly SpendProvider[] = ["claude", "datos"];

/** Estados que cuentan como gastado: lo reservado (aún sin liquidar) y lo liquidado. */
const COUNTED_STATUSES = ["reserved", "settled"];

const NO_PRODUCT = "Sin producto";
const DELETED_PRODUCT = "Producto borrado";
const HIDDEN_PRODUCTS = "Productos que ya no ves";
const DELETED_PERSON = "Persona borrada";

/** No queda saldo para lo que se quiere gastar. El mensaje es apto para mostrarse. */
export class SpendCapError extends Error {
  constructor(
    public scope: "global" | "persona",
    public capMicros: number,
    public spentMicros: number,
  ) {
    super(scope === "global" ? "Se ha alcanzado el tope mensual de gasto." : "Has alcanzado tu tope mensual de gasto.");
    this.name = "SpendCapError";
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

/** Mes natural en UTC que contiene `now`; `end` es el primer instante del mes siguiente. */
export function monthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

const entries = schema.spendEntries;

/** Lo que cuenta de cada fila: el coste real si ya se liquidó, si no lo reservado. */
const countedMicros = sql<number>`coalesce(sum(coalesce(${entries.costMicros}, ${entries.reservedMicros})), 0)::bigint`.mapWith(
  Number,
);

function inMonth(range: { start: Date; end: Date }, extra?: SQL): SQL | undefined {
  return and(
    gte(entries.createdAt, range.start),
    lt(entries.createdAt, range.end),
    inArray(entries.status, COUNTED_STATUSES),
    extra,
  );
}

async function spentIn(exec: Exec, range: { start: Date; end: Date }, userId?: number): Promise<number> {
  const [row] = await exec
    .select({ micros: countedMicros })
    .from(entries)
    .where(inMonth(range, userId === undefined ? undefined : eq(entries.userId, userId)));
  return row?.micros ?? 0;
}

function validCap(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function readGlobalCap(exec: Exec): Promise<number> {
  const [row] = await exec
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, GLOBAL_CAP_SETTING));
  if (!row) return DEFAULT_GLOBAL_CAP_MICROS;
  // Solo `setGlobalCap` lo escribe, y valida. Si aun así no vale, no se gasta (falla cerrada).
  if (!validCap(row.value)) throw new Error("El tope global guardado no es válido.");
  return row.value;
}

interface Spender {
  /** Tope propio efectivo; `null` para el dueño, que solo tiene el global. */
  capMicros: number | null;
  disabled: boolean;
}

function effectiveCap(row: { role: string; spendCapMicros: number | null }): number | null {
  if (row.role === "dueno") return null;
  return row.spendCapMicros ?? DEFAULT_COLLABORATOR_CAP_MICROS;
}

/** Quién gasta. El dueño en el propio ordenador (id 0) solo existe con el inicio de sesión apagado. */
async function spenderFor(exec: Exec, userId: number): Promise<Spender | null> {
  if (userId === LOCAL_USER.id) return authRequired() ? null : { capMicros: null, disabled: false };
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const [row] = await exec
    .select({ role: schema.users.role, spendCapMicros: schema.users.spendCapMicros, disabledAt: schema.users.disabledAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!row) return null;
  return { capMicros: effectiveCap(row), disabled: row.disabledAt !== null };
}

function assertMicros(value: number, what: string, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`${what} debe ser un número entero ${allowZero ? "no negativo" : "positivo"} de micro-dólares.`);
  }
}

function assertTokens(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)) {
    throw new Error("El número de tokens no es válido.");
  }
}

/**
 * Reserva el coste previsto de una llamada. Comprobación e inserción van en una transacción que
 * empieza tomando el cerrojo del libro: dos reservas nunca leen el mismo saldo, así que el tope
 * no se puede superar ni con llamadas simultáneas. Lanza `SpendCapError` si no cabe (primero se
 * mira el tope global y luego el de la persona) y no deja ninguna fila.
 */
export async function reserveSpend(input: {
  userId: number;
  productId: number | null;
  provider: SpendProvider;
  model?: string;
  stepKey: string;
  estimateMicros: number;
  now?: Date;
}): Promise<{ entryId: number }> {
  assertMicros(input.estimateMicros, "La estimación", false);
  if (!PROVIDERS.includes(input.provider)) throw new Error("Proveedor de gasto desconocido.");
  if (!input.stepKey) throw new Error("Falta la clave del paso.");
  const now = input.now ?? new Date();
  const range = monthRange(now);

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SPEND_LOCK_NAMESPACE}::int, ${SPEND_LOCK_KEY}::int)`);

    const spender = await spenderFor(tx, input.userId);
    if (!spender) throw new HttpError(404, "Persona no encontrada.");
    if (spender.disabled) throw new HttpError(403, "Esta cuenta está desactivada.");

    const globalCap = await readGlobalCap(tx);
    const globalSpent = await spentIn(tx, range);
    if (globalSpent + input.estimateMicros > globalCap) throw new SpendCapError("global", globalCap, globalSpent);

    if (spender.capMicros !== null) {
      const ownSpent = await spentIn(tx, range, input.userId);
      if (ownSpent + input.estimateMicros > spender.capMicros) {
        throw new SpendCapError("persona", spender.capMicros, ownSpent);
      }
    }

    const [row] = await tx
      .insert(entries)
      .values({
        createdAt: now,
        userId: input.userId,
        productId: input.productId,
        provider: input.provider,
        model: input.model ?? null,
        stepKey: input.stepKey,
        status: "reserved",
        reservedMicros: input.estimateMicros,
      })
      .returning({ id: entries.id });
    return { entryId: row.id };
  });
}

/**
 * Anota el coste real de un cargo reservado; desde ese momento cuenta el coste real y no lo
 * reservado. También vale para un cargo ya liberado (la llamada sí llegó a gastar: mejor que
 * cuente). Liquidar dos veces el mismo cargo se rechaza y no cambia nada.
 */
export async function settleSpend(
  entryId: number,
  actual: {
    costMicros: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    model?: string;
    detail?: unknown;
  },
): Promise<void> {
  assertMicros(actual.costMicros, "El coste", true);
  [actual.inputTokens, actual.outputTokens, actual.cacheReadTokens, actual.cacheWriteTokens].forEach(assertTokens);

  const db = getDb();
  // Un solo UPDATE condicionado al estado: dos liquidaciones a la vez no pasan las dos.
  const updated = await db
    .update(entries)
    .set({
      status: "settled",
      settledAt: new Date(),
      costMicros: actual.costMicros,
      inputTokens: actual.inputTokens ?? null,
      outputTokens: actual.outputTokens ?? null,
      cacheReadTokens: actual.cacheReadTokens ?? null,
      cacheWriteTokens: actual.cacheWriteTokens ?? null,
      ...(actual.model !== undefined ? { model: actual.model } : {}),
      ...(actual.detail !== undefined ? { detail: actual.detail } : {}),
    })
    .where(and(eq(entries.id, entryId), inArray(entries.status, ["reserved", "released"])))
    .returning({ id: entries.id });
  if (updated.length > 0) return;

  const [row] = await db.select({ status: entries.status }).from(entries).where(eq(entries.id, entryId));
  if (!row) throw new Error("Cargo no encontrado.");
  throw new Error("Este cargo ya está liquidado.");
}

/**
 * Deja de contar un cargo reservado que no llegó a gastar. Un cargo ya liquidado no cambia
 * (así se puede llamar sin miedo al terminar, haya ido bien o mal).
 */
export async function releaseSpend(entryId: number): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(entries)
    .set({ status: "released" })
    .where(and(eq(entries.id, entryId), eq(entries.status, "reserved")))
    .returning({ id: entries.id });
  if (updated.length > 0) return;
  const [row] = await db.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId));
  if (!row) throw new Error("Cargo no encontrado.");
}

/**
 * Da por gastadas las reservas que quedaron sin cerrar de unos pasos interrumpidos (el proceso se
 * cayó entre reservar y tener el resultado). No se sabe si la llamada llegó a cobrarse, así que
 * nunca se liberan: el libro se queda con lo reservado y la fila lleva `detail.outcome: "unknown"`.
 * Solo debe llamarlo quien acaba de hacerse con esos pasos (`src/jobs/`), y dentro de la misma
 * transacción (`exec`). Devuelve cuántos cargos cambió.
 */
export async function settleInterruptedSpend(stepKeys: string[], exec: Exec = getDb()): Promise<number> {
  if (stepKeys.length === 0) return 0;
  const mark = JSON.stringify({ outcome: "unknown", interrupted: true });
  const updated = await exec
    .update(entries)
    .set({
      status: "settled",
      settledAt: new Date(),
      costMicros: sql`${entries.reservedMicros}`,
      detail: sql`case when jsonb_typeof(${entries.detail}) = 'object' then ${entries.detail} || ${mark}::jsonb else ${mark}::jsonb end`,
    })
    .where(and(inArray(entries.stepKey, stepKeys), eq(entries.status, "reserved")))
    .returning({ id: entries.id });
  return updated.length;
}

/** Queda saldo (más de 0) en el tope global y en el de la persona. Sin cuenta activa: no. */
export async function hasRoom(userId: number, now: Date = new Date()): Promise<boolean> {
  const db = getDb();
  const spender = await spenderFor(db, userId);
  if (!spender || spender.disabled) return false;
  const range = monthRange(now);
  if ((await spentIn(db, range)) >= (await readGlobalCap(db))) return false;
  if (spender.capMicros === null) return true;
  return (await spentIn(db, range, userId)) < spender.capMicros;
}

export async function getGlobalCap(): Promise<number> {
  const value = await getSetting<unknown>(GLOBAL_CAP_SETTING);
  if (value === null) return DEFAULT_GLOBAL_CAP_MICROS;
  if (!validCap(value)) throw new Error("El tope global guardado no es válido.");
  return value;
}

function checkOwnerAndCap(owner: AuthUser, micros: number): void {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  if (typeof micros !== "number" || Number.isNaN(micros)) throw new HttpError(400, "El tope no es un importe válido.");
  if (micros < 0) throw new HttpError(400, "El tope no puede ser negativo.");
  if (!Number.isSafeInteger(micros)) throw new HttpError(400, "El tope no es un importe válido.");
}

/**
 * Tras cambiar un tope puede haber trabajos esperando saldo: se reanudan en el momento. Si esto
 * falla, el tope ya está guardado y la tarea de cada hora los reanudará: no se pierde nada.
 */
async function resumeAfterCapChange(): Promise<void> {
  try {
    // Importación dinámica: `src/jobs/` importa este módulo y así no se forma un ciclo.
    const { resumePausedJobs } = await import("@/jobs/boss");
    await resumePausedJobs();
  } catch (error) {
    console.error(
      "[gasto] No se pudieron reanudar ahora los trabajos en pausa:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Cambia el tope mensual global. Solo el dueño (403 si no). Reanuda los trabajos en pausa que ya tengan saldo. */
export async function setGlobalCap(owner: AuthUser, micros: number): Promise<void> {
  checkOwnerAndCap(owner, micros);
  await setSetting(GLOBAL_CAP_SETTING, micros);
  await resumeAfterCapChange();
}

/**
 * Cambia el tope mensual propio de un colaborador. Solo el dueño; el dueño no tiene tope propio.
 * Reanuda los trabajos en pausa que ya tengan saldo.
 */
export async function setUserCap(owner: AuthUser, userId: number, micros: number): Promise<void> {
  checkOwnerAndCap(owner, micros);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new HttpError(404, "Persona no encontrada.");
  const db = getDb();
  const [person] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!person) throw new HttpError(404, "Persona no encontrada.");
  if (person.role === "dueno") throw new HttpError(400, "El dueño no tiene tope propio: solo cuenta el tope global.");
  await db.update(schema.users).set({ spendCapMicros: micros }).where(eq(schema.users.id, userId));
  await resumeAfterCapChange();
}

export interface SpendSummary {
  /** `"2026-11"`. */
  month: string;
  capMicros: number;
  spentMicros: number;
  byProduct: Array<{ productId: number | null; name: string; micros: number }>;
  byUser: Array<{ userId: number; name: string; micros: number; capMicros: number | null }>;
}

const byMicrosDesc = <T extends { micros: number; name: string }>(a: T, b: T) =>
  b.micros - a.micros || a.name.localeCompare(b.name, "es");

/**
 * Gasto del mes. El dueño ve el de todos, por producto y por persona, frente al tope global.
 * Un colaborador solo ve sus propios cargos frente a su tope, y solo con el nombre de los
 * productos que hoy puede ver: lo gastado en productos que ya no tiene se agrupa sin nombre.
 */
export async function spendSummary(user: AuthUser, now: Date = new Date()): Promise<SpendSummary> {
  const db = getDb();
  const range = monthRange(now);
  const month = range.start.toISOString().slice(0, 7);
  const isOwner = user.role === "dueno";

  const rows = await db
    .select({ userId: entries.userId, productId: entries.productId, micros: countedMicros })
    .from(entries)
    .where(inMonth(range, isOwner ? undefined : eq(entries.userId, user.id)))
    .groupBy(entries.userId, entries.productId);
  const spentMicros = rows.reduce((total, row) => total + row.micros, 0);

  // Ids de producto que esta persona puede ver con nombre. El dueño, todos los del libro.
  const productIds = [...new Set(rows.map((row) => row.productId).filter((id): id is number => id !== null))];
  let visibleIds = productIds;
  if (!isOwner) {
    const visible = new Set((await listProductsFor(user)).map((product) => product.id));
    visibleIds = productIds.filter((id) => visible.has(id));
  }
  const names = await productNamesByIds(visibleIds);
  const visibleSet = new Set(visibleIds);

  const products = new Map<string, { productId: number | null; name: string; micros: number }>();
  for (const row of rows) {
    let key: string;
    let item: { productId: number | null; name: string };
    if (row.productId === null) {
      key = "none";
      item = { productId: null, name: NO_PRODUCT };
    } else if (visibleSet.has(row.productId)) {
      key = `p${row.productId}`;
      item = { productId: row.productId, name: names.get(row.productId) ?? DELETED_PRODUCT };
    } else {
      key = "hidden";
      item = { productId: null, name: HIDDEN_PRODUCTS };
    }
    const current = products.get(key) ?? { ...item, micros: 0 };
    current.micros += row.micros;
    products.set(key, current);
  }
  const byProduct = [...products.values()].sort(byMicrosDesc);

  const spentByUser = new Map<number, number>();
  for (const row of rows) spentByUser.set(row.userId, (spentByUser.get(row.userId) ?? 0) + row.micros);

  if (!isOwner) {
    const [person] = await db
      .select({ name: schema.users.name, role: schema.users.role, spendCapMicros: schema.users.spendCapMicros })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    const capMicros = person ? effectiveCap(person) ?? DEFAULT_COLLABORATOR_CAP_MICROS : DEFAULT_COLLABORATOR_CAP_MICROS;
    return {
      month,
      capMicros,
      spentMicros,
      byProduct,
      byUser: [{ userId: user.id, name: person?.name ?? user.name, micros: spentMicros, capMicros }],
    };
  }

  const people = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      spendCapMicros: schema.users.spendCapMicros,
    })
    .from(schema.users);
  const byUser: SpendSummary["byUser"] = people.map((person) => ({
    userId: person.id,
    name: person.name,
    micros: spentByUser.get(person.id) ?? 0,
    capMicros: effectiveCap(person),
  }));
  // Quien gastó sin tener fila en `users`: el dueño en el propio ordenador, o una cuenta borrada.
  const known = new Set(people.map((person) => person.id));
  for (const [userId, micros] of spentByUser) {
    if (known.has(userId)) continue;
    byUser.push({ userId, name: userId === LOCAL_USER.id ? LOCAL_USER.name : DELETED_PERSON, micros, capMicros: null });
  }
  byUser.sort(byMicrosDesc);

  return { month, capMicros: await getGlobalCap(), spentMicros, byProduct, byUser };
}

/** Coste liquidado de un cargo, o `null` si no existe o aún no está liquidado. Para comprobar el libro. */
export async function settledCostMicros(entryId: number): Promise<number | null> {
  const [row] = await getDb()
    .select({ status: entries.status, costMicros: entries.costMicros })
    .from(entries)
    .where(eq(entries.id, entryId));
  return row?.status === "settled" ? row.costMicros : null;
}
