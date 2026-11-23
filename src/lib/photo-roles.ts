/** Para qué sirve cada foto: el artículo, su embalaje, la persona de los vídeos, el sitio o estilo, u otra. */
/** `funcionamiento`: el producto funcionando o su efecto (p. ej. la proyección de un collar); va con el artículo en la imagen. */
export const PHOTO_ROLES = ["articulo", "embalaje", "avatar", "entorno", "funcionamiento", "otro"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

export function isPhotoRole(value: unknown): value is PhotoRole {
  return typeof value === "string" && (PHOTO_ROLES as readonly string[]).includes(value);
}
