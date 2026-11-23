import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { assignedProductIds } from "@/server/access";
import { buildInvite, type AuthUser, type Role } from "@/server/auth";
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

const MAX_NAME = 100;
const MAX_EMAIL = 254;

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
 * uso: solo se devuelve aquí, no se guarda en claro ni se escribe en el registro. Las
 * invitaciones anteriores sin usar de ese correo se cancelan en la misma transacción: si no,
 * quien conservara un enlace viejo podría cambiar después la contraseña de esa cuenta.
 */
export async function invitePerson(
  owner: AuthUser,
  input: { email: string; name: string },
  origin: string,
): Promise<{ link: string; expiresAt: Date }> {
  requireOwner(owner);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (email.length > MAX_EMAIL) throw new HttpError(400, `El correo no puede tener más de ${MAX_EMAIL} caracteres.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Escribe un correo válido.");
  if (name.length > MAX_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_NAME} caracteres.`);

  const { token, values } = buildInvite(email, name, { role: "colaborador", invitedBy: owner.id });
  await getDb().transaction(async (tx) => {
    // Dos invitaciones a la vez para el mismo correo van una detrás de otra.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"invite:" + email}))`);
    const [existing] = await tx
      .select({ disabledAt: schema.users.disabledAt })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (existing?.disabledAt) {
      throw new HttpError(409, "Esa cuenta está desactivada. Puedes reactivarla desde la lista de personas.");
    }
    if (existing) throw new HttpError(409, "Esa persona ya tiene cuenta.");
    await tx.delete(schema.invites).where(and(eq(schema.invites.email, email), isNull(schema.invites.usedAt)));
    await tx.insert(schema.invites).values(values);
  });
  return { link: `${origin}/activar?token=${encodeURIComponent(token)}`, expiresAt: values.expiresAt };
}

/**
 * Enlace para que una persona que YA tiene cuenta elija una contraseña nueva (la olvidó o perdió
 * el acceso). Es una invitación de un solo uso con su mismo papel: al usarla solo cambia la
 * contraseña (nunca el papel) y cierra sus sesiones (`acceptInvite`). Los enlaces anteriores sin
 * usar de ese correo dejan de valer. Solo el dueño, y nunca para una cuenta desactivada.
 */
export async function passwordLink(owner: AuthUser, userId: number, origin: string): Promise<{ link: string; expiresAt: Date }> {
  requireOwner(owner);
  if (!isId(userId)) throw new HttpError(404, "Persona no encontrada.");
  const [person] = await getDb()
    .select({ email: schema.users.email, name: schema.users.name, role: schema.users.role, disabledAt: schema.users.disabledAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!person) throw new HttpError(404, "Persona no encontrada.");
  if (person.disabledAt) throw new HttpError(409, "Esa cuenta está desactivada: reactívala primero.");
  const { token, values } = buildInvite(person.email, person.name, { role: person.role as Role, invitedBy: owner.id });
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"invite:" + person.email}))`);
    await tx.delete(schema.invites).where(and(eq(schema.invites.email, person.email), isNull(schema.invites.usedAt)));
    await tx.insert(schema.invites).values(values);
  });
  return { link: `${origin}/activar?token=${encodeURIComponent(token)}`, expiresAt: values.expiresAt };
}

/** Cancela las invitaciones sin usar de un correo: sus enlaces dejan de valer. */
export async function cancelInvitation(owner: AuthUser, email: string): Promise<void> {
  requireOwner(owner);
  await getDb()
    .delete(schema.invites)
    .where(and(eq(schema.invites.email, email.trim().toLowerCase()), isNull(schema.invites.usedAt)));
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
    // Orden de bloqueo fijo: primero los dueños activos (por id), después la persona. Así dos
    // dueños que se desactivan entre sí a la vez van uno detrás de otro, sin interbloqueo.
    const activeOwners = disabled
      ? await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(eq(schema.users.role, "dueno"), isNull(schema.users.disabledAt)))
          .orderBy(asc(schema.users.id))
          .for("update")
      : [];
    const [person] = await tx
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!person) throw new HttpError(404, "Persona no encontrada.");
    if (disabled && person.role === "dueno" && !activeOwners.some((row) => row.id !== userId)) {
      throw new HttpError(400, "No se puede desactivar al último dueño activo.");
    }
    await tx.update(schema.users).set({ disabledAt: disabled ? new Date() : null }).where(eq(schema.users.id, userId));
    if (disabled) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
      await deleteAllCredentials(userId, tx);
    }
  });
}
