import { handle } from "@/server/http";
import { listRules } from "@/server/rules";

/** Reglas con su versión vigente. Solo el dueño. */
export async function GET() {
  return handle(async () => Response.json({ rules: await listRules() }), { role: "dueno" });
}
