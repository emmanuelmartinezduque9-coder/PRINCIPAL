import { handle } from "@/server/http";
import { getProductFor, updateProduct } from "@/server/products";

// Solo dígitos: "1e3", "12abc" o un número enorme no se convierten en otro id válido.
const parseId = (id: string) => (/^[1-9]\d{0,15}$/.test(id) ? Number(id) : Number.NaN);

/** Un producto por id. Si no existe o no es de quien pregunta: el mismo 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    return Response.json({ product: await getProductFor(user!, parseId(id)) });
  });
}

/**
 * Cambia nombre, frase, idioma, países, el avatar habitual (`defaultAvatarMode`,
 * `defaultAvatarPhotoId`), el emoji (`emoji`: texto o `null`) o lo archiva (`archived`: solo el dueño), y el nicho, la audiencia y el ángulo actuales. Un producto ajeno: el mismo 404 que al leerlo.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" ? body : {};
    // Un valor que no es texto o no es una lista se rechaza con el mensaje de siempre.
    const text = (value: unknown) => (value === undefined ? undefined : typeof value === "string" ? value : "");
    const product = await updateProduct(user!, parseId(id), {
      name: text(input.name),
      summary: text(input.summary),
      language: text(input.language),
      countries:
        input.countries === undefined ? undefined : Array.isArray(input.countries) ? input.countries.map((c) => text(c) ?? "") : [],
      defaultAvatarMode: input.defaultAvatarMode,
      defaultAvatarPhotoId: input.defaultAvatarPhotoId,
      emoji: input.emoji,
      archived: input.archived,
      niche: input.niche,
      audience: input.audience,
      angle: input.angle,
    });
    return Response.json({ product });
  });
}
