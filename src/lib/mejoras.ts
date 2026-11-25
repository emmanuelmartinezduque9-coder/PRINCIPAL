/**
 * Lo que comparten el servidor y la pantalla de «Mejoras»: tipos de problema, dónde se ve un
 * problema y en qué estado está su recorrido. Ver `docs/decisiones-mejoras.md`.
 */

/**
 * Tipos de problema. Los de imagen y clip son la lista de comprobación que repetía el revisor de Codex
 * (producto, rótulos y marcas de agua, fondo, encuadre, manos, identidad y piel) más audio, montaje y
 * los bloqueos de Higgsfield.
 */
export const PROBLEM_TYPES = {
  audio: "Audio (sin sonido, voz, música)",
  producto: "Producto mal sustituido o deformado",
  avatar: "Persona / avatar (identidad, piel)",
  manos: "Manos y dedos",
  fondo: "Fondo o escenario",
  luz: "Luz o color",
  rotulos: "Rótulos o textos",
  movimiento: "Movimiento o acción del clip",
  encuadre: "Encuadre o composición",
  montaje: "Montaje (cortes, ritmo, duración)",
  bloqueo_higgsfield: "Bloqueo de Higgsfield",
  pantalla: "Pantalla de la web",
  otro: "Otro",
} as const;

export type ProblemType = keyof typeof PROBLEM_TYPES;
export const PROBLEM_TYPE_KEYS = Object.keys(PROBLEM_TYPES) as ProblemType[];

export function isProblemType(value: unknown): value is ProblemType {
  return typeof value === "string" && value in PROBLEM_TYPES;
}

/** Dónde vio la persona el problema. */
export const REPORT_STAGES = {
  imagen: "Imagen",
  clip: "Clip",
  montaje: "Montaje",
  lote: "Lote",
  desglose: "Desglose",
  pantalla: "Pantalla",
} as const;

export type ReportStage = keyof typeof REPORT_STAGES;

export function isReportStage(value: unknown): value is ReportStage {
  return typeof value === "string" && value in REPORT_STAGES;
}

/**
 * Recorrido de un reporte: recibido → causa (clasificado) → cambio aplicado → comprobado. `no_mejora`:
 * el cambio se aplicó y los números no mejoran (no cuenta como aprendido). `sin_arreglo`: no había
 * nada que cambiar (uso de la web, ya resuelto…).
 */
export const REPORT_STATUSES = {
  recibido: "Recibido",
  clasificado: "Causa encontrada",
  aplicado: "Cambio aplicado",
  comprobado: "Comprobado: mejora",
  no_mejora: "Aplicado, sin mejora",
  sin_arreglo: "Sin cambio necesario",
} as const;

export type ReportStatus = keyof typeof REPORT_STATUSES;

/** Qué hace falta para arreglarlo: una regla o prompt del motor, un arreglo de código, o nada. */
export const FIX_KINDS = { regla: "Regla o prompt", codigo: "Arreglo de código", uso: "Sin cambio" } as const;
export type FixKind = keyof typeof FIX_KINDS;

/** Máximo del texto de un reporte y de una captura. */
export const MAX_REPORT_CHARS = 4_000;
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Regla fija del dueño (25/11/2026): en marketing orgánico se permite nombrar y mostrar marcas, tiendas, películas y
 * personajes de terceros; nunca se quitan. Ninguna corrección o preferencia aprendida puede prohibirlos o mandar
 * quitarlos: si el texto lo hace, no se crea ni se aplica.
 */
const THIRD_PARTY = "marcas?|logos?|brands?|logotipos?|personajes?|characters?|pel[ií]culas?|films?|movies?|franquicias?|franchises?|trademarks?|harry potter";
const FORBID = "ning[uú]n[ao]?|nunca|sin|quita\\w*|elimina\\w*|retira\\w*|evita\\w*|borra\\w*|sustit[uú]\\w*|reemplaz\\w*|prohib\\w*|never|no|without|remove\\w*|avoid\\w*|replace\\w*|delete\\w*|drop\\w*";
const PROHIBITS = new RegExp(`\\b(${FORBID})\\b[^.]{0,60}\\b(${THIRD_PARTY})\\b`, "i");
export function prohibitsThirdParty(text: string | null | undefined): boolean {
  return typeof text === "string" && PROHIBITS.test(text);
}
