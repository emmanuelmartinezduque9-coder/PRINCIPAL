import "@/jobs/video-jobs"; // define `lote.avanzar` y `video.enviar`
import { handle } from "@/server/http";
import { confirmBatch } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Generar lote · ~X créditos»: `{ expectedCredits }` → `{ batch }`. Si el precio subió, 409 y nada cambia. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json({ batch: await confirmBatch(user!, parseId(id), { expectedCredits: body?.expectedCredits }) });
  });
}
