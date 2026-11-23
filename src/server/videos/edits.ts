import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import { MAX_EDIT_BYTES, MAX_EDIT_TEXT } from "@/db/schema";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, type Product } from "@/server/products";
import { parseRange, songSummaries } from "@/server/songs";
import type { Analysis } from "@/server/videos/analysis";
import { bodiesOfVideo } from "@/server/videos/bodies";
import { dubDialogueOf } from "@/server/videos/doblaje";
import { getObjectStore } from "@/lib/object-store";
import { downloadableClip, servableClipUrl } from "@/server/videos/clip";
import { canChooseSong, effectiveEditReferenceUrl, getVideoFor, hookTiming, type Video } from "@/server/videos/videos";

/**
 * Montaje automático (el paso que sigue a los clips), en la nube: el proceso en segundo plano de
 * Railway monta cada vídeo con el montador (`montador/montar_auto.py`; ver `montaje-nube.ts`).
 * Aquí se hace la «ficha de montaje» (`EditSpec`: los clips, la canción con su drop, los rótulos,
 * la referencia de edición), se pone el montaje en su cola (`edit_runs`) y se guarda el MP4 que
 * sale (`edits`, una versión por montaje; el archivo en el almacén de objetos), que se sirve con
 * un enlace firmado (o con `Range` desde la base de datos, los antiguos).
 *
 * - Al quedar un lote `listo`, se monta cada vídeo suyo (`startBatchEdits`, enganchado con
 *   `onBatchReady` en `src/jobs/video-jobs.ts`). Cuando todos han terminado (bien o con su
 *   motivo), el lote pasa a `montado`.
 * - «Montar» / «Volver a montar» a mano: quien creó el vídeo o el dueño (`canChooseSong`).
 * - El Mac ya no monta (hasta el 23/11/2026 lo hacía): solo trae los enlaces que la nube no
 *   alcanza (`src/server/link-media.ts`). Si está apagado, el montaje sigue sin ellos y lo avisa.
 */
export const NO_CLIP = "El vídeo aún no tiene clip.";
export const CREATOR_GONE = "Quien creó el lote ya no está activo.";
export const CLIP_NOT_SERVABLE = "El clip no se puede descargar.";
export const BODY_NOT_SERVABLE = "Un cuerpo no se puede descargar.";
export const ALREADY_RUNNING = "Este vídeo ya se está montando.";
const CANNOT_START = "Solo quien creó este vídeo o el dueño pueden montarlo.";
const CANNOT_EDIT_TEXTS = "Solo quien creó este vídeo o el dueño pueden cambiar sus rótulos.";
const BAD_TEXT = `Cada rótulo tiene que tener entre 1 y ${MAX_EDIT_TEXT} caracteres.`;
const NO_EDIT = "Este vídeo aún no está montado.";
const MAX_ERROR = 300;

export { MAX_EDIT_BYTES };

const videos = schema.videos;
const edits = schema.edits;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ───────────────────────── Ficha de montaje ─────────────────────────

/** Lo que el montador recibe para montar un vídeo (va tal cual en `edit_runs.spec`). */
export interface EditSpec {
  version: 2;
  videoId: number;
  title: string;
  kind: string;
  product: { name: string; language: string };
  /**
   * Los clips en orden: con «Solo gancho», el gancho (`hook`) y detrás sus cuerpos (`body`); con los
   * otros tipos, el clip aprobado (`clip`). `jobId` es el trabajo de Higgsfield (su copia en el
   * almacén propio, si ya está); `url`, su dirección de Higgsfield (`servableClipUrl`) por si no.
   */
  clips: Array<{ role: "hook" | "body" | "clip"; jobId: string | null; url: string }>;
  /** Con «Solo gancho», lo que dura de verdad el gancho (el clip generado puede ser más largo). */
  hookMs: number | null;
  /** La canción de la biblioteca (con su drop). `null`: audio original. */
  song: { id: number; title: string; dropMs: number | null; startMs: number; durationMs: number } | null;
  /**
   * «Audio original» (sin canción): el audio del vídeo de REFERENCIA, desde 0 y recortado a lo que
   * dure el montaje (los clips de Seedance salen mudos). `web`: la pista guardada al preparar la
   * referencia. `enlace`: si no se guardó, el enlace de la referencia (se trae como la referencia de
   * edición: `link-media.ts`). `null`: con canción, o sin ninguna de las dos.
   */
  referenceAudio: { source: "web" } | { source: "enlace"; url: string } | null;
  texts: { main: string; cta: string };
  editReferenceUrl: string | null;
  /**
   * Sin «referencia de edición», la edición se copia del MISMO vídeo que se replicó (regla de Codex:
   * «vacío NO significa sin edición»): el archivo entero del almacén o, en los de antes del 23/11/2026,
   * su enlace. `null` con referencia de edición o si no hay ninguno de los dos.
   */
  replicaReference?: { source: "almacen"; key: string } | { source: "enlace"; url: string } | null;
  /**
   * «Traducir el diálogo al alemán» (`doblaje.ts`): el «Audio original» se dobla (solo la voz; la
   * música y los efectos quedan los originales). Sin canción y con audio de la referencia; si no, aviso.
   */
  dubDialogue?: boolean;
}

/** El CTA de siempre del dueño, en el idioma del anuncio. */
export function standardCta(productName: string, language: string): string {
  if (language === "it") return `Commenta “${productName}” se ne vuoi uno anche tu! 🤩`;
  return `Kommentiere „${productName}“, wenn du auch eine willst! 🤩`;
}

const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= MAX_EDIT_TEXT ? text : null;
};

/** Un rótulo pedido en las indicaciones del vídeo: una línea «Texto: …» o «Rótulo: …». */
function noteText(note: string | null): string | null {
  for (const line of (note ?? "").split("\n")) {
    const match = /^\s*(?:texto|rótulo|rotulo|text)\s*:\s*(.+)$/i.exec(line);
    if (match) return cleanText(match[1]);
  }
  return null;
}

/**
 * Los rótulos que lleva el montaje: los guardados en el vídeo; si no hay, los que propuso Claude en
 * el desglose (`editTexts`); si tampoco, los que salen de las indicaciones (una línea «Texto: …»
 * o, si no hay, el nombre del producto) y el CTA de siempre del dueño.
 */
export function editTextsFor(
  video: Pick<Video, "editMainText" | "editCtaText" | "note">,
  product: Pick<Product, "name" | "language">,
  analysis: Pick<Analysis, "editTexts"> | null,
): { main: string; cta: string } {
  const proposed = analysis?.editTexts ?? null;
  return {
    main: cleanText(video.editMainText) ?? cleanText(proposed?.main) ?? noteText(video.note) ?? `${product.name.toUpperCase()} 😍`,
    cta: cleanText(video.editCtaText) ?? cleanText(proposed?.cta) ?? standardCta(product.name, product.language),
  };
}

/** El resultado del último desglose hecho del vídeo, o `null`. */
async function latestAnalysisResult(videoId: number): Promise<Analysis | null> {
  const [row] = await getDb()
    .select({ result: schema.videoAnalyses.result })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  return (row?.result as Analysis | null) ?? null;
}

/** El audio de la referencia guardado para `videoId`, o `null`. */
export async function readReferenceAudio(videoId: number): Promise<{ mime: string; data: Buffer } | null> {
  const [row] = await getDb()
    .select({ mime: schema.videoReferenceAudio.mime, data: schema.videoReferenceAudio.data })
    .from(schema.videoReferenceAudio)
    .where(eq(schema.videoReferenceAudio.videoId, videoId));
  return row ?? null;
}

/** De dónde sale «Audio original» en la ficha (ver `EditSpec.referenceAudio`); `null` con canción. */
async function referenceAudioSource(video: Video): Promise<"web" | { link: string } | null> {
  if (video.songId !== null) return null;
  const [stored] = await getDb()
    .select({ videoId: schema.videoReferenceAudio.videoId })
    .from(schema.videoReferenceAudio)
    .where(eq(schema.videoReferenceAudio.videoId, video.id));
  if (stored) return "web";
  if (video.referenceSource === "link" && video.referenceUrl) return { link: video.referenceUrl };
  return null;
}

/**
 * La ficha de montaje de `video`: los clips (409 si falta alguno o no se puede descargar), la
 * canción, los rótulos y el resto. Se calcula antes de abrir la transacción.
 */
async function buildSpec(video: Video, product: Product): Promise<EditSpec> {
  const clip = await downloadableClip(video);
  if (!clip) throw new HttpError(409, NO_CLIP);
  const clips: EditSpec["clips"] = [];
  if (video.kind === "solo_gancho") {
    clips.push({ role: "hook", jobId: clip.jobId, url: clip.url });
    for (const body of await bodiesOfVideo(video, { raw: true })) {
      if (!servableClipUrl(body.videoUrl)) throw new HttpError(409, BODY_NOT_SERVABLE);
      clips.push({ role: "body", jobId: body.jobId, url: body.videoUrl });
    }
  } else {
    clips.push({ role: "clip", jobId: clip.jobId, url: clip.url });
  }
  const song = video.songId === null ? null : ((await songSummaries([video.songId])).get(video.songId) ?? null);
  const original = await referenceAudioSource(video);
  const editReference = await effectiveEditReferenceUrl(video);
  return {
    version: 2,
    videoId: video.id,
    title: video.title,
    kind: video.kind,
    product: { name: product.name, language: product.language },
    clips,
    hookMs: hookTiming(video)?.hookMs ?? null,
    song: song ? { id: song.id, title: song.title, dropMs: song.dropMs, startMs: song.startMs, durationMs: song.durationMs } : null,
    referenceAudio: original === "web" ? { source: "web" } : original ? { source: "enlace", url: original.link } : null,
    texts: editTextsFor(video, product, await latestAnalysisResult(video.id)),
    // La del vídeo o, si no tiene, la de su producto en el lote.
    editReferenceUrl: editReference,
    replicaReference: editReference
      ? null
      : video.referenceStorageKey
        ? { source: "almacen", key: video.referenceStorageKey }
        : video.referenceSource === "link" && video.referenceUrl
          ? { source: "enlace", url: video.referenceUrl }
          : null,
    dubDialogue: await dubDialogueOf(video),
  };
}

/** Bloquea la fila del vídeo hasta el final de la transacción (orden de cerrojos: el vídeo, después la tarea). */
async function lockVideo(tx: Tx, videoId: number): Promise<Video | null> {
  const [row] = await tx.select().from(videos).where(eq(videos.id, videoId)).for("update");
  return row ?? null;
}

/**
 * Pone en cola el montaje de `video` (de `product`), pedido por `requestedBy`, con su ficha. Los
 * rótulos que no estaban guardados quedan guardados en el vídeo (para que se puedan cambiar). 409
 * si ya hay uno en marcha o si falta algún clip.
 */
async function queueEdit(video: Video, product: Product, requestedBy: number, now: Date): Promise<{ runId: number }> {
  const spec = await buildSpec(video, product);
  return getDb().transaction(async (tx) => {
    const locked = await lockVideo(tx, video.id);
    if (!locked) throw new HttpError(404, "Vídeo no encontrado.");
    const [active] = await tx
      .select({ id: schema.editRuns.id })
      .from(schema.editRuns)
      .where(and(eq(schema.editRuns.videoId, video.id), inArray(schema.editRuns.status, ["queued", "running"])));
    if (active) throw new HttpError(409, ALREADY_RUNNING);
    const [run] = await tx
      .insert(schema.editRuns)
      .values({ videoId: video.id, spec, requestedBy, createdAt: now, availableAt: now })
      .returning({ id: schema.editRuns.id });
    await tx
      .update(videos)
      .set({
        editStatus: "en_marcha",
        editError: null,
        editRunId: run.id,
        editMainText: locked.editMainText ?? spec.texts.main,
        editCtaText: locked.editCtaText ?? spec.texts.cta,
      })
      .where(eq(videos.id, video.id));
    return { runId: run.id };
  });
}

/**
 * «Montar» / «Volver a montar» un vídeo que `user` ve: quien lo creó o el dueño (403 si no). Hace
 * falta el clip hecho (409). Si ya hay un montaje en marcha, 409. No hace falta el Mac.
 */
export async function startEdit(user: AuthUser, videoId: number, now: Date = new Date()): Promise<{ runId: number }> {
  const video = await getVideoFor(user, videoId);
  if (!canChooseSong(user, video)) throw new HttpError(403, CANNOT_START);
  const product = await getProductFor(user, video.productId);
  return queueEdit(video, product, user.id, now);
}

/** El vídeo queda con el montaje fallido y su motivo (sin tocar el montaje anterior, si lo hay). */
async function markFailed(executor: Pick<Db, "update">, videoId: number, reason: string, runId?: number): Promise<void> {
  await executor
    .update(videos)
    .set({ editStatus: "fallido", editError: reason.slice(0, MAX_ERROR) })
    .where(runId === undefined ? eq(videos.id, videoId) : and(eq(videos.id, videoId), eq(videos.editRunId, runId)));
}

/** Los vídeos de un lote que lleva su envío automático: los de quien lo creó, sin «Saltar». */
async function batchVideos(batch: { id: number; createdBy: number }): Promise<Video[]> {
  return getDb()
    .select()
    .from(videos)
    .where(and(eq(videos.batchId, batch.id), eq(videos.createdBy, batch.createdBy), eq(videos.autoSkipped, false)))
    .orderBy(videos.id);
}

/**
 * Enganche de `listo`: pone en cola el montaje de cada vídeo del lote que aún no tiene uno (ni en
 * marcha ni hecho). Si un vídeo no se puede montar (le falta un clip descargable), queda fallido
 * con el motivo. Repetirlo no duplica nada.
 */
export async function startBatchEdits(batchId: number, now: Date = new Date()): Promise<void> {
  const [batch] = await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId));
  if (!batch) return;
  const creator = await getActiveUser(batch.createdBy);
  for (const video of await batchVideos(batch)) {
    if (video.editStatus === "en_marcha" || video.editStatus === "hecho") continue;
    if (creator === null) {
      await markFailed(getDb(), video.id, CREATOR_GONE);
      continue;
    }
    try {
      const product = await getProductFor(creator, video.productId);
      await queueEdit(video, product, creator.id, now);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.message !== ALREADY_RUNNING) await markFailed(getDb(), video.id, error.message);
    }
  }
  await settleBatch(batch.id);
}

export const REDUB_SETTING = "doblaje.relanzado-20261124";
/** Desde cuándo cuentan los montajes «de hoy» de la orden del 24/11/2026 (los lotes del 23 y el 24, hora de Berlín). */
export const REDUB_SINCE = new Date("2026-11-22T23:00:00Z");

/**
 * Orden del dueño (24/11/2026), UNA vez: los vídeos de lote ya montados desde el 23/11 con «Audio original»
 * se vuelven a montar, ahora con el doblaje por defecto (gasto aprobado: ~44 créditos por vídeo de 12 s). Si su
 * referencia no tiene diálogo o ya está en el idioma del anuncio, el montaje no gasta nada. Devuelve cuántos puso
 * en cola; repetirlo no hace nada (marca `doblaje.relanzado-20261124`).
 */
export async function redubTodaysEdits(now: Date = new Date()): Promise<number> {
  if (await getSetting<string>(REDUB_SETTING)) return 0;
  await setSetting(REDUB_SETTING, now.toISOString());
  const rows = await getDb()
    .selectDistinct({ id: videos.id })
    .from(videos)
    .innerJoin(edits, eq(edits.videoId, videos.id))
    .where(
      and(
        sql`${videos.batchId} is not null`,
        sql`${videos.songId} is null`,
        sql`${videos.dubDialogue} is distinct from false`,
        eq(videos.editStatus, "hecho"),
        sql`${edits.createdAt} >= ${REDUB_SINCE.toISOString()}::timestamptz`,
      ),
    );
  let queued = 0;
  for (const { id } of rows) {
    const [video] = await getDb().select().from(videos).where(eq(videos.id, id));
    const creator = video ? await getActiveUser(video.createdBy) : null;
    if (!video || !creator) continue;
    try {
      await queueEdit(video, await getProductFor(creator, video.productId), creator.id, now);
      queued += 1;
    } catch (error) {
      console.warn(`[montaje] No se pudo volver a montar el vídeo ${id} para doblarlo: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`[montaje] Doblaje por defecto: ${queued} vídeo(s) de los lotes de hoy vuelven a montarse.`);
  return queued;
}

/**
 * Un lote `listo` cuyos vídeos han terminado todos su montaje (hecho o fallido con su motivo)
 * pasa a `montado`. Se llama al cerrar cada montaje y en el seguimiento.
 */
export async function settleBatch(batchId: number | null): Promise<void> {
  if (batchId === null) return;
  const [batch] = await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId));
  if (batch?.status !== "listo") return;
  const list = await batchVideos(batch);
  if (list.length === 0 || !list.every((video) => video.editStatus === "hecho" || video.editStatus === "fallido")) return;
  await getDb()
    .update(schema.batches)
    .set({ status: "montado" })
    .where(and(eq(schema.batches.id, batch.id), eq(schema.batches.status, "listo")));
}

/** Para el seguimiento de cada minuto: los lotes `listo` que ya pueden quedar `montado`. */
export async function settleEditedBatches(): Promise<void> {
  const ids = await getDb().select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.status, "listo"));
  for (const { id } of ids) await settleBatch(id);
}

// ───────────────────────── Lo que deja el montador ─────────────────────────

/** Lo que se guarda de la autocomprobación del montador (lo demás se descarta). */
export interface EditSelfCheck {
  ok: boolean;
  avisos: string[];
  planos: number | null;
  cortesEnBeat: string | null;
  intentos: number | null;
  referencia: boolean;
}

const asCount = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

/** La autocomprobación tal como la deja el montador, recortada a lo que se enseña (`null` si no vale). */
export function cleanSelfCheck(value: unknown): EditSelfCheck | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const avisos = Array.isArray(raw.avisos) ? raw.avisos.filter((a): a is string => typeof a === "string").slice(0, 20).map((a) => a.slice(0, 300)) : [];
  return {
    ok: raw.ok === true,
    avisos,
    planos: asCount(raw.planos),
    cortesEnBeat: typeof raw.cortesEnBeat === "string" ? raw.cortesEnBeat.slice(0, 20) : null,
    intentos: asCount(raw.intentos),
    referencia: raw.referencia === true,
  };
}

/**
 * Guarda un montaje terminado como versión nueva del vídeo y el vídeo queda «hecho» (si ese
 * montaje, `runId`, sigue siendo el suyo). El MP4 ya está en el almacén (`storageKey`) o, sin
 * almacén, va en la base de datos (`bytes`).
 */
export async function saveEdit(
  tx: Tx,
  input: { videoId: number; runId: number; size: number; storageKey: string | null; bytes: Buffer | null; durationMs: number; selfCheck: EditSelfCheck | null },
  now: Date = new Date(),
): Promise<{ version: number }> {
  if (input.size <= 0 || input.size > MAX_EDIT_BYTES || (input.storageKey === null && input.bytes === null)) throw new HttpError(400, "El vídeo montado no es válido.");
  await lockVideo(tx, input.videoId);
  const [{ last }] = await tx.select({ last: max(edits.version) }).from(edits).where(eq(edits.videoId, input.videoId));
  const version = (last ?? 0) + 1;
  await tx.insert(edits).values({
    videoId: input.videoId,
    version,
    size: input.size,
    data: input.storageKey === null ? input.bytes : null,
    storageKey: input.storageKey,
    durationMs: Math.max(1, Math.round(input.durationMs)),
    selfCheck: input.selfCheck,
    taskId: input.runId,
    createdAt: now,
  });
  await tx
    .update(videos)
    .set({ editStatus: "hecho", editError: null })
    .where(and(eq(videos.id, input.videoId), eq(videos.editRunId, input.runId)));
  return { version };
}

/** El montaje `runId` no se pudo hacer: el vídeo lo dice con `reason` (si ese montaje sigue siendo el suyo). */
export async function failEdit(tx: Tx, videoId: number, runId: number, reason: string): Promise<void> {
  await lockVideo(tx, videoId);
  await markFailed(tx, videoId, reason, runId);
}

/** El lote de un vídeo (para `settleBatch` después de cerrar su montaje). */
export async function batchOfVideo(videoId: number): Promise<number | null> {
  const [row] = await getDb().select({ batchId: videos.batchId }).from(videos).where(eq(videos.id, videoId));
  return row?.batchId ?? null;
}

// ───────────────────────── Nombres y descargas ─────────────────────────

/** Fecha `AAAA-MM-DD` en la hora de Alemania (la del negocio). */
function berlinDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Un nombre de cuenta apto para un archivo (sin barras ni caracteres que el iPhone o el Finder no admiten). */
export function accountFileName(name: string): string {
  return name.replace(/[\\/]/g, "-").replace(/[:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Producto";
}

/**
 * Nombre del vídeo montado para guardarlo y pasarlo al iPhone: «EisWerk - 03 - 2026-11-23.mp4»
 * (cuenta, número del vídeo en su lote y fecha del montaje). Fuera de un lote, el número es el del vídeo.
 */
export function editFileName(account: string, number: number, date: Date): string {
  return `${accountFileName(account)} - ${String(number).padStart(2, "0")} - ${berlinDate(date)}.mp4`;
}

/** El número de un vídeo dentro de su lote (por orden de creación, como el tablero), o su id si no es de un lote. */
export async function videoNumber(video: Pick<Video, "id" | "batchId">): Promise<number> {
  if (video.batchId === null) return video.id;
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(videos)
    .where(and(eq(videos.batchId, video.batchId), sql`${videos.id} <= ${video.id}`));
  return row?.n ?? video.id;
}

/** Los bytes de un montaje guardado (del almacén o de la base de datos), en flujo. */
export async function openEditStream(edit: { id: number; size: number; storageKey: string | null }): Promise<ReadableStream<Uint8Array>> {
  if (edit.storageKey) {
    const store = getObjectStore();
    if (!store) throw new HttpError(503, "El almacén de archivos no está disponible ahora mismo.");
    const response = await fetch(await store.signedUrl(edit.storageKey, { expiresIn: 3600 }));
    if (!response.ok || !response.body) throw new HttpError(502, "No se pudo leer un vídeo montado del almacén.");
    return response.body;
  }
  return streamEdit(edit.id, 0, edit.size);
}

// ───────────────────────── Lo que ven las pantallas ─────────────────────────

export type EditStatus = "none" | "en_cola" | "montando" | "hecho" | "fallido";

export interface EditView {
  status: EditStatus;
  /** Por qué falló el último montaje (apto para la persona), o `null`. */
  error: string | null;
  /** La última versión montada (aunque después falle otro intento), o `null`. */
  latest: { version: number; durationMs: number; size: number; createdAt: Date; selfCheck: EditSelfCheck | null } | null;
  /** Quien mira puede pedir «Montar» / «Volver a montar» (quien lo creó o el dueño, con clip y sin otro en marcha). */
  canStart: boolean;
}

/** El montaje de varios vídeos ya comprobados (`getVideoFor`), por id. `clipReady`: si cada uno tiene clip. */
export async function editViews(user: AuthUser, list: Array<Video & { clipReady: boolean }>): Promise<Map<number, EditView>> {
  const result = new Map<number, EditView>();
  if (list.length === 0) return result;
  const ids = list.map((video) => video.id);
  const latest = await getDb()
    .selectDistinctOn([edits.videoId], {
      videoId: edits.videoId,
      version: edits.version,
      durationMs: edits.durationMs,
      size: edits.size,
      createdAt: edits.createdAt,
      selfCheck: edits.selfCheck,
    })
    .from(edits)
    .where(inArray(edits.videoId, ids))
    .orderBy(edits.videoId, desc(edits.version));
  const latestOf = new Map(latest.map((row) => [row.videoId, row]));
  const runIds = list.flatMap((video) => (video.editStatus === "en_marcha" && video.editRunId !== null ? [video.editRunId] : []));
  const runs = new Map(
    (runIds.length === 0
      ? []
      : await getDb().select({ id: schema.editRuns.id, status: schema.editRuns.status }).from(schema.editRuns).where(inArray(schema.editRuns.id, runIds))
    ).map((run) => [run.id, run.status]),
  );
  for (const video of list) {
    const last = latestOf.get(video.id);
    const status: EditStatus =
      video.editStatus === "en_marcha"
        ? runs.get(video.editRunId ?? 0) === "running"
          ? "montando"
          : "en_cola"
        : video.editStatus === "hecho" || video.editStatus === "fallido"
          ? video.editStatus
          : "none";
    result.set(video.id, {
      status,
      error: status === "fallido" ? video.editError : null,
      latest: last
        ? { version: last.version, durationMs: last.durationMs, size: last.size, createdAt: last.createdAt, selfCheck: cleanSelfCheck(last.selfCheck) }
        : null,
      canStart: canChooseSong(user, video) && video.clipReady && status !== "en_cola" && status !== "montando",
    });
  }
  return result;
}

/** Los rótulos del montaje de un vídeo que `user` ve (los guardados o los que llevaría) y si los puede cambiar. */
export async function editTextsView(user: AuthUser, video: Video): Promise<{ main: string; cta: string; editable: boolean }> {
  const product = await getProductFor(user, video.productId);
  return { ...editTextsFor(video, product, await latestAnalysisResult(video.id)), editable: canChooseSong(user, video) };
}

/**
 * Cambia los rótulos del montaje (`{ main, cta }`, cada uno de 1 a 200 caracteres): quien creó el
 * vídeo o el dueño (403). Sirven para el siguiente «Montar»; el montaje ya hecho no cambia.
 */
export async function setEditTexts(user: AuthUser, videoId: number, input: { main?: unknown; cta?: unknown }): Promise<{ main: string; cta: string }> {
  const video = await getVideoFor(user, videoId);
  if (!canChooseSong(user, video)) throw new HttpError(403, CANNOT_EDIT_TEXTS);
  const changes: { editMainText?: string; editCtaText?: string } = {};
  if (input.main !== undefined) {
    const main = cleanText(input.main);
    if (main === null) throw new HttpError(400, BAD_TEXT);
    changes.editMainText = main;
  }
  if (input.cta !== undefined) {
    const cta = cleanText(input.cta);
    if (cta === null) throw new HttpError(400, BAD_TEXT);
    changes.editCtaText = cta;
  }
  if (Object.keys(changes).length > 0) await getDb().update(videos).set(changes).where(eq(videos.id, video.id));
  const { main, cta } = await editTextsView(user, { ...video, ...changes });
  return { main, cta };
}

/**
 * El vídeo montado de un vídeo que `user` ve (la última versión, o `version`), entero o el trozo
 * `Range`; con `download`, como adjunto `<producto>-video-<id>-editado.mp4`. Solo se lee de la
 * base de datos el trozo pedido. 404 si no hay.
 */
export async function editVideoResponse(
  user: AuthUser,
  videoId: number,
  rangeHeader: string | null,
  options: { download?: boolean; version?: number | null } = {},
): Promise<Response> {
  const video = await getVideoFor(user, videoId);
  const where =
    options.version != null
      ? and(eq(edits.videoId, video.id), eq(edits.version, options.version))
      : eq(edits.videoId, video.id);
  const db = getDb();
  const [edit] = await db
    .select({ id: edits.id, version: edits.version, size: edits.size, storageKey: edits.storageKey, createdAt: edits.createdAt })
    .from(edits)
    .where(where)
    .orderBy(desc(edits.version))
    .limit(1);
  if (!edit) throw new HttpError(404, NO_EDIT);
  const common: Record<string, string> = {
    "Accept-Ranges": "bytes",
    // Una versión no cambia nunca de contenido.
    "Cache-Control": "private, max-age=3600",
    ETag: `"edit-${edit.id}"`,
    "X-Content-Type-Options": "nosniff",
  };
  let filename: string | null = null;
  if (options.download) {
    const product = await getProductFor(user, video.productId);
    filename = editFileName(product.name, await videoNumber(video), edit.createdAt);
    common["Content-Disposition"] = `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  // En el almacén: el navegador lo lee directamente de ahí con un enlace firmado (rápido, sin pasar por aquí).
  if (edit.storageKey) {
    const store = getObjectStore();
    if (!store) throw new HttpError(503, "El almacén de archivos no está disponible ahora mismo.");
    const location = await store.signedUrl(edit.storageKey, { expiresIn: 60 * 60, ...(filename ? { downloadName: filename } : {}) });
    return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "private, max-age=600" } });
  }
  // La descarga va entera; el reproductor pide trozos.
  const range = options.download ? null : parseRange(rangeHeader, edit.size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...common, "Content-Range": `bytes */${edit.size}` } });
  const start = range?.start ?? 0;
  const length = (range ? range.end + 1 : edit.size) - start;
  const headers: Record<string, string> = { ...common, "Content-Type": "video/mp4", "Content-Length": String(length) };
  const body = streamEdit(edit.id, start, length);
  if (!range) return new Response(body, { status: 200, headers });
  headers["Content-Range"] = `bytes ${start}-${start + length - 1}/${edit.size}`;
  return new Response(body, { status: 206, headers });
}

/** Trozo que se lee de la base de datos de cada vez al mandar un vídeo montado. */
const STREAM_SLICE = 2 * 1024 * 1024;

/** `length` bytes del vídeo montado `editId` desde `start`, leídos de la base de datos a trozos (nunca entero en memoria). */
function streamEdit(editId: number, start: number, length: number): ReadableStream<Uint8Array> {
  let offset = start;
  const end = start + length;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= end) {
        controller.close();
        return;
      }
      const size = Math.min(STREAM_SLICE, end - offset);
      const [slice] = await getDb()
        .select({ data: sql<Buffer>`substring(${edits.data} from ${offset + 1} for ${size})` })
        .from(edits)
        .where(eq(edits.id, editId));
      if (!slice || slice.data.length === 0) {
        controller.error(new Error(NO_EDIT));
        return;
      }
      offset += slice.data.length;
      controller.enqueue(new Uint8Array(slice.data));
    },
  });
}
