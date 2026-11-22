import { and, asc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  getHiggsfield,
  HiggsfieldAuthError,
  HiggsfieldConnectError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  isHiggsfieldError,
  type HfHistoryItem,
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
 *    sentencia y, si la consigue, comprueba acceso, saldo y precio y envía UNA vez, todo dentro de
 *    un plazo más corto que el que usa el seguimiento para dar un envío por perdido. No usa
 *    `runStep`: `runStep` repite un paso interrumpido, y aquí repetir es cobrar dos veces.
 * 3. `pollGeneration`: pregunta (barato) por los trabajos, como mucho cada 8 s; cuando todos han
 *    terminado encola `video.finalizar`, que descarga los resultados y hace las miniaturas con su
 *    propia reserva. Ninguna petición de la web descarga nada.
 * 4. Si no se sabe si el envío llegó (`unknown`), `reconcileGeneration` lo busca en el historial
 *    de Higgsfield; nunca se reenvía solo. Solo queda `not_sent` cuando el historial prueba que no llegó.
 *
 * El Higgsfield que se usa es siempre el de quien creó el vídeo.
 */

export const MAX_REGENERATIONS = 2;
export const SUBMIT_STALE_MS = 2 * 60 * 1000;
export const RECONCILE_GIVE_UP_MS = 10 * 60 * 1000;
export const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
export const POLL_MIN_INTERVAL_MS = 8_000;
/** Plazo de todo el envío (comprobaciones incluidas) desde que se hace con la fila: menor que `SUBMIT_STALE_MS`. */
export const SUBMIT_DEADLINE_MS = 100 * 1000;
/** Lo que se reserva del plazo para la llamada que envía: si las comprobaciones se comen más, no se envía. */
const MIN_SEND_WINDOW_MS = 30 * 1000;
/** Una intención que lleva más que esto sin enviarse se vuelve a encolar… */
const INTENT_STALE_MS = 2 * 60 * 1000;
/** …y pasado esto ya no se envía (la persona la verá «no enviada» y la puede volver a pedir). */
export const INTENT_EXPIRED_MS = 15 * 60 * 1000;
/** Reserva del trabajo que descarga los resultados: más que la descarga y la miniatura. */
export const FINALIZE_LEASE_MS = 10 * 60 * 1000;
/** Cuánto se sigue mirando una generación fallida por tope o porque Higgsfield no encontraba sus trabajos. */
export const LATE_RECHECK_MS = 6 * 60 * 60 * 1000;
const LATE_POLL_INTERVAL_MS = 5 * 60 * 1000;
/** Margen al buscar en el historial: lo enviado no puede ser anterior a esto antes del envío. */
const HISTORY_SLACK_MS = 60 * 1000;
const HISTORY_PAGE_SIZE = 50;
const HISTORY_MAX_PAGES = 5;
const MAX_REASON = 300;
const RAW_LIMIT = 20_000;
/** Tope de lo que se descarga de un resultado para hacer su miniatura. */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
/** Lado largo de las miniaturas de los resultados. */
const THUMB_MAX_SIDE = 540;

export const SUBMIT_JOB = "video.enviar";
export const FINALIZE_JOB = "video.finalizar";

export type GenerationKind = "frame" | "clip";
export type GenerationStatus = "intent" | "submitting" | "submitted" | "done" | "failed" | "not_sent" | "unknown";

export interface GenDeps {
  higgsfield?: HiggsfieldPort;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Solo para las pruebas: otro plazo para el envío (por defecto `SUBMIT_DEADLINE_MS`). */
  submitDeadlineMs?: number;
}

/**
 * Construye la petición de un tipo. `snapshot` (opcional): las columnas del vídeo en las que se
 * apoyó (p. ej. `{ approvedFrameResultId, referenceMediaId, videoPrompt, frameUse }`). Al apuntar la
 * generación, ya con el cerrojo del vídeo, se vuelven a leer; si alguna cambió entretanto (otra
 * pestaña rechazó o aprobó), no se apunta nada (409).
 */
export type RequestBuilder = (
  user: AuthUser,
  video: Video,
  deps: GenDeps,
) => Promise<{ request: HfImageRequest | HfVideoRequest; count: number; snapshot?: Partial<Video> }>;

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
export const VIDEO_CHANGED = "El vídeo ha cambiado mientras se preparaba el envío. Vuelve a intentarlo.";
const NOTHING_TO_REJECT = "No hay ningún resultado que rechazar.";
const RESULT_NOT_FOUND = "Resultado no encontrado.";
const THUMB_NOT_FOUND = "Miniatura no encontrada.";
const NO_BUILDER = "Este tipo de generación todavía no está disponible.";
export const GENERATION_ACCESS_LOST = "No se ha enviado: se perdió el acceso al producto.";
const NOT_QUEUED = "No se pudo poner en marcha la generación. Inténtalo de nuevo.";
const PREFLIGHT_FAILED = "No se pudo comprobar la petición antes de enviarla. Puedes volver a generarla.";
export const SEND_TOO_SLOW = "Higgsfield ha tardado demasiado en responder antes del envío y no se ha enviado nada. Vuelve a intentarlo.";
export const INTENT_EXPIRED = "La petición no llegó a enviarse a tiempo y ya no se envía. Vuelve a pedirla.";
export const UNKNOWN_OUTCOME = "No sabemos si la petición llegó a Higgsfield. Lo estamos comprobando; no se vuelve a enviar.";
export const CANNOT_CONFIRM =
  "No podemos confirmar con Higgsfield si la petición llegó. Mira tu cuenta de Higgsfield: no se vuelve a enviar para no cobrarte dos veces.";
export const NEVER_ARRIVED = "Higgsfield no llegó a recibir la petición. Puedes volver a generarla.";
export const BLOCKED = "Higgsfield ha bloqueado el resultado por su filtro de contenido o de marcas. Cambia la referencia o el prompt.";
export const JOB_FAILED = "Higgsfield no ha podido generar el resultado.";
export const JOB_NOT_FOUND = "Higgsfield no encuentra este trabajo. Lo seguiremos mirando unas horas; también puedes verlo en tu cuenta de Higgsfield.";
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
type GenerationChanges = Partial<typeof generations.$inferInsert>;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const ACTIVE: GenerationStatus[] = ["intent", "submitting", "submitted"];
const SPENT: GenerationStatus[] = ["submitted", "done", "failed"];

const clock = (deps: GenDeps) => deps.now?.() ?? new Date();
const higgsfieldOf = (deps: GenDeps) => deps.higgsfield ?? getHiggsfield();
const historyType = (kind: string): "image" | "video" => (kind === "frame" ? "image" : "video");
const nameOf = (error: unknown) => (error instanceof Error ? error.message : "desconocido");

/** Cerrojo de aviso por vídeo para las generaciones ("VGEN", vídeo). El 0 se usa para adoptar trabajos del historial. */
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
  if (error instanceof HiggsfieldRejectedError) throw new HttpError(409, rejectedBy(error.reason));
  if (error instanceof HiggsfieldUnavailableError) throw new HttpError(503, error.message);
  throw error;
}

function price(port: HiggsfieldPort, userId: number, kind: string, request: unknown, count: number) {
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

/** Pasa la fila de `from` a lo que diga `values`; si ya no estaba en `from`, no toca nada y devuelve `false`. */
async function moveFrom(id: number, from: GenerationStatus, values: GenerationChanges): Promise<boolean> {
  const moved = await getDb()
    .update(generations)
    .set(values)
    .where(and(eq(generations.id, id), eq(generations.status, from)))
    .returning({ id: generations.id });
  return moved.length > 0;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repite una escritura (nunca el envío) si la base de datos falla. */
async function retryWrite<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0, wait = 200; ; attempt += 1, wait *= 2) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 5) throw error;
      await delay(wait);
    }
  }
}

/** `fn` o `"timeout"` si no termina en `ms`; la promesa sigue viva (quien llama decide qué hacer con ella). */
async function within<T>(promise: Promise<T>, ms: number): Promise<{ value: T } | { error: unknown } | "timeout"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise.then((value) => ({ value }), (error: unknown) => ({ error })), timeout]);
  } finally {
    clearTimeout(timer);
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

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505";

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
 * (`expectedCredits`). Dos peticiones a la vez crean una sola (cerrojo por vídeo e índices únicos).
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

  const { request, count, snapshot } = await buildRequest(user, video, kind, deps);
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
      if (snapshot && Object.keys(snapshot).length > 0) {
        const [current] = await tx.select().from(schema.videos).where(eq(schema.videos.id, video.id));
        const changed =
          !current ||
          (Object.keys(snapshot) as Array<keyof Video>).some((key) => JSON.stringify(current[key]) !== JSON.stringify(snapshot[key]));
        if (changed) throw new HttpError(409, VIDEO_CHANGED);
      }
      const round = nextRound(await rowsOf(tx, video.id, kind));
      const [row] = await tx
        .insert(generations)
        .values({ videoId: video.id, kind, round, status: "intent", userId: video.createdBy, request, count, quotedCredits: credits, intentAt: clock(deps) })
        .returning({ id: generations.id });
      return row.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, BUSY); // otra petición se adelantó
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

/** Por qué no se debe enviar (o `null` si se puede), y el `quote_ref` del presupuesto fresco. */
async function preflight(row: Generation, port: HiggsfieldPort): Promise<{ blocked: string | null; quoteRef: string | null }> {
  const [video] = await getDb()
    .select({ productId: schema.videos.productId, createdBy: schema.videos.createdBy })
    .from(schema.videos)
    .where(eq(schema.videos.id, row.videoId));
  if (!video || video.createdBy !== row.userId || (await accessLost(row.userId, video.productId))) {
    return { blocked: GENERATION_ACCESS_LOST, quoteRef: null };
  }
  const { credits: balance } = await port.balance(row.userId);
  if (balance < row.quotedCredits) return { blocked: notEnough(row.quotedCredits, balance), quoteRef: null };
  const fresh = await price(port, row.userId, row.kind, row.request, row.count);
  if (fresh.credits > row.quotedCredits) return { blocked: priceChanged(fresh.credits), quoteRef: null };
  return { blocked: null, quoteRef: fresh.quoteRef };
}

/** Deja `not_sent` un envío que seguro que no llegó, esté aún en `submitting` o ya en `unknown`. */
async function settleNotSent(id: number, values: GenerationChanges): Promise<void> {
  const change = { ...values, status: "not_sent" as const };
  if (await retryWrite(() => moveFrom(id, "submitting", change))) return;
  if (await retryWrite(() => moveFrom(id, "unknown", change))) return;
  console.error(`[generaciones] La generación ${id} no estaba en envío ni en duda al anotar que no se envió.`);
}

/**
 * Anota un envío ya hecho (y ya cobrado): desde `submitting` o, si el seguimiento ya la dio por
 * dudosa, desde `unknown`. Si la fila ya no está en ninguno de los dos, lo dice bien alto con los
 * trabajos (para buscarlos a mano) y devuelve `false`.
 */
async function recordSubmitted(row: Generation, sent: HfSubmitResult, deps: GenDeps): Promise<boolean> {
  const jobIds = sent.jobIds.slice(0, row.count);
  const values: GenerationChanges = {
    status: "submitted",
    jobIds,
    submittedAt: clock(deps),
    creditsSpent: Math.ceil((row.quotedCredits * jobIds.length) / row.count),
    raw: trimRaw(sent.raw),
    error: null,
  };
  if (await retryWrite(() => moveFrom(row.id, "submitting", values))) return true;
  if (await retryWrite(() => moveFrom(row.id, "unknown", values))) return true;
  // La reconciliación pudo adoptarlos ya del historial: entonces no se ha perdido nada.
  const [current] = await getDb().select({ jobIds: generations.jobIds }).from(generations).where(eq(generations.id, row.id));
  if (current && jobIds.every((jobId) => current.jobIds.includes(jobId))) return false;
  console.error(`[generaciones] Envío ${row.id} hecho pero sin fila donde anotarlo. Trabajos de Higgsfield: ${jobIds.join(", ")}`);
  return false;
}

/** Lo que pasó con la llamada que gasta, una vez se sabe (aunque llegue tarde). */
async function settleSend(row: Generation, outcome: { value: HfSubmitResult } | { error: unknown }, deps: GenDeps): Promise<boolean> {
  const finishedAt = clock(deps);
  if ("value" in outcome) {
    const sent = outcome.value;
    if (sent.jobIds.length > 0) return recordSubmitted(row, sent, deps);
    await settleNotSent(row.id, { error: rejectedBy(sent.rejected.join(" · ") || "sin motivo"), raw: trimRaw(sent.raw), finishedAt });
    return false;
  }
  const error = outcome.error;
  if (error instanceof HiggsfieldRejectedError) {
    await settleNotSent(row.id, { error: rejectedBy(error.reason), raw: trimRaw(error.raw), finishedAt });
  } else if (error instanceof HiggsfieldAuthError || error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldConnectError) {
    await settleNotSent(row.id, { error: error.message, finishedAt });
  } else {
    if (!(error instanceof HiggsfieldUnknownOutcomeError)) console.error(`[generaciones] Envío ${row.id} con resultado desconocido:`, error);
    const raw = error instanceof HiggsfieldUnknownOutcomeError ? trimRaw(error.raw) : null;
    await retryWrite(() => moveFrom(row.id, "submitting", { status: "unknown", error: UNKNOWN_OUTCOME, raw }));
  }
  return false;
}

/**
 * El trabajo `video.enviar`. Solo quien pasa la fila de `intent` a `submitting` sigue: dos trabajos
 * para la misma generación (o uno repetido) envían una sola vez.
 *
 * Todo va dentro de `SUBMIT_DEADLINE_MS` desde que se hace con la fila (menos que lo que espera el
 * seguimiento para dar el envío por perdido). Si las comprobaciones tardan demasiado, no se envía.
 * Justo antes de la llamada que gasta se vuelve a sellar `submit_started_at`. Si la llamada no
 * responde a tiempo, la fila queda `unknown` y, si la respuesta llega después, se anota igual
 * (`unknown` → `submitted` o `not_sent`): los identificadores no se pierden.
 */
export async function submitGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const claimedAt = clock(deps);
  const deadlineMs = deps.submitDeadlineMs ?? SUBMIT_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  const [row] = await getDb()
    .update(generations)
    .set({ status: "submitting", submitStartedAt: claimedAt })
    .where(and(eq(generations.id, generationId), eq(generations.status, "intent")))
    .returning();
  if (!row) return;
  if (row.intentAt.getTime() < claimedAt.getTime() - INTENT_EXPIRED_MS) {
    await settleNotSent(row.id, { error: INTENT_EXPIRED, finishedAt: claimedAt });
    return;
  }
  const port = higgsfieldOf(deps);

  // Comprobaciones previas: cualquier fallo (o tardar demasiado) impide el envío.
  let blocked: string | null;
  let quoteRef: string | null = null;
  const checked = await within(preflight(row, port), deadline - Math.min(MIN_SEND_WINDOW_MS, deadlineMs / 3) - Date.now());
  if (checked === "timeout") blocked = SEND_TOO_SLOW;
  else if ("error" in checked) {
    if (!isHiggsfieldError(checked.error)) console.error(`[generaciones] Fallo al comprobar la generación ${row.id} antes de enviarla:`, checked.error);
    blocked = checked.error instanceof HiggsfieldRejectedError ? rejectedBy(checked.error.reason) : isHiggsfieldError(checked.error) ? checked.error.message : PREFLIGHT_FAILED;
  } else ({ blocked, quoteRef } = checked.value);
  if (blocked) {
    await settleNotSent(row.id, { error: blocked, finishedAt: clock(deps) });
    return;
  }

  // Se vuelve a sellar justo antes de enviar; si la fila ya no está en envío, no se envía.
  if (!(await moveFrom(row.id, "submitting", { submitStartedAt: clock(deps) }))) {
    await settleNotSent(row.id, { error: SEND_TOO_SLOW, finishedAt: clock(deps) });
    return;
  }
  const sending =
    row.kind === "frame"
      ? port.submitImages(row.userId, row.request as HfImageRequest, row.count)
      : port.submitVideo(row.userId, row.request as HfVideoRequest, { quoteRef });
  const outcome = await within(sending, deadline - Date.now());
  if (outcome === "timeout") {
    await retryWrite(() => moveFrom(row.id, "submitting", { status: "unknown", error: UNKNOWN_OUTCOME }));
    // La respuesta, si llega, se anota igual.
    void within(sending, 10 * 60 * 1000)
      .then((late) => (late === "timeout" ? false : settleSend(row, late, deps)))
      .catch((error: unknown) => console.error(`[generaciones] No se pudo anotar la respuesta tardía del envío ${row.id}:`, error));
    return;
  }
  if (!(await settleSend(row, outcome, deps))) return;
  try {
    await pollGeneration(row.id, deps);
  } catch (error) {
    console.error(`[generaciones] No se pudo consultar la generación ${row.id} recién enviada:`, error);
  }
}

// ───────────────────────── Seguimiento (barato) ─────────────────────────

/** Un trabajo que aún no ha terminado de verdad: pendiente, o «terminado» sin dirección de resultado. */
const stillRunning = (job: HfJob) => job.status === "pending" || (job.status === "done" && job.urls.length === 0);

/** Encola el trabajo que descarga los resultados (sin producto: no gasta y no debe pararse por acceso). */
async function enqueueFinalize(row: Generation): Promise<void> {
  await enqueueJob(FINALIZE_JOB, { userId: row.userId, productId: null }, { generationId: row.id });
}

/**
 * Pregunta a Higgsfield por los trabajos de una generación enviada, como mucho una vez cada 8 s (y
 * cada 5 min una fallida que aún se vuelve a mirar). No descarga nada: cuando todos han terminado,
 * encola `video.finalizar`. Se salta las que tienen una finalización en curso.
 */
export async function pollGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const notFinalizing = or(isNull(generations.finalizingAt), lt(generations.finalizingAt, ago(FINALIZE_LEASE_MS)));
  const [row] = await getDb()
    .update(generations)
    .set({ lastPolledAt: now })
    .where(
      and(
        eq(generations.id, generationId),
        notFinalizing,
        or(
          and(
            eq(generations.status, "submitted"),
            or(isNull(generations.lastPolledAt), lt(generations.lastPolledAt, ago(POLL_MIN_INTERVAL_MS))),
          ),
          and(
            eq(generations.status, "failed"),
            gt(generations.recheckUntil, now),
            or(isNull(generations.lastPolledAt), lt(generations.lastPolledAt, ago(LATE_POLL_INTERVAL_MS))),
          ),
        ),
      ),
    )
    .returning();
  if (!row) return;

  let jobs: HfJob[];
  try {
    jobs = await higgsfieldOf(deps).jobs(row.userId, row.jobIds, 0);
  } catch (error) {
    console.warn(`[generaciones] No se pudo consultar la generación ${row.id}: ${nameOf(error)}`);
    return;
  }
  if (jobs.length < row.jobIds.length || jobs.some(stillRunning)) return;
  // Una fallida que se vuelve a mirar solo cambia si algo ha terminado de verdad.
  if (row.status === "failed" && jobs.every((job) => job.failure === "not_found")) return;
  await enqueueFinalize(row);
}

/** Consulta (barato, sin descargar) las generaciones enviadas de un vídeo, si quien mira es quien lo creó. */
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

// ───────────────────────── Finalizar (trabajo con reserva) ─────────────────────────

/** Descarga un resultado (https o `data:`) leyendo por trozos, con tope de tiempo y de bytes. */
async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const protocol = new URL(url).protocol;
  if (protocol !== "https:" && protocol !== "data:") throw new Error("Dirección de resultado no válida.");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`La descarga respondió ${response.status}.`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) throw new Error("El resultado es demasiado grande.");
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("El resultado es demasiado grande.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** La miniatura de un resultado; si no se puede hacer, `null` (el resultado se guarda sin ella). */
async function thumbnailOf(url: string, kind: string, deps: GenDeps): Promise<Buffer | null> {
  try {
    return await makeThumbnail(await download(url, deps.fetch ?? fetch), kind === "frame" ? "image" : "video", THUMB_MAX_SIDE);
  } catch (error) {
    console.warn(`[generaciones] Sin miniatura para un resultado: ${nameOf(error)}`);
    return null;
  }
}

const isBlocked = (job: HfJob) => job.failure === "nsfw" || job.failure === "ip_detected";

function jobError(job: HfJob): string | null {
  if (job.status === "done") return null;
  if (isBlocked(job)) return BLOCKED;
  if (job.failure === "not_found") return JOB_NOT_FOUND;
  return job.error ? `${JOB_FAILED} ${job.error}`.slice(0, 1_000) : JOB_FAILED;
}

/**
 * El trabajo `video.finalizar`: con su propia reserva (`finalizing_at`, `FINALIZE_LEASE_MS`), vuelve
 * a preguntar por los trabajos y, si todos han terminado, descarga los resultados, hace las
 * miniaturas y deja la generación `done` (algún resultado bueno) o `failed`. Si Higgsfield no
 * encuentra algún trabajo, queda `failed` y se sigue mirando unas horas (`recheck_until`). Dos
 * finalizaciones a la vez (o una repetida) descargan una sola vez.
 */
export async function finalizeGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const [row] = await getDb()
    .update(generations)
    .set({ finalizingAt: now })
    .where(
      and(
        eq(generations.id, generationId),
        or(eq(generations.status, "submitted"), and(eq(generations.status, "failed"), gt(generations.recheckUntil, now))),
        or(isNull(generations.finalizingAt), lt(generations.finalizingAt, new Date(now.getTime() - FINALIZE_LEASE_MS))),
      ),
    )
    .returning();
  if (!row) return;
  const mine = and(eq(generations.id, row.id), eq(generations.finalizingAt, now));
  const release = () => getDb().update(generations).set({ finalizingAt: null }).where(mine);

  try {
    let jobs: HfJob[];
    try {
      jobs = await higgsfieldOf(deps).jobs(row.userId, row.jobIds, 0);
    } catch (error) {
      console.warn(`[generaciones] No se pudo consultar la generación ${row.id} para terminarla: ${nameOf(error)}`);
      await release();
      return;
    }
    if (jobs.length < row.jobIds.length || jobs.some(stillRunning)) {
      await release();
      return;
    }
    const anyOk = jobs.some((job) => job.status === "done");
    const notFound = jobs.some((job) => job.failure === "not_found");
    if (row.status === "failed" && !anyOk && notFound) {
      await release(); // sigue sin aparecer: se mirará otra vez
      return;
    }

    const found = await Promise.all(
      jobs.map(async (job, index) => {
        const ok = job.status === "done";
        const thumb = ok ? await thumbnailOf(job.urls[0], row.kind, deps) : null;
        return { generationId: row.id, index, jobId: job.jobId, ok, url: job.urls[0] ?? null, error: jobError(job), thumbMime: thumb ? "image/jpeg" : null, thumb };
      }),
    );
    const outcome: GenerationChanges = anyOk
      ? { status: "done", error: null, recheckUntil: null }
      : notFound
        ? { status: "failed", error: JOB_NOT_FOUND, recheckUntil: row.recheckUntil ?? new Date(now.getTime() + LATE_RECHECK_MS) }
        : { status: "failed", error: jobs.some(isBlocked) ? BLOCKED : JOB_FAILED, recheckUntil: null };

    await getDb().transaction(async (tx) => {
      const [finished] = await tx
        .update(generations)
        .set({ ...outcome, finishedAt: clock(deps), finalizingAt: null })
        .where(mine)
        .returning({ id: generations.id });
      if (!finished) return; // otra finalización se hizo con la fila (reserva caducada)
      for (const result of found) {
        await tx
          .insert(results)
          .values(result)
          .onConflictDoUpdate({
            target: [results.generationId, results.index],
            set: { jobId: result.jobId, ok: result.ok, url: result.url, error: result.error, thumbMime: result.thumbMime, thumb: result.thumb },
          });
      }
    });
  } catch (error) {
    await release().catch(() => {});
    throw error;
  }
}

// ───────────────────────── Reconciliar ─────────────────────────

/** Mismo modelo o de la misma familia (`nano_banana_2` en el historial para un envío `nano_banana_2_1`). */
function sameModelFamily(sent: string, seen: string): boolean {
  return seen === sent || sent.startsWith(`${seen}_`) || seen.startsWith(`${sent}_`);
}

/** Identificadores de trabajo que ya tiene otra generación (de quien sea). */
async function takenJobIds(db: Db | Tx, exceptId: number, candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db
    .select({ jobIds: generations.jobIds })
    .from(generations)
    .where(and(ne(generations.id, exceptId), sql`${generations.jobIds} ?| ${sql.param(candidates)}::text[]`));
  const inResults = await db.select({ jobId: results.jobId }).from(results).where(inArray(results.jobId, candidates));
  return new Set([...rows.flatMap((row) => row.jobIds), ...inResults.map((row) => row.jobId)]);
}

/**
 * Una generación en duda (`unknown`). Lee el historial de Higgsfield (todas las páginas que hagan
 * falta para cubrir desde el envío, con un tope) y:
 *
 * - adopta (→ `submitted`) los trabajos con el mismo prompt, con fecha desde el envío (con un
 *   minuto de margen), de la misma familia de modelo, con la misma resolución y las mismas entradas
 *   (si el historial las deja ver) y que no tenga ya otra generación. Nunca uno sin fecha.
 * - si hay algo parecido que no se puede adoptar con seguridad (sin fecha, otro modelo…), sigue en duda.
 * - solo pasa a `not_sent` cuando, pasados 10 minutos, el historial es creíble (cada entrada trae
 *   prompt y modelo), cubre todo el tiempo desde el envío y no hay nada parecido.
 * - si no se puede probar ni lo uno ni lo otro, sigue en duda y se pide a la persona que mire su cuenta.
 * Si el historial no se puede leer, no cambia nada.
 */
export async function reconcileGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const now = clock(deps);
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.status, "unknown")));
  if (!row) return;
  const startedAt = (row.submitStartedAt ?? row.intentAt).getTime();
  const since = startedAt - HISTORY_SLACK_MS;

  const items: HfHistoryItem[] = [];
  let credible = true;
  let covered = false;
  let cursor: number | null = null;
  try {
    for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
      const result = await higgsfieldOf(deps).history(row.userId, historyType(row.kind), HISTORY_PAGE_SIZE, cursor);
      items.push(...result.items);
      if (result.items.some((item) => item.prompt === null || !item.model)) credible = false;
      if (result.items.length < HISTORY_PAGE_SIZE || result.nextCursor === null) {
        covered = true;
        break;
      }
      if (result.items.some((item) => item.createdAt !== null && item.createdAt.getTime() <= since)) {
        covered = true;
        break;
      }
      cursor = result.nextCursor;
    }
  } catch (error) {
    console.warn(`[generaciones] Sin historial para reconciliar la generación ${row.id}: ${nameOf(error)}`);
    return;
  }

  const request = row.request as { model: string; prompt: string; resolution?: string; medias?: Array<{ value: string }> };
  const ourMedia = new Set((request.medias ?? []).map((media) => media.value));
  const samePrompt = (item: HfHistoryItem) => item.prompt !== null && item.prompt.trim() === request.prompt.trim();
  const inWindow = (item: HfHistoryItem) => item.createdAt === null || item.createdAt.getTime() >= since;
  const candidates = items.filter((item) => samePrompt(item) && inWindow(item));
  const taken = await takenJobIds(getDb(), row.id, candidates.map((item) => item.jobId));
  const similar = candidates.filter((item) => !taken.has(item.jobId));
  const safe = similar
    .filter(
      (item) =>
        item.createdAt !== null &&
        (!item.model || sameModelFamily(request.model, item.model)) &&
        (item.resolution === null || request.resolution === undefined || item.resolution === request.resolution) &&
        item.mediaIds.every((id) => ourMedia.has(id)),
    )
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    .slice(0, row.count);

  if (safe.length > 0) {
    await getDb().transaction(async (tx) => {
      await generationLock(tx, 0); // dos reconciliaciones no adoptan el mismo trabajo
      const stillTaken = await takenJobIds(tx, row.id, safe.map((item) => item.jobId));
      const adopt = safe.filter((item) => !stillTaken.has(item.jobId));
      if (adopt.length === 0) return;
      await tx
        .update(generations)
        .set({
          status: "submitted",
          jobIds: adopt.map((item) => item.jobId),
          submittedAt: now,
          creditsSpent: Math.ceil((row.quotedCredits * adopt.length) / row.count),
          error: null,
          raw: trimRaw({ adoptadosDelHistorial: adopt }),
        })
        .where(and(eq(generations.id, row.id), eq(generations.status, "unknown")));
    });
    return;
  }

  if (startedAt >= now.getTime() - RECONCILE_GIVE_UP_MS) return;
  if (similar.length === 0 && credible && covered) {
    await moveFrom(row.id, "unknown", { status: "not_sent", error: NEVER_ARRIVED, finishedAt: now });
  } else if (row.error !== CANNOT_CONFIRM) {
    await moveFrom(row.id, "unknown", { error: CANNOT_CONFIRM });
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
 * → otra vez a la cola (o `not_sent` si quien la pidió ya no tiene acceso, o si llevan más de 15
 * minutos); dudas → reconciliar; enviadas → consultar, y en error si no terminan en una hora (sin
 * reenviarse); fallidas que se vuelven a mirar → consultar.
 */
export async function sweepGenerations(deps: GenDeps = {}): Promise<void> {
  const db = getDb();
  const now = clock(deps);
  const ago = (ms: number) => new Date(now.getTime() - ms);

  await db
    .update(generations)
    .set({ status: "unknown", error: UNKNOWN_OUTCOME })
    .where(and(eq(generations.status, "submitting"), lt(generations.submitStartedAt, ago(SUBMIT_STALE_MS))));

  await db
    .update(generations)
    .set({ status: "not_sent", error: INTENT_EXPIRED, finishedAt: now })
    .where(and(eq(generations.status, "intent"), lt(generations.intentAt, ago(INTENT_EXPIRED_MS))));
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

  const ids = async (where: ReturnType<typeof and>) =>
    (await db.select({ id: generations.id }).from(generations).where(where)).map((row) => row.id);

  await each(await ids(eq(generations.status, "unknown")), "No se pudo reconciliar la generación", (id) => reconcileGeneration(id, deps));
  await each(await ids(eq(generations.status, "submitted")), "No se pudo consultar la generación", async (id) => {
    await pollGeneration(id, deps);
    await db
      .update(generations)
      .set({ status: "failed", error: TIMED_OUT, finishedAt: now, recheckUntil: new Date(now.getTime() + LATE_RECHECK_MS) })
      .where(
        and(
          eq(generations.id, id),
          eq(generations.status, "submitted"),
          lt(generations.submittedAt, ago(GENERATION_TIMEOUT_MS)),
          or(isNull(generations.finalizingAt), lt(generations.finalizingAt, ago(FINALIZE_LEASE_MS))),
        ),
      );
  });
  await each(
    await ids(and(eq(generations.status, "failed"), gt(generations.recheckUntil, now))),
    "No se pudo volver a mirar la generación",
    (id) => pollGeneration(id, deps),
  );
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

/**
 * Aprueba un resultado bueno de una generación terminada, no rechazada, de ese tipo y de ese vídeo.
 * Si no, 404. Con el mismo cerrojo que rechazar, para que no se crucen.
 */
export async function approveResult(user: AuthUser, videoId: number, kind: GenerationKind, resultId: number): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (!Number.isSafeInteger(resultId) || resultId <= 0) throw new HttpError(404, RESULT_NOT_FOUND);
  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    const [found] = await tx
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
          isNull(generations.rejectReason),
        ),
      );
    if (!found) throw new HttpError(404, RESULT_NOT_FOUND);
    await tx
      .update(schema.videos)
      .set({ ...(kind === "frame" ? { approvedFrameResultId: found.id } : { approvedClipResultId: found.id }), updatedAt: new Date() })
      .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)));
  });
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
