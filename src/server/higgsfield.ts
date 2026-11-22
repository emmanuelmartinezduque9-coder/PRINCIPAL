import { getDb, schema } from "@/db/client";
import {
  completeAuth,
  disconnect,
  getHiggsfield,
  HIGGSFIELD_KIND,
  HiggsfieldAuthError,
  HiggsfieldOAuthError,
  higgsfieldFakeMode,
  HiggsfieldStateError,
  HiggsfieldUnavailableError,
  isHiggsfieldError,
  sanitizeOAuthCode,
  startAuth,
  type HiggsfieldPort,
} from "@/connectors/higgsfield";
import { oauthOrigin } from "@/lib/cloud-env";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { credentialStatus, deleteCredential, listCredentialUsers, saveCredential } from "@/server/credentials";
import { HttpError } from "@/server/http";

/**
 * Conexión de Higgsfield de la persona de la sesión: estado y saldo para la pantalla, conectar,
 * volver, desconectar, diagnóstico (solo dueño) y la sonda periódica. Ninguna función acepta un
 * identificador de persona que no venga de la sesión; nada de lo que devuelven contiene permisos.
 */

/** Mensaje cuando en la nube falta una `PUBLIC_URL` https válida. */
export const ORIGIN_MISSING = "Configuración incompleta: falta PUBLIC_URL (https). No se puede conectar Higgsfield.";

/**
 * Origen con el que se construye la dirección de vuelta de Higgsfield. En la nube solo sale de
 * `PUBLIC_URL` (nunca de la cabecera `Host`); si falta o no vale, 503 y no se llama a Higgsfield.
 */
export function higgsfieldOrigin(request: Request): string {
  const origin = oauthOrigin(request);
  if (!origin) {
    console.error("[higgsfield] Falta PUBLIC_URL https en la nube: conexión rechazada.");
    throw new HttpError(503, ORIGIN_MISSING);
  }
  return origin;
}

/** Datos con aspecto de secreto fuera: claves sensibles, JWT y la consulta de las URL firmadas. */
const SENSITIVE_KEY = /token|secret|password|authorization|signature|cookie|api[_-]?key|credential/i;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const MAX_LOG_CHARS = 200_000;

export function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > 20) return "[…]";
  if (typeof value === "string") {
    if (JWT.test(value)) return "[oculto]";
    return value.replace(/(https?:\/\/[^\s"?#]+)\?[^\s"#]*/g, "$1?[oculto]");
  }
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) && item !== null && typeof item !== "boolean" ? "[oculto]" : stripSecrets(item, depth + 1),
      ]),
    );
  }
  return value;
}

export interface HiggsfieldStatus {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
  expiresAt: string | null;
  credits: number | null;
  plan: string | null;
  error: string | null;
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export async function higgsfieldStatus(user: AuthUser, deps: { higgsfield?: HiggsfieldPort } = {}): Promise<HiggsfieldStatus> {
  const { connected, meta } = await credentialStatus(user.id, HIGGSFIELD_KIND);
  const base: HiggsfieldStatus = {
    connected,
    email: connected ? str(meta.email) : null,
    needsReconnect: connected && meta.needsReconnect === true,
    expiresAt: connected ? str(meta.expiresAt) : null,
    credits: null,
    plan: null,
    error: null,
  };
  if (!connected) return base;
  if (base.needsReconnect) return { ...base, error: new HiggsfieldAuthError().message };
  try {
    const { credits, plan } = await (deps.higgsfield ?? getHiggsfield()).balance(user.id);
    return { ...base, credits, plan };
  } catch (error) {
    const known = isHiggsfieldError(error) ? error : new HiggsfieldUnavailableError();
    if (!isHiggsfieldError(error)) console.error("[higgsfield] Error inesperado al leer el saldo:", error instanceof Error ? error.name : error);
    return { ...base, needsReconnect: known instanceof HiggsfieldAuthError, error: known.message };
  }
}

/** Empieza la conexión. En modo simulado conecta al momento y vuelve a Ajustes. */
export async function startConnection(user: AuthUser, origin: string): Promise<{ authorizeUrl: string }> {
  if (higgsfieldFakeMode()) {
    await saveCredential(
      user.id,
      HIGGSFIELD_KIND,
      { accessToken: "simulado", refreshToken: "simulado", clientId: "simulado" },
      {
        email: user.email.includes("@") ? user.email : "persona@higgsfield.local",
        connectedAt: new Date().toISOString(),
        expiresAt: null,
        hasRefreshToken: true,
        scope: "openid email offline_access",
        needsReconnect: false,
      },
    );
    return { authorizeUrl: `${origin}/ajustes?higgsfield=conectado` };
  }
  return startAuth(user.id, origin);
}

/**
 * Vuelta de Higgsfield. Devuelve la consulta con la que volver a Ajustes:
 * `higgsfield=conectado|cancelado|error` (y, si Higgsfield dio un código OAuth, `motivo`).
 */
export async function finishConnection(user: AuthUser, origin: string, query: URLSearchParams): Promise<string> {
  const oauthError = query.get("error");
  if (oauthError) {
    if (oauthError === "access_denied") return "higgsfield=cancelado";
    const code = sanitizeOAuthCode(oauthError);
    console.warn(`[higgsfield] La autorización volvió con error: ${code ?? "(ilegible)"}`);
    return code ? `higgsfield=error&motivo=${code}` : "higgsfield=error";
  }
  try {
    await completeAuth(user.id, origin, { code: query.get("code") ?? "", state: query.get("state") ?? "" });
    return "higgsfield=conectado";
  } catch (error) {
    if (error instanceof HiggsfieldOAuthError) return error.code ? `higgsfield=error&motivo=${error.code}` : "higgsfield=error";
    if (error instanceof HiggsfieldStateError) {
      console.warn(`[higgsfield] Vuelta rechazada (persona ${user.id}): state no válido.`);
    } else if (!isHiggsfieldError(error)) {
      console.error("[higgsfield] Error inesperado en la vuelta:", error instanceof Error ? error.name : error);
    }
    return "higgsfield=error";
  }
}

export async function disconnectHiggsfield(user: AuthUser): Promise<void> {
  if (higgsfieldFakeMode()) return deleteCredential(user.id, HIGGSFIELD_KIND);
  await disconnect(user.id);
}

/**
 * Informe para la prueba con el dueño: respuestas en crudo de herramientas que no gastan, sin
 * nada con aspecto de secreto. Se guarda también en `higgsfield_probe_log` (para fijar las formas
 * reales de las respuestas).
 */
export async function higgsfieldDiagnostics(
  user: AuthUser,
  deps: { higgsfield?: HiggsfieldPort } = {},
): Promise<Record<string, unknown>> {
  const { connected, meta } = await credentialStatus(user.id, HIGGSFIELD_KIND);
  const header = {
    generatedAt: new Date().toISOString(),
    client: process.env.PRINCIPAL_HIGGSFIELD_CLIENT === "cimd" ? "cimd" : "registro dinámico",
    simulated: higgsfieldFakeMode(),
    connection: connected ? meta : null,
  };
  if (!connected) return { ...header, error: "Conecta tu Higgsfield en Ajustes." };
  let report: Record<string, unknown>;
  let ok = true;
  try {
    report = { ...header, ...(await (deps.higgsfield ?? getHiggsfield()).diagnostics(user.id)) };
  } catch (error) {
    ok = false;
    report = { ...header, error: isHiggsfieldError(error) ? error.message : new HiggsfieldUnavailableError().message };
  }
  const clean = stripSecrets(report) as Record<string, unknown>;
  const detail = JSON.stringify({ tipo: "diagnostico", ...clean });
  await getDb()
    .insert(schema.higgsfieldProbeLog)
    .values({ userId: user.id, ok, refreshed: false, detail: detail.length > MAX_LOG_CHARS ? `${detail.slice(0, MAX_LOG_CHARS)}…` : detail });
  return clean;
}

/**
 * Sonda (tarea programada): una lectura de saldo por persona conectada y una fila en
 * `higgsfield_probe_log`. Sirve para medir cuánto dura el permiso y si refrescar funciona. Solo
 * usa `balance`: nunca gasta créditos.
 */
export async function probeConnections(deps: { higgsfield?: HiggsfieldPort } = {}): Promise<void> {
  const higgsfield = deps.higgsfield ?? getHiggsfield();
  for (const userId of await listCredentialUsers(HIGGSFIELD_KIND)) {
    if (!(await getActiveUser(userId))) continue;
    const before = await credentialStatus(userId, HIGGSFIELD_KIND);
    let ok = false;
    let detail: string;
    if (before.meta.needsReconnect === true) {
      detail = "Necesita volver a conectar.";
    } else {
      try {
        const { credits } = await higgsfield.balance(userId);
        ok = true;
        detail = `${credits} créditos`;
      } catch (error) {
        detail = isHiggsfieldError(error) ? error.message : "Error inesperado.";
      }
    }
    const after = await credentialStatus(userId, HIGGSFIELD_KIND);
    const refreshed = ok && after.meta.expiresAt !== before.meta.expiresAt;
    await getDb().insert(schema.higgsfieldProbeLog).values({ userId, ok, refreshed, detail });
  }
}
