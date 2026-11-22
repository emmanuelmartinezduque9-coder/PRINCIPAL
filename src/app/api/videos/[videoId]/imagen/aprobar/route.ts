import { handle } from "@/server/http";
import { approveFrame } from "@/server/videos/frame";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Aprueba una candidata de la imagen inicial (`resultId`). Con un clip ya enviado, 409. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const resultId = typeof body?.resultId === "number" ? body.resultId : Number.NaN;
    await approveFrame(user!, parseId(videoId), resultId);
    return Response.json({ ok: true });
  });
}
