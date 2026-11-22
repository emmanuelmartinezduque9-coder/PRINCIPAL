/** Versión publicada: los 7 primeros caracteres del commit que desplegó Railway, o "local". */
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  return env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "local";
}
