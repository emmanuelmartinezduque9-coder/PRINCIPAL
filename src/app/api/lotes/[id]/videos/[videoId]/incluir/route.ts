import { handle } from "@/server/http";
import { includeBatchVideo } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Volver a incluir»: un vídeo saltado vuelve al envío automático del lote → `{ ok: true }`. Solo quien creó el lote. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  return handle(async (user) => {
    const { id, videoId } = await params;
    await includeBatchVideo(user!, parseId(id), parseId(videoId));
    return Response.json({ ok: true });
  });
}
