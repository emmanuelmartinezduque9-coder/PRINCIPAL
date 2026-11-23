import "@/jobs/product-jobs"; // define `producto.alta`
import { enqueueJob } from "@/jobs/boss";
import { handle } from "@/server/http";
import { INTAKE_JOB, intakeViewFor, requestMockup } from "@/server/product-intake";

const parseId = (id: string) => (/^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN);

/**
 * «Generar mockup»: la foto del producto sobre fondo gris en el Higgsfield de quien lo pide. Con
 * `{ aceptarCreditos: n }` acepta un coste mayor de lo normal que la web le enseñó antes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const intake = await requestMockup(user!, parseId(id), body?.aceptarCreditos);
    await enqueueJob(INTAKE_JOB, { userId: user!.id, productId: intake.productId }, { intakeId: intake.id });
    return Response.json({ intake: await intakeViewFor(user!, intake.productId) });
  });
}
