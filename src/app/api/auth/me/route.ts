import { authRequired } from "@/server/auth";
import { handle } from "@/server/http";

/** Quién está usando la aplicación y si esta instancia pide inicio de sesión. */
export async function GET() {
  return handle(async (user) => Response.json({ user, authRequired: authRequired() }));
}
