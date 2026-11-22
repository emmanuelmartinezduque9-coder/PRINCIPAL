import { handle, HttpError } from "@/server/http";
import { clipDownload, servableClipUrl } from "@/server/videos/clip";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Tope para que Higgsfield empiece a responder. */
const CONNECT_TIMEOUT_MS = 60_000;
/** Tope de la descarga entera (también mientras pasa el archivo). */
const DOWNLOAD_DEADLINE_MS = 10 * 60 * 1000;
/** Un clip de 30 s a 1080p no llega ni de lejos; más que esto no se reenvía. */
const MAX_CLIP_BYTES = 500 * 1024 * 1024;
const UNAVAILABLE = "No se pudo descargar el clip de Higgsfield. Inténtalo de nuevo.";
const TOO_BIG = "El clip es demasiado grande para descargarlo.";

/** Deja pasar el archivo y lo corta con error si pasa de `max` bytes (por si no dice su tamaño). */
function capped(max: number): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) controller.error(new Error(TOO_BIG));
      else controller.enqueue(chunk);
    },
  });
}

/**
 * Descarga el clip (el aprobado o, si no hay, el último terminado) para quien ve el vídeo. Se pide
 * a la dirección guardada (solo de Higgsfield, sin seguir redirecciones, con tope de tiempo y de
 * tamaño) y se reenvía en flujo como adjunto `<producto>-video-<id>.mp4`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const { url, filename } = await clipDownload(user!, parseId(videoId));
    if (!servableClipUrl(url)) throw new HttpError(404, "Todavía no hay clip.");

    const connect = new AbortController();
    const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS);
    const signal = AbortSignal.any([connect.signal, AbortSignal.timeout(DOWNLOAD_DEADLINE_MS)]);
    let upstream: Response;
    try {
      upstream = await fetch(url, { signal, redirect: "error" });
    } catch {
      throw new HttpError(502, UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => {});
      throw new HttpError(502, UNAVAILABLE);
    }
    const length = upstream.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > MAX_CLIP_BYTES) {
      await upstream.body.cancel().catch(() => {});
      throw new HttpError(502, TOO_BIG);
    }

    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
    return new Response(upstream.body.pipeThrough(capped(MAX_CLIP_BYTES)), { headers });
  });
}
