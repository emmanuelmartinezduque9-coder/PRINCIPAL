import { handle } from "@/server/http";
import { refreshLibrary } from "@/server/videos/library";

/**
 * «Actualizar»: trae lo nuevo del historial de vídeos de Higgsfield de quien pregunta (con su
 * propia conexión) → `{ added, pages }`. Sin Higgsfield conectado: 409 con `code: "higgsfield_connect"`.
 */
export async function POST() {
  return handle(async (user) => Response.json(await refreshLibrary(user!)));
}
