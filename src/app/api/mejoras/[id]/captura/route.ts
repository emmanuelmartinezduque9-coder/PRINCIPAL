import { handle, HttpError } from "@/server/http";
import { readScreenshot } from "@/server/videos/mejoras/reports";

type Context = { params: Promise<{ id: string }> };

/** La captura de un reporte, para su autor o el dueño. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async (user) => {
    const { id } = await params;
    if (!/^[1-9]\d{0,15}$/.test(id)) throw new HttpError(404, "No existe ese reporte.");
    const shot = await readScreenshot(user!, Number(id));
    return new Response(new Uint8Array(shot.data), { headers: { "Content-Type": shot.mime, "Cache-Control": "private, max-age=3600" } });
  });
}
