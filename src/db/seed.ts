import { seedReferenceBank } from "../server/videos/pinterest";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./client";
import { buildInvite } from "../server/auth";
import { seedRules } from "../server/rules";

const OWNER_LOCK = 7_002_001;

/**
 * Si todavía no hay ninguna cuenta y se ha indicado `OWNER_EMAIL`, deja una única invitación
 * de dueño vigente y devuelve su enlace (de un solo uso, 7 días). Si no, `null`.
 * `PUBLIC_URL` es la dirección pública de la aplicación.
 */
export async function ensureOwnerInvite(
  env: Record<string, string | undefined>,
  now: Date = new Date(),
): Promise<string | null> {
  const email = env.OWNER_EMAIL?.trim();
  if (!email) return null;
  const { token, values } = buildInvite(email, "Dueño", { role: "dueno", now });

  // Solo se guarda la huella del enlace, así que no se puede recuperar el de un arranque anterior:
  // mientras nadie lo use, cada arranque sustituye la invitación pendiente por una nueva y vuelve a
  // escribir el enlace. El cerrojo evita que dos arranques a la vez dejen dos invitaciones (o ninguna).
  const created = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${OWNER_LOCK})`);
    const [{ total }] = await tx.select({ total: count() }).from(schema.users);
    if (total > 0) return false;
    await tx.delete(schema.invites).where(and(eq(schema.invites.role, "dueno"), isNull(schema.invites.usedAt)));
    await tx.insert(schema.invites).values(values);
    return true;
  });
  if (!created) return null;
  const base = (env.PUBLIC_URL?.trim() || `http://localhost:${env.PORT ?? 3000}`).replace(/\/+$/, "");
  return `${base}/activar?token=${token}`;
}

/** Datos iniciales: las reglas de `reglas/` (sin pisar lo que el dueño haya editado) y el enlace para crear la cuenta del dueño. */
export async function seed(url: string): Promise<void> {
  process.env.DATABASE_URL ??= url;
  await seedRules();
  // El banco de referencias aprobadas (regla fija: ninguna imagen sin referencia).
  const added = await seedReferenceBank();
  if (added > 0) console.log(`[inicio] Banco de referencias aprobadas: ${added} nueva(s).`);
  const link = await ensureOwnerInvite(process.env);
  if (link) console.log(`[inicio] Enlace para crear la cuenta del dueño (un solo uso, 7 días): ${link}`);
}
