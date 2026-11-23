import "@/jobs/video-jobs"; // define `lote.avanzar`
import { handle } from "@/server/http";
import { approveAllFrames } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Aprobar todas» en «Revisar imágenes»: aprueba la imagen de cada vídeo que espera revisión → `{ approved }`. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json(await approveAllFrames(user!, parseId(id)));
  });
}
