import { createHash } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { MAX_SONG_BYTES } from "@/db/schema";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { MediaError, probeAudio } from "@/server/media/ffmpeg";
import { releaseSongFromVideos } from "@/server/videos/song-links";

/**
 * Biblioteca de canciones («Canciones»). Es común: cualquier persona con sesión la ve, la escucha y
 * elige canciones para sus vídeos; solo el dueño sube, cambia o borra (403 para los demás). Solo
 * este módulo toca la tabla `songs`.
 */

export { MAX_SONG_BYTES };
export const MAX_SONG_TITLE = 200;
export const MAX_SECTIONS = 20;
export const MAX_SECTION_LENGTH = 60;
/** Lo más que se manda en una respuesta parcial de un rango abierto (`bytes=N-`). */
export const MAX_RANGE_CHUNK = 2 * 1024 * 1024;

const NOT_FOUND = "Canción no encontrada.";
const OWNER_ONLY = "Solo el dueño puede cambiar las canciones.";

export interface SongInfo {
  id: number;
  title: string;
  number: number | null;
  sections: string[];
  durationMs: number;
  dropMs: number | null;
  startMs: number;
  mime: string;
  size: number;
  sha256: string;
  createdAt: Date;
}

/** Lo que enseñan el vídeo y el tablero de una canción elegida. */
export interface SongSummary {
  id: number;
  number: number | null;
  title: string;
  dropMs: number | null;
  startMs: number;
  durationMs: number;
}

const INFO = {
  id: schema.songs.id,
  title: schema.songs.title,
  number: schema.songs.number,
  sections: schema.songs.sections,
  durationMs: schema.songs.durationMs,
  dropMs: schema.songs.dropMs,
  startMs: schema.songs.startMs,
  mime: schema.songs.mime,
  size: schema.songs.size,
  sha256: schema.songs.sha256,
  createdAt: schema.songs.createdAt,
};

const SUMMARY = {
  id: schema.songs.id,
  number: schema.songs.number,
  title: schema.songs.title,
  dropMs: schema.songs.dropMs,
  startMs: schema.songs.startMs,
  durationMs: schema.songs.durationMs,
};

function requireOwner(user: AuthUser): void {
  if (user.role !== "dueno") throw new HttpError(403, OWNER_ONLY);
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Todas las canciones (sin el audio): por número y, sin número, por título. */
export async function listSongs(): Promise<SongInfo[]> {
  return getDb()
    .select(INFO)
    .from(schema.songs)
    .orderBy(sql`${schema.songs.number} asc nulls last`, asc(schema.songs.title), asc(schema.songs.id));
}

/** Resúmenes de las canciones `ids` (las que ya no existen no salen). */
export async function songSummaries(ids: Array<number | null>): Promise<Map<number, SongSummary>> {
  const wanted = [...new Set(ids.filter((id): id is number => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await getDb().select(SUMMARY).from(schema.songs).where(inArray(schema.songs.id, wanted));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Los datos que se pueden poner o cambiar de una canción (sin comprobar aún). */
export interface SongMetaInput {
  title?: unknown;
  number?: unknown;
  sections?: unknown;
  dropMs?: unknown;
  startMs?: unknown;
}

interface SongMeta {
  title?: string;
  number?: number | null;
  sections?: string[];
  dropMs?: number | null;
  startMs?: number;
}

const isMs = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Comprueba los datos; lo que no viene se queda sin tocar. Con `durationMs`, el drop y el inicio caben en la canción. */
function checkMeta(input: SongMetaInput, durationMs: number): SongMeta {
  const meta: SongMeta = {};
  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) throw new HttpError(400, "Escribe el título de la canción.");
    if (title.length > MAX_SONG_TITLE) throw new HttpError(400, `El título no puede tener más de ${MAX_SONG_TITLE} caracteres.`);
    meta.title = title;
  }
  if (input.number !== undefined) {
    if (input.number !== null && !(Number.isSafeInteger(input.number) && (input.number as number) > 0 && (input.number as number) < 100_000)) {
      throw new HttpError(400, "Número de canción no válido.");
    }
    meta.number = input.number as number | null;
  }
  if (input.sections !== undefined) {
    if (!Array.isArray(input.sections) || input.sections.some((section) => typeof section !== "string")) {
      throw new HttpError(400, "Secciones no válidas.");
    }
    const sections = [...new Set((input.sections as string[]).map((section) => section.trim()).filter(Boolean))];
    if (sections.length > MAX_SECTIONS || sections.some((section) => section.length > MAX_SECTION_LENGTH)) {
      throw new HttpError(400, "Secciones no válidas.");
    }
    meta.sections = sections;
  }
  if (input.dropMs !== undefined) {
    if (input.dropMs !== null && !(isMs(input.dropMs) && input.dropMs <= durationMs)) throw new HttpError(400, "El drop tiene que caer dentro de la canción.");
    meta.dropMs = input.dropMs as number | null;
  }
  if (input.startMs !== undefined) {
    if (!(isMs(input.startMs) && input.startMs <= durationMs)) throw new HttpError(400, "El inicio tiene que caer dentro de la canción.");
    meta.startMs = input.startMs;
  }
  return meta;
}

/**
 * Sube una canción (solo el dueño). El tipo (MP3, M4A o WAV) sale del contenido y la duración, de
 * ffprobe. Es idempotente por su sha256: si esa misma canción ya está, no se guarda otra vez; solo
 * se le cambian los datos que vengan (título, número, secciones, drop e inicio). Devuelve la
 * canción y si es nueva.
 */
export async function uploadSong(user: AuthUser, bytes: Buffer, input: SongMetaInput = {}): Promise<{ song: SongInfo; created: boolean }> {
  requireOwner(user);
  if (bytes.length === 0) throw new HttpError(400, "La canción está vacía.");
  if (bytes.length > MAX_SONG_BYTES) throw new HttpError(413, "La canción pesa demasiado (máximo 25 MB).");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = getDb();

  const [existing] = await db.select(INFO).from(schema.songs).where(eq(schema.songs.sha256, sha256));
  if (existing) {
    const meta = checkMeta(input, existing.durationMs);
    if (Object.keys(meta).length === 0) return { song: existing, created: false };
    const [song] = await db.update(schema.songs).set(meta).where(eq(schema.songs.id, existing.id)).returning(INFO);
    return { song: song ?? existing, created: false };
  }

  let probed: Awaited<ReturnType<typeof probeAudio>>;
  try {
    probed = await probeAudio(bytes);
  } catch (error) {
    if (error instanceof MediaError && error.name !== "FfmpegMissingError") throw new HttpError(400, error.message);
    if (error instanceof MediaError) throw new HttpError(503, error.message);
    throw error;
  }
  const meta = checkMeta(input, probed.durationMs);
  const values = {
    title: meta.title ?? "Canción",
    number: meta.number ?? null,
    sections: meta.sections ?? [],
    dropMs: meta.dropMs ?? null,
    startMs: meta.startMs ?? 0,
    durationMs: probed.durationMs,
    mime: probed.mime,
    size: bytes.length,
    sha256,
    data: bytes,
    createdBy: user.id,
  };
  // Dos subidas a la vez de la misma canción: la segunda solo cambia los datos (sigue siendo una).
  const [row] = await db
    .insert(schema.songs)
    .values(values)
    .onConflictDoUpdate({ target: schema.songs.sha256, set: Object.keys(meta).length === 0 ? { sha256 } : meta })
    .returning({ ...INFO, created: sql<boolean>`(xmax = 0)` });
  const { created, ...song } = row;
  return { song, created };
}

/** Cambia título, número, secciones, drop o inicio (solo el dueño). */
export async function updateSong(user: AuthUser, songId: number, input: SongMetaInput): Promise<SongInfo> {
  requireOwner(user);
  if (!validId(songId)) throw new HttpError(404, NOT_FOUND);
  const db = getDb();
  const [current] = await db.select({ durationMs: schema.songs.durationMs }).from(schema.songs).where(eq(schema.songs.id, songId));
  if (!current) throw new HttpError(404, NOT_FOUND);
  const meta = checkMeta(input, current.durationMs);
  if (Object.keys(meta).length === 0) {
    const [song] = await db.select(INFO).from(schema.songs).where(eq(schema.songs.id, songId));
    return song;
  }
  const [song] = await db.update(schema.songs).set(meta).where(eq(schema.songs.id, songId)).returning(INFO);
  if (!song) throw new HttpError(404, NOT_FOUND);
  return song;
}

/** Borra una canción (solo el dueño). Los vídeos que la llevaban vuelven a «Audio original». */
export async function deleteSong(user: AuthUser, songId: number): Promise<{ released: number }> {
  requireOwner(user);
  if (!validId(songId)) throw new HttpError(404, NOT_FOUND);
  return getDb().transaction(async (tx) => {
    // Bloqueada: nadie puede elegirla mientras se suelta de los vídeos y se borra.
    const [row] = await tx.select({ id: schema.songs.id }).from(schema.songs).where(eq(schema.songs.id, songId)).for("update");
    if (!row) throw new HttpError(404, NOT_FOUND);
    const released = await releaseSongFromVideos(tx, songId);
    await tx.delete(schema.songs).where(eq(schema.songs.id, songId));
    return { released };
  });
}

/** Un rango de bytes pedido con `Range`, ya ajustado al tamaño; `null` = la canción entera. */
export type ByteRange = { start: number; end: number } | null;

/**
 * Lee la cabecera `Range` (un solo rango, `bytes=a-b`, `bytes=a-` o `bytes=-n`). Sin cabecera, con
 * varios rangos o con una forma que no se entiende: `null` (se manda entera). Fuera del archivo:
 * `"unsatisfiable"` (416). Un rango abierto se corta en `MAX_RANGE_CHUNK`: el navegador pide el resto.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  if (start >= size) return "unsatisfiable";
  if (match[2] === "") return { start, end: Math.min(size - 1, start + MAX_RANGE_CHUNK - 1) };
  const end = Number(match[2]);
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * El audio de una canción, entero o el trozo `Range`, para cualquier persona con sesión. Solo se
 * lee de la base de datos el trozo pedido. Devuelve la respuesta HTTP (200, 206 o 416).
 */
export async function songAudioResponse(_user: AuthUser, songId: number, rangeHeader: string | null): Promise<Response> {
  if (!validId(songId)) throw new HttpError(404, NOT_FOUND);
  const db = getDb();
  const [song] = await db
    .select({ mime: schema.songs.mime, size: schema.songs.size, sha256: schema.songs.sha256 })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId));
  if (!song) throw new HttpError(404, NOT_FOUND);
  const common = {
    "Accept-Ranges": "bytes",
    // Una canción no cambia de contenido (su id va con su sha256): se puede guardar en el navegador.
    "Cache-Control": "private, max-age=86400",
    ETag: `"${song.sha256}"`,
    "X-Content-Type-Options": "nosniff",
  };
  const range = parseRange(rangeHeader, song.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...common, "Content-Range": `bytes */${song.size}` } });
  }
  const start = range?.start ?? 0;
  const length = (range ? range.end + 1 : song.size) - start;
  const [slice] = await db
    .select({ data: sql<Buffer>`substring(${schema.songs.data} from ${start + 1} for ${length})` })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId));
  if (!slice) throw new HttpError(404, NOT_FOUND);
  const body = Buffer.from(slice.data);
  const headers: Record<string, string> = { ...common, "Content-Type": song.mime, "Content-Length": String(body.length) };
  if (!range) return new Response(new Uint8Array(body), { status: 200, headers });
  headers["Content-Range"] = `bytes ${start}-${start + body.length - 1}/${song.size}`;
  return new Response(new Uint8Array(body), { status: 206, headers });
}
