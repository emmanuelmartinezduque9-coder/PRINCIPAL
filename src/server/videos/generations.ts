import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  getHiggsfield,
  HiggsfieldAuthError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  isHiggsfieldError,
  type HfImageRequest,
  type HfJob,
  type HfSubmitResult,
  type HfVideoRequest,
  type HiggsfieldPort,
} from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { makeThumbnail } from "@/server/media/ffmpeg";
import { getProductFor } from "@/server/products";
import { getVideoFor, requireVideoOwner, type Video } from "@/server/videos/videos";

/**
 * Generaciones en Higgsfield: el núcleo del dinero. No sabe nada de imágenes ni de clips: cada
 * tipo registra cómo construir su petición (`registerRequestBuilder`, Tareas 9 y 10).
 *
 * 1. `requestGeneration`: presupuesto y saldo frescos, y la intención (`intent`) confirmada en la
 *    base de datos, con la petición exacta, antes de llamar a nada que gaste. Encola `video.enviar`.
 * 2. `submitGeneration` (el trabajo): se hace con la fila (`intent` → `submitting`) en una sola
 *    sentencia y, si la consigue, comprueba acceso, saldo y precio y envía UNA vez. No usa `runStep`:
 *    `runStep` repite un paso interrumpido, y aquí repetir es cobrar dos veces.
 * 3. `pollGeneration`: pregunta por los trabajos (como mucho cada 8 s) y guarda resultados y miniaturas.
 * 4. Si no se sabe si el envío llegó (`unknown`), `reconcileGeneration` lo busca en el historial
 *    de Higgsfield; nunca se reenvía solo. Solo cuando es seguro que no llegó queda `not_sent`.
 *
 * El Higgsfield que se usa es siempre el de quien creó el vídeo.
 */

export const MAX_REGENERATIONS = 2;
export const SUBMIT_STALE_MS = 2 * 60 * 1000;
export const RECONCILE_GIVE_UP_MS = 10 * 60 * 1000;
export const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
export const POLL_MIN_INTERVAL_MS = 8_000;
/** Una intención que lleva más que esto sin enviarse se vuelve a encolar. */
const INTENT_STALE_MS = 2 * 60 * 1000;
/** Margen al buscar en el historial: lo enviado no puede ser anterior a esto antes del envío. */
const HISTORY_SLACK_MS = 60 * 1000;
const HISTORY_SIZE = 50;
const MAX_REASON = 300;
const RAW_LIMIT = 20_000;
/** Tope de lo que se descarga de un resultado para hacer su miniatura. */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
/** Lado largo de las miniaturas de los resultados. */
const THUMB_MAX_SIDE = 540;

export const SUBMIT_JOB = "video.enviar";

export type GenerationKind = "frame" | "clip";
export type GenerationStatus = "intent" | "submitting" | "submitted" | "done" | "failed" | "not_sent" | "unknown";

export interface GenDeps {
  higgsfield?: HiggsfieldPort;
  fetch?: typeof fetch;
  now?: () => Date;
}

export type RequestBuilder = (
  user: AuthUser,
  video: Video,
  deps: GenDeps,
) => Promise<{ request: HfImageRequest | HfVideoRequest; count: number }>;

export interface GenerationView {
  round: number;
  regenerationsLeft: number;
  approvedResultId: number | null;
  current: {
    id: number;
    status: GenerationStatus;
    error: string | null;
    quotedCredits: number;
    rejectReason: string | null;
    results: Array<{ id: number; ok: boolean; url: string | null; hasThumb: boolean }>;
  } | null;
}

// ───────────────────────── Textos ─────────────────────────

const BUSY = "Ya hay una generación en marcha.";
const CHECKING = "Estamos comprobando con Higgsfield si la petición anterior llegó. No se vuelve a enviar para no cobrarte dos veces.";
const MAX_REACHED = `Has llegado al máximo de ${MAX_REGENERATIONS} regeneraciones.`;
const REJECT_FIRST = "Antes de regenerar, rechaza el resultado anterior y di por qué.";
const BAD_REASON = `Escribe en una línea por qué lo rechazas (máximo ${MAX_REASON} caracteres).`;
const BAD_EXPECTED = "Confirma el precio antes de generar.";
const NOTHING_TO_REJECT = "No hay ningún resultado que rechazar.";
const RESULT_NOT_FOUND = "Resultado no encontrado.";
const THUMB_NOT_FOUND = "Miniatura no encontrada.";
const NO_BUILDER = "Este tipo de generación todavía no está disponible.";
export const GENERATION_ACCESS_LOST = "No se ha enviado: se perdió el acceso al producto.";
const NOT_QUEUED = "No se pudo poner en marcha la generación. Inténtalo de nuevo.";
const PREFLIGHT_FAILED = "No se pudo comprobar la petición antes de enviarla. Puedes volver a generarla.";
export const UNKNOWN_OUTCOME = "No sabemos si la petición llegó a Higgsfield. Lo estamos comprobando; no se vuelve a enviar.";
export const NEVER_ARRIVED = "Higgsfield no llegó a recibir la petición. Puedes volver a generarla.";
export const BLOCKED = "Higgsfield ha bloqueado el resultado por su filtro de contenido o de marcas. Cambia la referencia o el prompt.";
export const JOB_FAILED = "Higgsfield no ha podido generar el resultado.";
const NO_OUTPUT = "Higgsfield no ha devuelto el resultado.";
export const TIMED_OUT = "Higgsfield no ha terminado este trabajo en una hora. Míralo en tu cuenta de Higgsfield.";

const notEnough = (need: number, have: number) => `No tienes créditos suficientes en Higgsfield: hacen falta ${need} y tienes ${have}.`;
const priceChanged = (credits: number) => `El precio ha cambiado: ahora son ${credits} créditos. Revísalo y confirma de nuevo.`;
const rejectedBy = (reason: string) => `Higgsfield no ha aceptado la petición: ${reason}`;

// ───────────────────────── Constructores de peticiones ─────────────────────────

const builders = new Map<GenerationKind, RequestBuilder>();

/** Cómo se construye la petición de un tipo (lo registran la imagen inicial y el clip). */
export function registerRequestBuilder(kind: GenerationKind, build: RequestBuilder): void {
  builders.set(kind, build);
}

async function buildRequest(user: AuthUser, video: Video, kind: GenerationKind, deps: GenDeps) {
  const build = builders.get(kind);
  if (!build) throw new HttpError(503, NO_BUILDER);
  return build(user, video, deps);
}

// ───────────────────────── Utilidades ─────────────────────────

const generations = schema.generations;
const results = schema.generationResults;

type Generation = typeof generations.$inferSelect;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const ACTIVE: GenerationStatus[] = ["intent", "submitting", "submitted"];
const SPENT: GenerationStatus[] = ["submitted", "done", "failed"];

const clock = (deps: GenDeps) => deps.now?.() ?? new Date();
const higgsfieldOf = (deps: GenDeps) => deps.higgsfield ?? getHiggsfield();
const historyType = (kind: string): "image" | "video" => (kind === "frame" ? "image" : "video");

/** Cerrojo de aviso por vídeo para las generaciones ("VGEN", vídeo). */
const generationLock = (tx: Tx, videoId: number) =>
  tx.execute(sql`select pg_advisory_xact_lock(${0x5647454e}::int, ${videoId}::int)`);

/** La respuesta en crudo tal como se guarda: como mucho 20 000 caracteres de JSON. */
function trimRaw(raw: unknown): unknown {
  if (raw === undefined) return null;
  const json = JSON.stringify(raw);
  if (json === undefined) return null;
  return json.length <= RAW_LIMIT ? raw : { recortado: json.slice(0, RAW_LIMIT) };
}

/** Errores de Higgsfield al presupuestar, como respuesta para la persona. */
function asHttp(error: unknown): never {
  if (error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldAuthError) throw new HttpError(409, error.message);
  if (error instanceof HiggsfieldUnavailableError) throw new HttpError(503, error.message);
  throw error;
}

function price(port: HiggsfieldPort, userId: number, kind: string, request: unknown, count: number): Promise<{ credits: number }> {
  return kind === "frame" ? port.quoteImages(userId, request as HfImageRequest, count) : port.quoteVideo(userId, request as HfVideoRequest);
}

/** ¿Quien creó el vídeo ya no puede seguirlo (cuenta desactivada o producto que ya no ve)? */
async function accessLost(userId: number, productId: number): Promise<boolean> {
  const user = await getActiveUser(userId);
  if (!user) return true;
  try {
    await getProductFor(user, productId);
    return false;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return true;
    throw error;
  }
}

/** Pasa la fila de `from` a lo que diga `values`; si ya no estaba en `from`, no toca nada. */
async function moveFrom(id: number, from: GenerationStatus, values: Partial<typeof generations.$inferInsert>): Promise<boolean> {
  const moved = await getDb()
    .update(generations)
    .set(values)
    .where(and(eq(generations.id, id), eq(generations.status, from)))
    .returning({ id: generations.id });
  return moved.length > 0;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Anota un envío ya hecho (y ya cobrado). Si la base de datos falla se reintenta la escritura, no
 * el envío; si no se consigue, la fila se queda en `submitting` y el seguimiento la reconcilia.
 */
async function recordSubmitted(id: number, values: Partial<typeof generations.$inferInsert>): Promise<void> {
  for (let attempt = 0, wait = 200; ; attempt += 1, wait *= 2) {
    try {
      await moveFrom(id, "submitting", values);
      return;
    } catch (error) {
      if (attempt >= 5) throw error;
      await delay(wait);
    }
  }
}

// ───────────────────────── Rondas ─────────────────────────

/** Filas de un tipo en un vídeo, de la más antigua a la más reciente. */
function rowsOf(db: Db | Tx, videoId: number, kind: GenerationKind) {
  return db
    .select()
    .from(generations)
    .where(and(eq(generations.videoId, videoId), eq(generations.kind, kind)))
    .orderBy(asc(generations.id));
}

/**
 * La ronda que tocaría ahora, o el 409 que lo impide: una en marcha o en duda, el máximo de
 * regeneraciones, o la ronda anterior sin rechazar (salvo que fallara).
 */
function nextRound(rows: Generation[]): number {
  if (rows.some((row) => row.status === "unknown")) throw new HttpError(409, CHECKING);
  if (rows.some((row) => ACTIVE.includes(row.status as GenerationStatus))) throw new HttpError(409, BUSY);
  const spent = rows.filter((row) => SPENT.includes(row.status as GenerationStatus));
  const round = spent.length + 1;
  if (round > 1 + MAX_REGENERATIONS) throw new HttpError(409, MAX_REACHED);
  if (round > 1) {
    const last = spent.reduce((a, b) => (b.round > a.round ? b : a));
    if (last.status !== "failed" && !last.rejectReason) throw new HttpError(409, REJECT_FIRST);
  }
  return round;
}

// ───────────────────────── Pedir ─────────────────────────

/** Presupuesto de la siguiente ronda, con el saldo de quien creó el vídeo. No gasta nada. */
export async function quoteGeneration(
  user: AuthUser,
  videoId: number,
  kind: GenerationKind,
  deps: GenDeps = {},
): Promise<{ credits: number; balance: number; enough: boolean; round: number; regenerationsLeft: number }> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const round = nextRound(await rowsOf(getDb(), video.id, kind));
  const { request, count } = await buildRequest(user, video, kind, deps);
  const port = higgsfieldOf(deps);
  const [{ credits }, { credits: balance }] = await Promise.all([
    price(port, user.id, kind, request, count),
    port.balance(user.id),
  ]).catch(asHttp);
  return { credits, balance, enough: balance >= credits, round, regenerationsLeft: 1 + MAX_REGENERATIONS - round };
}

/**
 * Apunta una generación (`intent`) con la petición exacta y la encola. Solo quien creó el vídeo,
 * con saldo para el presupuesto fresco y si el precio no ha subido desde el que vio
 * (`expectedCredits`). Dos peticiones a la vez crean una sola (cerrojo por vídeo e índice único).
 */
export async function requestGeneration(
  user: AuthUser,
  videoId: number,
  kind: GenerationKind,
  input: { expectedCredits: number },
  deps: GenDeps = {},
): Promise<{ generationId: number }> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (!Number.isSafeInteger(input.expectedCredits) || input.expectedCredits < 0) throw new HttpError(400, BAD_EXPECTED);
  nextRound(await rowsOf(getDb(), video.id, kind));

  const { request, count } = await buildRequest(user, video, kind, deps);
  const port = higgsfieldOf(deps);
  const [{ credits }, { credits: balance }] = await Promise.all([
    price(port, user.id, kind, request, count),
    port.balance(user.id),
  ]).catch(asHttp);
  if (credits > input.expectedCredits) throw new HttpError(409, priceChanged(credits));
  if (balance < credits) throw new HttpError(409, notEnough(credits, balance));

  let generationId: number;
  try {
    generationId = await getDb().transaction(async (tx) => {
      await generationLock(tx, video.id);
      const round = nextRound(await rowsOf(tx, video.id, kind));
      const [row] = await tx
        .insert(generations)
        .values({ videoId: video.id, kind, round, status: "intent", userId: video.createdBy, request, count, quotedCredits: credits, intentAt: clock(deps) })
        .returning({ id: generations.id });
      return row.id;
    });
  } catch (error) {
    // Otra petición se adelantó con la misma ronda.
    if ((error as { code?: string; cause?: { code?: string } }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new HttpError(409, BUSY);
    }
    throw error;
  }

  try {
    await enqueueJob(SUBMIT_JOB, { userId: video.createdBy, productId: video.productId }, { generationId });
  } catch (error) {
    // Nada se ha enviado: si el trabajo llegara a la cola, ya no encontraría la fila en `intent`.
    await moveFrom(generationId, "intent", { status: "not_sent", error: NOT_QUEUED, finishedAt: clock(deps) });
    throw error;
  }
  return { generationId };
}

// ───────────────────────── Enviar (una vez) ─────────────────────────

/** Por qué no se debe enviar (o `null` si se puede). Cualquier fallo aquí también impide el envío. */
async function preflight(row: Generation, port: HiggsfieldPort): Promise<string | null> {
  const [video] = await getDb()
    .select({ productId: schema.videos.productId, createdBy: schema.videos.createdBy })
    .from(schema.videos)
    .where(eq(schema.videos.id, row.videoId));
  if (!video || video.createdBy !== row.userId || (await accessLost(row.userId, video.productId))) return GENERATION_ACCESS_LOST;
  const { credits: balance } = await port.balance(row.userId);
  if (balance < row.quotedCredits) return notEnough(row.quotedCredits, balance);
  const { credits } = await price(port, row.userId, row.kind, row.request, row.count);
  if (credits > row.quotedCredits) return priceChanged(credits);
  return null;
}

/**
 * El trabajo `video.enviar`. Solo quien pasa la fila de `intent` a `submitting` sigue: dos trabajos
 * para la misma generación (o uno repetido) envían una sola vez. Higgsfield dice que no, o el
 * permiso no vale → `not_sent`; cualquier otro fallo del envío → `unknown` (se reconcilia, no se
 * repite).
 */
export async function submitGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const [row] = await getDb()
    .update(generations)
    .set({ status: "submitting", submitStartedAt: now })
    .where(and(eq(generations.id, generationId), eq(generations.status, "intent")))
    .returning();
  if (!row) return;
  const port = higgsfieldOf(deps);

  let blocked: string | null;
  try {
    blocked = await preflight(row, port);
  } catch (error) {
    if (!isHiggsfieldError(error)) console.error(`[generaciones] Fallo al comprobar la generación ${row.id} antes de enviarla:`, error);
    blocked = isHiggsfieldError(error) ? error.message : PREFLIGHT_FAILED;
  }
  if (blocked) {
    await moveFrom(row.id, "submitting", { status: "not_sent", error: blocked, finishedAt: clock(deps) });
    return;
  }

  let sent: HfSubmitResult;
  try {
    sent =
      row.kind === "frame"
        ? await port.submitImages(row.userId, row.request as HfImageRequest, row.count)
        : await port.submitVideo(row.userId, row.request as HfVideoRequest);
  } catch (error) {
    const finishedAt = clock(deps);
    if (error instanceof HiggsfieldRejectedError) {
      await moveFrom(row.id, "submitting", { status: "not_sent", error: rejectedBy(error.reason), raw: trimRaw(error.raw), finishedAt });
    } else if (error instanceof HiggsfieldAuthError || error instanceof HiggsfieldNotConnectedError) {
      await moveFrom(row.id, "submitting", { status: "not_sent", error: error.message, finishedAt });
    } else {
      if (!(error instanceof HiggsfieldUnknownOutcomeError)) console.error(`[generaciones] Envío ${row.id} con resultado desconocido:`, error);
      const raw = error instanceof HiggsfieldUnknownOutcomeError ? trimRaw(error.raw) : null;
      await moveFrom(row.id, "submitting", { status: "unknown", error: UNKNOWN_OUTCOME, raw });
    }
    return;
  }

  if (sent.jobIds.length === 0) {
    await moveFrom(row.id, "submitting", {
      status: "not_sent",
      error: rejectedBy(sent.rejected.join(" · ") || "sin motivo"),
      raw: trimRaw(sent.raw),
      finishedAt: clock(deps),
    });
    return;
  }
  const accepted = Math.min(sent.jobIds.length, row.count);
  await recordSubmitted(row.id, {
    status: "submitted",
    jobIds: sent.jobIds.slice(0, row.count),
    submittedAt: clock(deps),
    creditsSpent: Math.ceil((row.quotedCredits * accepted) / row.count),
    raw: trimRaw(sent.raw),
    error: null,
  });
  try {
    await pollGeneration(row.id, deps);
  } catch (error) {
    console.error(`[generaciones] No se pudo consultar la generación ${row.id} recién enviada:`, error);
  }
}

// ───────────────────────── Seguimiento ─────────────────────────

/** Descarga un resultado (https o `data:`) con tope de tiempo y tamaño. */
async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const protocol = new URL(url).protocol;
  if (protocol !== "https:" && protocol !== "data:") throw new Error("Dirección de resultado no válida.");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`La descarga respondió ${response.status}.`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error("El resultado es demasiado grande.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("El resultado es demasiado grande.");
  return bytes;
}

/** La miniatura de un resultado; si no se puede hacer, `null` (el resultado se guarda sin ella). */
async function thumbnailOf(url: string, kind: string, deps: GenDeps): Promise<Buffer | null> {
  try {
    return await makeThumbnail(await download(url, deps.fetch ?? fetch), kind === "frame" ? "image" : "video", THUMB_MAX_SIDE);
  } catch (error) {
    console.warn(`[generaciones] Sin miniatura para un resultado: ${error instanceof Error ? error.message : "desconocido"}`);
    return null;
  }
}

function jobError(job: HfJob): string | null {
  if (job.status === "done") return job.urls.length > 0 ? null : NO_OUTPUT;
  if (job.failure === "nsfw" || job.failure === "ip_detected") return BLOCKED;
  return job.error ? `${JOB_FAILED} ${job.error}`.slice(0, 1_000) : JOB_FAILED;
}

/**
 * Pregunta a Higgsfield por los trabajos de una generación enviada, como mucho una vez cada 8 s
 * (el turno se reserva en la base de datos). Cuando todos han terminado guarda los resultados con
 * su miniatura y la generación queda `done` (algún resultado bueno) o `failed`.
 */
export async function pollGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const [row] = await getDb()
    .update(generations)
    .set({ lastPolledAt: now })
    .where(
      and(
        eq(generations.id, generationId),
        eq(generations.status, "submitted"),
        or(isNull(generations.lastPolledAt), lt(generations.lastPolledAt, new Date(now.getTime() - POLL_MIN_INTERVAL_MS))),
      ),
    )
    .returning();
  if (!row) return;

  let jobs: HfJob[];
  try {
    jobs = await higgsfieldOf(deps).jobs(row.userId, row.jobIds, 0);
  } catch (error) {
    console.warn(`[generaciones] No se pudo consultar la generación ${row.id}: ${error instanceof Error ? error.message : "desconocido"}`);
    return;
  }
  if (jobs.length < row.jobIds.length || jobs.some((job) => job.status === "pending")) return;

  const found = await Promise.all(
    jobs.map(async (job, index) => {
      const ok = job.status === "done" && job.urls.length > 0;
      const thumb = ok ? await thumbnailOf(job.urls[0], row.kind, deps) : null;
      return {
        generationId: row.id,
        index,
        jobId: job.jobId,
        ok,
        url: job.urls[0] ?? null,
        error: jobError(job),
        thumbMime: thumb ? "image/jpeg" : null,
        thumb,
      };
    }),
  );
  const anyOk = found.some((result) => result.ok);
  const blocked = jobs.some((job) => job.failure === "nsfw" || job.failure === "ip_detected");
  await getDb().transaction(async (tx) => {
    const [finished] = await tx
      .update(generations)
      .set({ status: anyOk ? "done" : "failed", error: anyOk ? null : blocked ? BLOCKED : JOB_FAILED, finishedAt: clock(deps) })
      .where(and(eq(generations.id, row.id), eq(generations.status, "submitted")))
      .returning({ id: generations.id });
    if (finished) await tx.insert(results).values(found).onConflictDoNothing();
  });
}

/** Consulta las generaciones enviadas de un vídeo, si quien mira es quien lo creó (al abrir el vídeo). */
export async function pollVideoGenerations(user: AuthUser, videoId: number, deps: GenDeps = {}): Promise<void> {
  const video = await getVideoFor(user, videoId);
  if (video.createdBy !== user.id) return;
  const pending = await getDb()
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.videoId, video.id), eq(generations.status, "submitted")));
  for (const { id } of pending) {
    try {
      await pollGeneration(id, deps);
    } catch (error) {
      console.error(`[generaciones] No se pudo consultar la generación ${id}:`, error);
    }
  }
}

// ───────────────────────── Reconciliar ─────────────────────────

/**
 * Una generación en duda (`unknown`): busca en el historial de Higgsfield lo enviado con el mismo
 * prompt y modelo, que no sea ya de otra generación de la persona y, si trae fecha, no anterior al
 * envío (con un minuto de margen). Si lo encuentra, lo adopta (`submitted`). Si no, y han pasado
 * 10 minutos, queda `not_sent`. Si el historial no se puede leer, no cambia nada.
 */
export async function reconcileGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.status, "unknown")));
  if (!row) return;

  let history;
  try {
    history = await higgsfieldOf(deps).history(row.userId, historyType(row.kind), HISTORY_SIZE);
  } catch (error) {
    console.warn(`[generaciones] Sin historial para reconciliar la generación ${row.id}: ${error instanceof Error ? error.message : "desconocido"}`);
    return;
  }

  const request = row.request as { model: string; prompt: string };
  const others = await getDb()
    .select({ jobIds: generations.jobIds })
    .from(generations)
    .where(and(eq(generations.userId, row.userId), ne(generations.id, row.id)));
  const taken = new Set(others.flatMap((other) => other.jobIds));
  const since = (row.submitStartedAt ?? row.intentAt).getTime() - HISTORY_SLACK_MS;
  const matches = history
    .filter(
      (item) =>
        item.model === request.model &&
        item.prompt?.trim() === request.prompt.trim() &&
        !taken.has(item.jobId) &&
        (item.createdAt === null || item.createdAt.getTime() >= since),
    )
    .slice(0, row.count);

  if (matches.length > 0) {
    await moveFrom(row.id, "unknown", {
      status: "submitted",
      jobIds: matches.map((item) => item.jobId),
      submittedAt: now,
      creditsSpent: Math.ceil((row.quotedCredits * matches.length) / row.count),
      error: null,
      raw: trimRaw({ adoptadosDelHistorial: matches }),
    });
    return;
  }
  if ((row.submitStartedAt ?? row.intentAt).getTime() < now.getTime() - RECONCILE_GIVE_UP_MS) {
    await moveFrom(row.id, "unknown", { status: "not_sent", error: NEVER_ARRIVED, finishedAt: now });
  }
}

// ───────────────────────── Barrido ─────────────────────────

async function each(ids: number[], what: string, fn: (id: number) => Promise<void>): Promise<void> {
  for (const id of ids) {
    try {
      await fn(id);
    } catch (error) {
      console.error(`[generaciones] ${what} ${id}:`, error);
    }
  }
}

/**
 * Para el seguimiento de cada minuto: envíos cortados a mitad → `unknown`; intenciones sin enviar
 * → otra vez a la cola (o `not_sent` si quien la pidió ya no tiene acceso); dudas → reconciliar;
 * enviadas → consultar, y en error si no terminan en una hora (sin reenviarse).
 */
export async function sweepGenerations(deps: GenDeps = {}): Promise<void> {
  const db = getDb();
  const now = clock(deps);
  const ago = (ms: number) => new Date(now.getTime() - ms);

  await db
    .update(generations)
    .set({ status: "unknown", error: UNKNOWN_OUTCOME })
    .where(and(eq(generations.status, "submitting"), lt(generations.submitStartedAt, ago(SUBMIT_STALE_MS))));

  const intents = await db
    .select({ id: generations.id, userId: generations.userId, productId: schema.videos.productId })
    .from(generations)
    .innerJoin(schema.videos, eq(schema.videos.id, generations.videoId))
    .where(and(eq(generations.status, "intent"), lt(generations.intentAt, ago(INTENT_STALE_MS))));
  for (const intent of intents) {
    try {
      if (await accessLost(intent.userId, intent.productId)) {
        await moveFrom(intent.id, "intent", { status: "not_sent", error: GENERATION_ACCESS_LOST, finishedAt: now });
      } else {
        await enqueueJob(SUBMIT_JOB, { userId: intent.userId, productId: intent.productId }, { generationId: intent.id });
      }
    } catch (error) {
      console.error(`[generaciones] No se pudo volver a encolar la generación ${intent.id}:`, error);
    }
  }

  const ids = async (status: GenerationStatus) =>
    (await db.select({ id: generations.id }).from(generations).where(eq(generations.status, status))).map((row) => row.id);

  await each(await ids("unknown"), "No se pudo reconciliar la generación", (id) => reconcileGeneration(id, deps));
  await each(await ids("submitted"), "No se pudo consultar la generación", async (id) => {
    await pollGeneration(id, deps);
    await db
      .update(generations)
      .set({ status: "failed", error: TIMED_OUT, finishedAt: now })
      .where(and(eq(generations.id, id), eq(generations.status, "submitted"), lt(generations.submittedAt, ago(GENERATION_TIMEOUT_MS))));
  });
}

// ───────────────────────── Rechazar, aprobar, ver ─────────────────────────

/**
 * Rechaza la última ronda terminada de un tipo con un motivo de una línea (hace falta para
 * regenerar). Si su resultado estaba aprobado, deja de estarlo.
 */
export async function rejectRound(user: AuthUser, videoId: number, kind: GenerationKind, reason: string): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text || /[\r\n]/.test(text) || text.length > MAX_REASON) throw new HttpError(400, BAD_REASON);

  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    const rows = await rowsOf(tx, video.id, kind);
    if (rows.some((row) => row.status === "unknown")) throw new HttpError(409, CHECKING);
    if (rows.some((row) => ACTIVE.includes(row.status as GenerationStatus))) throw new HttpError(409, BUSY);
    const finished = rows.filter((row) => row.status === "done" || row.status === "failed");
    if (finished.length === 0) throw new HttpError(409, NOTHING_TO_REJECT);
    const last = finished.reduce((a, b) => (b.round > a.round ? b : a));
    await tx.update(generations).set({ rejectReason: text }).where(eq(generations.id, last.id));

    const column = kind === "frame" ? schema.videos.approvedFrameResultId : schema.videos.approvedClipResultId;
    const field = kind === "frame" ? "approvedFrameResultId" : "approvedClipResultId";
    await tx
      .update(schema.videos)
      .set({ [field]: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.videos.id, video.id),
          inArray(column, tx.select({ id: results.id }).from(results).where(eq(results.generationId, last.id))),
        ),
      );
  });
}

/** Aprueba un resultado bueno de una generación terminada de ese tipo y de ese vídeo. Si no, 404. */
export async function approveResult(user: AuthUser, videoId: number, kind: GenerationKind, resultId: number): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (!Number.isSafeInteger(resultId) || resultId <= 0) throw new HttpError(404, RESULT_NOT_FOUND);
  const [found] = await getDb()
    .select({ id: results.id })
    .from(results)
    .innerJoin(generations, eq(generations.id, results.generationId))
    .where(
      and(
        eq(results.id, resultId),
        eq(results.ok, true),
        eq(generations.videoId, video.id),
        eq(generations.kind, kind),
        eq(generations.status, "done"),
      ),
    );
  if (!found) throw new HttpError(404, RESULT_NOT_FOUND);
  await getDb()
    .update(schema.videos)
    .set({ ...(kind === "frame" ? { approvedFrameResultId: found.id } : { approvedClipResultId: found.id }), updatedAt: new Date() })
    .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)));
}

/** La miniatura (JPEG) de un resultado, para quien ve su vídeo. Si no, 404. */
export async function readResultThumb(user: AuthUser, resultId: number): Promise<{ mime: string; data: Buffer }> {
  const missing = new HttpError(404, THUMB_NOT_FOUND);
  if (!Number.isSafeInteger(resultId) || resultId <= 0) throw missing;
  const [found] = await getDb()
    .select({ videoId: generations.videoId, mime: results.thumbMime, data: results.thumb })
    .from(results)
    .innerJoin(generations, eq(generations.id, results.generationId))
    .where(eq(results.id, resultId));
  if (!found) throw missing;
  try {
    await getVideoFor(user, found.videoId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw missing;
    throw error;
  }
  if (!found.mime || !found.data) throw missing;
  return { mime: found.mime, data: Buffer.from(found.data) };
}

/** Estado de un tipo de generación en un vídeo, para la pantalla. */
export async function generationView(video: Video, kind: GenerationKind): Promise<GenerationView> {
  const rows = await rowsOf(getDb(), video.id, kind);
  const spent = rows.filter((row) => SPENT.includes(row.status as GenerationStatus)).length;
  const current = rows.at(-1) ?? null;
  const list = current
    ? await getDb()
        .select({ id: results.id, ok: results.ok, url: results.url, hasThumb: sql<boolean>`${results.thumb} is not null` })
        .from(results)
        .where(eq(results.generationId, current.id))
        .orderBy(asc(results.index))
    : [];
  return {
    round: current?.round ?? 0,
    regenerationsLeft: Math.max(0, 1 + MAX_REGENERATIONS - Math.max(spent, 1)),
    approvedResultId: kind === "frame" ? video.approvedFrameResultId : video.approvedClipResultId,
    current: current
      ? {
          id: current.id,
          status: current.status as GenerationStatus,
          error: current.error,
          quotedCredits: current.quotedCredits,
          rejectReason: current.rejectReason,
          results: list,
        }
      : null,
  };
}
