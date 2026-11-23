import { handle } from "@/server/http";
import { startEdit } from "@/server/videos/edits";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * «Montar» / «Volver a montar»: pone en la cola de la nube el montaje del vídeo, con su ficha
 * (clips, canción, rótulos y referencia de edición). Quien creó el vídeo o el dueño. 409 si falta
 * el clip o si ya hay un montaje en marcha. `{ runId }`.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await startEdit(user!, parseId(videoId)), { status: 202 });
  });
}
