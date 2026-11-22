import { login } from "@/server/auth";
import { badRequest, handle } from "@/server/http";
import { sessionCookie } from "@/server/session-cookie";

export async function POST(request: Request) {
  return handle(
    async () => {
      const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
      if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
        return badRequest("Escribe tu correo y tu contraseña.");
      }
      const session = await login(body.email, body.password);
      if (!session) {
        // El mismo mensaje para correo desconocido, contraseña equivocada o bloqueo temporal.
        return Response.json(
          { error: "Correo o contraseña incorrectos. Tras varios intentos fallidos hay que esperar 15 minutos." },
          { status: 401 },
        );
      }
      return Response.json(
        { ok: true, user: session.user },
        { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
      );
    },
    { public: true },
  );
}
