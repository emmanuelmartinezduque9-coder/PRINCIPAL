import { badRequest, handle } from "@/server/http";
import { setEditTexts } from "@/server/videos/edits";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Cambia los rótulos del montaje (`{ main?, cta? }`): quien creó el vídeo o el dueño. Sirven para el siguiente montaje. */
export async function PUT(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Datos no válidos.");
    return Response.json(await setEditTexts(user!, parseId(videoId), { main: body.main, cta: body.cta }));
  });
}
