import { handle } from "@/server/http";
import { createVideo, listVideosFor } from "@/server/videos/videos";

// Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido.
const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Vídeos del producto, los más recientes primero (`mine`: los creó quien pregunta). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ videos: await listVideosFor(user!, parseId(id)) });
  });
}

/** Crea un vídeo vacío («Vídeo N») en el producto. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ video: await createVideo(user!, parseId(id)) }, { status: 201 });
  });
}
