import { handle } from "@/server/http";
import { disconnectHiggsfield } from "@/server/higgsfield";

/** Desconecta el Higgsfield de quien lo pide: revoca en Higgsfield si se puede y borra siempre aquí. */
export async function POST() {
  return handle(async (user) => {
    await disconnectHiggsfield(user!);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
