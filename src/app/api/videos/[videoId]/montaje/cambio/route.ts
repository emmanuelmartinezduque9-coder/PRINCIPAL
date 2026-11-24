import { handle } from "@/server/http";
import { requestEditChange } from "@/server/videos/cambio-montaje";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * «Volver a montar con este cambio»: `{ instruccion }` (texto o dictado). Cualquiera que vea el vídeo. El cambio
 * queda como reporte en «Mejoras» y el vídeo se vuelve a montar con él (lo aplica Claude en el montaje).
 * `{ runId, reportId }`; 409 si ya se está montando o falta el clip.
 */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => ({}))) as { instruccion?: unknown };
    return Response.json(await requestEditChange(user!, parseId(videoId), body.instruccion), { status: 202 });
  });
}
