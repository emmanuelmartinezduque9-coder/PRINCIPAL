import type { SongJson } from "@/components/songs/labels";
import { DEFAULT_HOOK_SECONDS as DEFAULT_HOOK, MAX_HOOK_SECONDS, MIN_HOOK_SECONDS } from "@/components/videos/brief-labels";
import type { VideoKind } from "@/server/videos/brief";

/**
 * Borrador de «Nuevo lote». Vive en memoria en el diseño de la aplicación (con los archivos
 * soltados) y, sin los archivos, en `localStorage`: tras recargar, las tarjetas de archivo piden
 * que se vuelva a arrastrar el mismo archivo. Aquí solo la lógica pura (probada en
 * `tests/batch-draft.test.ts`).
 */

const KINDS: readonly string[] = ["replicar", "adaptacion_concepto", "solo_gancho"];

/** Como `AvatarChoice`: id de foto, `bib-<id>` (biblioteca), «automatico», «nadie» o «sin_sustitucion». */
export type DraftAvatar = number | "nadie" | "sin_sustitucion" | "automatico" | `bib-${number}`;

/**
 * De dónde sale la referencia: un archivo soltado, un enlace que trae el Mac, o un archivo que se
 * soltó antes de recargar y hay que volver a arrastrar (`missing`, con su nombre y tamaño).
 */
export type Source =
  | { type: "file"; file: File; preview: string }
  | { type: "link"; url: string }
  | { type: "missing"; name: string; size: number };

export interface Row {
  key: string;
  source: Source;
  /** `null`: el avatar habitual del producto. */
  avatar: DraftAvatar | null;
  /** La variante del producto; `null`: las fotos de siempre. */
  variant: number | null;
  kind: VideoKind;
  /** «Qué adaptación quieres» (solo con adaptación). */
  adaptation: string;
  /** Duración del gancho y cuerpos que van detrás, en orden (solo con «Solo gancho»). */
  hookSeconds: number;
  bodies: number[];
  /** «Cambios específicos». */
  note: string;
  /** «Edición de referencia»: un vídeo cuyo estilo de edición se copia (vacío: ninguno). */
  editReference: string;
  /** «Música»: una canción de la biblioteca o `null` (audio original). */
  song: SongJson | null;
  /** «Más opciones» abierto. */
  open: boolean;
  error: string | null;
}

/** Un producto del lote con sus «Indicaciones» y sus vídeos. */
export interface Group {
  key: string;
  productId: number | null;
  notes: string;
  /** «Tipo» del grupo: el que reciben las tarjetas nuevas (cada una lo puede cambiar después). */
  kind: VideoKind;
  /** Con «Solo gancho», la duración que reciben las tarjetas nuevas. */
  hookSeconds: number;
  /** La variante que reciben las tarjetas nuevas (`null`: las fotos de siempre). */
  variant: number | null;
  rows: Row[];
}

export interface Draft {
  name: string;
  autoAnalyze: boolean;
  groups: Group[];
  /** El lote ya creado si «Crear y subir» se quedó a medias (se sigue con «Añadir y subir»). */
  batchId: number | null;
}

export const DRAFT_STORAGE_KEY = "principal:borrador-lote";

let counter = 0;
/** Claves únicas también frente a las que vuelven de `localStorage`. */
export const nextKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

export const newGroup = (productId: number | null = null): Group => ({
  key: nextKey("grupo"),
  productId,
  notes: "",
  kind: "replicar",
  hookSeconds: DEFAULT_HOOK,
  variant: null,
  rows: [],
});

export const emptyDraft = (): Draft => ({ name: "", autoAnalyze: true, groups: [newGroup()], batchId: null });

/** Hay algo que perder: nombre, un producto elegido, indicaciones o alguna tarjeta. */
export function hasContent(draft: Draft): boolean {
  return (
    draft.name.trim() !== "" ||
    draft.batchId !== null ||
    draft.groups.some((group) => group.productId !== null || group.notes.trim() !== "" || group.rows.length > 0)
  );
}

/** Lo que va a `localStorage`: todo menos los archivos (quedan su nombre y tamaño) y los errores. */
export function serializeDraft(draft: Draft): unknown {
  return {
    v: 1,
    name: draft.name,
    autoAnalyze: draft.autoAnalyze,
    batchId: draft.batchId,
    groups: draft.groups.map((group) => ({
      ...group,
      rows: group.rows.map((row) => ({
        ...row,
        error: null,
        source:
          row.source.type === "file"
            ? { type: "missing", name: row.source.file.name, size: row.source.file.size }
            : row.source,
      })),
    })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const kindOf = (value: unknown): VideoKind => (KINDS.includes(value as string) ? (value as VideoKind) : "replicar");
const hookOf = (value: unknown) => (Number.isInteger(value) && (value as number) >= MIN_HOOK_SECONDS && (value as number) <= MAX_HOOK_SECONDS ? (value as number) : DEFAULT_HOOK);

function parseSource(value: unknown): Source | null {
  if (!isRecord(value)) return null;
  if (value.type === "link" && typeof value.url === "string" && value.url) return { type: "link", url: value.url };
  if (value.type === "missing" && typeof value.name === "string" && Number.isSafeInteger(value.size)) {
    return { type: "missing", name: value.name, size: value.size as number };
  }
  return null;
}

function parseAvatar(value: unknown): DraftAvatar | null {
  if (value === "nadie" || value === "sin_sustitucion" || value === "automatico" || isId(value)) return value;
  if (typeof value === "string" && /^bib-[1-9]\d{0,15}$/.test(value)) return value as `bib-${number}`;
  return null;
}

function parseSong(value: unknown): SongJson | null {
  return isRecord(value) && isId(value.id) && typeof value.title === "string" ? (value as unknown as SongJson) : null;
}

function parseRow(value: unknown): Row | null {
  if (!isRecord(value)) return null;
  const source = parseSource(value.source);
  if (!source) return null;
  return {
    key: typeof value.key === "string" && value.key ? value.key : nextKey("fila"),
    source,
    avatar: parseAvatar(value.avatar),
    variant: isId(value.variant) ? value.variant : null,
    kind: kindOf(value.kind),
    adaptation: text(value.adaptation),
    hookSeconds: hookOf(value.hookSeconds),
    bodies: Array.isArray(value.bodies) ? value.bodies.filter(isId) : [],
    note: text(value.note),
    editReference: text(value.editReference).slice(0, 2000),
    song: parseSong(value.song),
    open: value.open === true,
    error: null,
  };
}

function parseGroup(value: unknown): Group | null {
  if (!isRecord(value)) return null;
  return {
    key: typeof value.key === "string" && value.key ? value.key : nextKey("grupo"),
    productId: isId(value.productId) ? value.productId : null,
    notes: text(value.notes),
    kind: kindOf(value.kind),
    hookSeconds: hookOf(value.hookSeconds),
    variant: isId(value.variant) ? value.variant : null,
    rows: Array.isArray(value.rows) ? value.rows.map(parseRow).filter((row): row is Row => row !== null) : [],
  };
}

/** Lee lo guardado por `serializeDraft`. Lo que no vale se descarta; sin nada útil, `null`. */
export function parseDraft(value: unknown): Draft | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const groups = Array.isArray(value.groups) ? value.groups.map(parseGroup).filter((group): group is Group => group !== null) : [];
  const draft: Draft = {
    name: text(value.name).slice(0, 100),
    autoAnalyze: value.autoAnalyze !== false,
    groups: groups.length > 0 ? groups : [newGroup()],
    batchId: isId(value.batchId) ? value.batchId : null,
  };
  return hasContent(draft) ? draft : null;
}
