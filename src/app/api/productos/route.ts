import { handle, HttpError } from "@/server/http";
import { coverPhotoIds } from "@/server/photos";
import { countArchivedProducts, createProduct, listProductsFor } from "@/server/products";

/**
 * Productos que puede ver quien pregunta, los más recientes primero, sin los archivados. Con
 * `?archivados=1`, solo los archivados (solo el dueño). Al dueño se le dice cuántos archivados hay.
 */
export async function GET(request: Request) {
  return handle(async (user) => {
    const archived = new URL(request.url).searchParams.get("archivados") === "1";
    const isOwner = user!.role === "dueno";
    if (archived && !isOwner) throw new HttpError(403, "Solo el dueño puede hacer esto.");
    const products = await listProductsFor(user!, archived ? "solo" : "no");
    const covers = await coverPhotoIds(
      user!,
      products.map((p) => p.id),
    );
    return Response.json({
      products: products.map((p) => ({ ...p, coverPhotoId: covers.get(p.id) ?? null })),
      archivedCount: isOwner ? (archived ? products.length : await countArchivedProducts(user!)) : 0,
    });
  });
}

/** Crea un producto. Si lo crea un colaborador, queda asignado a él. */
export async function POST(request: Request) {
  return handle(async (user) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" ? body : {};
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const product = await createProduct(user!, {
      kind: input.kind === undefined ? undefined : text(input.kind),
      name: text(input.name),
      summary: text(input.summary),
      // Un valor que no es texto o no es una lista se rechaza con el mensaje de siempre.
      language: input.language === undefined ? undefined : text(input.language),
      countries:
        input.countries === undefined ? undefined : Array.isArray(input.countries) ? input.countries.map(text) : [],
    });
    return Response.json({ product }, { status: 201 });
  });
}
