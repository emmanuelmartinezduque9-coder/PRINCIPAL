import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { detectVideoType } from "@/server/media/detect";
import { imageMimeOf, makeImageFile, makePreviewVideo, probeVideo } from "@/server/media/ffmpeg";

/**
 * Copia propia de todo lo que genera Higgsfield (tabla `stored_media`, una fila por trabajo).
 *
 * - **Qué se copia**: cada resultado bueno de una generación (`generation_results`, imagen o
 *   clip) y cada clip de la biblioteca (`library_clips`). `discoverMedia` crea las filas que falten
 *   con una sola consulta, así que lo nuevo y lo que ya existía antes de esta función (la
 *   «migración») entran por el mismo camino.
 * - **Qué se guarda** (`medios/<trabajo>/`): el archivo tal cual (`original.mp4` / `.jpg|.png|.webp`),
 *   una miniatura JPEG de 540 px (`miniatura.jpg`) y una vista ligera: MP4 de 480 px sin sonido
 *   para los vídeos (`vista.mp4`), JPEG de 1080 px para las imágenes (`vista.jpg`).
 * - **Idempotente**: las claves salen del trabajo; repetir una copia sustituye los mismos archivos.
 *   Una copia se reserva 15 minutos (`claimed_until`, con `for update skip locked`): dos procesos
 *   nunca copian la misma a la vez.
 * - **Reintentos**: hasta 8, cada vez más espaciados (1, 2, 4… minutos, 2 h como mucho). Después,
 *   `failed` con el motivo. Sin almacén (nube sin bucket) no se hace nada y todo se sirve como antes.
 */

export const ARCHIVE_MAX_ATTEMPTS = 8;
export const ARCHIVE_CLAIM_MS = 15 * 60 * 1000;
/** Copias a la vez en cada pasada (cada una baja un clip y pasa ffmpeg dos veces). */
export const ARCHIVE_CONCURRENCY = 3;
/** Copias por pasada (cada minuto); con 3 a la vez, unos segundos cada una. */
export const ARCHIVE_BATCH = 12;
const THUMB_SIDE = 540;
const IMAGE_PREVIEW_SIDE = 1080;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const JOB_ID = /^[A-Za-z0-9_-]{1,120}$/;

const stored = schema.storedMedia;

/**
 * `clip.ts` se importa tarde: él se registra en `generations.ts` al cargarse, y este módulo lo
 * importan módulos que `generations.ts` carga (ciclo de importación).
 */
const clipModule = () => import("@/server/videos/clip");

export type MediaKind = "video" | "image";

/** Carpeta de un trabajo en el almacén. `null` si el identificador no vale como parte de una clave. */
export function mediaPrefix(jobId: string): string | null {
  return JOB_ID.test(jobId) ? `medios/${jobId}` : null;
}

/**
 * Crea las filas que faltan: resultados buenos de generaciones y clips de la biblioteca, con una
 * dirección de Higgsfield servible y un identificador que vale como clave. Devuelve cuántas.
 */
export async function discoverMedia(): Promise<number> {
  const result = await getDb().execute(sql`
    insert into stored_media (job_id, kind, source_url)
    select distinct on (job_id) job_id, kind, url from (
      select r.job_id, case when g.kind = 'frame' then 'image' else 'video' end as kind, r.url, 0 as prio
        from generation_results r join generations g on g.id = r.generation_id
        where r.ok and r.url is not null
      union all
      select lc.job_id, 'video', lc.video_url, 1 from library_clips lc
    ) found
    where job_id ~ '^[A-Za-z0-9_-]{1,120}$'
      and url ~ '^https://[A-Za-z0-9.-]+\\.cloudfront\\.net/'
      and not exists (select 1 from stored_media s where s.job_id = found.job_id)
    order by job_id, prio
    on conflict (job_id) do nothing`);
  return result.rowCount ?? 0;
}

interface Claimed {
  jobId: string;
  kind: MediaKind;
  sourceUrl: string;
  attempts: number;
}

/**
 * Reserva hasta `limit` copias pendientes cuya hora ha llegado. Sin `now`, con la hora de la base
 * de datos (la misma con la que se crearon las filas: sin carreras entre relojes).
 */
async function claimDue(limit: number, now: Date | null): Promise<Claimed[]> {
  const at = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
  const rows = await getDb().execute<{ job_id: string; kind: MediaKind; source_url: string; attempts: number }>(sql`
    update stored_media s set claimed_until = ${at} + make_interval(secs => ${ARCHIVE_CLAIM_MS / 1000}), attempts = s.attempts + 1
    where s.job_id in (
      select job_id from stored_media
      where status = 'pending' and next_attempt_at <= ${at}
        and (claimed_until is null or claimed_until < ${at})
      order by next_attempt_at, created_at
      limit ${limit}
      for update skip locked)
    returning s.job_id, s.kind, s.source_url, s.attempts`);
  return rows.rows.map((row) => ({ jobId: row.job_id, kind: row.kind, sourceUrl: row.source_url, attempts: row.attempts }));
}

/** Espera antes del siguiente intento: 1, 2, 4… minutos, como mucho 2 horas. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export interface ArchiveDeps {
  store?: ObjectStore | null;
  fetch?: typeof fetch;
  now?: () => Date;
}

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const IMMUTABLE = "private, max-age=31536000, immutable";

/** Baja la dirección de Higgsfield a un archivo (mismas defensas que la descarga de un clip). */
async function downloadSource(url: string, target: string, deps: ArchiveDeps, maxBytes?: number): Promise<void> {
  const { openClipStream } = await clipModule();
  const { body } = await openClipStream(url, { fetch: deps.fetch, maxBytes });
  await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), createWriteStream(target));
}

async function headBytes(file: string): Promise<Buffer> {
  const handle = await fs.open(file, "r");
  try {
    const head = Buffer.alloc(16);
    const { bytesRead } = await handle.read(head, 0, 16, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Copia un trabajo: baja, comprueba, hace miniatura y vista ligera y lo sube todo. */
async function copyOne(row: Claimed, store: ObjectStore, deps: ArchiveDeps): Promise<Partial<typeof stored.$inferInsert>> {
  const prefix = mediaPrefix(row.jobId);
  const { servableClipUrl } = await clipModule();
  if (!prefix || !servableClipUrl(row.sourceUrl)) throw new PermanentArchiveError("Dirección o trabajo no admitidos.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "medio-"));
  try {
    const source = path.join(dir, "original");
    await downloadSource(row.sourceUrl, source, deps, row.kind === "image" ? MAX_IMAGE_BYTES : undefined);
    const { size } = await fs.stat(source);
    const head = await headBytes(source);
    const thumb = path.join(dir, "miniatura.jpg");
    if (row.kind === "video") {
      const mime = detectVideoType(head);
      if (!mime) throw new PermanentArchiveError("Lo que devolvió Higgsfield no es un vídeo.");
      const info = await probeVideo(source);
      const preview = path.join(dir, "vista.mp4");
      await makeImageFile(source, thumb, "video", THUMB_SIDE);
      await makePreviewVideo(source, preview);
      const originalKey = `${prefix}/original.${VIDEO_EXT[mime] ?? "mp4"}`;
      await store.putFile(originalKey, source, { contentType: mime, cacheControl: IMMUTABLE });
      await store.putFile(`${prefix}/miniatura.jpg`, thumb, { contentType: "image/jpeg", cacheControl: IMMUTABLE });
      await store.putFile(`${prefix}/vista.mp4`, preview, { contentType: "video/mp4", cacheControl: IMMUTABLE });
      return {
        originalKey,
        thumbKey: `${prefix}/miniatura.jpg`,
        previewKey: `${prefix}/vista.mp4`,
        mime,
        size,
        durationMs: info.durationMs,
        width: info.width,
        height: info.height,
      };
    }
    const mime = imageMimeOf(head);
    if (!mime) throw new PermanentArchiveError("Lo que devolvió Higgsfield no es una imagen.");
    const preview = path.join(dir, "vista.jpg");
    await makeImageFile(source, thumb, "image", THUMB_SIDE);
    await makeImageFile(source, preview, "image", IMAGE_PREVIEW_SIDE, 3);
    const originalKey = `${prefix}/original.${IMAGE_EXT[mime]}`;
    await store.putFile(originalKey, source, { contentType: mime, cacheControl: IMMUTABLE });
    await store.putFile(`${prefix}/miniatura.jpg`, thumb, { contentType: "image/jpeg", cacheControl: IMMUTABLE });
    await store.putFile(`${prefix}/vista.jpg`, preview, { contentType: "image/jpeg", cacheControl: IMMUTABLE });
    return { originalKey, thumbKey: `${prefix}/miniatura.jpg`, previewKey: `${prefix}/vista.jpg`, mime, size };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Un fallo que no se arregla reintentando (dirección rara, contenido que no es lo esperado). */
export class PermanentArchiveError extends Error {}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

/** Hace las copias pendientes que tocan. Devuelve cuántas terminaron bien y cuántas fallaron en esta pasada. */
export async function archivePending(deps: ArchiveDeps = {}, limit = ARCHIVE_BATCH): Promise<{ done: number; failed: number }> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  if (!store) return { done: 0, failed: 0 };
  const queue = await claimDue(limit, deps.now?.() ?? null);
  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      try {
        const saved = await copyOne(row, store, deps);
        await getDb()
          .update(stored)
          .set({ ...saved, status: "done", error: null, claimedUntil: null, storedAt: deps.now?.() ?? new Date() })
          .where(sql`${stored.jobId} = ${row.jobId}`);
        done += 1;
      } catch (error) {
        const final = error instanceof PermanentArchiveError || row.attempts >= ARCHIVE_MAX_ATTEMPTS;
        if (!final) console.warn(`[almacén] ${row.jobId}: intento ${row.attempts} falló: ${messageOf(error)}`);
        else console.error(`[almacén] ${row.jobId}: no se pudo copiar: ${messageOf(error)}`);
        await getDb()
          .update(stored)
          .set({
            status: final ? "failed" : "pending",
            error: messageOf(error),
            claimedUntil: null,
            nextAttemptAt: new Date((deps.now?.() ?? new Date()).getTime() + retryDelayMs(row.attempts)),
          })
          .where(sql`${stored.jobId} = ${row.jobId}`);
        if (final) failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: ARCHIVE_CONCURRENCY }, worker));
  return { done, failed };
}

/** Una pasada completa (tarea programada cada minuto): descubrir y copiar. */
export async function archiveSweep(deps: ArchiveDeps = {}): Promise<void> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  if (!store) return;
  await discoverMedia();
  await archivePending({ ...deps, store });
}

// ───────────────────────── Servir ─────────────────────────

export interface MediaLinks {
  /** El archivo tal cual. */
  original: string;
  /** Miniatura JPEG pequeña. */
  thumb: string;
  /** Vista ligera (MP4 pequeño sin sonido o JPEG mediano). */
  preview: string;
}

/**
 * Enlaces firmados (caducan a las 6 h) de los trabajos ya copiados. Los que aún no lo están no
 * salen: quien llama usa entonces la dirección de Higgsfield de siempre.
 */
export async function mediaLinks(jobIds: Iterable<string>, deps: { store?: ObjectStore | null } = {}): Promise<Map<string, MediaLinks>> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const ids = [...new Set(jobIds)].filter((id) => JOB_ID.test(id));
  const links = new Map<string, MediaLinks>();
  if (!store || ids.length === 0) return links;
  const rows = await getDb()
    .select({ jobId: stored.jobId, status: stored.status, originalKey: stored.originalKey, thumbKey: stored.thumbKey, previewKey: stored.previewKey })
    .from(stored)
    .where(inArray(stored.jobId, ids));
  await Promise.all(
    rows.map(async (row) => {
      if (row.status !== "done" || !row.originalKey || !row.thumbKey || !row.previewKey) return;
      const [original, thumb, preview] = await Promise.all([
        store.signedUrl(row.originalKey),
        store.signedUrl(row.thumbKey),
        store.signedUrl(row.previewKey),
      ]);
      links.set(row.jobId, { original, thumb, preview });
    }),
  );
  return links;
}

/** Enlace de descarga (con nombre de archivo) del original de un trabajo copiado; `null` si aún no lo está. */
export async function mediaDownloadUrl(jobId: string, filename: string, deps: { store?: ObjectStore | null } = {}): Promise<string | null> {
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  if (!store || !JOB_ID.test(jobId)) return null;
  const [row] = await getDb().select({ status: stored.status, key: stored.originalKey }).from(stored).where(sql`${stored.jobId} = ${jobId}`);
  if (!row || row.status !== "done" || !row.key) return null;
  return store.signedUrl(row.key, { downloadName: filename, expiresIn: 15 * 60 });
}

/** La clave del original de un trabajo copiado (para el montaje en la nube); `null` si aún no lo está. */
export async function storedOriginalKey(jobId: string): Promise<string | null> {
  if (!JOB_ID.test(jobId)) return null;
  const [row] = await getDb().select({ status: stored.status, key: stored.originalKey }).from(stored).where(sql`${stored.jobId} = ${jobId}`);
  return row?.status === "done" ? row.key : null;
}

/** Cuántos trabajos hay en cada estado (para Ajustes y el diagnóstico). */
export async function archiveStats(): Promise<{ pending: number; done: number; failed: number; bytes: number }> {
  const rows = await getDb().execute<{ status: string; n: string; bytes: string | null }>(
    sql`select status, count(*)::text as n, sum(size)::text as bytes from stored_media group by status`,
  );
  const stats = { pending: 0, done: 0, failed: 0, bytes: 0 };
  for (const row of rows.rows) {
    if (row.status === "pending" || row.status === "done" || row.status === "failed") stats[row.status] = Number(row.n);
    stats.bytes += Number(row.bytes ?? 0);
  }
  return stats;
}
