import { count, and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "./client";
import { createInvite } from "../server/auth";

/**
 * Si todavía no hay ninguna cuenta ni invitación pendiente y se ha indicado `OWNER_EMAIL`,
 * crea una invitación de dueño y devuelve su enlace (de un solo uso, 7 días). Si no, `null`.
 * `PUBLIC_URL` es la dirección pública de la aplicación.
 */
export async function ensureOwnerInvite(
  env: Record<string, string | undefined>,
  now: Date = new Date(),
): Promise<string | null> {
  const email = env.OWNER_EMAIL?.trim();
  if (!email) return null;
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(schema.users);
  if (total > 0) return null;
  const pending = await db
    .select({ tokenHash: schema.invites.tokenHash })
    .from(schema.invites)
    .where(and(eq(schema.invites.role, "dueno"), isNull(schema.invites.usedAt), gt(schema.invites.expiresAt, now)))
    .limit(1);
  if (pending.length > 0) return null;

  const { token } = await createInvite(email, "Dueño", { role: "dueno", now });
  const base = (env.PUBLIC_URL?.trim() || `http://localhost:${env.PORT ?? 3000}`).replace(/\/+$/, "");
  return `${base}/activar?token=${token}`;
}

/** Datos iniciales. Por ahora: el enlace para crear la cuenta del dueño. */
export async function seed(url: string): Promise<void> {
  process.env.DATABASE_URL ??= url;
  const link = await ensureOwnerInvite(process.env);
  if (link) console.log(`[inicio] Enlace para crear la cuenta del dueño (un solo uso, 7 días): ${link}`);
}
