import { publicOrigin } from "@/lib/cloud-env";
import { handle } from "@/server/http";
import { parsePersonId, passwordLink } from "@/server/people";

/**
 * Enlace de un solo uso para que una persona que ya tiene cuenta elija una contraseña nueva.
 * Solo el dueño; el enlace solo se devuelve en esta respuesta.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(
    async (owner) => {
      const result = await passwordLink(owner!, parsePersonId((await params).id), publicOrigin(request));
      return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
    },
    { role: "dueno" },
  );
}
