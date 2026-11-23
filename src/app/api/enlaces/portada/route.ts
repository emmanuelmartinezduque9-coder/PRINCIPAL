import "@/jobs/video-jobs"; // define `enlace.portada`
import { badRequest, handle } from "@/server/http";
import { linkThumbState } from "@/server/link-thumbs";

/**
 * Portada de un enlace de referencia: `?url=` → `{ status: "pending" | "ready" | "failed", src }`.
 * La primera vez la pide (se hace en segundo plano); la pantalla vuelve a preguntar mientras está
 * `pending`. Un enlace de un sitio no admitido es 400.
 */
export async function GET(request: Request) {
  return handle(async (user) => {
    const url = new URL(request.url).searchParams.get("url") ?? "";
    const state = await linkThumbState(url, user!.id);
    if (!state) return badRequest("Enlace no admitido.");
    return Response.json(
      { status: state.status, src: state.status === "ready" ? `/api/enlaces/portada/${state.id}` : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
