import { handle } from "@/server/http";
import { listProductBodies, markBody } from "@/server/videos/bodies";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Los cuerpos de un producto que ve quien pregunta → `{ bodies }`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ bodies: await listProductBodies(user!, parseId(id)) });
  });
}

/** Marca un clip de la biblioteca de quien pregunta como cuerpo del producto: `{ clipId, label? }` → `{ body }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const saved = await markBody(user!, parseId(id), { clipId: body?.clipId, label: body?.label });
    return Response.json({ body: saved }, { status: 201 });
  });
}
