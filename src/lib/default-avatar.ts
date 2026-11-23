/**
 * El avatar con el que empieza un vídeo nuevo, a partir del avatar habitual del producto. Lo usan
 * el servidor (al crear el vídeo) y el lote nuevo (para enseñar cada fila antes de crearla).
 *
 * - `sin_sustitucion` o `nadie`: ese modo, sin foto.
 * - `elegido`: la foto habitual si sigue siendo una foto de avatar del producto; si no, la primera
 *   foto de avatar. Si el producto no tiene ninguna: en una tarjeta del lote, «Automático» (el
 *   desglose elige de la biblioteca alguien parecido a la persona de la referencia;
 *   `withoutAvatars = "automatico"`); en un vídeo suelto, `elegido` sin foto, para que la persona
 *   elija (`withoutAvatars = "elegir"`).
 */

export type DefaultAvatarMode = "elegido" | "automatico" | "sin_sustitucion" | "nadie";

export function startingAvatar(
  product: { defaultAvatarMode: string; defaultAvatarPhotoId: number | null },
  avatarPhotoIds: number[],
  withoutAvatars: "automatico" | "elegir" = "automatico",
): { avatarMode: DefaultAvatarMode; avatarPhotoId: number | null } {
  if (product.defaultAvatarMode === "sin_sustitucion" || product.defaultAvatarMode === "nadie") {
    return { avatarMode: product.defaultAvatarMode, avatarPhotoId: null };
  }
  const chosen = product.defaultAvatarPhotoId !== null && avatarPhotoIds.includes(product.defaultAvatarPhotoId) ? product.defaultAvatarPhotoId : null;
  const photo = chosen ?? avatarPhotoIds[0] ?? null;
  if (photo !== null) return { avatarMode: "elegido", avatarPhotoId: photo };
  return { avatarMode: withoutAvatars === "automatico" ? "automatico" : "elegido", avatarPhotoId: null };
}

/**
 * El avatar con el que empieza una tarjeta de «Nuevo lote» (regla del dueño, 24/11/2026, como Codex:
 * `avatar_selection_mode = reference_match`): «Automático», que elige de la biblioteca a alguien
 * parecido a la persona de la referencia. Solo si el producto dice que no se sustituye a nadie
 * («Sin sustitución» o «No aparece nadie»), ese modo. Un avatar concreto, solo si él lo elige.
 */
export function batchCardAvatar(product: { defaultAvatarMode: string }): "automatico" | "sin_sustitucion" | "nadie" {
  if (product.defaultAvatarMode === "sin_sustitucion" || product.defaultAvatarMode === "nadie") return product.defaultAvatarMode;
  return "automatico";
}
