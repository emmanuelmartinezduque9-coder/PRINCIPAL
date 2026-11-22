import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isPhotoRole, PHOTO_ROLES, type PhotoRole } from "@/lib/photo-roles";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, listProductsFor } from "@/server/products";

/**
 * Fotos de producto. Cada función empieza comprobando el producto con `getProductFor`, así que
 * una foto solo la ve quien ve su producto, y un identificador ajeno da el mismo 404 que uno
 * que no existe.
 */

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_PRODUCT = 12;

// Los papeles viven en un módulo sin base de datos para poder usarlos también en las pantallas.
export { PHOTO_ROLES, isPhotoRole, type PhotoRole };

function checkRole(value: unknown): PhotoRole {
  if (!isPhotoRole(value)) throw new HttpError(400, "Papel de foto no válido.");
  return value;
}

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
export interface PhotoInfo {
  id: number;
  mime: string;
  size: number;
  role: PhotoRole;
}

const NOT_FOUND = "Foto no encontrada.";

/** Tipo de imagen según los primeros bytes del archivo (el nombre o el tipo declarado no cuentan). */
export function detectImageType(bytes: Buffer): PhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

const INFO_COLUMNS = {
  id: schema.productPhotos.id,
  mime: schema.productPhotos.mime,
  size: schema.productPhotos.size,
  role: schema.productPhotos.role,
};
const toInfo = (row: { id: number; mime: string; size: number; role: string }): PhotoInfo => ({
  ...row,
  role: isPhotoRole(row.role) ? row.role : "otro",
});

/**
 * Guarda una foto del producto, por defecto como «artículo». Rechaza papel desconocido, vacías,
 * pesadas, de formato no admitido y la que pase del máximo.
 */
export async function addProductPhoto(
  user: AuthUser,
  productId: number,
  bytes: Buffer,
  role: PhotoRole = "articulo",
): Promise<PhotoInfo> {
  const product = await getProductFor(user, productId);
  checkRole(role);
  if (bytes.length === 0) throw new HttpError(400, "La foto está vacía.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(400, "La foto pesa demasiado (máximo 8 MB).");
  const mime = detectImageType(bytes);
  if (!mime) {
    throw new HttpError(
      400,
      "Formato de foto no admitido. Usa JPG, PNG o WebP (en iPhone: Ajustes → Cámara → Formatos → «El más compatible»).",
    );
  }

  return getDb().transaction(async (tx) => {
    // Subidas simultáneas al mismo producto van una detrás de otra: así el máximo se cumple.
    await tx.execute(sql`select pg_advisory_xact_lock(${product.id})`);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.productPhotos)
      .where(eq(schema.productPhotos.productId, product.id));
    if (count >= MAX_PHOTOS_PER_PRODUCT) {
      throw new HttpError(400, `Este producto ya tiene ${MAX_PHOTOS_PER_PRODUCT} fotos.`);
    }
    const [row] = await tx
      .insert(schema.productPhotos)
      .values({ productId: product.id, mime, size: bytes.length, data: bytes, role, createdBy: user.id })
      .returning(INFO_COLUMNS);
    return toInfo(row);
  });
}

/**
 * Carga en bloque de fotos ya clasificadas (para el importador del sistema antiguo). Solo el
 * dueño; cada foto pasa por las mismas reglas que una subida normal. Los papeles se validan
 * todos antes de guardar nada.
 */
export async function importProductPhotos(
  owner: AuthUser,
  productId: number,
  photos: { bytes: Buffer; role: PhotoRole }[],
): Promise<PhotoInfo[]> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede importar fotos.");
  photos.forEach((photo) => checkRole(photo.role));
  const saved: PhotoInfo[] = [];
  for (const photo of photos) saved.push(await addProductPhoto(owner, productId, photo.bytes, photo.role));
  return saved;
}

/** Fotos del producto, en orden de subida (la primera es la portada). Sin los datos de la imagen. */
export async function listProductPhotos(user: AuthUser, productId: number): Promise<PhotoInfo[]> {
  const product = await getProductFor(user, productId);
  const rows = await getDb()
    .select(INFO_COLUMNS)
    .from(schema.productPhotos)
    .where(eq(schema.productPhotos.productId, product.id))
    .orderBy(asc(schema.productPhotos.id));
  return rows.map(toInfo);
}

/** Producto al que pertenece una foto, ya comprobado para `user`; 404 si la foto no existe o no es visible. */
async function ownedPhoto(user: AuthUser, photoId: number): Promise<{ id: number; productId: number }> {
  if (!Number.isSafeInteger(photoId) || photoId <= 0) throw new HttpError(404, NOT_FOUND);
  const [photo] = await getDb()
    .select({ id: schema.productPhotos.id, productId: schema.productPhotos.productId })
    .from(schema.productPhotos)
    .where(eq(schema.productPhotos.id, photoId));
  if (!photo) throw new HttpError(404, NOT_FOUND);
  try {
    await getProductFor(user, photo.productId);
  } catch (error) {
    // Mismo mensaje que si la foto no existiera.
    if (error instanceof HttpError && error.status === 404) throw new HttpError(404, NOT_FOUND);
    throw error;
  }
  return photo;
}

/** El contenido de una foto, si el producto es visible para `user`. */
export async function readProductPhoto(user: AuthUser, photoId: number): Promise<{ mime: string; data: Buffer }> {
  const photo = await ownedPhoto(user, photoId);
  const [row] = await getDb()
    .select({ mime: schema.productPhotos.mime, data: schema.productPhotos.data })
    .from(schema.productPhotos)
    .where(eq(schema.productPhotos.id, photo.id));
  if (!row) throw new HttpError(404, NOT_FOUND);
  return { mime: row.mime, data: Buffer.from(row.data) };
}

/** Cambia el papel de una foto, si el producto es visible para `user`. */
export async function setPhotoRole(user: AuthUser, photoId: number, role: PhotoRole): Promise<PhotoInfo> {
  const photo = await ownedPhoto(user, photoId);
  checkRole(role);
  const [row] = await getDb()
    .update(schema.productPhotos)
    .set({ role })
    .where(eq(schema.productPhotos.id, photo.id))
    .returning(INFO_COLUMNS);
  if (!row) throw new HttpError(404, NOT_FOUND);
  return toInfo(row);
}

/** Borra una foto, si el producto es visible para `user`. */
export async function deleteProductPhoto(user: AuthUser, photoId: number): Promise<void> {
  const photo = await ownedPhoto(user, photoId);
  await getDb()
    .delete(schema.productPhotos)
    .where(and(eq(schema.productPhotos.id, photo.id), eq(schema.productPhotos.productId, photo.productId)));
}

/**
 * Portada de cada producto: su primera foto de artículo o, si no tiene, la primera de todas. Solo para los productos que `user` puede ver.
 * Los productos sin fotos, o que no son suyos, no aparecen en el resultado.
 */
export async function coverPhotoIds(user: AuthUser, productIds: number[]): Promise<Map<number, number>> {
  const visible = new Set((await listProductsFor(user)).map((p) => p.id));
  const ids = [...new Set(productIds)].filter((id) => visible.has(id));
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      productId: schema.productPhotos.productId,
      id: sql<number | null>`coalesce(min(${schema.productPhotos.id}) filter (where ${schema.productPhotos.role} = 'articulo'), min(${schema.productPhotos.id}))`,
    })
    .from(schema.productPhotos)
    .where(inArray(schema.productPhotos.productId, ids))
    .groupBy(schema.productPhotos.productId);
  return new Map(rows.flatMap((r) => (r.id === null ? [] : [[r.productId, r.id] as const])));
}
