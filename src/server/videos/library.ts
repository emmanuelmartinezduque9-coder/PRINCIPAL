import { queueClipClassification } from "@/jobs/body-classifier";
import { getActiveUser } from "@/server/auth";
import { listCredentialUsers } from "@/server/credentials";
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  getHiggsfield,
  HIGGSFIELD_KIND,
  HiggsfieldAuthError,
  HiggsfieldNotConnectedError,
  HiggsfieldUnavailableError,
  type HfHistoryCursor,
  type HfHistoryItem,
  type HiggsfieldPort,
} from "@/connectors/higgsfield";
import { getDb, getSetting, schema } from "@/db/client";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import type { AuthUser } from "@/server/auth";
import { credentialStatus } from "@/server/credentials";
import { HttpError } from "@/server/http";
import { getProductFor, listProductsFor, productDisplayName } from "@/server/products";
import { mediaLinks } from "@/server/videos/archive";
import { servableClipUrl } from "@/server/videos/clip";

/**
 * Biblioteca de clips: los vídeos terminados del historial de Higgsfield de cada persona, copiados
 * a `library_clips` para que la pantalla cargue al instante. Cuándo se actualizó por última vez
 * la de cada persona va aparte, en `settings`. Se lee siempre con la conexión de la
 * persona de la sesión (ninguna función acepta otra persona) y cada una ve solo sus clips; los que
 * están marcados como cuerpo de un producto los ve además quien ve ese producto.
 */

/** Tamaño de cada página que se pide a Higgsfield. */
export const LIBRARY_PAGE_SIZE = 50;
/** Como mucho estas páginas por actualización (la primera carga trae hasta 500 clips). */
export const LIBRARY_MAX_PAGES = 10;
/** Si la última actualización es más vieja que esto (o no hubo ninguna), la pantalla actualiza sola al abrirse. */
export const LIBRARY_STALE_MS = 10 * 60 * 1000;
/**
 * Una actualización empezada hace menos que esto no se repite (dos pestañas, doble clic, la
 * pantalla abierta dos veces): se responde con lo que hay en la caché, sin llamar a Higgsfield.
 */
export const LIBRARY_REFRESH_GUARD_MS = 30 * 1000;
/**
 * Un clip puede terminar bastante después de crearse (las generaciones se dan por perdidas a la
 * hora), y entonces aparece en el historial por debajo de clips que ya se conocen. Por eso no se
 * para en el primer clip conocido, sino en uno conocido creado antes de la última actualización
 * menos este margen: de ahí hacia atrás ya estaba todo terminado y visto.
 */
export const LIBRARY_LATE_MARGIN_MS = 2 * 60 * 60 * 1000;
const MAX_PROMPT = 300;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

const BAD_CURSOR = "Página no válida.";
/**
 * La fecha más lejana que se admite en un cursor: el año 3000 (un cursor es la fecha de un clip).
 * Con fechas mucho mayores la consulta falla: o no son una `Date`, o no se pueden mandar a la base
 * de datos (pasó con el año 275760, y cerca del 10000 depende de la zona horaria del servidor).
 */
const MAX_CURSOR_MS = Date.UTC(3000, 0, 1);

const clips = schema.libraryClips;
const bodies = schema.productBodies;

export interface LibraryDeps {
  higgsfield?: HiggsfieldPort;
  now?: () => Date;
}

// ───────────────────────── Estado de la actualización, por persona ─────────────────────────

/**
 * Cuándo empezó y cuándo terminó bien la última actualización de cada persona. Va en `settings`
 * (una clave por persona), no se deduce de las filas de `library_clips`: así una biblioteca vacía
 * también cuenta como actualizada y no se vuelve a pedir en cada visita.
 */
const refreshKey = (userId: number) => `biblioteca.actualizacion:${userId}`;

const dateOrNull = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

async function refreshState(userId: number): Promise<{ startedAt: Date | null; refreshedAt: Date | null }> {
  const state = await getSetting<{ startedAt?: unknown; refreshedAt?: unknown }>(refreshKey(userId));
  return { startedAt: dateOrNull(state?.startedAt), refreshedAt: dateOrNull(state?.refreshedAt) };
}

/**
 * Reserva la actualización de esa persona: apunta `startedAt = now` solo si no hay otra empezada
 * en los últimos 30 s. Es una sola sentencia (insertar o actualizar con condición), así que de dos
 * peticiones a la vez solo una la consigue. Devuelve si la ha conseguido.
 */
async function claimRefresh(userId: number, now: Date): Promise<boolean> {
  const started = now.toISOString();
  // Las dos fechas son ISO en UTC con el mismo formato: comparadas como texto, se ordenan igual.
  const limit = new Date(now.getTime() - LIBRARY_REFRESH_GUARD_MS).toISOString();
  const claimed = await getDb().execute(sql`
    insert into settings (key, value) values (${refreshKey(userId)}, jsonb_build_object('startedAt', ${started}::text))
    on conflict (key) do update
      set value = settings.value || jsonb_build_object('startedAt', ${started}::text), updated_at = now()
      where settings.value->>'startedAt' is null or settings.value->>'startedAt' <= ${limit}
    returning key`);
  return claimed.rows.length > 0;
}

/** La actualización terminó bien: queda apuntada (también si no trajo nada). */
async function finishRefresh(userId: number, now: Date): Promise<void> {
  await getDb().execute(sql`
    update settings set value = value || jsonb_build_object('refreshedAt', ${now.toISOString()}::text), updated_at = now()
    where key = ${refreshKey(userId)}`);
}

/** La actualización falló: se suelta la reserva (si sigue siendo la nuestra) para poder reintentar ya. */
async function releaseRefresh(userId: number, now: Date): Promise<void> {
  await getDb().execute(sql`
    update settings set value = value || '{"startedAt": null}'::jsonb, updated_at = now()
    where key = ${refreshKey(userId)} and value->>'startedAt' = ${now.toISOString()}`);
}

// ───────────────────────── Actualizar ─────────────────────────

/** Sin conexión o caducada: 409 con el código que hace que la pantalla ofrezca ir a Ajustes. */
function connectError(error: HiggsfieldNotConnectedError | HiggsfieldAuthError): HttpError {
  return new HttpError(409, error.message, HIGGSFIELD_CONNECT);
}

async function historyPage(port: HiggsfieldPort, userId: number, cursor: HfHistoryCursor | null) {
  try {
    return await port.history(userId, "video", LIBRARY_PAGE_SIZE, cursor, { onlyCompleted: true });
  } catch (error) {
    if (error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldAuthError) throw connectError(error);
    if (error instanceof HiggsfieldUnavailableError) throw new HttpError(503, error.message);
    throw error;
  }
}

/** Principio del prompt en una línea (máx. 300 caracteres); `null` si no hay. */
function promptSnippet(prompt: string | null): string | null {
  const clean = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // Por caracteres enteros (no por unidades UTF-16): un emoji no se parte por la mitad.
  const chars = Array.from(clean);
  return chars.length > MAX_PROMPT ? `${chars.slice(0, MAX_PROMPT - 1).join("")}…` : clean;
}

/**
 * Lo que se guarda de una entrada del historial, o `null` si no se guarda: solo vídeos terminados
 * cuya dirección es servible (`https` de `*.cloudfront.net`: `servableClipUrl`). Una miniatura que
 * no lo es se queda sin miniatura.
 */
function storable(item: HfHistoryItem, now: Date) {
  if (item.type !== "video" || !item.completed || !servableClipUrl(item.resultUrl)) return null;
  return {
    jobId: item.jobId,
    videoUrl: item.resultUrl,
    thumbUrl: servableClipUrl(item.thumbUrl) ? item.thumbUrl : null,
    model: item.model,
    createdAtHf: item.createdAt ?? now,
    prompt: promptSnippet(item.prompt),
  };
}

/**
 * Trae lo nuevo del historial de vídeos de Higgsfield de `user` (con su propia conexión) y lo
 * guarda. Pide páginas de 50 hacia atrás hasta llegar a un clip que ya tenía de antes de la última
 * actualización (ver `LIBRARY_LATE_MARGIN_MS`), al final del historial o a 10 páginas. Se guarda
 * todo junto al final: si Higgsfield falla a mitad no queda una carga a medias. Los clips que
 * salieron de un vídeo de PRINCIPAL quedan marcados con ese vídeo. Sin Higgsfield conectado: 409
 * con el código `higgsfield_connect`.
 *
 * Si esa persona ya empezó otra actualización hace menos de 30 s (otra pestaña, un doble clic), no
 * se llama a Higgsfield: `skipped: true` y la pantalla enseña lo que hay en la caché. Si la
 * actualización falla, la reserva se suelta y se puede reintentar enseguida.
 */
export async function refreshLibrary(user: AuthUser, deps: LibraryDeps = {}): Promise<{ added: number; pages: number; skipped: boolean }> {
  const { connected, meta } = await credentialStatus(user.id, HIGGSFIELD_KIND);
  if (!connected) throw connectError(new HiggsfieldNotConnectedError());
  if (meta.needsReconnect === true) throw connectError(new HiggsfieldAuthError());

  const now = deps.now?.() ?? new Date();
  if (!(await claimRefresh(user.id, now))) return { added: 0, pages: 0, skipped: true };
  try {
    const result = await loadHistory(user, deps.higgsfield ?? getHiggsfield(), now);
    await finishRefresh(user.id, now);
    if (result.newIds.length) {
      try { await queueClipClassification(user.id, result.newIds.slice(0, 40)); }
      catch (error) { console.error("[biblioteca] No se pudo encolar la clasificación:", error); }
    }
    return { added: result.added, pages: result.pages, skipped: false };
  } catch (error) {
    await releaseRefresh(user.id, now);
    throw error;
  }
}

/** Lee el historial hasta donde toca y lo guarda todo junto. Devuelve cuántos clips eran nuevos y cuántas páginas pidió. */
async function loadHistory(user: AuthUser, port: HiggsfieldPort, now: Date): Promise<{ added: number; pages: number; newIds: number[] }> {
  const db = getDb();
  const { refreshedAt } = await refreshState(user.id);
  const settledBefore = refreshedAt ? refreshedAt.getTime() - LIBRARY_LATE_MARGIN_MS : null;

  const found = new Map<string, NonNullable<ReturnType<typeof storable>>>();
  const knownIds = new Set<string>();
  let cursor: HfHistoryCursor | null = null;
  let pages = 0;
  while (pages < LIBRARY_MAX_PAGES) {
    const page = await historyPage(port, user.id, cursor);
    pages += 1;
    for (const item of page.items) {
      const clip = storable(item, now);
      if (clip) found.set(clip.jobId, clip);
    }
    const ids = page.items.map((item) => item.jobId);
    const known =
      ids.length === 0
        ? []
        : await db
            .select({ jobId: clips.jobId, createdAtHf: clips.createdAtHf })
            .from(clips)
            .where(and(eq(clips.userId, user.id), inArray(clips.jobId, ids)));
    for (const row of known) knownIds.add(row.jobId);
    const reachedKnown = settledBefore !== null && known.some((row) => row.createdAtHf.getTime() < settledBefore);
    if (page.items.length === 0 || page.end || page.nextCursor === null || reachedKnown) break;
    cursor = page.nextCursor;
  }

  const rows = [...found.values()];
  if (rows.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .insert(clips)
        .values(rows.map((row) => ({ ...row, userId: user.id, fetchedAt: now })))
        .onConflictDoUpdate({
          target: [clips.userId, clips.jobId],
          set: {
            videoUrl: sql`excluded.video_url`,
            thumbUrl: sql`excluded.thumb_url`,
            model: sql`excluded.model`,
            createdAtHf: sql`excluded.created_at_hf`,
            prompt: sql`excluded.prompt`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
      // Los clips que salieron de PRINCIPAL: su trabajo es el de un resultado de un clip de esta persona.
      await tx.execute(sql`
        update library_clips lc set video_id = g.video_id
        from generation_results r join generations g on g.id = r.generation_id
        where lc.user_id = ${user.id} and lc.video_id is null and r.job_id = lc.job_id
          and g.user_id = ${user.id} and g.kind = 'clip'`);
    });
  }
  const newJobs = rows.filter(row => !knownIds.has(row.jobId)).map(row => row.jobId);
  const newClips = newJobs.length ? await db.select({ id: clips.id }).from(clips).where(and(eq(clips.userId, user.id), inArray(clips.jobId, newJobs))) : [];
  return { added: newJobs.length, pages, newIds: newClips.map(c => c.id) };
}

export interface LibraryBody {
  id: number;
  productId: number;
  productName: string;
  label: string;
  /** Puede desmarcarlo quien lo marcó y el dueño. */
  canRemove: boolean;
}

export interface LibraryClip {
  id: number;
  thumbUrl: string | null;
  videoUrl: string;
  /** Vista ligera (MP4 pequeño sin sonido) del almacén propio; `null` si el clip aún no está copiado. */
  previewUrl: string | null;
  /** El modelo y el principio del prompt, solo de los clips propios: de los ajenos (cuerpos de un producto) no se enseñan. */
  model: string | null;
  createdAt: Date;
  prompt: string | null;
  /** Es de la biblioteca de quien mira (solo entonces puede marcarlo como cuerpo). */
  mine: boolean;
  /** El vídeo de PRINCIPAL del que salió, si quien mira ve su producto. */
  video: { id: number; productId: number } | null;
  /** De qué productos (de los que ve quien mira) es cuerpo. */
  bodies: LibraryBody[];
  detectedProduct?: { id: number; name: string } | null;
}

export interface LibraryPage {
  clips: LibraryClip[];
  /** Para pedir la página siguiente (más antiguos); `null` si no hay más. */
  nextCursor: string | null;
  /** Cuántos clips tiene la biblioteca de quien mira. */
  total: number;
  /** Última actualización terminada de su biblioteca (aunque no trajera nada); `null` si no hubo ninguna. */
  refreshedAt: Date | null;
  /** Sin actualizar nunca o hace más de 10 minutos: la pantalla la actualiza sola al abrirse. */
  stale: boolean;
}

/**
 * `<milisegundos>_<id>` del último clip de una página. Uno que no tiene esa forma, o con una fecha
 * o un id que no caben (una fecha posterior al año 3000, un id que no es un entero seguro), es un 400.
 */
function parseCursor(cursor: string | null | undefined): { at: Date; id: number } | null {
  if (cursor === null || cursor === undefined || cursor === "") return null;
  const match = /^(\d{1,16})_([1-9]\d{0,15})$/.exec(cursor);
  if (!match) throw new HttpError(400, BAD_CURSOR);
  const ms = Number(match[1]);
  const id = Number(match[2]);
  if (ms > MAX_CURSOR_MS || !Number.isSafeInteger(id)) throw new HttpError(400, BAD_CURSOR);
  return { at: new Date(ms), id };
}

/**
 * Los clips de la biblioteca de `user`, los más recientes primero, por páginas. Con `productId`
 * (un producto que ve; si no, 404), los clips marcados como cuerpo de ese producto, sean de quien
 * sean. Sale de la caché: no llama a Higgsfield.
 */
export async function listLibrary(
  user: AuthUser,
  options: { cursor?: string | null; limit?: number; productId?: number | null } = {},
  deps: Pick<LibraryDeps, "now"> = {},
): Promise<LibraryPage> {
  const db = getDb();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)));
  const after = parseCursor(options.cursor);
  const productId = options.productId ?? null;
  if (productId !== null) await getProductFor(user, productId);

  const scope =
    productId === null
      ? eq(clips.userId, user.id)
      : sql`exists (select 1 from product_bodies b where b.library_clip_id = ${clips.id} and b.product_id = ${productId})`;
  const older = after ? or(lt(clips.createdAtHf, after.at), and(eq(clips.createdAtHf, after.at), lt(clips.id, after.id))) : undefined;
  const rows = await db
    .select()
    .from(clips)
    .where(and(scope, older))
    .orderBy(desc(clips.createdAtHf), desc(clips.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const lastRow = page[page.length - 1];

  const products = new Map((await listProductsFor(user, "todos")).map((product) => [product.id, productDisplayName(product)]));
  const marks =
    page.length === 0
      ? []
      : await db
          .select()
          .from(bodies)
          .where(inArray(bodies.libraryClipId, page.map((row) => row.id)))
          .orderBy(bodies.id);
  const videoIds = page.flatMap((row) => (row.videoId === null ? [] : [row.videoId]));
  const videos =
    videoIds.length === 0
      ? []
      : await db.select({ id: schema.videos.id, productId: schema.videos.productId }).from(schema.videos).where(inArray(schema.videos.id, videoIds));
  const videoOf = new Map(videos.filter((video) => products.has(video.productId)).map((video) => [video.id, video]));

  const links = await mediaLinks(page.map((row) => row.jobId));
  const [{ total }] = await db.select({ total: count() }).from(clips).where(eq(clips.userId, user.id));
  const { refreshedAt } = await refreshState(user.id);
  const now = deps.now?.() ?? new Date();
  return {
    clips: page.map((row) => ({
      id: row.id,
      thumbUrl: links.get(row.jobId)?.thumb ?? row.thumbUrl,
      videoUrl: links.get(row.jobId)?.original ?? row.videoUrl,
      previewUrl: links.get(row.jobId)?.preview ?? null,
      // De un clip ajeno (cuerpo de un producto que se ve) solo se enseña el vídeo: ni modelo ni prompt.
      model: row.userId === user.id ? row.model : null,
      createdAt: row.createdAtHf,
      prompt: row.userId === user.id ? row.prompt : null,
      mine: row.userId === user.id,
      video: row.videoId === null ? null : (videoOf.get(row.videoId) ?? null),
      detectedProduct: row.detectedProductId !== null && products.has(row.detectedProductId) ? { id: row.detectedProductId, name: products.get(row.detectedProductId)! } : null,
      bodies: marks
        .filter((mark) => mark.libraryClipId === row.id && products.has(mark.productId))
        .map((mark) => ({
          id: mark.id,
          productId: mark.productId,
          productName: products.get(mark.productId)!,
          label: mark.label,
          canRemove: mark.createdBy === user.id || user.role === "dueno",
        })),
    })),
    nextCursor: rows.length > limit && lastRow ? `${lastRow.createdAtHf.getTime()}_${lastRow.id}` : null,
    total,
    refreshedAt,
    stale: refreshedAt === null || now.getTime() - refreshedAt.getTime() > LIBRARY_STALE_MS,
  };
}

/** La reserva de 30 minutos también limita los reintentos de una conexión caducada. */
export async function refreshConnectedLibraries(now: Date = new Date(), higgsfield?: HiggsfieldPort): Promise<void> {
  for (const userId of await listCredentialUsers(HIGGSFIELD_KIND)) {
    const user = await getActiveUser(userId);
    if (!user) continue;
    const state = await refreshState(userId);
    const latest = Math.max(state.startedAt?.getTime() ?? 0, state.refreshedAt?.getTime() ?? 0);
    if (now.getTime() - latest < 30 * 60_000) continue;
    const claim = await getDb().execute(sql`
      insert into settings (key, value) values (${`biblioteca.automatica:${userId}`}, jsonb_build_object('at', ${now.toISOString()}::text))
      on conflict (key) do update set value = excluded.value
      where settings.value->>'at' <= ${new Date(now.getTime() - 30 * 60_000).toISOString()}
      returning key`);
    if (!claim.rows.length) continue;
    try { await refreshLibrary(user, { now: () => now, higgsfield }); }
    catch (error) { console.error(`[biblioteca] No se pudo sincronizar ${userId}:`, error); }
  }
}
