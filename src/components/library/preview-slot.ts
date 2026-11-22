/**
 * Un solo vídeo de vista previa a la vez en toda la pantalla: quien empieza a previsualizar se
 * queda con el turno y apaga al que lo tenía (el ratón sobre una miniatura y el foco del teclado
 * en otra no reproducen dos vídeos).
 */
let current: (() => void) | null = null;

/**
 * Toma el turno para `stop` (la función que apaga esa vista previa) y apaga la anterior, si era
 * otra. Devuelve cómo soltar el turno (no hace nada si ya lo tiene otra).
 */
export function claimPreview(stop: () => void): () => void {
  if (current !== null && current !== stop) current();
  current = stop;
  return () => {
    if (current === stop) current = null;
  };
}
