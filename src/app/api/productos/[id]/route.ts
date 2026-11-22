import { handle } from "@/server/http";
import { getProductFor } from "@/server/products";

/** Un producto por id. Si no existe o no es de quien pregunta: el mismo 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    // Solo dígitos: "1e3", "12abc" o un número enorme no se convierten en otro id válido.
    const productId = /^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN;
    return Response.json({ product: await getProductFor(user!, productId) });
  });
}
