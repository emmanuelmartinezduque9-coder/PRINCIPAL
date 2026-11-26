import { handle } from "@/server/http";
import { redoFromCard } from "@/server/videos/owner-redo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  return handle(async (user) => {
    const { id, videoId } = await params;
    const body = await request.json().catch(() => null);
    await redoFromCard(user!, Number(id), Number(videoId), body?.kind, body?.reason);
    return Response.json({ ok: true });
  });
}
