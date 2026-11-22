import { handle } from "@/server/http";
import { deleteVariant, updateVariant } from "@/server/variants";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
type Params = { params: Promise<{ id: string; variantId: string }> };

/** Cambia el nombre o las fotos de una variante: `{ name?, articlePhotoIds?, packagingPhotoId? }` → `{ variant }`. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async (user) => {
    const { id, variantId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { name, articlePhotoIds, packagingPhotoId } = body ?? {};
    return Response.json({ variant: await updateVariant(user!, parseId(id), parseId(variantId), { name, articlePhotoIds, packagingPhotoId }) });
  });
}

/** Borra la variante; sus vídeos vuelven a las fotos de siempre del producto. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async (user) => {
    const { id, variantId } = await params;
    await deleteVariant(user!, parseId(id), parseId(variantId));
    return Response.json({ ok: true });
  });
}
