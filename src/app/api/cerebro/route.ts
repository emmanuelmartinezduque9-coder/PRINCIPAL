import { handle } from "@/server/http";
import { cerebroView } from "@/server/videos/cerebro/vista";

/** «Cerebro de cuentas»: qué funciona en las cuentas del dueño (solo vistas y comentarios) y qué probar. Solo el dueño. */
export async function GET() {
  return handle(async () => Response.json(await cerebroView()), { role: "dueno" });
}
