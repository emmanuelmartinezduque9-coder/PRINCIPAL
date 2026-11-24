import { handle, HttpError } from "@/server/http";
import { publicationScreenshot } from "@/server/videos/publications";

/** Captura de una publicación (la de su fallo o la del reel publicado). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const screenshot = await publicationScreenshot(Number((await params).id));
    if (!screenshot) throw new HttpError(404, "Sin captura.");
    return new Response(new Uint8Array(screenshot), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  });
}
