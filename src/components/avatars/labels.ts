import type { Serialized } from "@/lib/api";
import { fold, type AvatarGroup } from "@/lib/avatar-groups";
import type { AvatarInfo } from "@/server/avatars";

export type AvatarJson = Serialized<AvatarInfo>;

export const AVATARS_KEY = ["avatars"] as const;
export const avatarImageUrl = (avatarId: number) => `/api/avatares/${avatarId}/imagen`;

export const GROUP_LABELS: Record<AvatarGroup, string> = {
  mujer: "Mujer",
  hombre: "Hombre",
  nina: "Niña",
  nino: "Niño",
  otro: "Otro",
};

/**
 * Edad por defecto a partir de la descripción, solo cuando es evidente («barba canosa» → 55,
 * «abuela» → 70); si no, `null` y la pone el dueño en la cuadrícula.
 */
export function inferAge(description: string | null | undefined): number | null {
  if (!description) return null;
  const text = fold(description);
  if (/\b(abuel[ao]s?|ancian[ao]s?|jubilad[ao]s?)\b/.test(text)) return 70;
  if (/\bcanos[ao]s?\b/.test(text)) return 55;
  if (/\badolescente\b/.test(text)) return 15;
  if (/\b(nin[ao]s?|bebe)\b/.test(text)) return 8;
  return null;
}

/** Un avatar tal como viene en `avatares.json` (solo lo que usa la importación). */
export interface PackageAvatar {
  id?: string;
  group?: string;
  number?: number;
  selector?: string;
  description?: string | null;
  higgsfieldMediaId?: string | null;
  file?: string | null;
}

export interface AvatarImportItem {
  key: string;
  label: string;
  file: File;
  fields: Record<string, string>;
}

export interface AvatarImportPlan {
  items: AvatarImportItem[];
  /** Avatares del paquete sin archivo en la carpeta elegida. */
  missing: string[];
}

const relativePath = (file: File) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

/** `avatares.json` entre los archivos de la carpeta (el menos profundo, si hay varios). */
export function findAvatarManifest(files: File[]): File | null {
  const candidates = files.filter((file) => file.name === "avatares.json");
  candidates.sort((a, b) => relativePath(a).split("/").length - relativePath(b).split("/").length);
  return candidates[0] ?? null;
}

/** Una descripción que en realidad es un nombre de archivo no se importa. */
const looksLikeFile = (text: string) => /\.(jpe?g|png|webp|heic)\b/i.test(text);

/**
 * Empareja cada avatar del paquete con su archivo (`file`, relativo a la carpeta de
 * `avatares.json`) y prepara el formulario de `POST /api/avatares`: `nombre` (el selector),
 * `grupo`, `numero`, `descripcion`, `higgsfield` y `edad` si la descripción la deja clara.
 */
export function planAvatarImport(files: File[], manifest: File, data: { items?: PackageAvatar[] }): AvatarImportPlan {
  const manifestPath = relativePath(manifest);
  const root = manifestPath.slice(0, manifestPath.length - manifest.name.length);
  const byPath = new Map<string, File>();
  for (const file of files) {
    const path = relativePath(file);
    if (path.startsWith(root)) byPath.set(path.slice(root.length), file);
  }
  const items: AvatarImportItem[] = [];
  const missing: string[] = [];
  for (const [index, entry] of (data.items ?? []).entries()) {
    const label = (entry.selector ?? "").trim() || entry.id || `Avatar ${index + 1}`;
    const file = entry.file ? byPath.get(entry.file.replace(/^\.?\//, "")) : undefined;
    if (!file) {
      missing.push(label);
      continue;
    }
    const fields: Record<string, string> = { nombre: label.slice(0, 60), grupo: entry.group ?? "otro" };
    if (Number.isSafeInteger(entry.number) && (entry.number as number) > 0) fields.numero = String(entry.number);
    const description = (entry.description ?? "").trim();
    if (description && !looksLikeFile(description)) fields.descripcion = description.slice(0, 500);
    const age = inferAge(description);
    if (age !== null) fields.edad = String(age);
    if (entry.higgsfieldMediaId) fields.higgsfield = entry.higgsfieldMediaId;
    items.push({ key: entry.id ?? String(index), label, file, fields });
  }
  return { items, missing };
}

/** El formulario de una subida (`archivo` y los datos). */
export function avatarForm(item: AvatarImportItem): FormData {
  const form = new FormData();
  form.append("archivo", item.file);
  for (const [name, value] of Object.entries(item.fields)) form.append(name, value);
  return form;
}

/** «mujer 7 · 33» para listas cortas. */
export const avatarShortLabel = (avatar: { name: string; ageYears: number | null }) =>
  avatar.ageYears === null ? avatar.name : `${avatar.name} · ${avatar.ageYears}`;
