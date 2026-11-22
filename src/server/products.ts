import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { productScope, scopedProducts } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";

/** Productos: qué son y para qué idioma y países se preparan. La visibilidad la decide `access.ts`. */

export type Product = typeof schema.products.$inferSelect;

export const LANGUAGES = ["de", "it"] as const;
export const COUNTRIES = ["DE", "AT", "CH", "IT"] as const;

const MAX_NAME = 200;
const MAX_SUMMARY = 1000;

const NOT_FOUND = "Producto no encontrado.";

/**
 * Un producto visible para `user`. Si no existe o no es suyo, el mismo 404: una sola consulta
 * con el ámbito incluido, así no se puede distinguir un caso del otro.
 */
export async function getProductFor(user: AuthUser, productId: number): Promise<Product> {
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new HttpError(404, NOT_FOUND);
  const [product] = await scopedProducts(user, eq(schema.products.id, productId));
  if (!product) throw new HttpError(404, NOT_FOUND);
  return product;
}

/** Productos visibles para `user`, los más recientes primero. */
export async function listProductsFor(user: AuthUser): Promise<Product[]> {
  return scopedProducts(user).orderBy(desc(schema.products.createdAt), desc(schema.products.id));
}

/**
 * Las reglas de los datos de un producto (nombre, frase, idioma y países), con los valores por
 * defecto. Lanza 400 con un mensaje para la persona. La usan crear, cambiar y el importador.
 */
export function validateProductInput(input: { name: string; summary: string; language?: string; countries?: string[] }) {
  const name = input.name.trim();
  const summary = input.summary.trim();
  if (!name) throw new HttpError(400, "Escribe el nombre del producto.");
  if (name.length > MAX_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_NAME} caracteres.`);
  if (!summary) throw new HttpError(400, "Escribe en una frase qué hace el producto.");
  if (summary.length > MAX_SUMMARY) {
    throw new HttpError(400, `La frase no puede tener más de ${MAX_SUMMARY} caracteres.`);
  }
  const language = input.language ?? "de";
  if (!(LANGUAGES as readonly string[]).includes(language)) throw new HttpError(400, "Idioma no disponible.");
  const countries = [...new Set(input.countries ?? ["DE", "AT", "CH"])];
  if (countries.length === 0) throw new HttpError(400, "Elige al menos un país.");
  if (!countries.every((c) => (COUNTRIES as readonly string[]).includes(c))) {
    throw new HttpError(400, "País no disponible.");
  }
  return { name, summary, language, countries };
}

/** Crea un producto. Si lo crea un colaborador, queda asignado a él en la misma operación. */
export async function createProduct(
  user: AuthUser,
  input: { name: string; summary: string; language?: string; countries?: string[] },
): Promise<Product> {
  const values = validateProductInput(input);
  return getDb().transaction(async (tx) => {
    const [product] = await tx
      .insert(schema.products)
      .values({ ...values, createdBy: user.id })
      .returning();
    if (user.role !== "dueno") {
      await tx
        .insert(schema.productAssignments)
        .values({ productId: product.id, userId: user.id, assignedBy: user.id });
    }
    return product;
  });
}

export interface ProductChanges {
  name?: string;
  summary?: string;
  language?: string;
  countries?: string[];
}

/**
 * Cambia los datos de un producto que `user` puede ver; lo que no se envía se queda igual.
 * El ámbito se aplica también en la propia escritura: un producto ajeno (o que deja de estar
 * asignado entre la lectura y el cambio) responde 404 y no se toca.
 */
export async function updateProduct(user: AuthUser, productId: number, changes: ProductChanges): Promise<Product> {
  const current = await getProductFor(user, productId);
  const values = validateProductInput({
    name: changes.name ?? current.name,
    summary: changes.summary ?? current.summary,
    language: changes.language ?? current.language,
    countries: changes.countries ?? current.countries,
  });
  const [product] = await getDb()
    .update(schema.products)
    .set(values)
    .where(and(eq(schema.products.id, current.id), productScope(user)))
    .returning();
  if (!product) throw new HttpError(404, NOT_FOUND);
  return product;
}

/**
 * Nombre de cada producto por id, sin filtrar por persona: para pantallas del dueño (gasto,
 * personas) que ya tienen los ids de datos que pueden ver. Los ids desconocidos se omiten.
 */
export async function productNamesByIds(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(inArray(schema.products.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}
