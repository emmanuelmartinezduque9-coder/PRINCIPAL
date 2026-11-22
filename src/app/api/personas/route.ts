import { publicOrigin } from "@/lib/cloud-env";
import { handle } from "@/server/http";
import { invitePerson, listPeople } from "@/server/people";
import { listProductsFor } from "@/server/products";

/** Personas con su tope, su gasto del mes y sus productos; invitaciones pendientes. Solo el dueño. */
export async function GET() {
  return handle(
    async (owner) => {
      const [people, products] = await Promise.all([listPeople(owner!), listProductsFor(owner!, "todos")]);
      return Response.json(
        { ...people, products: products.map((p) => ({ id: p.id, name: p.name })) },
        { headers: { "Cache-Control": "no-store" } },
      );
    },
    { role: "dueno" },
  );
}

/** Invita a una persona. El enlace de un solo uso se devuelve en esta respuesta y en ninguna otra. */
export async function POST(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      const result = await invitePerson(
        owner!,
        { email: text(body?.email), name: text(body?.name) },
        publicOrigin(request),
      );
      return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
    },
    { role: "dueno" },
  );
}
