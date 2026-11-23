import { badRequest, handle } from "@/server/http";
import { addVideoToBatch } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Crea un vídeo en el lote: `{ productId, avatarPhotoId | null, avatarLibraryId?, avatarMode, variantId?, kind?, adaptation?, hookSeconds?, bodyClipIds?, note?, linkUrl?, songId?, editReferenceUrl?, clipModel? }`
 * → `{ video }`. `avatarMode`: `elegido` (con `avatarPhotoId`) | `biblioteca` (con `avatarLibraryId`)
 * | `automatico` | `sin_sustitucion` | `nadie`; `variantId`: una variante del producto o `null`; `kind`: `replicar` (por
 * defecto) | `adaptacion_concepto` | `solo_gancho` (con `hookSeconds`, 2–8, y `bodyClipIds`, los
 * cuerpos de ese producto en orden). Con `linkUrl`, la referencia es ese enlace pegado: lo trae el
 * Mac de quien lo pide. `songId`: la «Música» (id de una canción o `null`, audio original).
 * `editReferenceUrl`: la «Referencia de edición» (un enlace admitido o `null`; solo se guarda).
 * `clipModel`: cómo se genera la réplica (`auto`, por defecto, o un modelo).
 * `references`: las imágenes de referencia subidas a mano (`{ sha256, role }[]`).
 * `regenerateFrom`: «Regenerar un vídeo» (id de un vídeo anterior del producto con la referencia
 * preparada): reutiliza su referencia y, si sigue valiendo, su desglose.
 * Solo quien creó el lote.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { productId, avatarPhotoId, avatarLibraryId, avatarMode, variantId, kind, adaptation, hookSeconds, bodyClipIds, note, linkUrl, songId, editReferenceUrl, clipModel, references, regenerateFrom } = body ?? {};
    if (!isId(productId)) return badRequest("Elige el producto.");
    if (avatarPhotoId !== null && !isId(avatarPhotoId)) return badRequest("Elige una foto con papel «Avatar» de este producto.");
    // El tipo, la adaptación, el gancho, los cuerpos, los cambios, quién sale y el enlace los comprueba `addVideoToBatch` (400).
    const video = await addVideoToBatch(user!, parseId(id), { productId, avatarPhotoId, avatarLibraryId, avatarMode, variantId, kind, adaptation, hookSeconds, bodyClipIds, note, linkUrl, songId, editReferenceUrl, clipModel, references, regenerateFrom });
    return Response.json({ video }, { status: 201 });
  });
}
