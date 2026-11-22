import { handle } from "@/server/http";
import { createProduct, listProductsFor } from "@/server/products";

/** Productos que puede ver quien pregunta, los más recientes primero. */
export async function GET() {
  return handle(async (user) => Response.json({ products: await listProductsFor(user!) }));
}

/** Crea un producto. Si lo crea un colaborador, queda asignado a él. */
export async function POST(request: Request) {
  return handle(async (user) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" ? body : {};
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const product = await createProduct(user!, {
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
