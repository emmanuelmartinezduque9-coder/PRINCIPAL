import { handle } from "@/server/http";
import { rejectRound } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Rechaza el último clip con un motivo de una línea (`{ reason }`); hace falta para regenerar. Solo quien creó el vídeo. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    await rejectRound(user!, parseId(videoId), "clip", typeof body?.reason === "string" ? body.reason : "");
    return Response.json({ ok: true });
  });
}
