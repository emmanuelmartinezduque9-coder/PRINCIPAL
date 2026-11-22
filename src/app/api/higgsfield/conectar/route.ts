import { publicOrigin } from "@/lib/cloud-env";
import { HiggsfieldOAuthError, isHiggsfieldError } from "@/connectors/higgsfield";
import { handle, HttpError } from "@/server/http";
import { startConnection } from "@/server/higgsfield";

/** Empieza la conexión de Higgsfield de quien lo pide: devuelve la dirección de autorización. */
export async function POST(request: Request) {
  return handle(async (user) => {
    try {
      const result = await startConnection(user!, publicOrigin(request));
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof HiggsfieldOAuthError) {
        throw new HttpError(502, `Higgsfield no aceptó la conexión${error.code ? ` (${error.code})` : ""}.`);
      }
      if (isHiggsfieldError(error)) throw new HttpError(503, error.message);
      throw error;
    }
  });
}
