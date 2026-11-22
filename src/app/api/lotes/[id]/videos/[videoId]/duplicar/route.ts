import { handle } from "@/server/http";
import { duplicateBatchVideo } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Duplicar»: otro vídeo en el lote con lo mismo y, si ya estaba lista, la misma referencia → `{ video }`. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  return handle(async (user) => {
    const { id, videoId } = await params;
    return Response.json({ video: await duplicateBatchVideo(user!, parseId(id), parseId(videoId)) }, { status: 201 });
  });
}
