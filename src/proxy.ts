import { NextResponse, type NextRequest } from "next/server";

/**
 * Comprobación rápida antes de servir una pantalla: sin sesión, a la página de entrada.
 * No sustituye a la protección real, que está en cada ruta de la API (`handle`); solo evita
 * enseñar la interfaz vacía a quien no ha entrado.
 */
export function proxy(request: NextRequest) {
  if (process.env.PRINCIPAL_AUTH === "off") return NextResponse.next();
  if (request.cookies.has("pr_sesion")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const back = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = back && back !== "/" ? `?volver=${encodeURIComponent(back)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Pantallas solamente: la API responde 401 por sí misma, y entrar/activar son públicas.
  matcher: ["/((?!api|_next|login|activar|.*\\..*).*)"],
};
