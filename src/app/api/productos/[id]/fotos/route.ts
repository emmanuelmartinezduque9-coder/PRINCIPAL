import { badRequest, handle, HttpError } from "@/server/http";
import { addProductPhoto, listProductPhotos, MAX_PHOTO_BYTES } from "@/server/photos";

// Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido.
const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Fotos de un producto (sin el contenido), la primera es la portada. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ photos: await listProductPhotos(user!, parseId(id)) });
  });
}

/** Sube una foto (multipart, campo `foto`). Una foto por petición. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    // Se corta antes de leer el cuerpo si ya es evidente que no cabe (margen para el multipart).
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_PHOTO_BYTES + 64 * 1024) throw new HttpError(413, "La foto pesa demasiado (máximo 8 MB).");
    const form = await request.formData().catch(() => null);
    const file = form?.get("foto");
    if (!(file instanceof File)) return badRequest("Elige una foto para subir.");
    const photo = await addProductPhoto(user!, parseId(id), Buffer.from(await file.arrayBuffer()));
    return Response.json({ photo }, { status: 201 });
  });
}
