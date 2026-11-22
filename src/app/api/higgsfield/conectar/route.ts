import { HiggsfieldOAuthError, isHiggsfieldError } from "@/connectors/higgsfield";
import { handle, HttpError } from "@/server/http";
import { higgsfieldOrigin, startConnection } from "@/server/higgsfield";

/** Empieza la conexión de Higgsfield de quien lo pide: devuelve la dirección de autorización. */
export async function POST(request: Request) {
  return handle(async (user) => {
    // En la nube, solo con PUBLIC_URL (503 si falta): nunca con la cabecera Host.
    const origin = higgsfieldOrigin(request);
    try {
      const result = await startConnection(user!, origin);
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
