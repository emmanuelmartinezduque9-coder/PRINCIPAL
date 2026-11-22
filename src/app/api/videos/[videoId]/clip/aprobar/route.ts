import { handle } from "@/server/http";
import { approveResult } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Aprueba un clip terminado de este vídeo (`{ resultId }`). Solo quien creó el vídeo. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { resultId?: unknown } | null;
    const resultId = typeof body?.resultId === "number" ? body.resultId : Number.NaN;
    await approveResult(user!, parseId(videoId), "clip", resultId);
    return Response.json({ ok: true });
  });
}
