import { handle } from "@/server/http";
import { deleteProductPhoto, readProductPhoto } from "@/server/photos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** El contenido de una foto, solo para quien puede ver su producto. */
export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handle(async (user) => {
    const { photoId } = await params;
    const { mime, data } = await readProductPhoto(user!, parseId(photoId));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        // Privada: nunca en cachés compartidas. Las fotos no cambian (un id no se reutiliza).
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handle(async (user) => {
    const { photoId } = await params;
    await deleteProductPhoto(user!, parseId(photoId));
    return Response.json({ ok: true });
  });
}
