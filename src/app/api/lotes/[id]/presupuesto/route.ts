import { handle } from "@/server/http";
import { quoteBatch } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Presupuesto del lote (imágenes + estimación de los clips) y saldo → `BatchQuote`. No gasta. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json(await quoteBatch(user!, parseId(id)));
  });
}
