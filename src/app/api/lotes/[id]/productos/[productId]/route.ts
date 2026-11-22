import { handle } from "@/server/http";
import { setBatchProductNotes } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Guarda las «Indicaciones para los vídeos de {producto}» del lote: `{ notes }` (texto o `null`;
 * vacío las quita) → `{ notes }`. Solo quien creó el lote.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; productId: string }> }) {
  return handle(async (user) => {
    const { id, productId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const notes = await setBatchProductNotes(user!, parseId(id), parseId(productId), body?.notes ?? null);
    return Response.json({ notes });
  });
}
