import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { listProductPhotos, photoIdsBySha256, type PhotoInfo } from "@/server/photos";
import { getProductFor } from "@/server/products";

/**
 * Variantes de un producto («rosa», «azul turquesa»…): qué fotos de artículo, en orden, y qué foto
 * de embalaje la representan. Las ve y las cambia quien ve el producto (como sus fotos); importarlas
 * en bloque es solo del dueño. Solo este módulo toca la tabla `product_variants`, y siempre después
 * de comprobar el producto con `getProductFor`: una variante de otro producto da el mismo 404 que
 * una que no existe.
 */

export const MAX_VARIANT_NAME = 60;
/** Fotos de artículo de una variante: las que caben en el manifiesto (`MAX_ARTICLE_REFS`). */
export const MAX_VARIANT_ARTICLES = 4;
export const MAX_VARIANTS_PER_PRODUCT = 30;

const NOT_FOUND = "Variante no encontrada.";
const NAME_TAKEN = (name: string) => `Ya hay una variante «${name}».`;

export interface VariantInfo {
  id: number;
  productId: number;
  name: string;
  /** Fotos de artículo, en orden; solo las que siguen existiendo en el producto. */
  articlePhotoIds: number[];
  packagingPhotoId: number | null;
}

const variants = schema.productVariants;
const COLUMNS = {
  id: variants.id,
  productId: variants.productId,
  name: variants.name,
  articlePhotoIds: variants.articlePhotoIds,
  packagingPhotoId: variants.packagingPhotoId,
};

type Row = { id: number; productId: number; name: string; articlePhotoIds: number[]; packagingPhotoId: number | null };

/** Sin las fotos que ya no existen: una foto borrada deja de salir sola. */
function present(row: Row, photos: PhotoInfo[]): VariantInfo {
  const ids = new Set(photos.map((photo) => photo.id));
  return {
    ...row,
    articlePhotoIds: row.articlePhotoIds.map(Number).filter((id) => ids.has(id)),
    packagingPhotoId: row.packagingPhotoId !== null && ids.has(row.packagingPhotoId) ? row.packagingPhotoId : null,
  };
}

/** Las variantes de un producto visible, en el orden en que se crearon. */
export async function listVariants(user: AuthUser, productId: number): Promise<VariantInfo[]> {
  const photos = await listProductPhotos(user, productId);
  const rows = await getDb().select(COLUMNS).from(variants).where(eq(variants.productId, productId)).orderBy(asc(variants.id));
  return rows.map((row) => present(row, photos));
}

/** Una variante de un producto visible; 404 si no existe o es de otro producto. */
export async function getVariantFor(user: AuthUser, productId: number, variantId: number): Promise<VariantInfo> {
  const photos = await listProductPhotos(user, productId);
  if (!Number.isSafeInteger(variantId) || variantId <= 0) throw new HttpError(404, NOT_FOUND);
  const [row] = await getDb()
    .select(COLUMNS)
    .from(variants)
    .where(and(eq(variants.id, variantId), eq(variants.productId, productId)));
  if (!row) throw new HttpError(404, NOT_FOUND);
  return present(row, photos);
}

export interface VariantInput {
  name?: unknown;
  articlePhotoIds?: unknown;
  packagingPhotoId?: unknown;
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** Comprueba el nombre y las fotos (de este producto). Lo que no viene se queda igual. */
function checkInput(input: VariantInput, photos: PhotoInfo[]): Partial<Omit<Row, "id" | "productId">> {
  const ids = new Set(photos.map((photo) => photo.id));
  const changes: Partial<Omit<Row, "id" | "productId">> = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (!name) throw new HttpError(400, "Escribe el nombre de la variante.");
    if (name.length > MAX_VARIANT_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_VARIANT_NAME} caracteres.`);
    changes.name = name;
  }
  if (input.articlePhotoIds !== undefined) {
    const list = input.articlePhotoIds;
    if (!Array.isArray(list) || !list.every(isId)) throw new HttpError(400, "Fotos no válidas.");
    const unique = [...new Set(list as number[])];
    if (unique.length === 0) throw new HttpError(400, "Elige al menos una foto del artículo.");
    if (unique.length > MAX_VARIANT_ARTICLES) throw new HttpError(400, `Como mucho ${MAX_VARIANT_ARTICLES} fotos del artículo.`);
    if (!unique.every((id) => ids.has(id))) throw new HttpError(400, "Elige fotos de este producto.");
    changes.articlePhotoIds = unique;
  }
  if (input.packagingPhotoId !== undefined) {
    if (input.packagingPhotoId !== null && !(isId(input.packagingPhotoId) && ids.has(input.packagingPhotoId))) {
      throw new HttpError(400, "Elige fotos de este producto.");
    }
    changes.packagingPhotoId = input.packagingPhotoId as number | null;
  }
  return changes;
}

const isNameTaken = (error: unknown) => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const inner = e.cause ?? e;
  return inner.code === "23505" && inner.constraint === "product_variants_product_name";
};

/** Crea una variante: nombre y al menos una foto de artículo de este producto (embalaje opcional). */
export async function createVariant(user: AuthUser, productId: number, input: VariantInput): Promise<VariantInfo> {
  const product = await getProductFor(user, productId);
  const photos = await listProductPhotos(user, product.id);
  const values = checkInput({ name: input.name ?? "", articlePhotoIds: input.articlePhotoIds ?? [], packagingPhotoId: input.packagingPhotoId ?? null }, photos);
  const existing = await getDb().select({ id: variants.id }).from(variants).where(eq(variants.productId, product.id));
  if (existing.length >= MAX_VARIANTS_PER_PRODUCT) throw new HttpError(400, `Este producto ya tiene ${MAX_VARIANTS_PER_PRODUCT} variantes.`);
  try {
    const [row] = await getDb()
      .insert(variants)
      .values({
        productId: product.id,
        name: values.name!,
        articlePhotoIds: values.articlePhotoIds!,
        packagingPhotoId: values.packagingPhotoId ?? null,
        createdBy: user.id,
      })
      .returning(COLUMNS);
    return present(row, photos);
  } catch (error) {
    if (isNameTaken(error)) throw new HttpError(409, NAME_TAKEN(values.name!));
    throw error;
  }
}

/** Cambia el nombre o las fotos de una variante. */
export async function updateVariant(user: AuthUser, productId: number, variantId: number, input: VariantInput): Promise<VariantInfo> {
  const current = await getVariantFor(user, productId, variantId);
  const photos = await listProductPhotos(user, productId);
  const changes = checkInput(input, photos);
  if (Object.keys(changes).length === 0) return current;
  try {
    const [row] = await getDb()
      .update(variants)
      .set(changes)
      .where(and(eq(variants.id, current.id), eq(variants.productId, productId)))
      .returning(COLUMNS);
    if (!row) throw new HttpError(404, NOT_FOUND);
    return present(row, photos);
  } catch (error) {
    if (changes.name !== undefined && isNameTaken(error)) throw new HttpError(409, NAME_TAKEN(changes.name));
    throw error;
  }
}

/** Borra una variante. Los vídeos que la llevaban vuelven a las fotos de siempre del producto. */
export async function deleteVariant(user: AuthUser, productId: number, variantId: number): Promise<void> {
  const current = await getVariantFor(user, productId, variantId);
  await getDb().delete(variants).where(and(eq(variants.id, current.id), eq(variants.productId, productId)));
}

export interface VariantImport {
  created: Array<{ id: number; name: string }>;
  skipped: Array<{ name: string; reason: string }>;
}

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Importa variantes por la huella sha256 de sus fotos ya subidas (solo el dueño): `{ variants:
 * [{ name, articleSha256: [...], packagingSha256? }] }`. Cada variante se crea si todas sus fotos
 * están en el producto y no hay otra con ese nombre; si no, se salta con el motivo. Se puede
 * repetir: las que ya están se saltan.
 */
export async function importVariants(owner: AuthUser, productId: number, body: unknown): Promise<VariantImport> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede importar variantes.");
  const product = await getProductFor(owner, productId);
  const list = (body as { variants?: unknown } | null)?.variants;
  if (!Array.isArray(list) || list.length > 100) throw new HttpError(400, "Formato no válido: { variants: [...] }.");
  const bySha = await photoIdsBySha256(owner, product.id);
  const result: VariantImport = { created: [], skipped: [] };
  for (const [index, entry] of list.entries()) {
    const item = (entry ?? {}) as { name?: unknown; articleSha256?: unknown; packagingSha256?: unknown };
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `#${index + 1}`;
    const articles = item.articleSha256;
    const packaging = item.packagingSha256 ?? null;
    if (!Array.isArray(articles) || articles.length === 0 || !articles.every((sha) => typeof sha === "string" && SHA256.test(sha.toLowerCase()))) {
      result.skipped.push({ name, reason: "articleSha256 no válido" });
      continue;
    }
    if (packaging !== null && !(typeof packaging === "string" && SHA256.test(packaging.toLowerCase()))) {
      result.skipped.push({ name, reason: "packagingSha256 no válido" });
      continue;
    }
    const articleIds = (articles as string[]).map((sha) => bySha.get(sha.toLowerCase()));
    const packagingId = packaging === null ? null : bySha.get((packaging as string).toLowerCase());
    const missing = articleIds.filter((id) => id === undefined).length + (packagingId === undefined ? 1 : 0);
    if (missing > 0) {
      result.skipped.push({ name, reason: missing === 1 ? "falta 1 foto en el producto" : `faltan ${missing} fotos en el producto` });
      continue;
    }
    try {
      const variant = await createVariant(owner, product.id, {
        name: item.name,
        articlePhotoIds: articleIds as number[],
        packagingPhotoId: packagingId ?? null,
      });
      result.created.push({ id: variant.id, name: variant.name });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      result.skipped.push({ name, reason: error.status === 409 ? "ya existe" : error.message });
    }
  }
  return result;
}
