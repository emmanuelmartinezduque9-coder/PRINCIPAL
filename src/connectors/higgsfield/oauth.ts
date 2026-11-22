import crypto from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb, getPool, getSetting, schema, setSetting } from "@/db/client";
import { decryptSecret, encryptSecret } from "@/lib/vault";
import { deleteCredential, readCredential, saveCredential } from "@/server/credentials";
import { HIGGSFIELD_KIND, HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "./port";

/**
 * Permiso OAuth de cada persona con su propia cuenta de Higgsfield (código de autorización +
 * PKCE S256, cliente público). Solo `fetch`, sin SDK.
 *
 * Reglas de seguridad:
 * - El `state` y el verificador PKCE son de un solo uso, van ligados a la persona que pulsó
 *   «Conectar» y caducan a los 10 minutos. De la base de datos solo sale la huella del `state`;
 *   el verificador va cifrado con un contexto que incluye la persona y esa huella.
 * - Los permisos (acceso y refresco) viven solo en la bóveda. Nunca aparecen en `meta`, en los
 *   registros ni en los mensajes de error.
 * - Refrescar, volver de la autorización y desconectar se hacen de uno en uno por persona: un
 *   cerrojo dentro del proceso (para no ocupar varias conexiones esperando) y un cerrojo
 *   consultivo de PostgreSQL de dos claves (`HIGG`, persona) entre procesos (web y cola). Tras
 *   tomar el cerrojo se vuelve a leer la credencial: así nunca se usa un token de refresco viejo.
 */

export const HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp";
export const HIGGSFIELD_ISSUER = "https://higgsfield.ai/_clerk";
export const HIGGSFIELD_SCOPES = "openid email offline_access";

const METADATA_URLS = [
  "https://higgsfield.ai/.well-known/oauth-authorization-server/_clerk",
  `${HIGGSFIELD_ISSUER}/.well-known/oauth-authorization-server`,
  `${HIGGSFIELD_ISSUER}/.well-known/openid-configuration`,
];
const METADATA_TTL_MS = 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;
const HTTP_TIMEOUT_MS = 15_000;

/** Cerrojo consultivo: espacio propio de Higgsfield ("HIGG") y, de segunda clave, la persona. */
const LOCK_NAMESPACE = 0x48494747;
/** Segunda clave para el alta del cliente (las personas son ≥ 0). */
const CLIENT_LOCK_KEY = -1;

const CLIENT_SETTING = "higgsfield.oauthClient";
const CLIENT_CONTEXT = "app:higgsfield-client";
const pendingContext = (userId: number, stateHash: string) => `higgsfield-pkce:${userId}:${stateHash}`;

/** Códigos con los que el servidor de permisos dice que el permiso ya no vale. */
const REJECTED = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

const INVALID_STATE = "La conexión ha caducado o no es válida. Vuelve a pulsar «Conectar».";

export interface OAuthDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

/** El `state` de la vuelta no existe, ya se usó, caducó o es de otra persona. */
export class HiggsfieldStateError extends Error {
  constructor() {
    super(INVALID_STATE);
    this.name = "HiggsfieldStateError";
  }
}

/** Higgsfield rechazó el alta o el intercambio del código. `code` es el código OAuth, saneado. */
export class HiggsfieldOAuthError extends Error {
  constructor(public code: string | null) {
    super("Higgsfield no aceptó la conexión.");
    this.name = "HiggsfieldOAuthError";
  }
}

interface StoredSecret {
  accessToken: string;
  refreshToken: string | null;
  clientId: string;
}

interface AsMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

// ───────────────────────── utilidades ─────────────────────────

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest();
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const redirectUriFor = (origin: string) => `${origin}/api/higgsfield/callback`;
const cimdClientId = (origin: string) => `${origin}/api/higgsfield/cliente`;
const cimdMode = () => process.env.PRINCIPAL_HIGGSFIELD_CLIENT === "cimd";
const fetchOf = (deps?: OAuthDeps) => deps?.fetch ?? fetch;
const nowOf = (deps?: OAuthDeps) => deps?.now?.() ?? new Date();

/** Un código OAuth tal cual lo define la norma (letras, `_`), o nada: nunca texto libre del servidor. */
export function sanitizeOAuthCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z_]{1,40}$/.test(value) ? value : null;
}

function isHiggsfieldUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "higgsfield.ai" || url.hostname.endsWith(".higgsfield.ai"));
  } catch {
    return false;
  }
}

const sameKeyChains = new Map<string, Promise<unknown>>();

/** Ejecuta `fn` de una en una para la misma clave dentro de este proceso. */
async function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = sameKeyChains.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  sameKeyChains.set(key, tail);
  try {
    return await run;
  } finally {
    if (sameKeyChains.get(key) === tail) sameKeyChains.delete(key);
  }
}

/** `fn` con el cerrojo consultivo (`HIGG`, `key`) tomado, en una conexión propia. */
async function withLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  return serialized(`lock:${key}`, async () => {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1::int, $2::int)", [LOCK_NAMESPACE, key]);
      const result = await fn();
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

async function send(f: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, redirect: "error", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    throw new HiggsfieldUnavailableError();
  }
}

// ───────────────────────── metadatos y cliente ─────────────────────────

let metadataCache: { at: number; value: AsMetadata } | null = null;
let clientCache: { redirectUri: string; clientId: string } | null = null;

/** Olvida lo guardado en memoria (metadatos y cliente). Para pruebas. */
export function resetOAuthCache(): void {
  metadataCache = null;
  clientCache = null;
}

function validMetadata(body: Record<string, unknown>): AsMetadata | null {
  if (body.issuer !== undefined && body.issuer !== HIGGSFIELD_ISSUER) return null;
  if (!isHiggsfieldUrl(body.authorization_endpoint) || !isHiggsfieldUrl(body.token_endpoint)) return null;
  const methods = body.code_challenge_methods_supported;
  if (Array.isArray(methods) && !methods.includes("S256")) return null;
  return {
    authorization_endpoint: body.authorization_endpoint,
    token_endpoint: body.token_endpoint,
    registration_endpoint: isHiggsfieldUrl(body.registration_endpoint) ? body.registration_endpoint : undefined,
    revocation_endpoint: isHiggsfieldUrl(body.revocation_endpoint) ? body.revocation_endpoint : undefined,
  };
}

async function authServerMetadata(f: typeof fetch): Promise<AsMetadata> {
  if (metadataCache && Date.now() - metadataCache.at < METADATA_TTL_MS) return metadataCache.value;
  for (const url of METADATA_URLS) {
    try {
      const response = await send(f, url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const value = validMetadata((await response.json()) as Record<string, unknown>);
      if (!value) continue;
      metadataCache = { at: Date.now(), value };
      return value;
    } catch {
      // Se prueba la siguiente dirección.
    }
  }
  console.warn("[higgsfield] No se pudieron leer los metadatos del servidor de permisos.");
  throw new HiggsfieldUnavailableError();
}

/** Documento de metadatos de cliente (CIMD) que sirve `/api/higgsfield/cliente`. */
export function clientMetadata(origin: string): Record<string, unknown> {
  return {
    client_id: cimdClientId(origin),
    client_name: "PRINCIPAL",
    client_uri: origin,
    redirect_uris: [redirectUriFor(origin)],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: HIGGSFIELD_SCOPES,
  };
}

/**
 * Identificador de cliente de esta web. Alta dinámica una sola vez (guardada cifrada en
 * `settings`) y otra vez si cambia la dirección de vuelta; con `PRINCIPAL_HIGGSFIELD_CLIENT=cimd`,
 * el documento de cliente de la propia web.
 */
async function clientIdFor(origin: string, f: typeof fetch): Promise<string> {
  if (cimdMode()) return cimdClientId(origin);
  const redirectUri = redirectUriFor(origin);
  if (clientCache?.redirectUri === redirectUri) return clientCache.clientId;
  return withLock(CLIENT_LOCK_KEY, async () => {
    const stored = await getSetting<{ enc: string; redirectUri: string }>(CLIENT_SETTING);
    if (stored?.redirectUri === redirectUri) {
      const { clientId } = decryptSecret<{ clientId: string }>(stored.enc, CLIENT_CONTEXT);
      clientCache = { redirectUri, clientId };
      return clientId;
    }
    const metadata = await authServerMetadata(f);
    if (!metadata.registration_endpoint) throw new HiggsfieldOAuthError("registration_not_supported");
    const response = await send(f, metadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: "PRINCIPAL",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: HIGGSFIELD_SCOPES,
      }),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const clientId = typeof body?.client_id === "string" && body.client_id ? body.client_id : null;
    if (!response.ok || !clientId) {
      const code = sanitizeOAuthCode(body?.error);
      console.warn(`[higgsfield] Alta de cliente rechazada: HTTP ${response.status} ${code ?? ""}`.trim());
      if (response.status >= 500) throw new HiggsfieldUnavailableError();
      throw new HiggsfieldOAuthError(code ?? "registration_failed");
    }
    await setSetting(CLIENT_SETTING, { enc: encryptSecret({ clientId, issuer: HIGGSFIELD_ISSUER }, CLIENT_CONTEXT), redirectUri });
    clientCache = { redirectUri, clientId };
    return clientId;
  });
}

// ───────────────────────── tokens ─────────────────────────

type TokenResult = { ok: true; tokens: TokenResponse } | { ok: false; status: number; error: string | null };

async function tokenRequest(f: typeof fetch, metadata: AsMetadata, params: Record<string, string>): Promise<TokenResult> {
  const response = await send(f, metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...params, resource: HIGGSFIELD_MCP_URL }).toString(),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && typeof body?.access_token === "string" && body.access_token) {
    return {
      ok: true,
      tokens: {
        access_token: body.access_token,
        refresh_token: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : undefined,
        expires_in: typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : undefined,
        scope: typeof body.scope === "string" ? body.scope : undefined,
        id_token: typeof body.id_token === "string" ? body.id_token : undefined,
      },
    };
  }
  return { ok: false, status: response.status, error: sanitizeOAuthCode(body?.error) };
}

/** Correo de la cuenta, leído del `id_token` solo para mostrarlo (no se usa para decidir nada). */
function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" && claims.email.length <= 254 ? claims.email : null;
  } catch {
    return null;
  }
}

async function saveTokens(
  userId: number,
  tokens: TokenResponse,
  clientId: string,
  now: Date,
  previous?: { secret: StoredSecret; meta: Record<string, unknown> },
): Promise<void> {
  const refreshToken = tokens.refresh_token ?? previous?.secret.refreshToken ?? null;
  const secret: StoredSecret = { accessToken: tokens.access_token, refreshToken, clientId };
  await saveCredential(userId, HIGGSFIELD_KIND, secret, {
    email: emailFromIdToken(tokens.id_token) ?? (previous?.meta.email as string | undefined) ?? null,
    connectedAt: (previous?.meta.connectedAt as string | undefined) ?? now.toISOString(),
    expiresAt: tokens.expires_in ? new Date(now.getTime() + tokens.expires_in * 1000).toISOString() : null,
    hasRefreshToken: Boolean(refreshToken),
    scope: tokens.scope ?? (previous?.meta.scope as string | undefined) ?? null,
    needsReconnect: false,
  });
}

async function markNeedsReconnect(userId: number, current: { secret: StoredSecret; meta: Record<string, unknown> }) {
  await saveCredential(userId, HIGGSFIELD_KIND, current.secret, { ...current.meta, needsReconnect: true });
}

function expiresSoon(meta: Record<string, unknown>, now: Date): boolean {
  if (typeof meta.expiresAt !== "string") return false; // sin caducidad declarada: se confía hasta un 401
  return new Date(meta.expiresAt).getTime() - now.getTime() < REFRESH_MARGIN_MS;
}

// ───────────────────────── flujo ─────────────────────────

/** Empieza la conexión: devuelve la dirección de Higgsfield a la que llevar a la persona. */
export async function startAuth(userId: number, origin: string, deps?: OAuthDeps): Promise<{ authorizeUrl: string }> {
  const f = fetchOf(deps);
  const now = nowOf(deps);
  const metadata = await authServerMetadata(f);
  const clientId = await clientIdFor(origin, f);
  const redirectUri = redirectUriFor(origin);
  const state = randomToken();
  const verifier = randomToken();
  const stateHash = sha256(state).toString("hex");

  const db = getDb();
  await db.delete(schema.oauthPending).where(lt(schema.oauthPending.expiresAt, now));
  await db.insert(schema.oauthPending).values({
    stateHash,
    userId,
    verifierEnc: encryptSecret({ verifier, redirectUri, clientId }, pendingContext(userId, stateHash)),
    createdAt: now,
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
  });

  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: HIGGSFIELD_SCOPES,
    state,
    code_challenge: sha256(verifier).toString("base64url"),
    code_challenge_method: "S256",
    resource: HIGGSFIELD_MCP_URL,
  }).toString();
  return { authorizeUrl: url.toString() };
}

/** Vuelta de Higgsfield: comprueba el `state` (una vez, de esta persona, vigente) y guarda los permisos. */
export async function completeAuth(
  userId: number,
  origin: string,
  params: { code: string; state: string },
  deps?: OAuthDeps,
): Promise<void> {
  const f = fetchOf(deps);
  const now = nowOf(deps);
  if (typeof params.state !== "string" || !params.state || typeof params.code !== "string" || !params.code) {
    throw new HiggsfieldStateError();
  }
  const stateHash = sha256(params.state).toString("hex");
  // Solo la persona que lo creó lo consume: un intento ajeno no gasta el `state` de nadie.
  const [row] = await getDb()
    .delete(schema.oauthPending)
    .where(and(eq(schema.oauthPending.stateHash, stateHash), eq(schema.oauthPending.userId, userId)))
    .returning();
  if (!row || row.expiresAt.getTime() <= now.getTime()) throw new HiggsfieldStateError();
  let pending: { verifier: string; redirectUri: string; clientId: string };
  try {
    pending = decryptSecret(row.verifierEnc, pendingContext(userId, stateHash));
  } catch {
    throw new HiggsfieldStateError();
  }
  if (pending.redirectUri !== redirectUriFor(origin)) throw new HiggsfieldStateError();

  const metadata = await authServerMetadata(f);
  const result = await tokenRequest(f, metadata, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
  });
  if (!result.ok) {
    console.warn(`[higgsfield] Intercambio del código rechazado: HTTP ${result.status} ${result.error ?? ""}`.trim());
    if (result.status >= 500) throw new HiggsfieldUnavailableError();
    throw new HiggsfieldOAuthError(result.error);
  }
  await withLock(userId, () => saveTokens(userId, result.tokens, pending.clientId, now));
}

/**
 * Refresca bajo el cerrojo de la persona. `stillGood` decide, con la credencial recién leída tras
 * tomar el cerrojo, si otro ya refrescó (y entonces no se llama a Higgsfield).
 */
async function refreshLocked(
  userId: number,
  deps: OAuthDeps | undefined,
  stillGood: (current: { secret: StoredSecret; meta: Record<string, unknown> }) => boolean,
): Promise<string> {
  const f = fetchOf(deps);
  return withLock(userId, async () => {
    const current = await readCredential<StoredSecret>(userId, HIGGSFIELD_KIND);
    if (!current) throw new HiggsfieldNotConnectedError();
    if (current.meta.needsReconnect) throw new HiggsfieldAuthError();
    if (stillGood(current)) return current.secret.accessToken;
    if (!current.secret.refreshToken) {
      await markNeedsReconnect(userId, current);
      throw new HiggsfieldAuthError();
    }
    const metadata = await authServerMetadata(f);
    const result = await tokenRequest(f, metadata, {
      grant_type: "refresh_token",
      refresh_token: current.secret.refreshToken,
      client_id: current.secret.clientId,
    });
    if (!result.ok) {
      console.warn(`[higgsfield] Refresco rechazado (persona ${userId}): HTTP ${result.status} ${result.error ?? ""}`.trim());
      if (result.error && REJECTED.has(result.error)) {
        await markNeedsReconnect(userId, current);
        throw new HiggsfieldAuthError();
      }
      throw new HiggsfieldUnavailableError();
    }
    await saveTokens(userId, result.tokens, current.secret.clientId, nowOf(deps), current);
    return result.tokens.access_token;
  });
}

/** Token de acceso vigente; lo refresca si caduca en menos de 60 s. Un refresco a la vez por persona. */
export async function accessTokenFor(userId: number, deps?: OAuthDeps): Promise<string> {
  const current = await readCredential<StoredSecret>(userId, HIGGSFIELD_KIND);
  if (!current) throw new HiggsfieldNotConnectedError();
  if (current.meta.needsReconnect) throw new HiggsfieldAuthError();
  if (!expiresSoon(current.meta, nowOf(deps))) return current.secret.accessToken;
  return refreshLocked(userId, deps, (fresh) => !expiresSoon(fresh.meta, nowOf(deps)));
}

/** Tras un 401 del servidor: fuerza un refresco (salvo que otro lo acabe de hacer). */
export async function refreshNow(userId: number, deps?: OAuthDeps): Promise<string> {
  const current = await readCredential<StoredSecret>(userId, HIGGSFIELD_KIND);
  if (!current) throw new HiggsfieldNotConnectedError();
  if (current.meta.needsReconnect) throw new HiggsfieldAuthError();
  const rejected = current.secret.accessToken;
  return refreshLocked(userId, deps, (fresh) => fresh.secret.accessToken !== rejected);
}

/** Revoca en Higgsfield si se puede y borra siempre la conexión local de esa persona. */
export async function disconnect(userId: number, deps?: OAuthDeps): Promise<void> {
  const f = fetchOf(deps);
  await withLock(userId, async () => {
    const current = await readCredential<StoredSecret>(userId, HIGGSFIELD_KIND).catch(() => null);
    if (current) {
      try {
        const { revocation_endpoint: endpoint } = await authServerMetadata(f);
        const tokens: Array<[string | null, string]> = [
          [current.secret.refreshToken, "refresh_token"],
          [current.secret.accessToken, "access_token"],
        ];
        for (const [token, hint] of tokens) {
          if (!endpoint || !token) continue;
          await send(f, endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token, token_type_hint: hint, client_id: current.secret.clientId }).toString(),
          }).catch(() => null);
        }
      } catch {
        console.warn(`[higgsfield] No se pudo revocar en Higgsfield (persona ${userId}); se borra en local.`);
      }
    }
    await deleteCredential(userId, HIGGSFIELD_KIND);
    await getDb().delete(schema.oauthPending).where(eq(schema.oauthPending.userId, userId));
  });
}
