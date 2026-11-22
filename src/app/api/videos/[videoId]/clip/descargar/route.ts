import { handle } from "@/server/http";
import { clipDownload, openClipStream } from "@/server/videos/clip";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Descarga el clip (el aprobado o, si no hay, el último terminado) para quien ve el vídeo. Se pide
 * a la dirección guardada (solo de Higgsfield, sin seguir redirecciones, con tope de tiempo y de
 * tamaño: `openClipStream`) y se reenvía en flujo como adjunto `<producto>-video-<id>.mp4`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const { url, filename } = await clipDownload(user!, parseId(videoId));
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
