import { oauthOrigin } from "@/lib/cloud-env";
import { currentUser } from "@/server/http";
import { finishConnection } from "@/server/higgsfield";

const redirect = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/**
 * Vuelta de la autorización de Higgsfield. Siempre redirige a Ajustes (nunca un 500): el `state`
 * tiene que ser de la persona de la sesión, vigente y sin usar. En la nube, sin `PUBLIC_URL`
 * válida no se completa nada y se redirige con una ruta relativa (nunca a la cabecera Host).
 */
export async function GET(request: Request) {
  const origin = oauthOrigin(request);
  if (!origin) {
    console.error("[higgsfield] Falta PUBLIC_URL https en la nube: vuelta rechazada.");
    return redirect("/ajustes?higgsfield=error");
  }
  try {
    const user = await currentUser();
    if (!user) return redirect(`${origin}/login?volver=${encodeURIComponent("/ajustes")}`);
    const query = await finishConnection(user, origin, new URL(request.url).searchParams);
    return redirect(`${origin}/ajustes?${query}`);
  } catch (error) {
    console.error("[higgsfield] Error inesperado en la vuelta:", error instanceof Error ? error.name : error);
    return redirect(`${origin}/ajustes?higgsfield=error`);
  }
}
