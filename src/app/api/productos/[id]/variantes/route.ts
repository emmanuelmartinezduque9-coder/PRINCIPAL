import { handle } from "@/server/http";
import { createVariant, listVariants } from "@/server/variants";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Las variantes del producto: `{ variants: [{ id, productId, name, articlePhotoIds, packagingPhotoId }] }`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ variants: await listVariants(user!, parseId(id)) });
  });
}

/** Crea una variante: `{ name, articlePhotoIds: [id…] (1–4, en orden), packagingPhotoId?: id | null }` → 201 `{ variant }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { name, articlePhotoIds, packagingPhotoId } = body ?? {};
    const variant = await createVariant(user!, parseId(id), { name, articlePhotoIds, packagingPhotoId });
    return Response.json({ variant }, { status: 201 });
  });
}
