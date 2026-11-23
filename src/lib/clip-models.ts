/**
 * Cómo se genera la réplica en Higgsfield (regla 6 del motor). Copiado del motor de Codex
 * (`EDITOR/genjutsu.py`, `genjutsu_defaults.py`, `reference_hook_policy.py` y el panel
 * `local-lotes.js`, paquete activo `test-hook-selection-20261102`):
 *
 * - IDs reales del proveedor, los mismos que enviaba Codex (comprobados en el catálogo de
 *   Higgsfield el 23/11/2026: `hf_mult_motion_control`, `hf_mult_replace_object`, `wan3_0_prime`).
 * - Solo las opciones que Emmanuel usó de verdad en sus últimos lotes (pedidos 46, 54, 81… del
 *   7 al 21/11/2026): Motion Transfer (casi todos), Object Swap y Wan 3.0 Prime, más Seedance (los
 *   clips de imagen inicial). Genjutsu Lite (último uso 25/10) y Wan 3.0 sin Prime (último uso
 *   11/10) no se ponen.
 * - Por defecto, Genjutsu Motion Transfer (regla fija de Emmanuel, 24/11/2026; era el
 *   `DEFAULT_NEW_MODEL` de Codex, orden del 29/10/2026), salvo que el tramo no llegue a lo que
 *   admite Genjutsu (3 s): entonces Seedance. Ya no hay «Automático» en los selectores.
 *
 * Sin dependencias de servidor: lo usan también las pantallas.
 */

export const SEEDANCE = "seedance_2_5";
export const MOTION_TRANSFER = "hf_mult_motion_control";
export const OBJECT_SWAP = "hf_mult_replace_object";
export const WAN_PRIME = "wan3_0_prime";

/** Un modelo real del proveedor. */
export const CLIP_MODELS = [SEEDANCE, MOTION_TRANSFER, OBJECT_SWAP, WAN_PRIME] as const;
export type ClipModel = (typeof CLIP_MODELS)[number];

/**
 * Valores guardados: un modelo o `auto` (vídeos de antes del 24/11/2026; resuelve igual que Motion
 * Transfer). En los selectores solo salen los modelos (`CLIP_MODEL_OPTIONS`).
 */
export const CLIP_MODEL_CHOICES = ["auto", MOTION_TRANSFER, OBJECT_SWAP, WAN_PRIME, SEEDANCE] as const;
export type ClipModelChoice = (typeof CLIP_MODEL_CHOICES)[number];

/** Lo que se elige en la tarjeta y en el grupo (orden de Emmanuel, 24/11/2026: sin «Automático»). */
export const CLIP_MODEL_OPTIONS = [MOTION_TRANSFER, OBJECT_SWAP, WAN_PRIME, SEEDANCE] as const;

/**
 * Regla fija de Emmanuel (24/11/2026): por defecto la réplica se hace con Genjutsu Motion Transfer;
 * si él elige otro modelo en la tarjeta o en el grupo, se usa ese.
 */
export const DEFAULT_CLIP_MODEL_CHOICE: ClipModelChoice = MOTION_TRANSFER;

/** Lo que resolvía Codex sin selección expresa (`DEFAULT_NEW_MODEL`). */
export const AUTO_DEFAULT_MODEL: ClipModel = MOTION_TRANSFER;

export const isClipModel = (value: unknown): value is ClipModel => CLIP_MODELS.includes(value as ClipModel);
export const isClipModelChoice = (value: unknown): value is ClipModelChoice => CLIP_MODEL_CHOICES.includes(value as ClipModelChoice);

/** Etiquetas del selector, como en el panel de Codex. */
export const CLIP_MODEL_LABEL: Record<ClipModelChoice, string> = {
  auto: "Genjutsu · Motion Transfer",
  [MOTION_TRANSFER]: "Genjutsu · Motion Transfer",
  [OBJECT_SWAP]: "Genjutsu · Object Swap",
  [WAN_PRIME]: "Wan 3.0 Prime",
  [SEEDANCE]: "Seedance",
};

/** Una línea bajo el selector (textos del panel de Codex). */
export const CLIP_MODEL_HINT: Record<ClipModelChoice, string> = {
  auto: "Recrea la escena usando el movimiento del original (Seedance si el tramo dura menos de 3 s).",
  [MOTION_TRANSFER]: "Por defecto. Recrea la escena usando el movimiento del original (Seedance si el tramo dura menos de 3 s).",
  [OBJECT_SWAP]: "Adapta producto, avatar y entorno sobre el vídeo original.",
  [WAN_PRIME]: "Wan 3.0 Prime usa el vídeo original y la imagen aprobada como referencias, con audio propio.",
  [SEEDANCE]: "Genera el clip desde la imagen aprobada, sin audio.",
};

/** ¿Es un modelo Genjutsu (edita el vídeo original y conserva su audio)? */
export const isGenjutsu = (model: ClipModel) => model === MOTION_TRANSFER || model === OBJECT_SWAP;

/**
 * Duración del vídeo fuente que admite cada modelo, en segundos (Codex: `source_duration_limits`
 * y `parametros`). Seedance y Wan van de 4 a 30 s; Motion Transfer de 3 a 30; Object Swap, de 4 a 30
 * (catálogo de Higgsfield).
 */
export const SOURCE_LIMITS: Record<ClipModel, { min: number; max: number }> = {
  [SEEDANCE]: { min: 0, max: 30 },
  [MOTION_TRANSFER]: { min: 3, max: 30 },
  [OBJECT_SWAP]: { min: 4, max: 30 },
  [WAN_PRIME]: { min: 4, max: 30 },
};

/**
 * El modelo con el que se genera de verdad: el elegido (Motion Transfer por defecto). `null` o
 * `undefined` es un vídeo o un desglose de antes de poder elegir (siempre Seedance): no se
 * reinterpreta lo ya hecho.
 */
export function resolveClipModel(choice: string | null | undefined, segmentDurationMs: number | null | undefined): ClipModel {
  if (choice === null || choice === undefined) return SEEDANCE;
  // Motion Transfer (el de por defecto, o `auto` de antes): si el tramo no llega a lo que admite
  // Genjutsu (3 s), Seedance, como siempre.
  if (choice === "auto" || choice === MOTION_TRANSFER) {
    if (segmentDurationMs !== null && segmentDurationMs !== undefined && segmentDurationMs < SOURCE_LIMITS[MOTION_TRANSFER].min * 1000) return SEEDANCE;
    return MOTION_TRANSFER;
  }
  if (isClipModel(choice)) return choice;
  return AUTO_DEFAULT_MODEL;
}

/** Segundos que se piden a Wan 3.0 Prime: el tramo entero redondeado hacia arriba (Codex: 12,4 s → 13). */
export function wanDurationSeconds(segmentDurationMs: number): number {
  return Math.min(SOURCE_LIMITS[WAN_PRIME].max, Math.ceil(Math.round(segmentDurationMs) / 1000));
}

/** Por qué el tramo no sirve para el modelo elegido (una pregunta para el dueño), o `null`. */
export function sourceProblem(model: ClipModel, segmentDurationMs: number): string | null {
  const { min, max } = SOURCE_LIMITS[model];
  const seconds = segmentDurationMs / 1000;
  if (seconds + 1e-9 >= min && seconds <= max + 0.5) return null;
  const shown = (Math.round(seconds * 10) / 10).toString().replace(".", ",");
  return `${CLIP_MODEL_LABEL[model]} necesita una referencia de ${min} a ${max} s y este tramo dura ${shown} s. ¿Lo hago con otro modelo?`;
}
