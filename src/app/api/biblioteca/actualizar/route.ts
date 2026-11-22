import { handle } from "@/server/http";
import { refreshLibrary } from "@/server/videos/library";

/**
 * «Actualizar»: trae lo nuevo del historial de vídeos de Higgsfield de quien pregunta (con su
 * propia conexión) → `{ added, pages, skipped }`. Sin Higgsfield conectado: 409 con
 * `code: "higgsfield_connect"`. Si esa persona ya empezó otra hace menos de 30 s, no se llama a
 * Higgsfield (`skipped: true`): la pantalla enseña lo que hay en la caché.
 */
export async function POST() {
  return handle(async (user) => Response.json(await refreshLibrary(user!)));
}
