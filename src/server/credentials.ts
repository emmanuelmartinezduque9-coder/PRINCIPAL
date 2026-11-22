import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { decryptSecret, encryptSecret } from "@/lib/vault";

/**
 * Credenciales de terceros de cada persona (p. ej. el acceso de Higgsfield). El secreto se
 * guarda cifrado en sobre y ligado a `userId:kind`: una fila copiada a otra persona no se
 * descifra. `readCredential` devuelve el secreto y solo debe usarse en el servidor;
 * a las pantallas llega únicamente `credentialStatus`.
 */

const contextOf = (userId: number, kind: string) => `${userId}:${kind}`;

function check(userId: number, kind: string): void {
  if (!Number.isSafeInteger(userId) || userId < 0) throw new Error("Persona no válida");
  if (!kind) throw new Error("Falta el tipo de credencial");
}

const where = (userId: number, kind: string) =>
  and(eq(schema.credentials.userId, userId), eq(schema.credentials.kind, kind));

/** Crea o sustituye la credencial de esa persona y tipo. `meta` llega al navegador: nunca debe contener secretos. */
export async function saveCredential(
  userId: number,
  kind: string,
  secret: object,
  meta: Record<string, unknown> = {},
): Promise<void> {
  check(userId, kind);
  const secretEnc = encryptSecret(secret, contextOf(userId, kind));
  await getDb()
    .insert(schema.credentials)
    .values({ userId, kind, secretEnc, meta })
    .onConflictDoUpdate({
      target: [schema.credentials.userId, schema.credentials.kind],
      set: { secretEnc, meta, updatedAt: new Date() },
    });
}

/** Secreto descifrado de esa persona, o `null` si no tiene. Nunca enviar al navegador. */
export async function readCredential<T = unknown>(
  userId: number,
  kind: string,
): Promise<{ secret: T; meta: Record<string, unknown>; updatedAt: Date } | null> {
  check(userId, kind);
  const [row] = await getDb().select().from(schema.credentials).where(where(userId, kind));
  if (!row) return null;
  return {
    secret: decryptSecret<T>(row.secretEnc, contextOf(userId, kind)),
    meta: row.meta as Record<string, unknown>,
    updatedAt: row.updatedAt,
  };
}

/** Lo único que puede llegar al navegador: si hay credencial y sus datos no secretos. */
export async function credentialStatus(
  userId: number,
  kind: string,
): Promise<{ connected: boolean; meta: Record<string, unknown>; updatedAt: Date | null }> {
  check(userId, kind);
  const [row] = await getDb()
    .select({ meta: schema.credentials.meta, updatedAt: schema.credentials.updatedAt })
    .from(schema.credentials)
    .where(where(userId, kind));
  if (!row) return { connected: false, meta: {}, updatedAt: null };
  return { connected: true, meta: row.meta as Record<string, unknown>, updatedAt: row.updatedAt };
}

/** Personas que tienen guardada una credencial de ese tipo (sin leer ningún secreto). */
export async function listCredentialUsers(kind: string): Promise<number[]> {
  check(0, kind);
  const rows = await getDb()
    .select({ userId: schema.credentials.userId })
    .from(schema.credentials)
    .where(eq(schema.credentials.kind, kind))
    .orderBy(schema.credentials.userId);
  return rows.map((row) => row.userId);
}

export async function deleteCredential(userId: number, kind: string): Promise<void> {
  check(userId, kind);
  await getDb().delete(schema.credentials).where(where(userId, kind));
}

/** Borra todas las credenciales de una persona, sea cual sea su tipo (p. ej. al desactivarla, dentro de su transacción). */
export async function deleteAllCredentials(userId: number, executor: Pick<ReturnType<typeof getDb>, "delete"> = getDb()): Promise<void> {
  check(userId, "todas");
  await executor.delete(schema.credentials).where(eq(schema.credentials.userId, userId));
}
