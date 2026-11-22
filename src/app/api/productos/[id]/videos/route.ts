import { createVideoFromLink } from "@/server/agent";
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

/**
 * Crea un vídeo («Vídeo N») en el producto: vacío o, con `{ linkUrl }`, con ese enlace pegado como
 * referencia (lo trae el Mac de quien lo pide; si el enlace no vale o no hay Mac, no se crea nada).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { linkUrl?: unknown } | null;
    const linkUrl = body?.linkUrl;
    const video = linkUrl == null ? await createVideo(user!, parseId(id)) : await createVideoFromLink(user!, parseId(id), linkUrl);
    return Response.json({ video }, { status: 201 });
  });
}
