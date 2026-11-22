import "@/jobs/video-jobs"; // define `lote.avanzar`
import { handle } from "@/server/http";
import { rejectFrame } from "@/server/videos/frame";
import { kickBatchOfVideo } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Rechaza la última ronda de la imagen inicial con un motivo de una línea (`reason`). Con un clip ya enviado, 409. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    await rejectFrame(user!, parseId(videoId), typeof body?.reason === "string" ? body.reason : "");
    // Si el vídeo es de un lote que va solo: con todas aprobadas empiezan los clips; un rechazo se regenera.
    await kickBatchOfVideo(parseId(videoId));
    return Response.json({ ok: true });
  });
}
