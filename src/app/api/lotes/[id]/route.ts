import "@/jobs/video-jobs"; // define `video.finalizar`, que encola la consulta de las generaciones
import { handle } from "@/server/http";
import { batchView, pollBatchGenerations } from "@/server/videos/batches";

// Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido.
const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * El tablero del lote: una fila por vídeo que ve quien pregunta. Antes pregunta a su Higgsfield por
 * las generaciones en curso de sus propios vídeos del lote.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const batchId = parseId(id);
    await pollBatchGenerations(user!, batchId);
    return Response.json(await batchView(user!, batchId), { headers: { "Cache-Control": "no-store" } });
  });
}
