/** Para qué sirve cada foto: el artículo, su embalaje, la persona de los vídeos, el sitio o estilo, u otra. */
export const PHOTO_ROLES = ["articulo", "embalaje", "avatar", "entorno", "otro"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

export function isPhotoRole(value: unknown): value is PhotoRole {
  return typeof value === "string" && (PHOTO_ROLES as readonly string[]).includes(value);
}
