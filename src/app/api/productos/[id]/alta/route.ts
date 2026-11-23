import "@/jobs/product-jobs"; // define `producto.alta`
import { enqueueJob } from "@/jobs/boss";
import { handle } from "@/server/http";
import { INTAKE_JOB, intakeViewFor, restartIntake } from "@/server/product-intake";

const parseId = (id: string) => (/^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN);

/** Cómo va el alta automática del producto (la última), o `null` si se creó a mano. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ intake: await intakeViewFor(user!, parseId(id)) });
  });
}

/** «Volver a analizar» (con el mismo enlace u otro: `{ url }`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const intake = await restartIntake(user!, parseId(id), { url: body?.url });
    await enqueueJob(INTAKE_JOB, { userId: user!.id, productId: intake.productId }, { intakeId: intake.id });
    return Response.json({ intake: await intakeViewFor(user!, intake.productId) }, { status: 201 });
  });
}
