import { HttpError } from "@/server/http";

/**
 * Las indicaciones de un vídeo que llegan al desglose de Claude: el tipo (replicar la referencia o
 * adaptar su concepto), «Qué adaptación quieres», «Cambios específicos» y quién sale (el avatar
 * elegido, las personas de la referencia o nadie). Un desglose guarda las que usó: si cambian
 * después, ya no vale (`analysisStaleness`), igual que si cambia la referencia.
 */

export const VIDEO_KINDS = ["replicar", "adaptacion_concepto"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

export const AVATAR_MODES = ["elegido", "sin_sustitucion", "nadie"] as const;
export type AvatarMode = (typeof AVATAR_MODES)[number];

export const MAX_ADAPTATION = 12_000;
export const MAX_NOTE = 300;

export const isVideoKind = (value: unknown): value is VideoKind => VIDEO_KINDS.includes(value as VideoKind);
export const isAvatarMode = (value: unknown): value is AvatarMode => AVATAR_MODES.includes(value as AvatarMode);

const BAD_VALUE = "Valor no válido.";
const ADAPTATION_TOO_LONG = `«Qué adaptación quieres» no puede tener más de ${MAX_ADAPTATION.toLocaleString("es-ES")} caracteres.`;
const ADAPTATION_ONLY = "«Qué adaptación quieres» solo va con «Adaptación de concepto».";
const NOTE_TOO_LONG = `«Cambios específicos» no puede tener más de ${MAX_NOTE} caracteres.`;

/** Lo que cuenta de un vídeo para su desglose. */
export interface BriefSource {
  kind: string;
  avatarMode: string;
  note: string | null;
  adaptation: string | null;
}

/** Lo que se manda a Claude y se guarda en el desglose. La adaptación solo con `adaptacion_concepto`. */
export interface Brief {
  kind: VideoKind;
  avatarMode: AvatarMode;
  note: string | null;
  adaptation: string | null;
}

export function briefOf(video: BriefSource): Brief {
  return {
    kind: video.kind as VideoKind,
    avatarMode: video.avatarMode as AvatarMode,
    note: video.note,
    adaptation: video.kind === "adaptacion_concepto" ? video.adaptation : null,
  };
}

/**
 * Por qué un desglose ya no corresponde al vídeo: `reference` si cambió la referencia, `brief` si
 * cambiaron las indicaciones (tipo, adaptación, cambios específicos o quién sale); `null` si vale.
 */
export function analysisStaleness(
  analysis: BriefSource & { referenceMediaId: string | null },
  video: BriefSource & { referenceMediaId: string | null },
): "reference" | "brief" | null {
  if (analysis.referenceMediaId !== video.referenceMediaId) return "reference";
  const used = briefOf(analysis);
  const now = briefOf(video);
  const same = used.kind === now.kind && used.avatarMode === now.avatarMode && used.note === now.note && used.adaptation === now.adaptation;
  return same ? null : "brief";
}

/** «Cambios específicos»: una línea, sin espacios de sobra; vacío es `null`. 400 si es largo o no es texto. */
export function cleanNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new HttpError(400, BAD_VALUE);
  const note = value.replace(/[\r\n]+/g, " ").trim();
  if (note.length > MAX_NOTE) throw new HttpError(400, NOTE_TOO_LONG);
  return note || null;
}

/**
 * Comprueba el tipo y la adaptación que se quieren guardar sobre `current` (lo que ya tiene el
 * vídeo; `replicar` sin adaptación al crearlo). Devuelve los cambios, o 400.
 */
export function checkKindInput(
  input: { kind?: unknown; adaptation?: unknown },
  current: { kind: string } = { kind: "replicar" },
): { kind?: VideoKind; adaptation?: string | null } {
  const changes: { kind?: VideoKind; adaptation?: string | null } = {};
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
