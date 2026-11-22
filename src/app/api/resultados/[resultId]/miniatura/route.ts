import { handle } from "@/server/http";
import { readResultThumb } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** La miniatura (JPEG) de un resultado de una generación, para quien ve su vídeo. */
export async function GET(_request: Request, { params }: { params: Promise<{ resultId: string }> }) {
  return handle(async (user) => {
    const { resultId } = await params;
    const { mime, data } = await readResultThumb(user!, parseId(resultId));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        // Un resultado no cambia nunca: se puede guardar, pero solo en el navegador de quien lo ve.
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
