import { handle } from "@/server/http";
import { editVideoResponse } from "@/server/videos/edits";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const parseVersion = (value: string | null) => (value !== null && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null);

/**
 * El vídeo montado (la última versión, o `?v=N`) para quien ve el vídeo, con `Range` (206) para el
 * reproductor. `?descargar=1`: entero, como adjunto `<producto>-video-<id>-editado.mp4`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const query = new URL(request.url).searchParams;
    return editVideoResponse(user!, parseId(videoId), request.headers.get("range"), {
      download: query.get("descargar") === "1",
      version: parseVersion(query.get("v")),
    });
  });
}
