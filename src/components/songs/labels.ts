import type { Serialized } from "@/lib/api";
import type { SongInfo, SongSummary } from "@/server/songs";

export type SongJson = Serialized<SongInfo>;
export type SongSummaryJson = Serialized<SongSummary>;

export const SONGS_KEY = ["songs"] as const;
export const audioUrl = (songId: number) => `/api/canciones/${songId}/audio`;

/** «1:05.3»: minutos, segundos y la décima (el drop se marca a ojo, pero con precisión). */
export function formatTime(ms: number, tenths = true): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const shown = tenths ? seconds.toFixed(1).padStart(4, "0") : String(Math.floor(seconds)).padStart(2, "0");
  return `${minutes}:${shown}`;
}

/** Nombre corto de una canción: «12 · Título» o solo el título. */
export const songLabel = (song: { number: number | null; title: string }) => (song.number === null ? song.title : `${song.number} · ${song.title}`);

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Busca por número exacto (o «#12») o por palabras del título y las secciones, sin tildes ni mayúsculas. */
export function searchSongs<T extends { number: number | null; title: string; sections?: string[] }>(songs: T[], query: string): T[] {
  const q = fold(query.trim().replace(/^#/, ""));
  if (!q) return songs;
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const exact = songs.filter((song) => song.number === n);
    const rest = songs.filter((song) => song.number !== n && fold(song.title).includes(q));
    return [...exact, ...rest];
  }
  const words = q.split(/\s+/);
  return songs.filter((song) => {
    const text = fold([song.title, ...(song.sections ?? [])].join(" "));
    return words.every((word) => text.includes(word));
  });
}

/** Lo que no es una sección de verdad: la carpeta que tenían todas en la biblioteca antigua. */
export const CATCH_ALL_SECTION = "Todas las canciones";
export const NO_SECTION = "Sin sección";

/** Las canciones por sección (la primera que tengan), por orden alfabético; las que no tienen, al final. */
export function groupSongs<T extends { sections: string[] }>(songs: T[]): Array<{ section: string; songs: T[] }> {
  const groups = new Map<string, T[]>();
  for (const song of songs) {
    const section = song.sections.find((s) => s !== CATCH_ALL_SECTION) ?? NO_SECTION;
    groups.set(section, [...(groups.get(section) ?? []), song]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_SECTION ? 1 : b === NO_SECTION ? -1 : a.localeCompare(b, "es")))
    .map(([section, list]) => ({ section, songs: list }));
}

/** Una canción tal como viene en `canciones.json` (solo lo que usa la importación). */
export interface PackageSong {
  id?: string;
  title?: string;
  numbers?: number[];
  sections?: string[];
  suggestedStartS?: number | null;
  dropSeconds?: number | null;
  file?: string | null;
}

export interface ImportItem {
  key: string;
  label: string;
  file: File;
  fields: Record<string, string | string[]>;
}

export interface ImportPlan {
  items: ImportItem[];
  /** Canciones del paquete sin archivo en la carpeta elegida. */
  missing: string[];
}

/** Ruta relativa a la carpeta elegida (`webkitRelativePath`; en pruebas, el nombre). */
const relativePath = (file: File) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

/** Encuentra `canciones.json` entre los archivos de la carpeta (el menos profundo, si hay varios). */
export function findManifest(files: File[]): File | null {
  const candidates = files.filter((file) => file.name === "canciones.json");
  candidates.sort((a, b) => relativePath(a).split("/").length - relativePath(b).split("/").length);
  return candidates[0] ?? null;
}

const toMs = (seconds: number | null | undefined) =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? String(Math.round(seconds * 1000)) : null;

/**
 * Empareja cada canción del paquete con su archivo por la ruta relativa (`file`, relativa a la
 * carpeta de `canciones.json`) y prepara sus datos: título, número, secciones, drop e inicio en ms.
 */
export function planImport(files: File[], manifest: File, data: { songs?: PackageSong[] }): ImportPlan {
  const manifestPath = relativePath(manifest);
  const root = manifestPath.slice(0, manifestPath.length - manifest.name.length);
  const byPath = new Map<string, File>();
  for (const file of files) {
    const path = relativePath(file);
    if (path.startsWith(root)) byPath.set(path.slice(root.length), file);
  }
  const items: ImportItem[] = [];
  const missing: string[] = [];
  for (const [index, song] of (data.songs ?? []).entries()) {
    const title = (song.title ?? "").trim() || song.id || `Canción ${index + 1}`;
    const number = song.numbers?.find((n) => Number.isSafeInteger(n) && n > 0) ?? null;
    const label = number === null ? title : `${number} · ${title}`;
    const file = song.file ? byPath.get(song.file.replace(/^\.?\//, "")) : undefined;
    if (!file) {
      missing.push(label);
      continue;
    }
    const fields: Record<string, string | string[]> = {
      titulo: title.slice(0, 200),
      secciones: (song.sections ?? []).filter((section) => section !== CATCH_ALL_SECTION),
    };
    if (number !== null) fields.numero = String(number);
    const drop = toMs(song.dropSeconds);
    if (drop !== null) fields.drop = drop;
    const start = toMs(song.suggestedStartS);
    if (start !== null) fields.inicio = start;
    items.push({ key: song.id ?? `${index}`, label, file, fields });
  }
  return { items, missing };
}

/** El formulario de una subida (`archivo` y los datos). */
export function importForm(item: ImportItem): FormData {
  const form = new FormData();
  form.append("archivo", item.file);
  for (const [name, value] of Object.entries(item.fields)) for (const v of [value].flat()) form.append(name, v);
  // Sin secciones también se manda (vacía), para que una reimportación las deje como en el paquete.
  if (Array.isArray(item.fields.secciones) && item.fields.secciones.length === 0) form.append("secciones", "");
  return form;
}
