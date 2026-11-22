import "@/jobs/video-jobs"; // define `video.enviar`, que encola pedir la generación
import "@/server/videos/frame"; // registra cómo se construye la petición de la imagen
import { handle } from "@/server/http";
import { requestGeneration } from "@/server/videos/generations";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Genera las dos candidatas de la imagen inicial con el precio que la persona vio
 * (`expectedCredits`): si ha subido o no hay saldo, 409 y no se envía nada → `{ generationId }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const expectedCredits = typeof body?.expectedCredits === "number" ? body.expectedCredits : Number.NaN;
    return Response.json(await requestGeneration(user!, parseId(videoId), "frame", { expectedCredits }), { status: 202 });
  });
}
