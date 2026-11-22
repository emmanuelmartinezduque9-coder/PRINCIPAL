/**
 * Dirección a la que volver tras entrar: solo rutas de esta misma aplicación.
 * Cualquier otra cosa (otro sitio, `//x`, `/\\x`, `https://x`) vuelve al inicio.
 */
export function safeBackPath(back: string | null | undefined, origin: string): string {
  if (!back) return "/";
  try {
    const url = new URL(back, origin);
    if (url.origin !== new URL(origin).origin) return "/";
    const path = url.pathname + url.search + url.hash;
    // `/.//x`, `/a/..//x` o `/%2e//x` se normalizan a `//x`, que el navegador tomaría por otro sitio.
    if (path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}
