/**
 * El avatar con el que empieza un vídeo nuevo, a partir del avatar habitual del producto. Lo usan
 * el servidor (al crear el vídeo) y el lote nuevo (para enseñar cada fila antes de crearla).
 *
 * - `sin_sustitucion` o `nadie`: ese modo, sin foto.
 * - `elegido`: la foto habitual si sigue siendo una foto de avatar del producto; si no, la primera
 *   foto de avatar. Si el producto no tiene ninguna: en una tarjeta del lote, «nadie» (como en
 *   Lotes v1, `withoutAvatars = "nadie"`); en un vídeo suelto, `elegido` sin foto, para que la
 *   persona elija (`withoutAvatars = "elegir"`).
 */

export type DefaultAvatarMode = "elegido" | "sin_sustitucion" | "nadie";

export function startingAvatar(
  product: { defaultAvatarMode: string; defaultAvatarPhotoId: number | null },
  avatarPhotoIds: number[],
  withoutAvatars: "nadie" | "elegir" = "nadie",
): { avatarMode: DefaultAvatarMode; avatarPhotoId: number | null } {
  if (product.defaultAvatarMode === "sin_sustitucion" || product.defaultAvatarMode === "nadie") {
    return { avatarMode: product.defaultAvatarMode, avatarPhotoId: null };
  }
  const chosen = product.defaultAvatarPhotoId !== null && avatarPhotoIds.includes(product.defaultAvatarPhotoId) ? product.defaultAvatarPhotoId : null;
  const photo = chosen ?? avatarPhotoIds[0] ?? null;
  if (photo !== null) return { avatarMode: "elegido", avatarPhotoId: photo };
  return { avatarMode: withoutAvatars === "nadie" ? "nadie" : "elegido", avatarPhotoId: null };
}
