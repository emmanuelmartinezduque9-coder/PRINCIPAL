import "@/jobs/video-jobs"; // define `video.enviar`, que encola pedir el clip
import "@/server/videos/clip"; // registra el constructor del clip
import { handle } from "@/server/http";
import { requestGeneration } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Pide el clip con el precio que la persona vio (`{ expectedCredits }`) → 202 `{ generationId }`.
 * Se envía en segundo plano, una sola vez. Solo quien creó el vídeo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { expectedCredits?: unknown } | null;
    const expectedCredits = typeof body?.expectedCredits === "number" ? body.expectedCredits : Number.NaN;
    return Response.json(await requestGeneration(user!, parseId(videoId), "clip", { expectedCredits }), { status: 202 });
  });
}
