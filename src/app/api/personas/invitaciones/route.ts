import { handle } from "@/server/http";
import { cancelInvitation } from "@/server/people";

/** Cancela las invitaciones pendientes de un correo. Solo el dueño. */
export async function DELETE(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
      await cancelInvitation(owner!, typeof body?.email === "string" ? body.email : "");
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
