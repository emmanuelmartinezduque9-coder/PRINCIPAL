import { handle } from "@/server/http";
import { adoptCandidate } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * «Es este»: en una duda atascada del clip, la persona reconoce en su Higgsfield uno de los
 * trabajos parecidos (`{ jobId }`) y la generación lo adopta → `{ risk }`. Solo quien creó el
 * vídeo y pasado el tiempo de comprobación.
 */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { jobId?: unknown } | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    return Response.json(await adoptCandidate(user!, parseId(videoId), "clip", jobId));
  });
}
