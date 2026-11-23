import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { HttpError } from "@/server/http";
import { downloadLinkMedia, ensureLinkMedia, fetchInCloud, linkMediaById, macTaskStatus, requestFromMac, type FetchDeps } from "@/server/link-media";
import { imageMimeOf, makeImageFile, makeThumbnail, MediaError } from "@/server/media/ffmpeg";

/**
 * Portadas de los enlaces de referencia (petición de Emmanuel, 24/11/2026): en cuanto se pega un
 * enlace (aunque el lote no se haya enviado), su miniatura para reconocerlo sin abrirlo.
 *
 * 1. **La nube, rápido**: oEmbed de TikTok y YouTube; para los demás (Instagram, Facebook), la
 *    `og:image` de la página.
 * 2. **Si no hay portada**, el primer fotograma del vídeo del enlace (`link-media.ts`): yt-dlp en la
 *    nube y, si no puede (Instagram), el Mac del dueño. Ese vídeo queda en el almacén y sirve después.
 *
 * Se guarda en la fila del enlace (`link_media.thumb`, JPEG de 360 px) y una copia en el almacén
 * (`portadas/<id>.jpg`). Nunca es un error para la pantalla: sin portada, se enseña el icono.
 */

export const THUMB_JOB = "enlace.portada";
const THUMB_SIDE = 360;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
/** Una portada «pendiente» sin novedades desde hace más que esto se vuelve a intentar en el seguimiento. */
const RETRY_AFTER_MS = 10 * 60_000;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const media = schema.linkMedia;
type Row = typeof media.$inferSelect;

export interface ThumbDeps extends FetchDeps {
  fetch?: typeof fetch;
}

export type ThumbState = { status: "pending" | "ready" | "failed"; id: number };

// ───────────────────────── Pedir y leer ─────────────────────────

/**
 * El estado de la portada de `url` y, si nadie la había pedido, la pide (trabajo `enlace.portada`).
 * `null` si el enlace no es de un sitio admitido.
 */
export async function linkThumbState(url: string, userId: number): Promise<ThumbState | null> {
  const row = await ensureLinkMedia(url);
  if (!row) return null;
  if (row.thumbStatus === "ready" || row.thumbStatus === "failed" || row.thumbStatus === "pending") return { status: row.thumbStatus, id: row.id };
  const [claimed] = await getDb()
    .update(media)
    .set({ thumbStatus: "pending", updatedAt: new Date() })
    .where(and(eq(media.id, row.id), isNull(media.thumbStatus)))
    .returning({ id: media.id });
  if (claimed) {
    try {
      await enqueueJob(THUMB_JOB, { userId, productId: null }, { linkMediaId: row.id });
    } catch (error) {
      // Ya la retomará el seguimiento.
      console.error(`[portadas] No se pudo encolar la portada del enlace ${row.id}:`, error);
    }
  }
  return { status: "pending", id: row.id };
}

export async function readLinkThumb(id: number): Promise<Buffer> {
  if (!Number.isSafeInteger(id)) throw new HttpError(404, "Portada no encontrada.");
  const [row] = await getDb().select({ thumb: media.thumb, status: media.thumbStatus }).from(media).where(eq(media.id, id));
  if (!row || row.status !== "ready" || !row.thumb) throw new HttpError(404, "Portada no encontrada.");
  return row.thumb;
}

// ───────────────────────── Hacerla ─────────────────────────

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchImpl(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

const decodeEntities = (value: string) => value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&quot;/g, '"');

/** La dirección de la portada que da el propio sitio, o `null`. */
export async function previewImageUrl(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const oembed = /(^|\.)tiktok\.com$/.test(host)
    ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    : /(^|\.)(youtube\.com|youtu\.be)$/.test(host)
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
      : null;
  if (oembed) {
    try {
      const response = await fetchWithTimeout(fetchImpl, oembed, { headers: { "User-Agent": BROWSER_UA } });
      if (response.ok) {
        const body = (await response.json()) as { thumbnail_url?: unknown };
        if (typeof body.thumbnail_url === "string" && body.thumbnail_url.startsWith("https://")) return body.thumbnail_url;
      }
    } catch {
      // Se prueba con la página.
    }
  }
  try {
    const response = await fetchWithTimeout(fetchImpl, url, { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" } });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 600_000);
    const match =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const found = match ? decodeEntities(match[1]) : null;
    return found && found.startsWith("https://") ? found : null;
  } catch {
    return null;
  }
}

/** Baja una imagen (con tope) y la deja en JPEG de 360 px; `null` si no es una imagen. */
async function imageThumb(imageUrl: string, fetchImpl: typeof fetch): Promise<Buffer | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, imageUrl, { headers: { "User-Agent": BROWSER_UA } });
    if (!response.ok) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES || !imageMimeOf(data.subarray(0, 16))) return null;
    return await makeThumbnail(data, "image", THUMB_SIDE);
  } catch (error) {
    if (error instanceof MediaError) return null;
    return null;
  }
}

/** El primer fotograma del vídeo del enlace (ya en el almacén), en JPEG de 360 px. */
async function frameThumb(row: Row, store: ObjectStore | null): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "portada-"));
  try {
    const video = path.join(dir, "video");
    if (!(await downloadLinkMedia(row, video, { store }))) return null;
    const out = path.join(dir, "portada.jpg");
    await makeImageFile(video, out, "video", THUMB_SIDE);
    return await fs.readFile(out);
  } catch (error) {
    if (error instanceof MediaError) return null;
    throw error;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function saveThumb(row: Row, jpeg: Buffer, store: ObjectStore | null): Promise<void> {
  let key: string | null = null;
  if (store) {
    try {
      key = `portadas/${row.id}.jpg`;
      await store.putBuffer(key, jpeg, { contentType: "image/jpeg" });
    } catch (error) {
      key = null;
      console.error(`[portadas] No se pudo copiar al almacén la portada del enlace ${row.id}:`, error);
    }
  }
  await getDb().update(media).set({ thumbStatus: "ready", thumb: jpeg, thumbKey: key, thumbError: null, updatedAt: new Date() }).where(eq(media.id, row.id));
}

async function failThumb(row: Row, reason: string): Promise<void> {
  await getDb().update(media).set({ thumbStatus: "failed", thumbError: reason.slice(0, 300), updatedAt: new Date() }).where(eq(media.id, row.id));
}

/**
 * Hace la portada de un enlace: la del sitio; si no, el primer fotograma de su vídeo (de la nube o,
 * si no puede, pidiéndoselo al Mac; entonces queda `pending` y la termina el seguimiento cuando llega).
 */
export async function makeLinkThumb(id: number, deps: ThumbDeps = {}): Promise<void> {
  const row = await linkMediaById(id);
  if (!row || row.thumbStatus === "ready") return;
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const fetchImpl = deps.fetch ?? fetch;

  if (row.status === "ready") {
    const jpeg = await frameThumb(row, store);
    if (jpeg) return saveThumb(row, jpeg, store);
  }
  const imageUrl = await previewImageUrl(row.url, fetchImpl);
  const fromSite = imageUrl ? await imageThumb(imageUrl, fetchImpl) : null;
  if (fromSite) return saveThumb(row, fromSite, store);

  // Sin portada del sitio: el vídeo del enlace (que además sirve después para la referencia).
  if (row.status === "failed") return failThumb(row, row.error ?? "No se pudo traer el vídeo del enlace.");
  if (await fetchInCloud(row, { ...deps, store })) {
    const ready = (await linkMediaById(id))!;
    const jpeg = await frameThumb(ready, store);
    return jpeg ? saveThumb(ready, jpeg, store) : failThumb(ready, "No se pudo sacar un fotograma del vídeo.");
  }
  const fresh = (await linkMediaById(id))!;
  if (fresh.agentTaskId === null && store) {
    if (!(await requestFromMac(fresh))) return failThumb(fresh, "Sin portada y sin Mac para traer el vídeo.");
  } else if (!store) {
    return failThumb(fresh, "Sin portada del sitio.");
  }
  await getDb().update(media).set({ thumbStatus: "pending", updatedAt: new Date() }).where(eq(media.id, id));
}

/**
 * Para el seguimiento de cada minuto: termina las portadas cuyo vídeo ya llegó (del Mac), da por
 * fallidas las que el Mac no pudo traer y reintenta las que se quedaron a medias.
 */
export async function linkThumbSweep(now: Date = new Date(), deps: ThumbDeps = {}): Promise<void> {
  const rows = await getDb()
    .select()
    .from(media)
    .where(eq(media.thumbStatus, "pending"))
    .limit(30);
  for (const row of rows) {
    try {
      if (row.status === "ready" || row.status === "failed") {
        await makeLinkThumb(row.id, deps);
        continue;
      }
      const task = await macTaskStatus(row);
      if (task === "failed") await failThumb(row, row.error ?? "El Mac no pudo traer el vídeo.");
      else if (task === null && row.updatedAt < new Date(now.getTime() - RETRY_AFTER_MS)) await makeLinkThumb(row.id, deps);
    } catch (error) {
      console.error(`[portadas] No se pudo terminar la portada del enlace ${row.id}:`, error);
    }
  }
}
