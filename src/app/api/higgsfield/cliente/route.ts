import { clientMetadata } from "@/connectors/higgsfield";
import { publicOrigin } from "@/lib/cloud-env";
import { handle } from "@/server/http";

/** Documento público de metadatos de cliente (CIMD) de esta web para Higgsfield. No contiene secretos. */
export async function GET(request: Request) {
  return handle(
    async () =>
      Response.json(clientMetadata(publicOrigin(request)), { headers: { "Cache-Control": "public, max-age=300" } }),
    { public: true },
  );
}
