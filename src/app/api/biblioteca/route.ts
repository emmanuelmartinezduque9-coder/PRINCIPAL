import { badRequest, handle } from "@/server/http";
import { listLibrary } from "@/server/videos/library";

const isId = (value: string) => /^[1-9]\d{0,15}$/.test(value);

/**
 * La biblioteca de clips de quien pregunta, de la caché (no llama a Higgsfield):
 * `?cursor=&limite=&producto=` → `{ clips, nextCursor, total, refreshedAt, stale }`. Con `producto`,
 * los clips marcados como cuerpo de ese producto.
 */
export async function GET(request: Request) {
  return handle(async (user) => {
    const query = new URL(request.url).searchParams;
    const product = query.get("producto");
    const limit = query.get("limite");
    if (product !== null && !isId(product)) return badRequest("Producto no válido.");
    if (limit !== null && !/^\d{1,3}$/.test(limit)) return badRequest("Página no válida.");
    return Response.json(
      await listLibrary(user!, {
        cursor: query.get("cursor"),
        limit: limit === null ? undefined : Number(limit),
        productId: product === null ? null : Number(product),
      }),
    );
  });
}
