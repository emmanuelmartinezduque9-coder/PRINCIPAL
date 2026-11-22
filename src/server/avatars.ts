import { createHash } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { MAX_AVATAR_BYTES } from "@/db/schema";
import { AVATAR_GROUPS, isAvatarGroup, normalizeTag, type AvatarGroup } from "@/lib/avatar-groups";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { checkPhotoBytes } from "@/server/photos";

/**
 * Biblioteca global de avatares («Avatares»). La ve cualquier persona con sesión y cualquier vídeo
 * puede usar uno; solo el dueño sube o cambia (403 para los demás). No se borran: se retiran.
 * Solo este módulo toca la tabla `avatars`.
 */

export { AVATAR_GROUPS, isAvatarGroup, MAX_AVATAR_BYTES, type AvatarGroup };
export const MAX_AVATAR_NAME = 60;
export const MAX_AVATAR_DESCRIPTION = 500;
export const MAX_AVATAR_TAGS = 20;

const NOT_FOUND = "Avatar no encontrado.";
const OWNER_ONLY = "Solo el dueño puede cambiar los avatares.";

export interface AvatarInfo {
  id: number;
  name: string;
  group: AvatarGroup;
  number: number | null;
  ageYears: number | null;
  tags: string[];
  description: string | null;
  mime: string;
  size: number;
  sha256: string;
  higgsfieldMediaId: string | null;
  retired: boolean;
  createdAt: Date;
}

/** Lo que usan la elección automática y las vistas de los vídeos. */
export type AvatarSummary = Pick<AvatarInfo, "id" | "name" | "group" | "number" | "ageYears" | "tags" | "retired">;

const INFO = {
  id: schema.avatars.id,
  name: schema.avatars.name,
  group: schema.avatars.group,
  number: schema.avatars.number,
  ageYears: schema.avatars.ageYears,
  tags: schema.avatars.tags,
  description: schema.avatars.description,
  mime: schema.avatars.mime,
  size: schema.avatars.size,
  sha256: schema.avatars.sha256,
  higgsfieldMediaId: schema.avatars.higgsfieldMediaId,
  retired: schema.avatars.retired,
  createdAt: schema.avatars.createdAt,
};

const SUMMARY = {
  id: schema.avatars.id,
  name: schema.avatars.name,
  group: schema.avatars.group,
  number: schema.avatars.number,
  ageYears: schema.avatars.ageYears,
  tags: schema.avatars.tags,
  retired: schema.avatars.retired,
};

/** El grupo guardado lo garantiza la base de datos; aquí solo se estrecha el tipo. */
const typed = <T extends { group: string }>(row: T) => ({ ...row, group: row.group as AvatarGroup });

function requireOwner(user: AuthUser): void {
  if (user.role !== "dueno") throw new HttpError(403, OWNER_ONLY);
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Orden de la biblioteca: por grupo (mujer, hombre, niña, niño, otro), número y nombre. */
const ORDER = [
  sql`array_position(array['mujer','hombre','nina','nino','otro']::text[], ${schema.avatars.group})`,
  sql`${schema.avatars.number} asc nulls last`,
  asc(schema.avatars.name),
  asc(schema.avatars.id),
];

/** Todos los avatares (sin la imagen), también los retirados. */
export async function listAvatars(): Promise<AvatarInfo[]> {
  const rows = await getDb().select(INFO).from(schema.avatars).orderBy(...ORDER);
  return rows.map(typed);
}

/** Los avatares que se pueden elegir solos: los no retirados, en el orden de la biblioteca. */
export async function activeAvatarSummaries(): Promise<AvatarSummary[]> {
  const rows = await getDb().select(SUMMARY).from(schema.avatars).where(eq(schema.avatars.retired, false)).orderBy(...ORDER);
  return rows.map(typed);
}

/** Resúmenes de los avatares `ids` (también retirados; los que no existen no salen). */
export async function avatarSummaries(ids: Array<number | null>): Promise<Map<number, AvatarSummary>> {
  const wanted = [...new Set(ids.filter((id): id is number => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await getDb().select(SUMMARY).from(schema.avatars).where(inArray(schema.avatars.id, wanted));
  return new Map(rows.map((row) => [row.id, typed(row)]));
}

/** ¿Existe el avatar y se puede elegir (no está retirado)? */
export async function isChoosableAvatar(id: number): Promise<boolean> {
  if (!validId(id)) return false;
  const [row] = await getDb().select({ retired: schema.avatars.retired }).from(schema.avatars).where(eq(schema.avatars.id, id));
  return row !== undefined && !row.retired;
}

/** La imagen de un avatar, para cualquier persona con sesión. */
export async function readAvatarImage(avatarId: number): Promise<{ mime: string; data: Buffer; sha256: string }> {
  if (!validId(avatarId)) throw new HttpError(404, NOT_FOUND);
  const [row] = await getDb()
    .select({ mime: schema.avatars.mime, data: schema.avatars.data, sha256: schema.avatars.sha256 })
    .from(schema.avatars)
    .where(eq(schema.avatars.id, avatarId));
  if (!row) throw new HttpError(404, NOT_FOUND);
  return { mime: row.mime, data: Buffer.from(row.data), sha256: row.sha256 };
}

/** Los datos que se pueden poner o cambiar de un avatar (sin comprobar aún). */
export interface AvatarMetaInput {
  name?: unknown;
  group?: unknown;
  number?: unknown;
  ageYears?: unknown;
  tags?: unknown;
  description?: unknown;
  higgsfieldMediaId?: unknown;
  retired?: unknown;
}

interface AvatarMeta {
  name?: string;
  group?: AvatarGroup;
  number?: number | null;
  ageYears?: number | null;
  tags?: string[];
  description?: string | null;
  higgsfieldMediaId?: string | null;
  retired?: boolean;
}

const BAD = "Valor no válido.";

/** Comprueba los datos; lo que no viene se queda sin tocar. 400 si algo no vale. */
export function checkAvatarMeta(input: AvatarMetaInput): AvatarMeta {
  const meta: AvatarMeta = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (!name) throw new HttpError(400, "Escribe el nombre del avatar.");
    if (name.length > MAX_AVATAR_NAME) throw new HttpError(400, `El nombre no puede tener más de ${MAX_AVATAR_NAME} caracteres.`);
    meta.name = name;
  }
  if (input.group !== undefined) {
    if (!isAvatarGroup(input.group)) throw new HttpError(400, "Grupo no válido.");
    meta.group = input.group;
  }
  if (input.number !== undefined) {
    if (input.number !== null && !(Number.isSafeInteger(input.number) && (input.number as number) > 0 && (input.number as number) < 100_000)) {
      throw new HttpError(400, BAD);
    }
    meta.number = input.number as number | null;
  }
  if (input.ageYears !== undefined) {
    if (input.ageYears !== null && !(Number.isInteger(input.ageYears) && (input.ageYears as number) >= 0 && (input.ageYears as number) <= 120)) {
      throw new HttpError(400, "Edad no válida (0–120 años).");
    }
    meta.ageYears = input.ageYears as number | null;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) throw new HttpError(400, "Rasgos no válidos.");
    const tags = [...new Set((input.tags as string[]).map(normalizeTag).filter(Boolean))];
    if (tags.length > MAX_AVATAR_TAGS || tags.some((tag) => tag.length > 30)) throw new HttpError(400, "Rasgos no válidos.");
    meta.tags = tags;
  }
  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== "string") throw new HttpError(400, BAD);
    const description = (input.description ?? "").trim();
    if (description.length > MAX_AVATAR_DESCRIPTION) {
      throw new HttpError(400, `La descripción no puede tener más de ${MAX_AVATAR_DESCRIPTION} caracteres.`);
    }
    meta.description = description || null;
  }
  if (input.higgsfieldMediaId !== undefined) {
    const id = input.higgsfieldMediaId;
    if (id !== null && !(typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id))) throw new HttpError(400, BAD);
    meta.higgsfieldMediaId = id as string | null;
  }
  if (input.retired !== undefined) {
    if (typeof input.retired !== "boolean") throw new HttpError(400, BAD);
    meta.retired = input.retired;
  }
  return meta;
}

const isUniqueViolation = (error: unknown, constraint: string) => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const inner = e.cause ?? e;
  return inner.code === "23505" && inner.constraint === constraint;
};

const NAME_TAKEN = (name: string) => `Ya hay un avatar «${name}».`;

/**
 * Sube un avatar (solo el dueño). El tipo (JPG, PNG o WebP) sale del contenido y pesa como mucho
 * 8 MB. Es idempotente por su sha256: si esa misma imagen ya está, no se guarda otra vez ni se
 * cambia nada (así reimportar la carpeta no pisa la edad o los rasgos puestos a mano). Hacen falta
 * nombre y grupo. Otro avatar con el mismo nombre: 409. Devuelve el avatar y si es nuevo.
 */
export async function uploadAvatar(user: AuthUser, bytes: Buffer, input: AvatarMetaInput): Promise<{ avatar: AvatarInfo; created: boolean }> {
  requireOwner(user);
  if (bytes.length > MAX_AVATAR_BYTES) throw new HttpError(413, "La imagen pesa demasiado (máximo 8 MB).");
  const mime = checkPhotoBytes(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = getDb();
  const [existing] = await db.select(INFO).from(schema.avatars).where(eq(schema.avatars.sha256, sha256));
  if (existing) return { avatar: typed(existing), created: false };

  const meta = checkAvatarMeta(input);
  if (meta.name === undefined) throw new HttpError(400, "Escribe el nombre del avatar.");
  if (meta.group === undefined) throw new HttpError(400, "Grupo no válido.");
  try {
    const [row] = await db
      .insert(schema.avatars)
      .values({
        name: meta.name,
        group: meta.group,
        number: meta.number ?? null,
        ageYears: meta.ageYears ?? null,
        tags: meta.tags ?? [],
        description: meta.description ?? null,
        higgsfieldMediaId: meta.higgsfieldMediaId ?? null,
        retired: meta.retired ?? false,
        mime,
        size: bytes.length,
        sha256,
        data: bytes,
        createdBy: user.id,
      })
      // La misma imagen subida dos veces a la vez: la segunda no crea otra.
      .onConflictDoNothing({ target: schema.avatars.sha256 })
      .returning(INFO);
    if (row) return { avatar: typed(row), created: true };
    const [same] = await db.select(INFO).from(schema.avatars).where(eq(schema.avatars.sha256, sha256));
    return { avatar: typed(same), created: false };
  } catch (error) {
    if (isUniqueViolation(error, "avatars_name")) throw new HttpError(409, NAME_TAKEN(meta.name));
    throw error;
  }
}

/** Cambia los datos de un avatar (solo el dueño): nombre, grupo, número, edad, rasgos, descripción o retirado. */
export async function updateAvatar(user: AuthUser, avatarId: number, input: AvatarMetaInput): Promise<AvatarInfo> {
  requireOwner(user);
  if (!validId(avatarId)) throw new HttpError(404, NOT_FOUND);
  const meta = checkAvatarMeta(input);
  const db = getDb();
  if (Object.keys(meta).length === 0) {
    const [row] = await db.select(INFO).from(schema.avatars).where(eq(schema.avatars.id, avatarId));
    if (!row) throw new HttpError(404, NOT_FOUND);
    return typed(row);
  }
  try {
    const [row] = await db
      .update(schema.avatars)
      .set({ ...meta, updatedAt: new Date() })
      .where(eq(schema.avatars.id, avatarId))
      .returning(INFO);
    if (!row) throw new HttpError(404, NOT_FOUND);
    return typed(row);
  } catch (error) {
    if (meta.name !== undefined && isUniqueViolation(error, "avatars_name")) throw new HttpError(409, NAME_TAKEN(meta.name));
    throw error;
  }
}
