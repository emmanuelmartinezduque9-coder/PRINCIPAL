import { cookies } from "next/headers";
import { logout, SESSION_COOKIE } from "@/server/auth";
import { handle } from "@/server/http";
import { clearedSessionCookie } from "@/server/session-cookie";

export async function POST() {
  return handle(
    async () => {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (token) await logout(token);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
    },
    { public: true },
  );
}
