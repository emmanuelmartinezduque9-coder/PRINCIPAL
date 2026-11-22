import { acceptInvite, InviteError, login } from "@/server/auth";
import { badRequest, handle } from "@/server/http";
import { sessionCookie } from "@/server/session-cookie";

/** Usa un enlace de invitación: la persona elige su contraseña y queda con la sesión iniciada. */
export async function POST(request: Request) {
  return handle(
    async () => {
      const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
      if (typeof body.token !== "string" || typeof body.password !== "string") {
        return badRequest("Falta el enlace o la contraseña.");
      }
      let user;
      try {
        user = await acceptInvite(body.token, body.password);
      } catch (error) {
        // Solo se enseñan los mensajes pensados para la persona; cualquier otro fallo sale como 500 genérico.
        if (error instanceof InviteError) return badRequest(error.message);
        throw error;
      }
      const session = await login(user.email, body.password);
      return Response.json(
        { ok: true, user },
        session ? { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } } : undefined,
      );
    },
    { public: true },
  );
}
