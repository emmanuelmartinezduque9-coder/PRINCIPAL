import { handle } from "@/server/http";
import { dismissUnknown } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * «No está»: la persona ya miró su Higgsfield y la petición del clip no llegó; la duda pasa a «no
 * enviada» y se puede volver a generar → `{ risk }`. Solo quien creó el vídeo y pasado el tiempo
 * de comprobación.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await dismissUnknown(user!, parseId(videoId), "clip"));
  });
}
