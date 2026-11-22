import "@/jobs/video-jobs"; // define `video.finalizar`, que encola la consulta de las generaciones
import { handle } from "@/server/http";
import { batchView, getBatchFor, pollBatchGenerations, setBatchAutoAnalyze } from "@/server/videos/batches";
import { autoView } from "@/server/videos/lote";

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
    const view = await batchView(user!, batchId);
    // Con el estado del envío automático («Enviar lote»): pasos, pausa y preguntas abiertas.
    const auto = await autoView(user!, await getBatchFor(user!, batchId));
    return Response.json({ ...view, auto }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Cambia «Desglosar al subir»: `{ autoAnalyze }` → `{ batch }`. Solo quien creó el lote. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json({ batch: await setBatchAutoAnalyze(user!, parseId(id), body?.autoAnalyze) });
  });
}
