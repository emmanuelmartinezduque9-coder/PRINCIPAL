import { handle } from "@/server/http";
import { higgsfieldDiagnostics } from "@/server/higgsfield";

/** Respuestas en crudo de las herramientas de Higgsfield que no gastan (solo el dueño, con su propia conexión). */
export async function POST() {
  return handle(
    async (owner) => Response.json(await higgsfieldDiagnostics(owner!), { headers: { "Cache-Control": "no-store" } }),
    { role: "dueno" },
  );
}
