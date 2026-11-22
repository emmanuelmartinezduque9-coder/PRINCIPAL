import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

/**
 * Acceso a la aplicación cuando está publicada: una cuenta por persona, con papel de dueño
 * o de colaborador. Cada persona elige su contraseña con un enlace de un solo uso; ni las
 * contraseñas ni los identificadores de sesión o de invitación se guardan en claro.
 */

export const SESSION_COOKIE = "pr_sesion";
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const MIN_PASSWORD = 10;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export type Role = "dueno" | "colaborador";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

/** Sin inicio de sesión: solo cuando la aplicación corre en el propio ordenador. */
export function authRequired(): boolean {
  return process.env.PRINCIPAL_AUTH !== "off";
}

export const LOCAL_USER: AuthUser = { id: 0, email: "local", name: "Este ordenador", role: "dueno" };

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const userColumns = {
  id: schema.users.id,
  email: schema.users.email,
  name: schema.users.name,
  role: schema.users.role,
};

function asAuthUser(row: { id: number; email: string; name: string; role: string }): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role === "dueno" ? "dueno" : "colaborador" };
}

// ───────────────────────── Contraseñas ─────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer, params = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const params = { N: Number(n), r: Number(r), p: Number(p), keylen: expected.length };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger) || expected.length === 0) return false;
  try {
    const actual = await scrypt(password, Buffer.from(salt, "base64"), params);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ───────────────────────── Invitaciones ─────────────────────────

/** Crea un enlace de un solo uso para que la persona elija (o cambie) su contraseña. */
export async function createInvite(
  email: string,
  name: string,
  options: { role?: Role; invitedBy?: number; now?: Date } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const address = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Escribe un correo válido.");
  const now = options.now ?? new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * DAY);
  await getDb()
    .insert(schema.invites)
    .values({
      tokenHash: sha256(token),
      email: address,
      name: name.trim() || address,
      role: options.role ?? "colaborador",
      invitedBy: options.invitedBy ?? null,
      createdAt: now,
      expiresAt,
    });
  return { token, expiresAt };
}

/**
 * Usa el enlace: crea la cuenta con el papel de la invitación, o, si el correo ya tiene
 * cuenta, solo cambia su contraseña y su nombre (nunca el papel). Cierra las sesiones anteriores.
 */
export async function acceptInvite(token: string, password: string, now: Date = new Date()): Promise<AuthUser> {
  const db = getDb();
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, sha256(token)));
  if (!invite || invite.usedAt) throw new Error("Este enlace no es válido o ya se ha usado.");
  if (invite.expiresAt <= now) throw new Error("Este enlace ha caducado. Pide uno nuevo.");
  if (password.length < MIN_PASSWORD) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }

  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Se marca como usado primero y de forma atómica: dos peticiones a la vez no lo usan dos veces.
    const claimed = await tx
      .update(schema.invites)
      .set({ usedAt: now })
      .where(and(eq(schema.invites.tokenHash, invite.tokenHash), isNull(schema.invites.usedAt)))
      .returning({ tokenHash: schema.invites.tokenHash });
    if (claimed.length === 0) throw new Error("Este enlace no es válido o ya se ha usado.");

    const [user] = await tx
      .insert(schema.users)
      .values({ email: invite.email, name: invite.name, passwordHash, role: invite.role })
      .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash, name: invite.name } })
      .returning(userColumns);
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    return asAuthUser(user);
  });
}

// ───────────────────────── Sesiones ─────────────────────────

/** Fallos recientes por correo. En memoria: basta para frenar a quien prueba contraseñas. */
const failures = new Map<string, { count: number; lockedUntil: number }>();

export function resetLoginAttempts(): void {
  failures.clear();
}

/** Inicia sesión. Devuelve null si el correo o la contraseña no valen, o si está bloqueado. */
export async function login(
  email: string,
  password: string,
  now: Date = new Date(),
): Promise<{ token: string; user: AuthUser; expiresAt: Date } | null> {
  const address = normalizeEmail(email);
  const state = failures.get(address);
  if (state && state.lockedUntil > now.getTime()) return null;

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(and(eq(schema.users.email, address), isNull(schema.users.disabledAt)));
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    const count = (state && state.lockedUntil <= now.getTime() && state.count >= MAX_FAILURES ? 0 : (state?.count ?? 0)) + 1;
    failures.set(address, { count, lockedUntil: count >= MAX_FAILURES ? now.getTime() + LOCK_MS : 0 });
    return null;
  }
  failures.delete(address);

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
  await db
    .insert(schema.sessions)
    .values({ tokenHash: sha256(token), userId: user.id, createdAt: now, lastSeenAt: now, expiresAt });
  return { token, user: asAuthUser(user), expiresAt };
}

/** Persona de una sesión vigente, o null. Cada uso prolonga la sesión. */
export async function getSessionUser(token: string, now: Date = new Date()): Promise<AuthUser | null> {
  if (!token) return null;
  const db = getDb();
  const tokenHash = sha256(token);
  const [row] = await db
    .select({ ...userColumns, lastSeenAt: schema.sessions.lastSeenAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, now), isNull(schema.users.disabledAt)),
    );
  if (!row) return null;
  // Se anota el uso como mucho una vez por hora para no escribir en cada petición.
  if (now.getTime() - row.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY) })
      .where(eq(schema.sessions.tokenHash, tokenHash));
  }
  return asAuthUser(row);
}

export async function logout(token: string): Promise<void> {
  if (!token) return;
  await getDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
}
