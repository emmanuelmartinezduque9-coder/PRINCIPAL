import "@/jobs/video-jobs"; // define `lote.avanzar`
import { rejectFrame } from "@/server/videos/frame";
import { kickVideo } from "@/server/videos/autopilot";
import { handle, HttpError } from "@/server/http";
import { tramoKind, tramoParam } from "@/server/videos/tramos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Rechaza la última ronda de la imagen inicial con un motivo de una línea (`reason`). Con un clip ya enviado, 409. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    // Con varios sitios en la referencia, `tramo` dice de qué sitio es la apertura (0 o nada: la inicial).
    const tramo = tramoParam(body?.tramo);
    if (Number.isNaN(tramo)) throw new HttpError(400, "Sitio no válido.");
    await rejectFrame(user!, parseId(videoId), typeof body?.reason === "string" ? body.reason : "", tramoKind("frame", tramo));
    // Si el vídeo es de un lote que va solo: con todas aprobadas empiezan los clips; un rechazo se regenera.
    await kickVideo(parseId(videoId));
    return Response.json({ ok: true });
  });
}
