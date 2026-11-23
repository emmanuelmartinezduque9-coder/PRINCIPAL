import "@/jobs/product-jobs"; // define `producto.alta`
import { enqueueJob } from "@/jobs/boss";
import { handle } from "@/server/http";
import { INTAKE_JOB, startIntake } from "@/server/product-intake";

const parseId = (id: string) => (/^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN);

/** Las fotos opcionales del alta ya están subidas: empieza el análisis. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const intake = await startIntake(user!, parseId(id));
    if (intake) await enqueueJob(INTAKE_JOB, { userId: user!.id, productId: intake.productId }, { intakeId: intake.id });
    return Response.json({ ok: true });
  });
}
