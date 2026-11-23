import "@/jobs/video-jobs"; // define `video.automatico`, `video.enviar` y `lote.avanzar`
import { handle } from "@/server/http";
import { resumeVideo } from "@/server/videos/autopilot";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * «Seguir»: la respuesta a la única pregunta con la que se paró el flujo automático del vídeo
 * (recargó saldo, reintentar un fallo…). Quita la parada y pide el paso siguiente. Solo quien lo creó.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    await resumeVideo(user!, parseId(videoId));
    return Response.json({ ok: true });
  });
}
