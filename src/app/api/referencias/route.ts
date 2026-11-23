import { handle } from "@/server/http";
import { uploadReference } from "@/server/videos/referencias";

/**
 * Sube una imagen de referencia (el cuerpo es la imagen tal cual) → `{ sha256, url }`. Se guarda una
 * vez por huella en el almacén; la tarjeta del lote o el vídeo guardan solo la huella y su papel.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const bytes = Buffer.from(await request.arrayBuffer());
    return Response.json(await uploadReference(bytes), { status: 201 });
  });
}
