import { badRequest, handle } from "@/server/http";
import { addVideoToBatch } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Crea un vídeo en el lote: `{ productId, avatarPhotoId | null, noPerson, note? }` → `{ video }`.
 * Solo quien creó el lote.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { productId, avatarPhotoId, noPerson, note } = body ?? {};
    if (!isId(productId)) return badRequest("Elige el producto.");
    if (avatarPhotoId !== null && !isId(avatarPhotoId)) return badRequest("Elige una foto con papel «Avatar» de este producto.");
    if (typeof noPerson !== "boolean") return badRequest("Valor no válido.");
    if (note !== undefined && note !== null && typeof note !== "string") return badRequest("Valor no válido.");
    const video = await addVideoToBatch(user!, parseId(id), { productId, avatarPhotoId, noPerson, note });
    return Response.json({ video }, { status: 201 });
  });
}
