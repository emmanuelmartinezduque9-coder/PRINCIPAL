import "@/server/videos/clip"; // registra el constructor del clip
import { handle } from "@/server/http";
import { quoteGeneration } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Precio del clip y saldo de quien creó el vídeo (no gasta nada). Solo quien lo creó. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await quoteGeneration(user!, parseId(videoId), "clip"));
  });
}
