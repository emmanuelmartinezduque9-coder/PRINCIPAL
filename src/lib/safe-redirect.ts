/**
 * Dirección a la que volver tras entrar: solo rutas de esta misma aplicación.
 * Cualquier otra cosa (otro sitio, `//x`, `/\\x`, `https://x`) vuelve al inicio.
 */
export function safeBackPath(back: string | null | undefined, origin: string): string {
  if (!back) return "/";
  try {
    const url = new URL(back, origin);
    if (url.origin !== new URL(origin).origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
