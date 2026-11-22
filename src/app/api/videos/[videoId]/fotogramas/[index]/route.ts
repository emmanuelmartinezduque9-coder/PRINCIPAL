import { handle } from "@/server/http";
import { readVideoFrame } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const parseIndex = (value: string) => (/^(0|[1-9]\d{0,4})$/.test(value) ? Number(value) : Number.NaN);

/** Un fotograma (JPEG) de la referencia, para quien ve el vídeo. */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string; index: string }> }) {
  return handle(async (user) => {
    const { videoId, index } = await params;
    const { mime, data } = await readVideoFrame(user!, parseId(videoId), parseIndex(index));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        // Privada y sin caché larga: una referencia nueva sustituye los fotogramas con el mismo índice.
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
