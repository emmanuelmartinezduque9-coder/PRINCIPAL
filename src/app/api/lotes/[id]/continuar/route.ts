import "@/jobs/video-jobs"; // define `lote.avanzar`
import { handle } from "@/server/http";
import { resumeBatch } from "@/server/videos/lote";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Continuar» un lote en pausa: `{ extraCredits? }` o `{ skip: true }` → `{ batch }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json({ batch: await resumeBatch(user!, parseId(id), { extraCredits: body?.extraCredits, skip: body?.skip }) });
  });
}
