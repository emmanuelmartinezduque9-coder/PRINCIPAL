/**
 * El avatar con el que empieza un vídeo nuevo, a partir del avatar habitual del producto. Lo usan
 * el servidor (al crear el vídeo) y el lote nuevo (para enseñar cada fila antes de crearla).
 *
 * - `sin_sustitucion` o `nadie`: ese modo, sin foto.
 * - `elegido`: la foto habitual si sigue siendo una foto de avatar del producto; si no, la primera
 *   foto de avatar; y si el producto no tiene ninguna, «nadie» (como en Lotes v1).
 */

export type DefaultAvatarMode = "elegido" | "sin_sustitucion" | "nadie";

export function startingAvatar(
  product: { defaultAvatarMode: string; defaultAvatarPhotoId: number | null },
  avatarPhotoIds: number[],
): { avatarMode: DefaultAvatarMode; avatarPhotoId: number | null } {
  if (product.defaultAvatarMode === "sin_sustitucion" || product.defaultAvatarMode === "nadie") {
    return { avatarMode: product.defaultAvatarMode, avatarPhotoId: null };
  }
  const chosen = product.defaultAvatarPhotoId !== null && avatarPhotoIds.includes(product.defaultAvatarPhotoId) ? product.defaultAvatarPhotoId : null;
  const photo = chosen ?? avatarPhotoIds[0] ?? null;
  return photo === null ? { avatarMode: "nadie", avatarPhotoId: null } : { avatarMode: "elegido", avatarPhotoId: photo };
}
