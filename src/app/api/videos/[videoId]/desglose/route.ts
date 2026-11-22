import "@/jobs/video-jobs"; // define `video.desglose`, que encola pedir el desglose
import { handle } from "@/server/http";
import { requestAnalysis } from "@/server/videos/analysis";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Pide un desglose nuevo del vídeo de referencia (se hace en segundo plano) → `{ analysisId }`. Solo quien creó el vídeo. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await requestAnalysis(user!, parseId(videoId)), { status: 202 });
  });
}
