import { handle } from "@/server/http";
import { removeBatchVideo } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Quitar»: borra el vídeo del lote si aún no tiene ninguna generación (409 si la tiene). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  return handle(async (user) => {
    const { id, videoId } = await params;
    await removeBatchVideo(user!, parseId(id), parseId(videoId));
    return new Response(null, { status: 204 });
  });
}
