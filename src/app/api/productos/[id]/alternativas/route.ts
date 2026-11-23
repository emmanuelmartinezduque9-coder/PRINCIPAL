import "@/jobs/product-jobs"; // define `producto.investigar`
import { enqueueJob } from "@/jobs/boss";
import { handle } from "@/server/http";
import { listResearch, requestResearch, RESEARCH_JOB } from "@/server/product-research";

const parseId = (id: string) => (/^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN);

/** Las últimas búsquedas de nicho, ángulo o audiencia del producto, con sus propuestas y pruebas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ research: await listResearch(user!, parseId(id)) });
  });
}

/** «Buscar nicho / ángulo / audiencia diferente»: `{ tipo: "nicho" | "angulo" | "audiencia", nota? }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const row = await requestResearch(user!, parseId(id), { kind: body?.tipo, note: body?.nota });
    await enqueueJob(RESEARCH_JOB, { userId: user!.id, productId: row.productId }, { researchId: row.id });
    return Response.json({ research: row }, { status: 201 });
  });
}
