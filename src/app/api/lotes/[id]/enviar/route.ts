import "@/jobs/video-jobs"; // define `video.desglose` y `lote.avanzar`
import { handle } from "@/server/http";
import { sendBatch } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Enviar lote»: desglosa lo que falte y pasa a «Preguntas» → `{ batch }`. Solo quien creó el lote, una vez. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ batch: await sendBatch(user!, parseId(id)) });
  });
}
