import { and, count, desc, eq, inArray, lt, max, or, sql } from "drizzle-orm";
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
import { getDb, schema } from "@/db/client";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import type { AuthUser } from "@/server/auth";
import { credentialStatus } from "@/server/credentials";
import { HttpError } from "@/server/http";
import { getProductFor, listProductsFor } from "@/server/products";
import { servableClipUrl } from "@/server/videos/clip";

/**
 * Biblioteca de clips: los vídeos terminados del historial de Higgsfield de cada persona, copiados
 * a `library_clips` para que la pantalla cargue al instante. Se lee siempre con la conexión de la
 * persona de la sesión (ninguna función acepta otra persona) y cada una ve solo sus clips; los que
 * están marcados como cuerpo de un producto los ve además quien ve ese producto.
 */

/** Tamaño de cada página que se pide a Higgsfield. */
export const LIBRARY_PAGE_SIZE = 50;
/** Como mucho estas páginas por actualización (la primera carga trae hasta 500 clips). */
export const LIBRARY_MAX_PAGES = 10;
/** Con la caché más vieja que esto (o vacía), la pantalla la actualiza sola al abrirse. */
export const LIBRARY_STALE_MS = 10 * 60 * 1000;
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

const clips = schema.libraryClips;
const bodies = schema.productBodies;

export interface LibraryDeps {
  higgsfield?: HiggsfieldPort;
  now?: () => Date;
}

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
 */
export async function refreshLibrary(user: AuthUser, deps: LibraryDeps = {}): Promise<{ added: number; pages: number }> {
  const { connected, meta } = await credentialStatus(user.id, HIGGSFIELD_KIND);
  if (!connected) throw connectError(new HiggsfieldNotConnectedError());
  if (meta.needsReconnect === true) throw connectError(new HiggsfieldAuthError());

  const db = getDb();
  const port = deps.higgsfield ?? getHiggsfield();
  const now = deps.now?.() ?? new Date();
  const [{ last }] = await db.select({ last: max(clips.fetchedAt) }).from(clips).where(eq(clips.userId, user.id));
  const settledBefore = last ? last.getTime() - LIBRARY_LATE_MARGIN_MS : null;

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
  return { added: rows.filter((row) => !knownIds.has(row.jobId)).length, pages };
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
  model: string;
  createdAt: Date;
  prompt: string | null;
  /** Es de la biblioteca de quien mira (solo entonces puede marcarlo como cuerpo). */
  mine: boolean;
  /** El vídeo de PRINCIPAL del que salió, si quien mira ve su producto. */
  video: { id: number; productId: number } | null;
  /** De qué productos (de los que ve quien mira) es cuerpo. */
  bodies: LibraryBody[];
}

export interface LibraryPage {
  clips: LibraryClip[];
  /** Para pedir la página siguiente (más antiguos); `null` si no hay más. */
  nextCursor: string | null;
  /** Cuántos clips tiene la biblioteca de quien mira. */
  total: number;
  /** Última actualización de su biblioteca; `null` si nunca se ha cargado nada. */
  refreshedAt: Date | null;
  /** Vacía o con más de 10 minutos: la pantalla la actualiza sola al abrirse. */
  stale: boolean;
}

/** `<milisegundos>_<id>` del último clip de una página. */
function parseCursor(cursor: string | null | undefined): { at: Date; id: number } | null {
  if (cursor === null || cursor === undefined || cursor === "") return null;
  const match = /^(\d{1,16})_([1-9]\d{0,15})$/.exec(cursor);
  if (!match) throw new HttpError(400, BAD_CURSOR);
  return { at: new Date(Number(match[1])), id: Number(match[2]) };
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

  const products = new Map((await listProductsFor(user)).map((product) => [product.id, product.name]));
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

  const [state] = await db.select({ total: count(), last: max(clips.fetchedAt) }).from(clips).where(eq(clips.userId, user.id));
  const now = deps.now?.() ?? new Date();
  return {
    clips: page.map((row) => ({
      id: row.id,
      thumbUrl: row.thumbUrl,
      videoUrl: row.videoUrl,
      model: row.model,
      createdAt: row.createdAtHf,
      prompt: row.prompt,
      mine: row.userId === user.id,
      video: row.videoId === null ? null : (videoOf.get(row.videoId) ?? null),
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
    total: state.total,
    refreshedAt: state.last,
    stale: state.total === 0 || state.last === null || now.getTime() - state.last.getTime() > LIBRARY_STALE_MS,
  };
}
