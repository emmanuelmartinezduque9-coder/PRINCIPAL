import { clientMetadata } from "@/connectors/higgsfield";
import { handle, notFound } from "@/server/http";
import { higgsfieldOrigin } from "@/server/higgsfield";

/**
 * Documento público de metadatos de cliente (CIMD) de esta web para Higgsfield. Solo existe con
 * `PRINCIPAL_HIGGSFIELD_CLIENT=cimd`; si no, 404. No contiene secretos.
 */
export async function GET(request: Request) {
  return handle(
    async () => {
      if (process.env.PRINCIPAL_HIGGSFIELD_CLIENT !== "cimd") return notFound("No encontrado.");
      return Response.json(clientMetadata(higgsfieldOrigin(request)), {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    },
    { public: true },
  );
}
