import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { productScope, scopedProducts } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";

/** Productos: qué son y para qué idioma y países se preparan. La visibilidad la decide `access.ts`. */

export type Product = typeof schema.products.$inferSelect;

export const LANGUAGES = ["de", "it", "en"] as const;
export const COUNTRIES = ["DE", "AT", "CH", "IT", "US"] as const;

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

/**
 * Qué productos archivados entran en una lista: `no` (por defecto: listas y selectores), `solo`
 * (la vista de archivados del dueño) o `todos` (para saber qué ids ve una persona, p. ej. al
 * enseñar un lote antiguo con un producto ya archivado).
 */
export type ArchivedFilter = "no" | "solo" | "todos";

/** Nombre para enseñar: con el emoji delante si lo tiene. */
export const productDisplayName = (product: { name: string; emoji: string | null }) =>
  product.emoji ? `${product.emoji} ${product.name}` : product.name;

/** Productos visibles para `user`, los más recientes primero. Sin archivados salvo que se pidan. */
export async function listProductsFor(user: AuthUser, archived: ArchivedFilter = "no"): Promise<Product[]> {
  const where =
    archived === "no" ? isNull(schema.products.archivedAt) : archived === "solo" ? isNotNull(schema.products.archivedAt) : undefined;
  return scopedProducts(user, where).orderBy(desc(schema.products.createdAt), desc(schema.products.id));
}

/** Cuántos productos archivados ve `user`. */
export async function countArchivedProducts(user: AuthUser): Promise<number> {
  return (await scopedProducts(user, isNotNull(schema.products.archivedAt))).length;
}

const MAX_EMOJI = 16;

/**
 * Emoji del producto: `null` lo quita; si no, uno o varios emoji (los compuestos, como 💇‍♀️ o una
 * bandera, cuentan como varios caracteres), hasta 16 caracteres y sin letras, números ni espacios.
 */
export function validateEmoji(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "Emoji no válido.");
  const emoji = value.trim();
  if (!emoji) return null;
  if ([...emoji].length > MAX_EMOJI) throw new HttpError(400, "Emoji demasiado largo.");
  if (/[\p{L}\p{N}\s]/u.test(emoji) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)) {
    throw new HttpError(400, "Emoji no válido.");
  }
  return emoji;
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
  options: {
    /** Enlace del que sale (alta desde un enlace). */
    sourceUrl?: string;
    /** Algo más que debe quedar en la misma operación (p. ej. el alta automática). */
    alsoInTx?: (tx: ProductTx, product: Product) => Promise<void>;
  } = {},
): Promise<Product> {
  const values = validateProductInput(input);
  return getDb().transaction(async (tx) => {
    const [product] = await tx
      .insert(schema.products)
      .values({ ...values, createdBy: user.id, sourceUrl: options.sourceUrl ?? null })
      .returning();
    if (user.role !== "dueno") {
      await tx
        .insert(schema.productAssignments)
        .values({ productId: product.id, userId: user.id, assignedBy: user.id });
    }
    await options.alsoInTx?.(tx, product);
    return product;
  });
}

export type ProductTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Lo que el sistema rellena solo (el alta desde un enlace): nombre, frase, nicho, audiencia,
 * ángulo, emoji y enlace de origen. Quien llama ya comprobó el acceso al producto. Recorta a los
 * máximos de siempre; lo que no se envía se queda igual.
 */
export async function setProductFacts(
  productId: number,
  facts: { name?: string; summary?: string; niche?: string | null; audience?: string | null; angle?: string | null; emoji?: string | null; sourceUrl?: string },
): Promise<void> {
  const clip = (value: string | null | undefined, max: number) => (value == null ? value : value.trim().slice(0, max) || null);
  const changes: Partial<typeof schema.products.$inferInsert> = {};
  if (facts.name?.trim()) changes.name = facts.name.trim().slice(0, MAX_NAME);
  if (facts.summary?.trim()) changes.summary = facts.summary.trim().slice(0, MAX_SUMMARY);
  if (facts.niche !== undefined) changes.niche = clip(facts.niche, 300);
  if (facts.audience !== undefined) changes.audience = clip(facts.audience, 300);
  if (facts.angle !== undefined) changes.angle = clip(facts.angle, 300);
  if (facts.emoji !== undefined) {
    try {
      changes.emoji = validateEmoji(facts.emoji);
    } catch {
      // Un emoji que no vale no impide guardar lo demás.
    }
  }
  if (facts.sourceUrl) changes.sourceUrl = facts.sourceUrl;
  if (Object.keys(changes).length === 0) return;
  await getDb().update(schema.products).set(changes).where(eq(schema.products.id, productId));
}

/** Nombres de todos los productos (para no repetir raíces al elegir una marca nueva). */
export async function allProductNames(): Promise<string[]> {
  const rows = await getDb().select({ name: schema.products.name }).from(schema.products);
  return [...new Set(rows.map((row) => row.name))];
}

export interface ProductChanges {
  name?: string;
  summary?: string;
  language?: string;
  countries?: string[];
  /** Avatar habitual de los vídeos nuevos: `elegido` (con una foto de avatar del producto o `null`), `sin_sustitucion` o `nadie`. */
  defaultAvatarMode?: unknown;
  defaultAvatarPhotoId?: unknown;
  /** Texto con el emoji, o `null` para quitarlo. */
  emoji?: unknown;
  /** Archivar (`true`) o desarchivar (`false`). Solo el dueño. */
  archived?: unknown;
  /** Nicho, audiencia y ángulo actuales: texto (hasta 300 caracteres) o `null` para quitarlo. */
  niche?: unknown;
  audience?: unknown;
  angle?: unknown;
}

const MAX_FOCUS = 300;

/** Nicho, audiencia o ángulo: texto recortado o `null`. Lanza 400 si no vale. */
function focusText(value: unknown, what: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `${what} no válido.`);
  const text = value.trim();
  if (text.length > MAX_FOCUS) throw new HttpError(400, `${what} no puede tener más de ${MAX_FOCUS} caracteres.`);
  return text || null;
}

const AVATAR_MODES = ["elegido", "sin_sustitucion", "nadie"];

/** Comprueba el avatar habitual (400 si no vale) y devuelve las columnas que cambian. */
async function checkDefaultAvatar(
  current: Product,
  changes: ProductChanges,
): Promise<{ defaultAvatarMode?: string; defaultAvatarPhotoId?: number | null }> {
  if (changes.defaultAvatarMode === undefined && changes.defaultAvatarPhotoId === undefined) return {};
  // Elegir una foto sin decir el modo pasa a «elegido».
  const pickingPhoto = changes.defaultAvatarMode === undefined && changes.defaultAvatarPhotoId !== undefined && changes.defaultAvatarPhotoId !== null;
  const mode = changes.defaultAvatarMode ?? (pickingPhoto ? "elegido" : current.defaultAvatarMode);
  if (typeof mode !== "string" || !AVATAR_MODES.includes(mode)) throw new HttpError(400, "Valor no válido.");
  // Otro modo quita la foto.
  let photoId = changes.defaultAvatarPhotoId === undefined ? (mode === "elegido" ? current.defaultAvatarPhotoId : null) : changes.defaultAvatarPhotoId;
  if (photoId !== null && (!Number.isSafeInteger(photoId) || (photoId as number) <= 0)) throw new HttpError(400, "Valor no válido.");
  if (photoId !== null && changes.defaultAvatarMode !== undefined && mode !== "elegido") {
    throw new HttpError(400, "Con «Sin sustitución» o «No aparece nadie» no se elige avatar.");
  }
  if (photoId !== null) {
    const [photo] = await getDb()
      .select({ id: schema.productPhotos.id })
      .from(schema.productPhotos)
      .where(
        and(
          eq(schema.productPhotos.id, photoId as number),
          eq(schema.productPhotos.productId, current.id),
          eq(schema.productPhotos.role, "avatar"),
        ),
      );
    if (!photo) throw new HttpError(400, "Elige una foto con papel «Avatar» de este producto.");
  }
  if (mode !== "elegido") photoId = null;
  return { defaultAvatarMode: photoId !== null ? "elegido" : mode, defaultAvatarPhotoId: photoId as number | null };
}

/**
 * Cambia los datos de un producto que `user` puede ver (también su avatar habitual); lo que no se
 * envía se queda igual.
 * El ámbito se aplica también en la propia escritura: un producto ajeno (o que deja de estar
 * asignado entre la lectura y el cambio) responde 404 y no se toca.
 */
export async function updateProduct(user: AuthUser, productId: number, changes: ProductChanges): Promise<Product> {
  const current = await getProductFor(user, productId);
  const extra: { emoji?: string | null; archivedAt?: Date | null; niche?: string | null; audience?: string | null; angle?: string | null } = {};
  if (changes.emoji !== undefined) extra.emoji = validateEmoji(changes.emoji);
  if (changes.niche !== undefined) extra.niche = focusText(changes.niche, "Nicho");
  if (changes.audience !== undefined) extra.audience = focusText(changes.audience, "Audiencia");
  if (changes.angle !== undefined) extra.angle = focusText(changes.angle, "Ángulo");
  if (changes.archived !== undefined) {
    if (typeof changes.archived !== "boolean") throw new HttpError(400, "Valor no válido.");
    if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño puede archivar productos.");
    // Archivar de nuevo conserva la fecha de la primera vez.
    extra.archivedAt = changes.archived ? (current.archivedAt ?? new Date()) : null;
  }
  const values = validateProductInput({
    name: changes.name ?? current.name,
    summary: changes.summary ?? current.summary,
    language: changes.language ?? current.language,
    countries: changes.countries ?? current.countries,
  });
  const avatar = await checkDefaultAvatar(current, changes);
  const [product] = await getDb()
    .update(schema.products)
    .set({ ...values, ...avatar, ...extra })
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

/** Quién creó un producto (para hacer en su nombre lo que se genera solo). `null` si no existe. */
export async function productOwnerId(productId: number): Promise<number | null> {
  const [row] = await getDb().select({ createdBy: schema.products.createdBy }).from(schema.products).where(eq(schema.products.id, productId));
  return row?.createdBy ?? null;
}

/** Móvil y cuentas de un producto (productos delegados al móvil). Sin comprobar acceso: quien llama ya lo hizo. */
export async function productDelegation(productId: number): Promise<{ phoneId: number | null; instagramAccount: string | null; facebookAccount: string | null; publishGapHours: number } | null> {
  const [row] = await getDb()
    .select({ phoneId: schema.products.phoneId, instagramAccount: schema.products.instagramAccount, facebookAccount: schema.products.facebookAccount, publishGapHours: schema.products.publishGapHours })
    .from(schema.products)
    .where(eq(schema.products.id, productId));
  return row ?? null;
}

/** Guarda el móvil y las cuentas de un producto (ya comprobados por `phones.ts`). */
export async function saveProductDelegation(
  productId: number,
  input: { phoneId: number | null; instagramAccount: string | null; facebookAccount: string | null; publishGapHours: number },
): Promise<void> {
  await getDb().update(schema.products).set(input).where(eq(schema.products.id, productId));
}

/** Mercado de productos conocidos por el motor; la lectura permanece en la capa de productos. */
export async function productMarketsByIds(ids: number[]): Promise<Map<number, { language: string; countries: string[] }>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select({ id: schema.products.id, language: schema.products.language, countries: schema.products.countries }).from(schema.products).where(inArray(schema.products.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, { language: r.language, countries: r.countries }]));
}
