import { handle } from "@/server/http";
import { createBatch, listBatchesFor } from "@/server/videos/batches";

/** Lotes que ve quien pregunta (los suyos; el dueño, todos), con cuántos vídeos tienen y cuántos están hechos. */
export async function GET() {
  return handle(async (user) => Response.json({ batches: await listBatchesFor(user!) }));
}

/** Crea un lote vacío: `{ name, autoAnalyze? }` → `{ batch }`. */
export async function POST(request: Request) {
  return handle(async (user) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name : "";
    return Response.json({ batch: await createBatch(user!, name, { autoAnalyze: body?.autoAnalyze }) }, { status: 201 });
  });
}
