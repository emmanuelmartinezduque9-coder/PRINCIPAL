import { handle, HttpError } from "@/server/http";
import { phoneScreenshot } from "@/server/phones";

/** Última captura de la pantalla del móvil. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const screenshot = await phoneScreenshot(Number((await params).id));
    if (!screenshot) throw new HttpError(404, "Sin captura.");
    return new Response(new Uint8Array(screenshot), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  });
}
