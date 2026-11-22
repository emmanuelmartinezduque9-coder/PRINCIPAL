import { handle } from "@/server/http";
import { bodyDownload } from "@/server/videos/bodies";
import { openClipStream } from "@/server/videos/clip";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Descarga un cuerpo de un producto que ve quien pregunta, igual que el clip: se pide a su
 * dirección guardada (solo de Higgsfield, con tope de tiempo y de tamaño: `openClipStream`) y se
 * reenvía en flujo como adjunto `<producto>-cuerpo-<nombre>.mp4`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ bodyId: string }> }) {
  return handle(async (user) => {
    const { bodyId } = await params;
    const { url, filename } = await bodyDownload(user!, parseId(bodyId));
    const { body, length } = await openClipStream(url);
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (length !== null) headers.set("Content-Length", length);
    return new Response(body, { headers });
  });
}
