import { handle } from "@/server/http";
import { unmarkBody } from "@/server/videos/bodies";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Desmarca un cuerpo (quien lo marcó o el dueño). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ bodyId: string }> }) {
  return handle(async (user) => {
    const { bodyId } = await params;
    await unmarkBody(user!, parseId(bodyId));
    return Response.json({ ok: true });
  });
}
