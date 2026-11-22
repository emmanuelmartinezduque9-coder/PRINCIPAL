import { HttpError } from "@/server/http";

/**
 * Las indicaciones de un vídeo que llegan al desglose de Claude: el tipo (replicar la referencia,
 * adaptar su concepto o hacer solo el gancho, con su duración), «Qué adaptación quieres», «Cambios específicos», las «Indicaciones» del
 * lote para su producto y quién sale (el avatar elegido, las personas de la referencia o nadie). Un desglose guarda las que usó: si cambian
 * después, ya no vale (`analysisStaleness`), igual que si cambia la referencia.
 */

export const VIDEO_KINDS = ["replicar", "adaptacion_concepto", "solo_gancho"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

export const AVATAR_MODES = ["elegido", "sin_sustitucion", "nadie"] as const;
export type AvatarMode = (typeof AVATAR_MODES)[number];

export const MAX_ADAPTATION = 12_000;
export const MAX_NOTE = 6_000;
export const MAX_PRODUCT_NOTES = 4_000;

/** «Duración del gancho» (segundos) de un vídeo «Solo gancho». */
export const MIN_HOOK_SECONDS = 2;
export const MAX_HOOK_SECONDS = 8;
export const DEFAULT_HOOK_SECONDS = 4;

export const isVideoKind = (value: unknown): value is VideoKind => VIDEO_KINDS.includes(value as VideoKind);
export const isAvatarMode = (value: unknown): value is AvatarMode => AVATAR_MODES.includes(value as AvatarMode);

const BAD_VALUE = "Valor no válido.";
/** Miles con punto, como se escriben en España (también los de cuatro cifras: 4.000). */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const ADAPTATION_TOO_LONG = `«Qué adaptación quieres» no puede tener más de ${thousands(MAX_ADAPTATION)} caracteres.`;
const ADAPTATION_ONLY = "«Qué adaptación quieres» solo va con «Adaptación de concepto».";
const NOTE_TOO_LONG = `«Cambios específicos» no puede tener más de ${thousands(MAX_NOTE)} caracteres.`;
const BAD_HOOK_SECONDS = `El gancho dura entre ${MIN_HOOK_SECONDS} y ${MAX_HOOK_SECONDS} segundos.`;
const PRODUCT_NOTES_TOO_LONG = `Las indicaciones no pueden tener más de ${thousands(MAX_PRODUCT_NOTES)} caracteres.`;

/** Lo que cuenta de un vídeo para su desglose. */
export interface BriefSource {
  kind: string;
  avatarMode: string;
  note: string | null;
  adaptation: string | null;
  /** Duración del gancho (en un vídeo siempre hay; en un desglose, solo si era «Solo gancho»). */
  hookSeconds: number | null;
  /** «Indicaciones para los vídeos de {producto}» del lote del vídeo. */
  productNotes: string | null;
}

/**
 * Lo que se manda a Claude y se guarda en el desglose. La adaptación solo con
 * `adaptacion_concepto`; la duración del gancho solo con `solo_gancho`.
 */
export interface Brief {
  kind: VideoKind;
  avatarMode: AvatarMode;
  note: string | null;
  adaptation: string | null;
  hookSeconds: number | null;
  productNotes: string | null;
}

export function briefOf(video: BriefSource): Brief {
  return {
    kind: video.kind as VideoKind,
    avatarMode: video.avatarMode as AvatarMode,
    note: video.note,
    adaptation: video.kind === "adaptacion_concepto" ? video.adaptation : null,
    hookSeconds: video.kind === "solo_gancho" ? video.hookSeconds : null,
    productNotes: video.productNotes,
  };
}

/**
 * Por qué un desglose ya no corresponde al vídeo: `reference` si cambió la referencia, `brief` si
 * cambiaron las indicaciones (tipo, adaptación, duración del gancho, cambios específicos o quién
 * sale); `null` si vale.
 */
export function analysisStaleness(
  analysis: BriefSource & { referenceMediaId: string | null },
  video: BriefSource & { referenceMediaId: string | null },
): "reference" | "brief" | null {
  if (analysis.referenceMediaId !== video.referenceMediaId) return "reference";
  const used = briefOf(analysis);
  const now = briefOf(video);
  const same =
    used.kind === now.kind &&
    used.avatarMode === now.avatarMode &&
    used.note === now.note &&
    used.adaptation === now.adaptation &&
    used.hookSeconds === now.hookSeconds &&
    used.productNotes === now.productNotes;
  return same ? null : "brief";
}

/** Texto de varias líneas sin espacios de sobra al principio ni al final; vacío es `null`. 400 si es largo o no es texto. */
function cleanText(value: unknown, max: number, tooLong: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new HttpError(400, BAD_VALUE);
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length > max) throw new HttpError(400, tooLong);
  return text || null;
}

/** «Cambios específicos» (varias líneas, hasta 6.000 caracteres). */
export const cleanNote = (value: unknown) => cleanText(value, MAX_NOTE, NOTE_TOO_LONG);

/** «Indicaciones para los vídeos de {producto}» (hasta 4.000 caracteres). */
export const cleanProductNotes = (value: unknown) => cleanText(value, MAX_PRODUCT_NOTES, PRODUCT_NOTES_TOO_LONG);

/**
 * Comprueba el tipo, la adaptación y la duración del gancho que se quieren guardar sobre `current`
 * (lo que ya tiene el vídeo; `replicar` sin adaptación al crearlo). Devuelve los cambios, o 400.
 * La duración del gancho es un entero de 2 a 8; se puede guardar con cualquier tipo (solo cuenta
 * con «Solo gancho»).
 */
export function checkKindInput(
  input: { kind?: unknown; adaptation?: unknown; hookSeconds?: unknown },
  current: { kind: string } = { kind: "replicar" },
): { kind?: VideoKind; adaptation?: string | null; hookSeconds?: number } {
  const changes: { kind?: VideoKind; adaptation?: string | null; hookSeconds?: number } = {};
  if (input.hookSeconds !== undefined) {
    const seconds = input.hookSeconds;
    if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < MIN_HOOK_SECONDS || seconds > MAX_HOOK_SECONDS) {
      throw new HttpError(400, BAD_HOOK_SECONDS);
    }
    changes.hookSeconds = seconds;
  }
  if (input.kind !== undefined) {
    if (!isVideoKind(input.kind)) throw new HttpError(400, BAD_VALUE);
    changes.kind = input.kind;
  }
  if (input.adaptation !== undefined) {
    if (input.adaptation !== null && typeof input.adaptation !== "string") throw new HttpError(400, BAD_VALUE);
    const adaptation = (input.adaptation ?? "").trim();
    if (adaptation.length > MAX_ADAPTATION) throw new HttpError(400, ADAPTATION_TOO_LONG);
    if (adaptation && (changes.kind ?? current.kind) !== "adaptacion_concepto") throw new HttpError(400, ADAPTATION_ONLY);
    changes.adaptation = adaptation || null;
  }
  return changes;
}
