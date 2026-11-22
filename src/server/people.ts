import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { assignedProductIds } from "@/server/access";
import { createInvite, type AuthUser, type Role } from "@/server/auth";
import { deleteAllCredentials } from "@/server/credentials";
import { HttpError } from "@/server/http";
import { spendSummary } from "@/server/spend";

/**
 * Pantalla Personas: solo el dueño. Invitar, ver el tope y lo gastado de cada persona, y
 * desactivarla o reactivarla. Los productos asignados se leen con los ayudantes de `access.ts`.
 */

export interface PersonRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  /** Tope mensual efectivo; `null` para el dueño, que solo tiene el tope global. */
  capMicros: number | null;
  spentMicros: number;
  productIds: number[];
}

function requireOwner(owner: AuthUser): void {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
}

const isId = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Id de persona de la URL. Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido. */
export function parsePersonId(text: string): number {
  return /^[1-9]\d{0,15}$/.test(text) ? Number(text) : Number.NaN;
}

export async function listPeople(
  owner: AuthUser,
  now: Date = new Date(),
): Promise<{
  users: PersonRow[];
  pending: Array<{ email: string; name: string; expiresAt: Date }>;
}> {
  requireOwner(owner);
  const db = getDb();
  const [rows, summary, pending] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        disabledAt: schema.users.disabledAt,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.createdAt), asc(schema.users.id)),
    spendSummary(owner, now),
    db
      .select({ email: schema.invites.email, name: schema.invites.name, expiresAt: schema.invites.expiresAt })
      .from(schema.invites)
      .where(and(isNull(schema.invites.usedAt), gt(schema.invites.expiresAt, now)))
      .orderBy(asc(schema.invites.expiresAt)),
  ]);
  const spend = new Map(summary.byUser.map((row) => [row.userId, row]));

  const users = await Promise.all(
    rows.map(async (row): Promise<PersonRow> => {
      const role: Role = row.role === "dueno" ? "dueno" : "colaborador";
      const line = spend.get(row.id);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role,
        disabled: row.disabledAt !== null,
        capMicros: line?.capMicros ?? null,
        spentMicros: line?.micros ?? 0,
        // El dueño ve todos los productos sin asignación: no tiene lista propia.
        productIds: role === "dueno" ? [] : await assignedProductIds(row.id),
      };
    }),
  );
  return { users, pending };
}

/**
 * Crea una invitación de colaborador y devuelve su enlace. El enlace lleva el token de un solo
 * uso: solo se devuelve aquí, no se guarda en claro ni se escribe en el registro.
 */
export async function invitePerson(
  owner: AuthUser,
  input: { email: string; name: string },
  origin: string,
): Promise<{ link: string; expiresAt: Date }> {
  requireOwner(owner);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Escribe un correo válido.");
  const [existing] = await getDb()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (existing) throw new HttpError(409, "Esa persona ya tiene cuenta.");
  const { token, expiresAt } = await createInvite(email, input.name, { role: "colaborador", invitedBy: owner.id });
  return { link: `${origin}/activar?token=${encodeURIComponent(token)}`, expiresAt };
}

/**
 * Desactiva o reactiva a una persona. Al desactivar: se cierran sus sesiones, se borran sus
 * credenciales de terceros y se conserva su gasto. Reactivar no devuelve las credenciales.
 * Nadie puede desactivarse a sí mismo ni dejar la aplicación sin ningún dueño activo.
 */
export async function setPersonDisabled(owner: AuthUser, userId: number, disabled: boolean): Promise<void> {
  requireOwner(owner);
  if (!isId(userId)) throw new HttpError(404, "Persona no encontrada.");
  if (disabled && userId === owner.id) throw new HttpError(400, "No puedes desactivar tu propia cuenta.");

  await getDb().transaction(async (tx) => {
    const [person] = await tx
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!person) throw new HttpError(404, "Persona no encontrada.");
    if (disabled && person.role === "dueno") {
      const others = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, "dueno"), isNull(schema.users.disabledAt), ne(schema.users.id, userId)))
        .for("update");
      if (others.length === 0) throw new HttpError(400, "No se puede desactivar al último dueño activo.");
    }
    await tx.update(schema.users).set({ disabledAt: disabled ? new Date() : null }).where(eq(schema.users.id, userId));
    if (disabled) await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  });
  if (disabled) await deleteAllCredentials(userId);
}
