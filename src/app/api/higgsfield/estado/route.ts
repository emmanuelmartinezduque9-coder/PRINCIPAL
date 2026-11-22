import { handle } from "@/server/http";
import { higgsfieldStatus } from "@/server/higgsfield";

/** Estado de la conexión de Higgsfield de quien lo pide, con su saldo. Nunca lleva los permisos. */
export async function GET() {
  return handle(async (user) =>
    Response.json(await higgsfieldStatus(user!), { headers: { "Cache-Control": "no-store" } }),
  );
}
