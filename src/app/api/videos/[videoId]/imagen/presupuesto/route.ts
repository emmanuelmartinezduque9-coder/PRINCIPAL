import "@/jobs/video-jobs"; // define `video.pinterest`, que pone en marcha la búsqueda de referencias
import "@/server/videos/frame"; // registra cómo se construye la petición de la imagen
import { handle } from "@/server/http";
import { quoteGeneration } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Precio de la siguiente ronda de la imagen inicial y saldo de Higgsfield. No gasta nada. Solo quien creó el vídeo. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await quoteGeneration(user!, parseId(videoId), "frame"), { headers: { "Cache-Control": "no-store" } });
  });
}
