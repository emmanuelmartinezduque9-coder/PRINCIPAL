import { handle } from "@/server/http";
import { readPinterestImage } from "@/server/videos/pinterest";

/**
 * Una foto de Pinterest guardada (referencia de una imagen inicial), para cualquier cuenta con
 * sesión. Solo se usa cuando no hay almacén (si lo hay, la pantalla recibe un enlace firmado).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sha256: string }> }) {
  return handle(async () => {
    const { sha256 } = await params;
    const { mime, data } = await readPinterestImage(sha256);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        // Una huella no cambia de contenido nunca.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
