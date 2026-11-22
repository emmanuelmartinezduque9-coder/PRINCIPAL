import { and, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { currentUser, HttpError, type HandleOptions } from "@/server/http";

/**
 * Capa única de acceso a los productos. El dueño ve todos; un colaborador solo los que tiene
 * asignados. Toda consulta de productos se filtra aquí, en la propia consulta a la base de
 * datos: nada se lee primero y se descarta después.
 */

/** Persona con la sesión abierta. Sin sesión, o con la cuenta desactivada: 401. */
export async function requireUser(options: HandleOptions = {}): Promise<AuthUser> {
  const user = await currentUser(options);
  if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
  return user;
}

/** Como `requireUser`, pero solo deja pasar al dueño: un colaborador recibe 403. */
export async function requireOwner(options: HandleOptions = {}): Promise<AuthUser> {
  const user = await requireUser(options);
  if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  return user;
}

/**
 * Condición SQL "este producto es visible para esta persona", para usar sobre `products`.
 * Para un colaborador exige además que su cuenta siga activa: aunque quien llama conserve
 * los datos de una persona ya desactivada, la consulta no devuelve nada (falla cerrada).
 */
export function productScope(user: AuthUser): SQL {
  if (user.role === "dueno") return sql`true`;
  const assignments = schema.productAssignments;
  return exists(
    getDb()
      .select({ one: sql`1` })
      .from(assignments)
      .innerJoin(schema.users, eq(schema.users.id, assignments.userId))
      .where(
        and(
          eq(assignments.productId, schema.products.id),
          eq(assignments.userId, user.id),
          isNull(schema.users.disabledAt),
        ),
      ),
  );
}

/**
 * Productos visibles para `user`, con condiciones opcionales que se suman con `and(...)`:
 * pueden estrechar el resultado, nunca ampliarlo. La consulta devuelta ya tiene su `where`
 * y TypeScript no deja volver a llamarlo (lo sustituiría y se perdería el ámbito); sí admite
 * `orderBy`, `limit`, etc.
 */
export function scopedProducts(user: AuthUser, where?: SQL) {
  return getDb()
    .select()
    .from(schema.products)
    .where(and(productScope(user), where));
}

const isId = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Ids de los productos asignados a una persona, de menor a mayor. */
export async function assignedProductIds(userId: number): Promise<number[]> {
  const rows = await getDb()
    .select({ productId: schema.productAssignments.productId })
    .from(schema.productAssignments)
    .where(eq(schema.productAssignments.userId, userId))
    .orderBy(schema.productAssignments.productId);
  return rows.map((row) => row.productId);
}

/**
 * Sustituye el conjunto de productos asignados a una persona. Solo el dueño (403 si no).
 * Un producto que no existe da 400 y no cambia nada; una persona que no existe, 404.
 */
export async function setAssignments(owner: AuthUser, userId: number, productIds: number[]): Promise<void> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const ids = [...new Set(productIds)];
  if (!ids.every(isId)) throw new HttpError(400, "Alguno de los productos elegidos no existe.");
  if (!isId(userId)) throw new HttpError(404, "Persona no encontrada.");

  await getDb().transaction(async (tx) => {
    // Se bloquea la fila de la persona: dos cambios a la vez sobre ella van uno detrás de otro.
    const [person] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!person) throw new HttpError(404, "Persona no encontrada.");
    if (ids.length > 0) {
      const found = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(inArray(schema.products.id, ids));
      if (found.length !== ids.length) throw new HttpError(400, "Alguno de los productos elegidos no existe.");
    }
    await tx.delete(schema.productAssignments).where(eq(schema.productAssignments.userId, userId));
    if (ids.length > 0) {
      await tx
        .insert(schema.productAssignments)
        .values(ids.map((productId) => ({ productId, userId, assignedBy: owner.id })));
    }
  });
}
