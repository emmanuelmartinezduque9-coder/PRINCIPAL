import { captureVideoSignals } from "@/server/videos/aprendizaje/senales";
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
  type HfHistoryCursor,
  type HfHistoryItem,
  type HfImageRequest,
  type HfJob,
  type HfSubmitResult,
  type HfVideoRequest,
  type HiggsfieldPort,
} from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { mediaLinks } from "@/server/videos/archive";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import { enqueueJob } from "@/jobs/boss";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { makeThumbnail } from "@/server/media/ffmpeg";
import { getProductFor } from "@/server/products";
import { getVideoFor, latestDoneAnalysis, requireVideoOwner, type Video } from "@/server/videos/videos";

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
/**
 * Motivo de un rechazo que hace la propia aplicación para aplicar una corrección (no el dueño): no
 * gasta una de sus regeneraciones, igual que un bloqueo del filtro de Higgsfield.
 */
export const SYSTEM_REJECT_PREFIX = "Corrección automática: ";
export const SUBMIT_STALE_MS = 2 * 60 * 1000;
export const RECONCILE_GIVE_UP_MS = 10 * 60 * 1000;
/**
 * Cuánto se espera a un trabajo enviado antes de darlo por vencido: 4 horas (24/11/2026: Genjutsu con colas largas
 * tarda más de una hora; el lote 8 seguía «pending» en Higgsfield a la hora). Aun vencido, se sigue mirando
 * `LATE_RECHECK_MS` y se recoge si termina; el lote no lo regenera mientras tanto.
 */
export const GENERATION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
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
/** Un trabajo que Higgsfield no encuentra cuenta como pendiente hasta que pasa esto desde el envío. */
export const NOT_FOUND_GRACE_MS = 15 * 60 * 1000;
/** Una duda que no se puede confirmar se vuelve a mirar cada tanto, no cada minuto. */
const RECONCILE_BACKOFF_MS = 15 * 60 * 1000;
/**
 * Cuánto se sigue esperando la respuesta de un envío que no respondió a tiempo. Tiene que terminar
 * antes de que la reconciliación pueda rendirse (`RECONCILE_GIVE_UP_MS` desde el sello del envío),
 * para que una respuesta tardía nunca encuentre la fila ya «no enviada».
 */
const LATE_REPLY_WAIT_MS = RECONCILE_GIVE_UP_MS - SUBMIT_DEADLINE_MS - 60 * 1000;
if (LATE_REPLY_WAIT_MS <= 0) throw new Error("LATE_REPLY_WAIT_MS debe ser positivo: revisa RECONCILE_GIVE_UP_MS y SUBMIT_DEADLINE_MS.");
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

/** `upscale`: Topaz a 1080p sobre el clip ya hecho (orden de Emmanuel, 24/11/2026, como Codex). */
export type BaseGenerationKind = "frame" | "clip" | "upscale";
/** `frame:N`, `clip:N`, `upscale:N`: los del sitio N de la referencia (regla del 24/11/2026, `tramos.ts`). */
export type GenerationKind = BaseGenerationKind | `${BaseGenerationKind}:${number}`;

/** El tipo sin su sitio (`clip:2` → `clip`). */
export const baseKindOf = (kind: string): BaseGenerationKind => kind.split(":")[0] as BaseGenerationKind;
export type GenerationStatus = "intent" | "submitting" | "submitted" | "done" | "failed" | "not_sent" | "unknown";

export interface GenDeps {
  higgsfield?: HiggsfieldPort;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Solo para las pruebas: otro plazo para el envío (por defecto `SUBMIT_DEADLINE_MS`). */
  submitDeadlineMs?: number;
  /** Solo para las pruebas: otra espera para una respuesta tardía del envío (por defecto `LATE_REPLY_WAIT_MS`). */
  lateReplyWaitMs?: number;
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
    /**
     * Solo en una duda (`unknown`): los trabajos parecidos del historial que la persona puede
     * reconocer («Es este»), si ya puede resolverla a mano y el aviso de riesgo para la pantalla.
     */
    stuck: {
      candidates: Array<{ jobId: string; createdAt: string | null; model: string; thumbUrl: string | null }>;
      canResolve: boolean;
      risk: string;
    } | null;
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
export const TIMED_OUT = "Higgsfield no ha terminado este trabajo en cuatro horas; se sigue mirando por si llega.";

const notEnough = (need: number, have: number) => `No tienes créditos suficientes en Higgsfield: hacen falta ${need} y tienes ${have}.`;
const priceChanged = (credits: number) => `El precio ha cambiado: ahora son ${credits} créditos. Revísalo y confirma de nuevo.`;
const rejectedBy = (reason: string) => `Higgsfield no ha aceptado la petición: ${reason}`;

// ───────────────────────── Constructores de peticiones ─────────────────────────

const builders = new Map<BaseGenerationKind, RequestBuilder>();

/** Cómo se construye la petición de un tipo (lo registran la imagen inicial y el clip). */
export function registerRequestBuilder(kind: BaseGenerationKind, build: RequestBuilder): void {
  builders.set(kind, build);
}

/**
 * La petición de ese tipo. Construirla sube fotos y fotogramas al Higgsfield de la persona: sus
 * errores (sin conexión, permiso caducado, Higgsfield caído) se responden igual que al presupuestar.
 */
async function buildRequest(user: AuthUser, video: Video, kind: GenerationKind, deps: GenDeps) {
  const build = builders.get(baseKindOf(kind));
  if (!build) throw new HttpError(503, NO_BUILDER);
  // Con varios sitios en la referencia, cada generación se construye con el vídeo visto desde su
  // sitio (`tramos.ts`); lo que se vuelve a comprobar al apuntar son las columnas del vídeo de verdad.
  const { videoForKind } = await import("@/server/videos/tramos");
  const seen = await videoForKind(video, kind, deps).catch(asHttp);
  const built = await build(user, seen, deps).catch(asHttp);
  if (seen === video || !built.snapshot) return built;
  const keys = Object.keys(built.snapshot) as Array<keyof Video>;
  return { ...built, snapshot: Object.fromEntries(keys.map((key) => [key, video[key]])) as Partial<Video> };
}

// ───────────────────────── Utilidades ─────────────────────────

const generations = schema.generations;
const results = schema.generationResults;

type Generation = typeof generations.$inferSelect;
type GenerationChanges = Partial<typeof generations.$inferInsert>;
type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Comprobación extra que corre dentro de la transacción de aprobar o rechazar, ya con el cerrojo del
 * vídeo (el mismo que toma apuntar una generación): lo que mire no puede cambiar a la vez. Si
 * lanza, no se cambia nada.
 */
export type GenerationGuard = (tx: Tx, video: Video) => Promise<void>;

const ACTIVE: GenerationStatus[] = ["intent", "submitting", "submitted"];
const SPENT: GenerationStatus[] = ["submitted", "done", "failed"];

const clock = (deps: GenDeps) => deps.now?.() ?? new Date();
const higgsfieldOf = (deps: GenDeps) => deps.higgsfield ?? getHiggsfield();
const historyType = (kind: string): "image" | "video" => (baseKindOf(kind) === "frame" ? "image" : "video");
const nameOf = (error: unknown) => (error instanceof Error ? error.message : "desconocido");

/** Cerrojo de aviso por vídeo para las generaciones ("VGEN", vídeo). El 0 se usa para adoptar trabajos del historial. */
export const generationLock = (tx: Tx, videoId: number) =>
  tx.execute(sql`select pg_advisory_xact_lock(${0x5647454e}::int, ${videoId}::int)`);

/** La respuesta en crudo tal como se guarda: como mucho 20 000 caracteres de JSON. */
function trimRaw(raw: unknown): unknown {
  if (raw === undefined) return null;
  const json = JSON.stringify(raw);
  if (json === undefined) return null;
  return json.length <= RAW_LIMIT ? raw : { recortado: json.slice(0, RAW_LIMIT) };
}

/** Errores de Higgsfield al construir la petición o presupuestar, como respuesta para la persona. */
export function asHttp(error: unknown): never {
  if (error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldAuthError) {
    throw new HttpError(409, error.message, HIGGSFIELD_CONNECT);
  }
  if (error instanceof HiggsfieldRejectedError) throw new HttpError(409, rejectedBy(error.reason));
  if (error instanceof HiggsfieldUnavailableError) throw new HttpError(503, error.message);
  throw error;
}

/**
 * Lo que se prevé que cuesta Topaz a 1080p (Higgsfield no lo presupuesta): unos 0,33 créditos por
 * segundo, a partir de sus movimientos (3 y 5 créditos por clip), con un mínimo de 2.
 */
export function upscaleEstimate(seconds: number): number {
  return Math.max(2, Math.ceil(seconds / 3));
}

function price(port: HiggsfieldPort, userId: number, kind: string, request: unknown, count: number): Promise<{ credits: number; quoteRef: string | null }> {
  if (baseKindOf(kind) === "upscale") {
    // Sin presupuesto del proveedor: la previsión (guardada en la petición al construirla).
    const seconds = (request as { estimateSeconds?: number }).estimateSeconds ?? 15;
    return Promise.resolve({ credits: upscaleEstimate(seconds), quoteRef: null });
  }
  return baseKindOf(kind) === "frame" ? port.quoteImages(userId, request as HfImageRequest, count) : port.quoteVideo(userId, request as HfVideoRequest);
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
  // Un bloqueo del filtro de Higgsfield no es una regeneración: Higgsfield lo devuelve (sus
  // movimientos, 23/11/2026) y el lote lo repite solo con el prompt o el modelo corregidos.
  const counted = spent.filter((row) => !(row.status === "failed" && row.error === BLOCKED) && !row.rejectReason?.startsWith(SYSTEM_REJECT_PREFIX)).length;
  if (counted + 1 > 1 + MAX_REGENERATIONS) throw new HttpError(409, MAX_REACHED);
  const round = Math.max(spent.length, ...spent.map((row) => row.round)) + 1;
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
      const [current] = await tx.select().from(schema.videos).where(eq(schema.videos.id, video.id)).for("no key update");
      if (snapshot && Object.keys(snapshot).length > 0) {
        const changed =
          !current ||
          (Object.keys(snapshot) as Array<keyof Video>).some((key) => JSON.stringify(current[key]) !== JSON.stringify(snapshot[key]));
        if (changed) throw new HttpError(409, VIDEO_CHANGED);
      }
      // Lo que no es una columna del vídeo (las indicaciones del lote) también puede haber cambiado:
      // si el último desglose ya no vale, no se apunta nada.
      if (current && (await latestDoneAnalysis(current))?.staleReason) throw new HttpError(409, VIDEO_CHANGED);
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
 * Anota un envío ya hecho (y ya cobrado), con el cerrojo de adopción (el mismo que la
 * reconciliación) y sin quedarse trabajos que ya tenga otra generación:
 * - desde `submitting` o, si el seguimiento ya la dio por dudosa, desde `unknown`;
 * - si la reconciliación ya adoptó parte del historial (la fila sigue enviada, o ya terminó, o su
 *   finalización caducó), añade los que falten; si ya había terminado, la vuelve a mirar
 *   (`recheck_until`) para que la finalización recoja el índice nuevo;
 * - si no, lo dice bien alto con los trabajos (para buscarlos a mano).
 * Devuelve si la fila quedó `submitted` con estos trabajos.
 */
async function recordSubmitted(row: Generation, sent: HfSubmitResult, deps: GenDeps): Promise<boolean> {
  const ids = sent.jobIds.slice(0, row.count);
  const recorded = await retryWrite(() =>
    getDb().transaction(async (tx) => {
      await generationLock(tx, 0);
      const taken = await takenJobIds(tx, row.id, ids);
      const free = ids.filter((jobId) => !taken.has(jobId));
      if (free.length < ids.length) {
        console.error(`[generaciones] Envío ${row.id}: trabajos que ya tenía otra generación: ${ids.filter((id) => taken.has(id)).join(", ")}`);
      }
      if (free.length === 0) return "lost" as const;
      const values: GenerationChanges = {
        status: "submitted",
        jobIds: free,
        submittedAt: clock(deps),
        creditsSpent: Math.ceil((row.quotedCredits * free.length) / row.count),
        raw: trimRaw(sent.raw),
        error: null,
      };
      for (const from of ["submitting", "unknown"] as const) {
        const moved = await tx
          .update(generations)
          .set(values)
          .where(and(eq(generations.id, row.id), eq(generations.status, from)))
          .returning({ id: generations.id });
        if (moved.length > 0) return "recorded" as const;
      }
      const [current] = await tx.select().from(generations).where(eq(generations.id, row.id)).for("update");
      const now = clock(deps);
      const notFinalizing = current?.finalizingAt === null || (current?.finalizingAt ?? now).getTime() < now.getTime() - FINALIZE_LEASE_MS;
      const merging = current && notFinalizing && (current.status === "submitted" || RECHECKED.includes(current.status as GenerationStatus));
      if (merging) {
        const merged = [...new Set([...current.jobIds, ...free])].slice(0, row.count);
        if (merged.length > current.jobIds.length) {
          // Ya terminada: se vuelve a mirar para que la finalización recoja el trabajo nuevo (índice nuevo).
          const recheck = current.status === "submitted" ? {} : { recheckUntil: laterOf(current.recheckUntil, new Date(now.getTime() + LATE_RECHECK_MS)) };
          // Una finalización con la reserva caducada puede seguir viva (lenta): se le quita la reserva
          // para que su escritura (`where(mine)`) no pise esto con lo que leyó antes.
          const lease = current.finalizingAt === null ? {} : { finalizingAt: null };
          await tx
            .update(generations)
            .set({ jobIds: merged, creditsSpent: Math.ceil((row.quotedCredits * merged.length) / row.count), ...recheck, ...lease })
            .where(eq(generations.id, row.id));
        }
        return "recorded" as const;
      }
      // La reconciliación pudo adoptarlos ya del historial: entonces no se ha perdido nada.
      if (current && free.every((jobId) => current.jobIds.includes(jobId))) return "known" as const;
      return "lost" as const;
    }),
  );
  if (recorded === "lost") {
    console.error(`[generaciones] Envío ${row.id} hecho pero sin fila donde anotarlo. Trabajos de Higgsfield: ${ids.join(", ")}`);
  }
  return recorded === "recorded";
}

const laterOf = (a: Date | null, b: Date) => (a !== null && a.getTime() > b.getTime() ? a : b);

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
    baseKindOf(row.kind) === "frame"
      ? port.submitImages(row.userId, row.request as HfImageRequest, row.count)
      : port.submitVideo(row.userId, row.request as HfVideoRequest, { quoteRef });
  const outcome = await within(sending, deadline - Date.now());
  if (outcome === "timeout") {
    await retryWrite(() => moveFrom(row.id, "submitting", { status: "unknown", error: UNKNOWN_OUTCOME }));
    // La respuesta, si llega, se anota igual. Si llega después de la espera, al menos queda en el
    // registro con sus trabajos (para buscarlos a mano), como cuando no hay fila donde anotarla.
    let gaveUp = false;
    void within(sending, deps.lateReplyWaitMs ?? LATE_REPLY_WAIT_MS)
      .then((late) => {
        if (late !== "timeout") return settleSend(row, late, deps);
        gaveUp = true;
        return false;
      })
      .catch((error: unknown) => console.error(`[generaciones] No se pudo anotar la respuesta tardía del envío ${row.id}:`, error));
    sending.then(
      (sent) => {
        if (!gaveUp) return;
        const ids = sent.jobIds.slice(0, row.count);
        console.error(
          `[generaciones] Envío ${row.id}: respuesta después de la espera, sin anotar. Trabajos de Higgsfield: ${ids.join(", ") || "ninguno"}`,
        );
      },
      () => {},
    );
    return;
  }
  if (!(await settleSend(row, outcome, deps))) return;
  if (baseKindOf(row.kind) === "frame") {
    // Comprobable en los registros: cuántas referencias llevó la imagen y si iban las de Pinterest (regla fija).
    const request = row.request as HfImageRequest;
    const pinterest = /EXACT requested background|approved by the owner as references \(from Pinterest\)/.test(request.prompt);
    console.log(`[generaciones] Imagen del vídeo ${row.videoId} enviada (ronda ${row.round}): ${request.medias.length} referencias; referencias aprobadas de Pinterest: ${pinterest ? "sí" : "no"}.\n${request.prompt}`);
  }
  try {
    await pollGeneration(row.id, deps);
  } catch (error) {
    console.error(`[generaciones] No se pudo consultar la generación ${row.id} recién enviada:`, error);
  }
}

// ───────────────────────── Seguimiento (barato) ─────────────────────────

/**
 * Un trabajo que aún no ha terminado de verdad: pendiente, «terminado» sin dirección de resultado,
 * o que Higgsfield aún no encuentra pero se envió hace menos de `NOT_FOUND_GRACE_MS` (una sola vez
 * sin encontrarlo no hace fallar un trabajo pagado).
 */
function stillRunning(row: Generation, now: Date): (job: HfJob) => boolean {
  const recent = row.submittedAt !== null && row.submittedAt.getTime() > now.getTime() - NOT_FOUND_GRACE_MS;
  return (job) => job.status === "pending" || (job.status === "done" && job.urls.length === 0) || (job.failure === "not_found" && recent);
}

/** Estados en los que una generación ya terminada se sigue mirando (`recheck_until`). */
const RECHECKED: GenerationStatus[] = ["failed", "done"];

/** Encola el trabajo que descarga los resultados (sin producto: no gasta y no debe pararse por acceso). */
async function enqueueFinalize(row: Generation): Promise<void> {
  await enqueueJob(FINALIZE_JOB, { userId: row.userId, productId: null }, { generationId: row.id });
}

/**
 * Pregunta a Higgsfield por los trabajos de una generación enviada, como mucho una vez cada 8 s (y
 * cada 5 min una terminada que aún se vuelve a mirar porque algún trabajo no aparecía). No descarga
 * nada: cuando todos han terminado, encola `video.finalizar`. Se salta las que tienen una
 * finalización en curso.
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
            inArray(generations.status, RECHECKED),
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
  if (jobs.length < row.jobIds.length || jobs.some(stillRunning(row, now))) return;
  if (row.status !== "submitted") {
    // Una terminada que se vuelve a mirar solo cambia si lo que no aparecía ya ha aparecido.
    const stillMissing = jobs.some((job) => job.failure === "not_found");
    const newlyDone = row.status === "failed" && jobs.some((job) => job.status === "done");
    if (stillMissing && !newlyDone) return;
  }
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
    return await makeThumbnail(await download(url, deps.fetch ?? fetch), baseKindOf(kind) === "frame" ? "image" : "video", THUMB_MAX_SIDE);
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
        or(eq(generations.status, "submitted"), and(inArray(generations.status, RECHECKED), gt(generations.recheckUntil, now))),
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
    if (jobs.length < row.jobIds.length || jobs.some(stillRunning(row, now))) {
      await release();
      return;
    }
    // Lo que ya está guardado y bien (al volver a mirar una terminada) no se descarga otra vez, y la
    // generación sigue `done` aunque ahora Higgsfield diga otra cosa de ese trabajo.
    const savedOk = new Set(
      (await getDb().select({ index: results.index }).from(results).where(and(eq(results.generationId, row.id), eq(results.ok, true)))).map(
        (saved) => saved.index,
      ),
    );
    const anyOk = jobs.some((job) => job.status === "done") || savedOk.size > 0;
    const notFound = jobs.some((job) => job.failure === "not_found");
    if (row.status === "failed" && !anyOk && notFound) {
      await release(); // sigue sin aparecer: se mirará otra vez
      return;
    }
    const found = await Promise.all(
      jobs.map(async (job, index) => {
        if (savedOk.has(index)) return null;
        const ok = job.status === "done";
        const thumb = ok ? await thumbnailOf(job.urls[0], row.kind, deps) : null;
        if (ok && baseKindOf(row.kind) === "frame") console.log(`[generaciones] Imagen del vídeo ${row.videoId} (ronda ${row.round}) lista: ${job.urls[0]}`);
        return { generationId: row.id, index, jobId: job.jobId, ok, url: job.urls[0] ?? null, error: jobError(job), thumbMime: thumb ? "image/jpeg" : null, thumb };
      }),
    );
    // Si algún trabajo sigue sin aparecer, se vuelve a mirar unas horas (también si otro salió bien).
    const recheckUntil = notFound ? (row.recheckUntil ?? new Date(now.getTime() + LATE_RECHECK_MS)) : null;
    const outcome: GenerationChanges = anyOk
      ? { status: "done", error: null, recheckUntil }
      : notFound
        ? { status: "failed", error: JOB_NOT_FOUND, recheckUntil }
        : // Todo bloqueado por el filtro: Higgsfield lo devuelve (sus movimientos: «refund»), así que no cuenta como gastado.
          jobs.every(isBlocked)
          ? { status: "failed", error: BLOCKED, recheckUntil: null, creditsSpent: 0 }
          : { status: "failed", error: jobs.some(isBlocked) ? BLOCKED : JOB_FAILED, recheckUntil: null };

    await getDb().transaction(async (tx) => {
      const [finished] = await tx
        .update(generations)
        .set({ ...outcome, finishedAt: clock(deps), finalizingAt: null })
        .where(mine)
        .returning({ id: generations.id });
      if (!finished) return; // otra finalización se hizo con la fila (reserva caducada)
      for (const result of found) {
        if (!result) continue;
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

/** Un identificador corto (p. ej. `ref`) aparece en muchas direcciones: no prueba nada. */
const MIN_URL_ID_CHARS = 16;

/**
 * ¿La dirección nombra ese identificador? Solo con identificadores largos (≥ 16 caracteres, un UUID
 * lo es) y como trozo entero de la ruta: tras `/`, `=` o `_` (las direcciones reales son
 * `…/hf_<fecha>_<hora>_<id>.png`) y antes de `/`, `.`, `_`, `-`, `?`, `#` o el final.
 */
export function urlNames(url: string, value: string): boolean {
  if (value.length < MIN_URL_ID_CHARS) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`[/=_]${escaped}(?:[/._?#-]|$)`).test(url);
}

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
  const inResults = await db
    .select({ jobId: results.jobId })
    .from(results)
    .where(and(inArray(results.jobId, candidates), ne(results.generationId, exceptId)));
  return new Set([...rows.flatMap((row) => row.jobIds), ...inResults.map((row) => row.jobId)]);
}

type ReconcileOutcome = "unreadable" | "adopted" | "not_sent" | "unknown" | "skipped";

/**
 * Una pasada de reconciliación sobre una fila en duda. Lee el historial de Higgsfield (por páginas,
 * con un tope, hasta llegar a antes del envío) y:
 *
 * - adopta (→ `submitted`) los trabajos con el mismo prompt, con fecha desde el envío (con un
 *   minuto de margen), de la misma familia de modelo, con la misma resolución y con entradas que
 *   sean nuestras (por identificador o porque su dirección lleva uno de nuestros identificadores), y
 *   que no tenga ya otra generación. Nunca uno sin fecha.
 * - si hay algo parecido que no se puede adoptar con seguridad, lo guarda como candidato
 *   (`candidates`) para que la persona decida, y sigue en duda.
 * - solo pasa a `not_sent` cuando, pasados 10 minutos, se ha llegado al final del historial o a
 *   antes del envío (no basta una página corta), las entradas de esa ventana traen prompt y modelo,
 *   y no hay nada con ese prompt.
 * - si no se puede probar ni lo uno ni lo otro, sigue en duda (y se vuelve a mirar cada 15 minutos).
 * Si el historial no se puede leer, no cambia nada.
 */
async function reconcileRow(row: Generation, deps: GenDeps, options: { force?: boolean } = {}): Promise<ReconcileOutcome> {
  const now = clock(deps);
  if (
    !options.force &&
    row.error === CANNOT_CONFIRM &&
    row.lastPolledAt !== null &&
    row.lastPolledAt.getTime() > now.getTime() - RECONCILE_BACKOFF_MS
  ) {
    return "skipped";
  }
  const startedAt = (row.submitStartedAt ?? row.intentAt).getTime();
  const since = startedAt - HISTORY_SLACK_MS;

  const items: HfHistoryItem[] = [];
  let covered = false;
  let cursor: HfHistoryCursor | null = null;
  try {
    for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
      const result = await higgsfieldOf(deps).history(row.userId, historyType(row.kind), HISTORY_PAGE_SIZE, cursor);
      items.push(...result.items);
      // Cubre la ventana: Higgsfield dijo que no hay más (`null` explícito) o ya llegamos a antes del envío.
      if (result.end || result.items.some((item) => item.createdAt !== null && item.createdAt.getTime() <= since)) {
        covered = true;
        break;
      }
      // Sin cursor (y sin decir que es el final) no se sabe si hay más: no prueba nada.
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }
  } catch (error) {
    console.warn(`[generaciones] Sin historial para reconciliar la generación ${row.id}: ${nameOf(error)}`);
    return "unreadable";
  }

  const request = row.request as { model: string; prompt: string; resolution?: string; medias?: Array<{ value: string }> };
  const ours = (request.medias ?? []).map((media) => media.value);
  const isOurs = (media: HfHistoryItem["media"][number]) =>
    (media.id !== null && ours.includes(media.id)) || (media.url !== null && ours.some((value) => urlNames(media.url!, value)));
  const inWindow = (item: HfHistoryItem) => item.createdAt === null || item.createdAt.getTime() >= since;
  // Solo cuenta para la credibilidad lo que cae en la ventana (y lo que no trae fecha).
  const credible = items.filter(inWindow).every((item) => item.prompt !== null && item.model !== "");
  const samePrompt = (item: HfHistoryItem) => item.prompt !== null && item.prompt.trim() === request.prompt.trim();
  const candidates = items.filter((item) => samePrompt(item) && inWindow(item));
  const taken = await takenJobIds(getDb(), row.id, candidates.map((item) => item.jobId));
  const similar = candidates.filter((item) => !taken.has(item.jobId));
  const isSafe = (item: HfHistoryItem) =>
    item.createdAt !== null &&
    (!item.model || sameModelFamily(request.model, item.model)) &&
    (item.resolution === null || request.resolution === undefined || item.resolution === request.resolution) &&
    item.media.every(isOurs);
  const safe = similar
    .filter(isSafe)
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    .slice(0, row.count);

  if (safe.length > 0) {
    const adopted = await getDb().transaction(async (tx) => {
      await generationLock(tx, 0); // dos reconciliaciones (o un envío tardío) no se quedan el mismo trabajo
      const stillTaken = await takenJobIds(tx, row.id, safe.map((item) => item.jobId));
      const adopt = safe.filter((item) => !stillTaken.has(item.jobId));
      if (adopt.length === 0) return false;
      const moved = await tx
        .update(generations)
        .set({
          status: "submitted",
          jobIds: adopt.map((item) => item.jobId),
          submittedAt: now,
          lastPolledAt: null,
          creditsSpent: Math.ceil((row.quotedCredits * adopt.length) / row.count),
          error: null,
          candidates: null,
          raw: trimRaw({ adoptadosDelHistorial: adopt }),
        })
        .where(and(eq(generations.id, row.id), eq(generations.status, "unknown")))
        .returning({ id: generations.id });
      return moved.length > 0;
    });
    if (adopted) return "adopted";
  }

  const stored = similar
    .filter((item) => !safe.includes(item))
    .map((item) => ({ jobId: item.jobId, createdAt: item.createdAt?.toISOString() ?? null, model: item.model, thumbUrl: item.thumbUrl }));
  if (startedAt >= now.getTime() - RECONCILE_GIVE_UP_MS) {
    await moveFrom(row.id, "unknown", { candidates: stored.length > 0 ? stored : null });
    return "unknown";
  }
  if (similar.length === 0 && credible && covered) {
    await moveFrom(row.id, "unknown", { status: "not_sent", error: NEVER_ARRIVED, finishedAt: now, candidates: null });
    return "not_sent";
  }
  await moveFrom(row.id, "unknown", { error: CANNOT_CONFIRM, lastPolledAt: now, candidates: stored.length > 0 ? stored : null });
  return "unknown";
}

/** Reconciliación de una generación en duda (para el seguimiento); ver `reconcileRow`. */
export async function reconcileGeneration(generationId: number, deps: GenDeps = {}): Promise<void> {
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.status, "unknown")));
  if (row) await reconcileRow(row, deps);
}

// ───────────────────────── Resolver a mano una duda ─────────────────────────

export const STUCK_RISK = "Si sí estaba, Higgsfield te cobrará las dos.";
const NOTHING_STUCK = "No hay ninguna petición pendiente de comprobar.";
const TOO_SOON = "Aún lo estamos comprobando con Higgsfield. Espera unos minutos.";
const FOUND_NOW = "Higgsfield acaba de encontrarlo: la generación sigue su curso.";
const PROVED_ABSENT = "Higgsfield confirma que la petición no llegó. Puedes volver a generarla.";
const NOT_A_CANDIDATE = "Ese trabajo no es uno de los posibles.";
export const DISMISSED = "Revisado en Higgsfield: la petición no llegó.";

/** El vídeo de una duda atascada, solo para quien lo creó (404 si no lo ve, 403 si no es suyo). */
async function ownVideo(user: AuthUser, videoId: number): Promise<Video> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  return video;
}

/**
 * Lo común a las dos salidas de una duda atascada (con el vídeo ya comprobado por `ownVideo`): solo
 * pasados `RECONCILE_GIVE_UP_MS` desde el envío y solo tras una reconciliación fresca en esta misma
 * petición que no adopta nada. Devuelve la fila tal como queda, o si la reconciliación ya probó que
 * no llegó.
 */
async function freshStuck(video: Video, kind: GenerationKind, deps: GenDeps) {
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.videoId, video.id), eq(generations.kind, kind), eq(generations.status, "unknown")));
  if (!row) throw new HttpError(409, NOTHING_STUCK);
  if ((row.submitStartedAt ?? row.intentAt).getTime() >= clock(deps).getTime() - RECONCILE_GIVE_UP_MS) throw new HttpError(409, TOO_SOON);
  const outcome = await reconcileRow(row, deps, { force: true });
  if (outcome === "unreadable") throw new HttpError(503, new HiggsfieldUnavailableError().message);
  if (outcome === "adopted") throw new HttpError(409, FOUND_NOW);
  return { row, provedAbsent: outcome === "not_sent" };
}

/**
 * «Es este»: la persona reconoce en su Higgsfield uno de los candidatos parecidos y la generación lo
 * adopta (→ `submitted`), anotando quién y cuándo. Solo un candidato de la reconciliación fresca y
 * que no tenga ya otra generación.
 */
export async function adoptCandidate(
  user: AuthUser,
  videoId: number,
  kind: GenerationKind,
  jobId: string,
  deps: GenDeps = {},
): Promise<{ risk: string }> {
  const video = await ownVideo(user, videoId);
  // Sin trabajo no hay nada que adoptar: ni se mira el historial (pero quien no ve el vídeo recibe antes su 404/403).
  if (typeof jobId !== "string" || jobId.trim() === "") throw new HttpError(400, NOT_A_CANDIDATE);
  const { row, provedAbsent } = await freshStuck(video, kind, deps);
  if (provedAbsent) throw new HttpError(409, PROVED_ABSENT);
  const now = clock(deps);
  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    await generationLock(tx, 0);
    const [current] = await tx
      .select()
      .from(generations)
      .where(and(eq(generations.id, row.id), eq(generations.status, "unknown")))
      .for("update");
    if (!current) throw new HttpError(409, NOTHING_STUCK);
    if (!(current.candidates ?? []).some((candidate) => candidate.jobId === jobId)) throw new HttpError(400, NOT_A_CANDIDATE);
    if ((await takenJobIds(tx, current.id, [jobId])).size > 0) throw new HttpError(409, NOT_A_CANDIDATE);
    await tx
      .update(generations)
      .set({
        status: "submitted",
        jobIds: [jobId],
        submittedAt: now,
        lastPolledAt: null,
        creditsSpent: Math.ceil(current.quotedCredits / current.count),
        error: null,
        candidates: null,
        resolvedBy: user.id,
        resolvedAt: now,
        resolvedAs: "adoptado",
      })
      .where(eq(generations.id, current.id));
  });
  return { risk: STUCK_RISK };
}

/**
 * «Ya lo revisé en Higgsfield: no está»: la duda pasa a `not_sent` (se puede volver a generar),
 * anotando quién y cuándo. Si sí estaba, Higgsfield cobrará las dos (`risk`).
 */
export async function dismissUnknown(user: AuthUser, videoId: number, kind: GenerationKind, deps: GenDeps = {}): Promise<{ risk: string }> {
  const video = await ownVideo(user, videoId);
  const { row, provedAbsent } = await freshStuck(video, kind, deps);
  if (provedAbsent) return { risk: STUCK_RISK };
  const now = clock(deps);
  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    const moved = await tx
      .update(generations)
      .set({ status: "not_sent", error: DISMISSED, finishedAt: now, candidates: null, resolvedBy: user.id, resolvedAt: now, resolvedAs: "no_esta" })
      .where(and(eq(generations.id, row.id), eq(generations.status, "unknown")))
      .returning({ id: generations.id });
    if (moved.length === 0) throw new HttpError(409, NOTHING_STUCK);
  });
  return { risk: STUCK_RISK };
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
    await ids(and(inArray(generations.status, RECHECKED), gt(generations.recheckUntil, now))),
    "No se pudo volver a mirar la generación",
    (id) => pollGeneration(id, deps),
  );
}

// ───────────────────────── Rechazar, aprobar, ver ─────────────────────────

/**
 * Rechaza la última ronda terminada de un tipo con un motivo de una línea (hace falta para
 * regenerar). Si su resultado estaba aprobado, deja de estarlo.
 */
export async function rejectRound(
  user: AuthUser,
  videoId: number,
  kind: GenerationKind,
  reason: string,
  options: { guard?: GenerationGuard } = {},
): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text || /[\r\n]/.test(text) || text.length > MAX_REASON) throw new HttpError(400, BAD_REASON);

  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    await options.guard?.(tx, video);
    const rows = await rowsOf(tx, video.id, kind);
    if (rows.some((row) => row.status === "unknown")) throw new HttpError(409, CHECKING);
    if (rows.some((row) => ACTIVE.includes(row.status as GenerationStatus))) throw new HttpError(409, BUSY);
    const finished = rows.filter((row) => row.status === "done" || row.status === "failed");
    if (finished.length === 0) throw new HttpError(409, NOTHING_TO_REJECT);
    const last = finished.reduce((a, b) => (b.round > a.round ? b : a));
    await tx.update(generations).set({ rejectReason: text }).where(eq(generations.id, last.id));
    // Fecha del hecho aunque la ronda rechazada no tuviera ningún resultado aprobado.
    await tx.update(schema.videos).set({ updatedAt: new Date() }).where(eq(schema.videos.id, video.id));

    if (kind.includes(":")) {
      // Un sitio extra: lo aprobado de ese sitio deja de estarlo si era de esta ronda.
      const ids = (await tx.select({ id: results.id }).from(results).where(eq(results.generationId, last.id))).map((r) => r.id);
      await tx
        .update(schema.videos)
        .set({ tramoApprovals: sql`${schema.videos.tramoApprovals} - ${kind}::text`, updatedAt: new Date() })
        .where(and(eq(schema.videos.id, video.id), inArray(sql`(${schema.videos.tramoApprovals} ->> ${kind}::text)::bigint`, ids.length > 0 ? ids : [0])));
      return;
    }
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
  await captureVideoSignals(videoId);
}

/**
 * Aprueba un resultado bueno de una generación terminada, no rechazada, de ese tipo y de ese vídeo.
 * Si no, 404. Con el mismo cerrojo que rechazar, para que no se crucen.
 */
export async function approveResult(
  user: AuthUser,
  videoId: number,
  kind: GenerationKind,
  resultId: number,
  options: { guard?: GenerationGuard } = {},
): Promise<void> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (!Number.isSafeInteger(resultId) || resultId <= 0) throw new HttpError(404, RESULT_NOT_FOUND);
  await getDb().transaction(async (tx) => {
    await generationLock(tx, video.id);
    await options.guard?.(tx, video);
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
    if (kind.includes(":")) {
      await tx
        .update(schema.videos)
        .set({ tramoApprovals: sql`${schema.videos.tramoApprovals} || jsonb_build_object(${kind}::text, ${found.id}::bigint)`, updatedAt: new Date() })
        .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)));
      return;
    }
    await tx
      .update(schema.videos)
      .set({ ...(kind === "frame" ? { approvedFrameResultId: found.id } : { approvedClipResultId: found.id }), updatedAt: new Date() })
      .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)));
  });
  await captureVideoSignals(videoId);
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
export async function generationView(video: Video, kind: GenerationKind, viewerId: number): Promise<GenerationView> {
  // Los candidatos de una duda (miniaturas del Higgsfield de quien creó el vídeo) y resolverla son solo suyos.
  const creator = viewerId === video.createdBy;
  const rows = await rowsOf(getDb(), video.id, kind);
  const spent = rows.filter((row) => SPENT.includes(row.status as GenerationStatus)).length;
  const current = rows.at(-1) ?? null;
  const rawList = current
    ? await getDb()
        .select({ id: results.id, ok: results.ok, url: results.url, jobId: results.jobId, hasThumb: sql<boolean>`${results.thumb} is not null` })
        .from(results)
        .where(eq(results.generationId, current.id))
        .orderBy(asc(results.index))
    : [];
  // Lo ya copiado al almacén propio se sirve desde ahí (rápido y sin depender de Higgsfield).
  const links = await mediaLinks(rawList.filter((row) => row.ok).map((row) => row.jobId));
  const list = rawList.map(({ jobId, ...row }) => ({ ...row, url: links.get(jobId)?.original ?? row.url }));
  return {
    round: current?.round ?? 0,
    regenerationsLeft: Math.max(0, 1 + MAX_REGENERATIONS - Math.max(spent, 1)),
    approvedResultId: kind.includes(":")
      ? (video.tramoApprovals?.[kind] ?? null)
      : kind === "frame"
        ? video.approvedFrameResultId
        : video.approvedClipResultId,
    current: current
      ? {
          id: current.id,
          status: current.status as GenerationStatus,
          error: current.error,
          quotedCredits: current.quotedCredits,
          rejectReason: current.rejectReason,
          results: list,
          stuck:
            current.status === "unknown"
              ? {
                  candidates: creator ? (current.candidates ?? []) : [],
                  canResolve: creator && (current.submitStartedAt ?? current.intentAt).getTime() < Date.now() - RECONCILE_GIVE_UP_MS,
                  risk: STUCK_RISK,
                }
              : null,
        }
      : null,
  };
}
