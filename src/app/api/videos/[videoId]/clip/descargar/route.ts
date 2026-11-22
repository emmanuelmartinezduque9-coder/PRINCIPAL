import { handle, HttpError } from "@/server/http";
import { clipDownload } from "@/server/videos/clip";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Tope para que Higgsfield empiece a responder; el archivo en sí puede tardar más en pasar. */
const CONNECT_TIMEOUT_MS = 60_000;
const UNAVAILABLE = "No se pudo descargar el clip de Higgsfield. Inténtalo de nuevo.";

/**
 * Descarga el clip (el aprobado o, si no hay, el último terminado) para quien ve el vídeo. Se pide
 * a la dirección guardada y se reenvía tal cual como adjunto `<producto>-video-<id>.mp4`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const { url, filename } = await clipDownload(user!, parseId(videoId));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(url, { signal: controller.signal });
    } catch {
      throw new HttpError(502, UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok || !upstream.body) throw new HttpError(502, UNAVAILABLE);
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    });
    const length = upstream.headers.get("content-length");
    if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
    return new Response(upstream.body, { headers });
  });
}
