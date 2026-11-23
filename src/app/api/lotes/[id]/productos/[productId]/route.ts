import { badRequest, handle } from "@/server/http";
import { setBatchProductClipModel, setBatchProductEditReference, setBatchProductNotes } from "@/server/videos/batches";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Guarda lo que el lote dice de un producto: `{ notes?, editReferenceUrl?, clipModel? }` (cada uno,
 * texto o `null`; vacío lo quita; lo que no venga no se toca) → lo guardado. `notes`: las
 * «Indicaciones para los vídeos de {producto}». `editReferenceUrl`: la «Edición de referencia» del
 * grupo, que pasa también a los vídeos del grupo sin una propia. `clipModel`: cómo se genera la
 * réplica en el grupo (`auto` o un modelo; `null`, sin elección), que pasa igual a sus vídeos. Solo
 * quien creó el lote.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; productId: string }> }) {
  return handle(async (user) => {
    const { id, productId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const hasNotes = body !== null && "notes" in body;
    const hasEdit = body !== null && "editReferenceUrl" in body;
    const hasModel = body !== null && "clipModel" in body;
    if (!hasNotes && !hasEdit && !hasModel) return badRequest("Nada que guardar.");
    const result: { notes?: string | null; editReferenceUrl?: string | null; clipModel?: string | null } = {};
    if (hasNotes) result.notes = await setBatchProductNotes(user!, parseId(id), parseId(productId), body.notes ?? null);
    if (hasEdit) result.editReferenceUrl = await setBatchProductEditReference(user!, parseId(id), parseId(productId), body.editReferenceUrl);
    if (hasModel) result.clipModel = await setBatchProductClipModel(user!, parseId(id), parseId(productId), body.clipModel);
    return Response.json(result);
  });
}
