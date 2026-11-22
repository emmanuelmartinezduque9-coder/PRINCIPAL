import "@/jobs/video-jobs"; // define `video.desglose` y `lote.avanzar`
import { handle } from "@/server/http";
import { answerQuestion, batchQuestions } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Preguntas del lote»: las abiertas de todos los vídeos → `{ questions }`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ questions: await batchQuestions(user!, parseId(id)) }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Responde una: `{ videoId, key, value }` → `{ ok }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    await answerQuestion(user!, parseId(id), { videoId: body?.videoId, key: body?.key, value: body?.value });
    return Response.json({ ok: true });
  });
}
