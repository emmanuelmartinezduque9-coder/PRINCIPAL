import { bucketEnvState } from "./object-store";
import { parseVaultKey } from "./vault-key";

type Env = Record<string, string | undefined>;

/** Verdadero cuando la aplicación corre en la nube (Railway) y no en el propio ordenador. */
export function isCloud(env: Env = process.env): boolean {
  return env.PRINCIPAL_CLOUD === "1" || !!env.RAILWAY_PROJECT_ID;
}

/**
 * Revisa la configuración antes de arrancar en la nube. `problems` impiden arrancar;
 * `warnings` solo se avisan (la web arranca, pero algo no funcionará).
 */
export function checkCloudEnv(env: Env): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL?.trim()) problems.push("Falta DATABASE_URL (la base de datos).");

  const vaultKey = env.VAULT_KEY;
  if (vaultKey === undefined || vaultKey.trim() === "") {
    problems.push("Falta VAULT_KEY (la clave que protege las conexiones guardadas).");
  } else {
    try {
      parseVaultKey(vaultKey.trim());
    } catch {
      problems.push("VAULT_KEY debe ser una clave de 32 bytes en base64.");
    }
  }

  if (env.PRINCIPAL_AUTH === "off") {
    problems.push("En la nube no se puede desactivar el inicio de sesión (PRINCIPAL_AUTH=off).");
  }
  if (env.PRINCIPAL_HIGGSFIELD_FAKE === "1") {
    problems.push("En la nube no se puede usar el Higgsfield simulado (PRINCIPAL_HIGGSFIELD_FAKE).");
  }
  const publicUrl = env.PUBLIC_URL?.trim();
  if (!publicUrl) {
    problems.push("Falta PUBLIC_URL (la dirección pública de la web, https://…).");
  } else if (!publicUrl.startsWith("https://")) {
    problems.push("PUBLIC_URL debe empezar por https://.");
  } else if (!httpsOrigin(publicUrl)) {
    problems.push("PUBLIC_URL no es una dirección válida.");
  }
  const bucket = bucketEnvState(env);
  if (bucket === "partial") {
    problems.push("Faltan variables del almacén (BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY_ID y BUCKET_SECRET_ACCESS_KEY van juntas).");
  } else if (bucket === "none") {
    warnings.push("Sin almacén de archivos (BUCKET_*): los vídeos generados se sirven desde Higgsfield y no se copian.");
  }
  if (!env.ANTHROPIC_API_KEY?.trim()) {
    warnings.push("Falta ANTHROPIC_API_KEY: la IA no funcionará hasta añadirla.");
  }
  return { problems, warnings };
}

/** Origen `https://…` de una dirección, o `null` si no se entiende o no es https. */
function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Origen para permisos OAuth (la dirección de vuelta de Higgsfield). En la nube sale SOLO de una
 * `PUBLIC_URL` https válida: nunca de la cabecera `Host` de la petición, que manda quien llama.
 * `null` si en la nube falta o no vale (quien llama debe negarse). En el propio ordenador, como
 * `publicOrigin`.
 */
export function oauthOrigin(request: Request, env: Env = process.env): string | null {
  if (isCloud(env)) {
    const configured = env.PUBLIC_URL?.trim();
    return configured ? httpsOrigin(configured) : null;
  }
  return publicOrigin(request, env);
}

/** Dirección pública de la web: `PUBLIC_URL` si está definida; si no, la de la petición. */
export function publicOrigin(request: Request, env: Env = process.env): string {
  const configured = env.PUBLIC_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // PUBLIC_URL mal escrita: se usa la de la petición.
    }
  }
  return new URL(request.url).origin;
}
