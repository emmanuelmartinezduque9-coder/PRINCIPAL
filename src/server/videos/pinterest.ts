import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { JobPausedError, runStep, stepKey, StepFailedError, type JobContext } from "@/jobs/steps";
import { imagePart, textPart, type LlmContent } from "@/llm/content";
import { getGateway, NO_CREDIT, type LlmGateway } from "@/llm/gateway";
import { getObjectStore } from "@/lib/object-store";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { makeThumbnail } from "@/server/media/ffmpeg";
import type { PinCandidate, searchPins } from "@/server/pinterest-searches";
import { readProductPhoto } from "@/server/photos";
import { getProductFor } from "@/server/products";
import { loadRules, RULE_SLUGS } from "@/server/rules";
import type { ManifestItem } from "@/server/videos/manifest";

/**
 * Referencias de Pinterest de la imagen inicial. Regla fija del dueño (23/11/2026, pedida tres
 * veces): **por defecto, siempre** se buscan fotos reales de Pinterest para cada imagen, también
 * al regenerar una rechazada; solo si el vídeo lleva una referencia de entorno puesta a mano no se
 * busca. Ver `reglas/referencias-pinterest.md` y `docs/decisiones-referencias-pinterest.md`.
 *
 * Al terminar un desglose se apunta una búsqueda (`video_pinterest_refs`, una por desglose) y se
 * encola `video.pinterest`:
 *  1. Claude lee el desglose (lugar, época, luz, estilo, acción) y escribe 2–3 consultas como las
 *     que el dueño usaba a mano (reglas `referencias-pinterest`).
 *  2. Se busca en Pinterest desde la nube; si Pinterest no deja, desde el Mac del dueño.
 *  3. Claude mira las candidatas con visión y elige las mejores (fotos reales de móvil, sin texto
 *     ni marcas de agua, con el sitio y la luz que pide la toma).
 *  4. Se descargan a tamaño original, se guardan una vez por huella en el almacén y quedan listas.
 * La imagen inicial no se pide sin ellas (`pinterestRefsForFrame`): van detrás de las demás
 * referencias, con su papel escrito en el prompt (`withPinterestRoles`).
 */

export const PINTEREST_JOB = "video.pinterest";
/** Cuántas fotos de Pinterest acompañan a cada imagen inicial. */
export const MAX_PINTEREST_REFS = 2;
/** Candidatas que mira Claude, como mucho. */
const MAX_CANDIDATES = 24;
/** Lado largo de las miniaturas que mira Claude y de las fotos que se guardan. */
const THUMB_SIDE = 474;
const STORED_SIDE = 2048;
/** Miniaturas que se preparan a la vez (cada una es un ffmpeg). */
const THUMB_PARALLEL = 4;
/** Intentos automáticos de una búsqueda que falló antes de pararse y decirlo. */
export const MAX_PINTEREST_ATTEMPTS = 3;
/** Una búsqueda en marcha sin novedades desde hace esto se vuelve a lanzar. */
const STALE_SEARCH_MS = 10 * 60_000;
/** Una búsqueda pendiente sin trabajo en la cola desde hace esto se vuelve a encolar. */
const REQUEUE_MS = 2 * 60_000;

/** Lo que dice la imagen mientras se buscan (la petición espera; el lote lo vuelve a intentar solo). */
export const PINTEREST_PENDING = "Buscando referencias de Pinterest para esta imagen; se pide en cuanto estén.";
const PINTEREST_FAILED = "No se encontraron referencias de Pinterest para esta imagen";

const runs = schema.videoPinterestRefs;
const images = schema.pinterestImages;
type Run = typeof runs.$inferSelect;

export interface PinterestScene {
  /** El sitio de la toma, en español («salón con decoración navideña»). */
  place: string;
  season: string | null;
  light: string;
  style: string;
  /** Lo que tiene que verse para que la acción quepa (congelador abierto, encimera libre…). */
  needs: string;
  queries: string[];
}

export interface PinterestRef {
  sha256: string;
  query: string;
  pinId: string;
  sourceUrl: string;
  reason: string;
}

// ───────────────────────── Referencias manuales ─────────────────────────

/**
 * ¿El vídeo lleva una referencia de entorno puesta a mano? Entonces no se busca en Pinterest
 * (excepción del dueño). Mira el manifiesto, no solo la columna: una foto de entorno que ya no
 * existe con ese papel no cuenta.
 */
export function hasManualEnvironment(manifest: Pick<ManifestItem, "role">[]): boolean {
  return manifest.some((item) => item.role === "entorno");
}

// ───────────────────────── Prompt ─────────────────────────

const list = (tags: string[]) => (tags.length === 1 ? tags[0] : `${tags.slice(0, -1).join(", ")} and ${tags.at(-1)}`);

/**
 * El párrafo que da su papel a las fotos de Pinterest, con sus números reales. Se añade al final del
 * prompt de la imagen al pedirla (el desglose escribe el prompt antes de que existan). Sin fotos de
 * Pinterest en el manifiesto, el prompt tal cual.
 */
export function withPinterestRoles(prompt: string, manifest: ManifestItem[]): string {
  const tags = manifest.filter((item) => item.source.kind === "pinterest").map((item) => item.tag);
  if (tags.length === 0) return prompt;
  const which = tags.length === 1 ? `${tags[0]} is a real everyday phone photo` : `${list(tags)} are real everyday phone photos`;
  return `${prompt.trimEnd()}\n\n${which} of this kind of place, chosen and approved by the owner as references (from Pinterest). Use ${tags.length === 1 ? "it" : "them"} as the environment and realism reference: the real place, its furniture, materials, decoration, lived-in details and the natural look of a vertical phone photo. Its observed practical lighting is the authority for the light of the whole scene. Rebuild the background of image 1 in that style so it reads as the same kind of real lived-in place, not a set. Keep the framing, camera distance, angle, pose, hands and action of image 1, the person's identity only from the avatar reference and the product only from its own references. Do not copy any person, face, text, logo, watermark or screen content from ${tags.length === 1 ? "that photo" : "those photos"}.`;
}

// ───────────────────────── Guardar y leer fotos ─────────────────────────

const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const objectKeyOf = (hash: string) => `pinterest/${hash}.jpg`;

/** Guarda una foto (ya en JPEG) una sola vez por huella: en el almacén si lo hay; si no, en la base de datos. */
export async function storePinterestImage(data: Buffer, source: { url: string; pinId: string; width: number | null; height: number | null }): Promise<string> {
  const hash = sha256(data);
  const [existing] = await getDb().select({ sha256: images.sha256 }).from(images).where(eq(images.sha256, hash));
  if (existing) return hash;
  const store = getObjectStore();
  let objectKey: string | null = null;
  if (store) {
    objectKey = objectKeyOf(hash);
    await store.putBuffer(objectKey, data, { contentType: "image/jpeg", cacheControl: "private, max-age=31536000, immutable" });
  }
  await getDb()
    .insert(images)
    .values({
      sha256: hash,
      mime: "image/jpeg",
      bytes: data.length,
      width: source.width,
      height: source.height,
      objectKey,
      data: objectKey ? null : data,
      sourceUrl: source.url,
      pinId: source.pinId || null,
    })
    .onConflictDoNothing();
  return hash;
}

/** El contenido de una foto de Pinterest guardada. 404 si no existe. */
export async function readPinterestImage(hash: string): Promise<{ mime: string; data: Buffer }> {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError(404, "Foto no encontrada.");
  const [row] = await getDb().select().from(images).where(eq(images.sha256, hash));
  if (!row) throw new HttpError(404, "Foto no encontrada.");
  if (row.data) return { mime: row.mime, data: Buffer.from(row.data) };
  const store = getObjectStore();
  if (!store || !row.objectKey) throw new HttpError(404, "Foto no encontrada.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pinterest-"));
  try {
    const file = path.join(dir, "foto.jpg");
    await store.download(row.objectKey, file);
    return { mime: row.mime, data: await fs.readFile(file) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Enlace para ver la foto en la web: firmado del almacén si está allí; si no, la ruta propia. */
export async function pinterestImageUrl(hash: string): Promise<string> {
  const [row] = await getDb().select({ objectKey: images.objectKey }).from(images).where(eq(images.sha256, hash));
  const store = getObjectStore();
  if (row?.objectKey && store) return store.signedUrl(row.objectKey);
  return `/api/pinterest/${hash}`;
}

// ───────────────────────── Estado por vídeo ─────────────────────────

/** Solo para pruebas: en vez de encolar la búsqueda, la resuelve al momento (o `null` para quitarlo). */
let instantForTests: ((run: Run) => Promise<void>) | null = null;
export function setPinterestForTests(resolve: ((run: Run) => Promise<void>) | null): void {
  instantForTests = resolve;
}

/** Solo para pruebas: deja lista la búsqueda con estas fotos ya guardadas. */
export async function markPinterestReadyForTests(runId: number, refs: PinterestRef[]): Promise<void> {
  await setRun(runId, { status: "ready", refs, error: null });
}

/** El último desglose hecho del vídeo (el que da el prompt de la imagen). */
async function latestDoneAnalysisId(videoId: number): Promise<number | null> {
  const [row] = await getDb()
    .select({ id: schema.videoAnalyses.id })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  return row?.id ?? null;
}

async function runOf(videoId: number, analysisId: number): Promise<Run | null> {
  const [row] = await getDb().select().from(runs).where(and(eq(runs.videoId, videoId), eq(runs.analysisId, analysisId)));
  return row ?? null;
}

async function enqueue(run: Pick<Run, "id" | "videoId">): Promise<void> {
  const [video] = await getDb()
    .select({ createdBy: schema.videos.createdBy, productId: schema.videos.productId })
    .from(schema.videos)
    .where(eq(schema.videos.id, run.videoId));
  if (!video) return;
  await enqueueJob(PINTEREST_JOB, { userId: video.createdBy, productId: video.productId }, { runId: run.id });
}

/**
 * Apunta (si no está) la búsqueda de Pinterest del vídeo para ese desglose y la encola. Con
 * `retry`, una búsqueda fallida vuelve a empezar (con intentos de nuevo). No hace nada si ya está
 * lista o en marcha. Nunca lanza por la cola: el seguimiento la vuelve a encolar.
 */
export async function ensurePinterestRun(videoId: number, analysisId: number, options: { retry?: boolean } = {}): Promise<Run> {
  await getDb().insert(runs).values({ videoId, analysisId }).onConflictDoNothing();
  let run = (await runOf(videoId, analysisId))!;
  if (run.status === "failed" && options.retry) {
    [run] = await getDb()
      .update(runs)
      .set({ status: "pending", error: null, attempts: 0, scene: null, queries: null, refs: null, updatedAt: new Date() })
      .where(and(eq(runs.id, run.id), eq(runs.status, "failed")))
      .returning();
    run ??= (await runOf(videoId, analysisId))!;
  }
  if (run.status === "pending" && instantForTests) {
    await instantForTests(run);
    return (await runOf(videoId, analysisId))!;
  }
  if (run.status === "pending") {
    try {
      await enqueue(run);
    } catch (error) {
      console.error(`[pinterest] No se pudo encolar la búsqueda ${run.id}:`, error);
    }
  }
  return run;
}

/** Al terminar un desglose: si el vídeo no lleva entorno puesto a mano, se buscan sus referencias. */
export async function startPinterestAfterAnalysis(videoId: number, analysisId: number): Promise<void> {
  const [video] = await getDb().select({ environmentPhotoId: schema.videos.environmentPhotoId }).from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video || video.environmentPhotoId !== null) return;
  await ensurePinterestRun(videoId, analysisId);
}

/**
 * Las huellas de las fotos de Pinterest listas para la imagen inicial del vídeo (su último desglose
 * hecho), en orden. Vacío si aún no hay desglose o no están listas.
 */
export async function readyPinterestRefs(videoId: number): Promise<string[]> {
  return (await readyPinterest(videoId)).refs;
}

/** Las fotos listas y si el producto no se ve en la toma (entonces no se adjuntan sus fotos). */
export async function readyPinterest(
  videoId: number,
): Promise<{ refs: string[]; productHidden: boolean; packagingHidden: boolean; approvedMethod: boolean }> {
  const none = { refs: [], productHidden: false, packagingHidden: false, approvedMethod: false };
  const analysisId = await latestDoneAnalysisId(videoId);
  if (analysisId === null) return none;
  const run = await runOf(videoId, analysisId);
  if (run?.status !== "ready") return none;
  const refs = ((run.refs as PinterestRef[] | null) ?? []).map((ref) => ref.sha256);
  const approvedMethod = run.framePrompt !== null;
  const scene = run.scene as { productHidden?: boolean; packagingHidden?: boolean } | null;
  return { refs, approvedMethod, productHidden: approvedMethod && scene?.productHidden === true, packagingHidden: approvedMethod && scene?.packagingHidden === true };
}

/**
 * Antes de pedir la imagen inicial (también al regenerar): sin entorno puesto a mano, tienen que
 * estar sus fotos de Pinterest. Si no están, se ponen en marcha y 409 (`PINTEREST_PENDING`: el
 * lote lo vuelve a intentar solo). Si fallaron todos los intentos, 409 con el motivo y se vuelve a
 * intentar desde cero (no se genera nunca sin ellas).
 */
export async function requirePinterestRefs(videoId: number): Promise<void> {
  const analysisId = await latestDoneAnalysisId(videoId);
  if (analysisId === null) return; // Sin desglose ya lo para `requireAnalysisDone`.
  const run = await ensurePinterestRun(videoId, analysisId);
  if (run.status === "ready" && Array.isArray(run.refs) && run.refs.length > 0) return;
  if (run.status === "pending" && run.error === NO_CREDIT) throw new HttpError(409, NO_CREDIT);
  if (run.status === "failed") {
    await ensurePinterestRun(videoId, analysisId, { retry: true });
    throw new HttpError(409, `${PINTEREST_FAILED}: ${run.error ?? "Pinterest no respondió"}. Se vuelve a buscar.`);
  }
  throw new HttpError(409, PINTEREST_PENDING);
}

/** Lo que enseña la tarjeta del vídeo: «Referencias de Pinterest» con sus miniaturas. */
export interface PinterestView {
  status: Run["status"];
  error: string | null;
  scene: PinterestScene | null;
  refs: Array<PinterestRef & { url: string }>;
}

/** La búsqueda del último desglose hecho del vídeo, para la pantalla; `null` si no hay (o lleva entorno a mano). */
export async function pinterestView(videoId: number): Promise<PinterestView | null> {
  const analysisId = await latestDoneAnalysisId(videoId);
  if (analysisId === null) return null;
  const run = await runOf(videoId, analysisId);
  if (!run) return null;
  const refs = (run.refs as PinterestRef[] | null) ?? [];
  return {
    status: run.status,
    error: run.error,
    scene: (run.scene as PinterestScene | null) ?? null,
    refs: await Promise.all(refs.map(async (ref) => ({ ...ref, url: await pinterestImageUrl(ref.sha256) }))),
  };
}

/** Las búsquedas de varios vídeos a la vez (el tablero de un lote), por vídeo. */
export async function pinterestViews(videoIds: number[]): Promise<Map<number, PinterestView>> {
  const out = new Map<number, PinterestView>();
  for (const id of videoIds) {
    const view = await pinterestView(id);
    if (view) out.set(id, view);
  }
  return out;
}

// ───────────────────────── Claude: consultas y elección ─────────────────────────

const RULE_SLUG = "referencias-pinterest";

const sceneSchema: z.ZodType<PinterestScene> = z.object({
  place: z.string().min(1).describe("El tipo de sitio de la toma, en español y concreto (p. ej. «salón con decoración navideña», «cocina con isla»)."),
  season: z.string().nullable().describe("Época o temporada si cuenta (Navidad, verano…), o null."),
  light: z.string().min(1).describe("La luz del sitio (lámparas cálidas de tarde, luz de ventana de día…), en español."),
  style: z.string().min(1).describe("Estilo y nivel de la casa o tienda (casa alemana normal, habitada…), en español."),
  needs: z.string().min(1).describe("Lo que tiene que verse en la foto para que la acción de la toma quepa, en español."),
  queries: z
    .array(z.string().min(3).max(90))
    .min(2)
    .max(3)
    .describe("2–3 búsquedas para el buscador de Pinterest, de 3 a 7 palabras, como las del dueño: la primera en el idioma del mercado."),
});

const pickSchema = z.object({
  picks: z
    .array(z.object({ n: z.number().int().min(1), reason: z.string().min(1).describe("Por qué vale, en español y en una frase.") }))
    .max(MAX_PINTEREST_REFS)
    .describe("Las mejores, de mejor a peor; vacío si ninguna vale."),
  rejected: z.string().describe("En una frase, qué falla en las que no valen."),
});

const PLAN_INSTRUCTIONS = `Preparas la búsqueda en Pinterest de las fotos reales que acompañarán a la imagen inicial de un anuncio como referencia de realismo y de entorno (lugar, luz, decoración, aspecto de foto de móvil). Sigue la regla «Referencias de Pinterest»: decide en el orden producto → acción de la toma → espacio → cámara, y escribe consultas como las que el dueño usaba a mano para casos parecidos.

Mira el primer fotograma de la referencia (la composición que se conserva) y el desglose. Describe el sitio de la toma (place), la época (season, solo si cuenta: si la escena es navideña, Navidad), la luz, el estilo de la casa o tienda y lo que tiene que verse para que quepa la acción (needs).

Después escribe 2 o 3 consultas para el buscador de Pinterest (queries): cortas (3–7 palabras), con el tipo de sitio, el punto de vista si importa (pov, Perspektive), la temporada solo si corresponde y palabras de foto cotidiana (gemütlich, Alltag, cozy, real). La primera, en el idioma del mercado del anuncio; otra puede ir en inglés. Nada de «interior design», «luxury», «showroom», «architecture», «render», «aesthetic». Nada de marcas ajenas salvo una tienda que la toma pida.`;

const PICK_INSTRUCTIONS = `Eliges, entre fotos candidatas encontradas en Pinterest, las que servirán de referencia de realismo y de entorno para la imagen inicial de un anuncio (no aportan personas, producto ni encuadre: eso sale de otras referencias). Sigue la regla «Referencias de Pinterest».

Vale una foto que:
- es una foto real hecha con móvil (o lo parece): casa o tienda habitada, objetos cotidianos, luz práctica del sitio, encuadre algo imperfecto;
- es el mismo tipo de sitio que pide la toma y deja que la acción quepa (superficies, aparatos, altura y dirección de cámara compatibles con el primer fotograma de la referencia);
- respeta la época y la luz pedidas.

Rechaza la foto que: no es un lugar (producto, textura, collage, plano de detalle); es un render, una imagen hecha con IA, un showroom, un catálogo o una foto de interiorismo demasiado perfecta; lleva texto, rótulos, frases o marcas de agua encima; está dominada por una persona con la cara visible; es otro tipo de sitio; tiene una perspectiva imposible para el encuadre o se ve mal.

Elige como mucho ${MAX_PINTEREST_REFS}, de mejor a peor, por su número de candidata. Si ninguna vale, no elijas ninguna.`;

/** Los textos del desglose que describen la escena (sin los prompts largos). */
function analysisText(result: Record<string, unknown> | null): string {
  if (!result) return "";
  const shots = Array.isArray(result.shots) ? (result.shots as Array<Record<string, unknown>>) : [];
  const adaptation = Array.isArray(result.adaptation) ? (result.adaptation as Array<Record<string, unknown>>) : [];
  return [
    typeof result.conceptLogic === "string" ? `Lógica del concepto: ${result.conceptLogic}` : "",
    ...shots.map((shot, i) => `Toma ${i + 1}: se ve ${String(shot.seen ?? "")}; acción: ${String(shot.action ?? "")}`),
    ...adaptation.slice(0, 6).map((row) => `Adaptación: ${String(row.original ?? "")} → ${String(row.equivalent ?? "")} (se conserva: ${String(row.kept ?? "")})`),
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pinterest respondió ${response.status} al bajar la foto.`);
  return Buffer.from(await response.arrayBuffer());
}

/** Lo que se puede cambiar en las pruebas. */
export interface PinterestDeps {
  gateway?: LlmGateway;
  fetchImage?: (url: string) => Promise<Buffer>;
  /** Para buscar en Pinterest (las pruebas no salen a internet). */
  search?: typeof searchPins;
  now?: Date;
}

// ───────────────────────── Banco de referencias aprobadas ─────────────────────────

/**
 * Orden del dueño (23/11/2026): las fotos que encontraba la búsqueda nueva no valían (falsas,
 * oscuras, sin la decoración pedida). De momento NO se busca en Pinterest: cada imagen reutiliza
 * referencias del banco que él ya eligió a mano y aprobó (`reference_bank`), elegidas solas por
 * Claude según la escena. La búsqueda se queda en el código para afinarla más adelante.
 */
export const BANK_ONLY = true;
const BANK_THUMB_SIDE = 384;
const BANK_FILE = "reglas/banco-referencias.json";

interface BankSeed {
  code: string;
  sha256: string;
  bytes: number;
  accounts: string[];
  description: string;
}

/**
 * Siembra el banco con las referencias aprobadas del sistema anterior (`reglas/banco-referencias.json`;
 * los archivos ya están en el almacén, `pinterest/<sha256>.jpg`). No pisa nada: solo añade las que faltan.
 */
export async function seedReferenceBank(file: string = path.join(process.cwd(), BANK_FILE)): Promise<number> {
  let entries: BankSeed[];
  try {
    entries = JSON.parse(await fs.readFile(file, "utf8")) as BankSeed[];
  } catch {
    return 0;
  }
  let added = 0;
  for (const entry of entries) {
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) continue;
    await getDb()
      .insert(images)
      .values({ sha256: entry.sha256, mime: "image/jpeg", bytes: entry.bytes, objectKey: objectKeyOf(entry.sha256), sourceUrl: `banco:${entry.code}`, pinId: null })
      .onConflictDoNothing();
    const inserted = await getDb()
      .insert(schema.referenceBank)
      .values({ sha256: entry.sha256, code: entry.code, description: entry.description, accounts: entry.accounts, source: "aprobada_manual" })
      .onConflictDoNothing()
      .returning({ sha256: schema.referenceBank.sha256 });
    added += inserted.length;
  }
  return added;
}

/**
 * Las imágenes que el dueño aprueba alimentan el banco: si el vídeo llevaba una referencia de
 * entorno puesta a mano, esa foto pasa al banco de aprobadas (una vez por huella).
 */
export async function addApprovedToBank(user: AuthUser, videoId: number): Promise<void> {
  // Los fondos subidos a mano en la tarjeta o el vídeo (ya guardados por huella) entran tal cual.
  const manual = (await manualReferences(videoId)).filter((ref) => ref.role === "fondo" || ref.role === "ambiente");
  if (manual.length > 0) {
    const [owner] = await getDb()
      .select({ productId: schema.videos.productId })
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId));
    const product = owner ? await getProductFor(user, owner.productId) : null;
    for (const ref of manual) {
      await getDb()
        .insert(schema.referenceBank)
        .values({
          sha256: ref.sha256,
          code: `V${videoId}`,
          description: `${ref.role === "fondo" ? "Fondo" : "Ambiente"} que el dueño subió a mano en un vídeo${product ? ` de ${product.name}` : ""} y aprobó`,
          accounts: product ? [product.name.toUpperCase()] : [],
          source: "aprobada_en_lote",
        })
        .onConflictDoNothing();
    }
  }
  const [video] = await getDb()
    .select({ environmentPhotoId: schema.videos.environmentPhotoId, productId: schema.videos.productId })
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId));
  if (!video || video.environmentPhotoId === null) return;
  const product = await getProductFor(user, video.productId);
  const photo = await readProductPhoto(user, video.environmentPhotoId);
  const row = { photo: { id: video.environmentPhotoId, data: photo.data }, productName: product.name };
  let jpeg: Buffer;
  try {
    jpeg = await makeThumbnail(Buffer.from(row.photo.data), "image", STORED_SIDE);
  } catch {
    return;
  }
  const hash = await storePinterestImage(jpeg, { url: `foto:${row.photo.id}`, pinId: "", width: null, height: null });
  await getDb()
    .insert(schema.referenceBank)
    .values({
      sha256: hash,
      code: `V${videoId}`,
      description: `Referencia de entorno que el dueño puso a mano en un vídeo de ${row.productName} y aprobó`,
      accounts: [row.productName.toUpperCase()],
      source: "aprobada_en_lote",
    })
    .onConflictDoNothing();
}

/** La miniatura de una foto del banco (se hace y se guarda la primera vez). */
async function bankThumb(hash: string, cached: Buffer | null): Promise<Buffer | null> {
  if (cached) return Buffer.from(cached);
  try {
    const { data } = await readPinterestImage(hash);
    const thumb = await makeThumbnail(data, "image", BANK_THUMB_SIDE);
    await getDb().update(schema.referenceBank).set({ thumb }).where(eq(schema.referenceBank.sha256, hash));
    return thumb;
  } catch (error) {
    console.error(`[pinterest] No se pudo preparar la foto ${hash.slice(0, 12)} del banco:`, error);
    return null;
  }
}

const BANK_INSTRUCTIONS = `Eliges, del banco de referencias que el dueño ya eligió a mano y aprobó en lotes anteriores, las fotos que acompañarán a la imagen inicial de un anuncio como referencia de entorno y realismo (no aportan personas, producto ni encuadre: eso sale de otras referencias). Todas son válidas para él; tu trabajo es elegir la que mejor encaja con la escena.

Elige por este orden: el mismo tipo de sitio que la toma y que la acción quepa (salón con sofá y árbol para una escena de sofá navideña; cocina para preparar; congelador para sacar algo del congelador; tienda para comprar); la época y la decoración (si la escena es navideña, una con decoración navideña clara); la luz y el momento del día del primer fotograma; el punto de vista (un POV desde el sofá si la toma lo es); y, a igualdad, una usada en la misma cuenta. Elige como mucho ${MAX_PINTEREST_REFS}, de mejor a peor, por su número: la primera será el fondo EXACTO de la imagen (la sala que se reproduce entera), así que tiene que ser del mismo tipo de sitio y dejar sitio a la acción; la segunda, si la eliges, solo aporta textura de foto real (realismo), así que basta con que sea una foto real cotidiana de luz parecida. Si de verdad ninguna es del mismo tipo de sitio, elige la más cercana y dilo en el motivo.`;

/** Elige del banco con visión y deja lista la búsqueda (sin bajar nada: las fotos ya están en el almacén). */
async function pickFromBank(
  run: Run,
  ctx: JobContext,
  gateway: LlmGateway,
  rules: Awaited<ReturnType<typeof loadRules>>,
  scene: PinterestScene,
  product: { name: string; countries: string[] },
  frameJpeg: Buffer | null,
): Promise<void> {
  // Referencias subidas a mano en la tarjeta o el vídeo (24/11/2026): un fondo a mano es la sala y
  // manda (no se elige del banco); un «ambiente» o «realismo» a mano ocupa el hueco de realismo.
  const manual = await manualReferences(run.videoId);
  const manualRoom = manual.find((ref) => ref.role === "fondo");
  const manualRealism = manual.find((ref) => ref.role === "realismo" || ref.role === "ambiente");
  const userRef = (sha256: string, reason: string): PinterestRef => ({ sha256, query: "a mano", pinId: "a mano", sourceUrl: "subida-a-mano", reason });
  if (manualRoom) {
    const refs = [userRef(manualRoom.sha256, "Fondo subido a mano en la tarjeta: manda sobre el banco."), ...(manualRealism ? [userRef(manualRealism.sha256, "Subida a mano: realismo.")] : [])];
    await finishWithRefs(run, ctx, gateway, rules, refs, frameJpeg, product, scene, true);
    return;
  }
  const bank = await getDb().select().from(schema.referenceBank).where(eq(schema.referenceBank.active, true)).orderBy(schema.referenceBank.code);
  const shown: Array<{ row: (typeof bank)[number]; thumb: Buffer }> = [];
  for (let start = 0; start < bank.length; start += THUMB_PARALLEL) {
    const part = await Promise.all(bank.slice(start, start + THUMB_PARALLEL).map(async (row) => ({ row, thumb: await bankThumb(row.sha256, row.thumb) })));
    for (const item of part) if (item.thumb) shown.push({ row: item.row, thumb: item.thumb });
  }
  if (shown.length === 0) {
    await failRun(run, "El banco de referencias aprobadas está vacío");
    return;
  }
  const content: LlmContent = [
    textPart(
      [
        `Producto: ${product.name} (cuenta ${product.name.toUpperCase()}). Países: ${product.countries.join(", ")}.`,
        `Sitio de la toma: ${scene.place}. Época: ${scene.season ?? "sin época concreta"}. Luz: ${scene.light}. Estilo: ${scene.style}.`,
        `Tiene que verse: ${scene.needs}.`,
      ].join("\n"),
    ),
    ...(frameJpeg ? [textPart("Primer fotograma de la referencia (composición que se conserva):"), imagePart(frameJpeg, "image/jpeg")] : []),
    ...shown.flatMap((item, i) => {
      const accounts = (item.row.accounts as string[]).join(", ") || "sin cuenta";
      return [textPart(`Referencia ${i + 1} (${item.row.code}, usada en ${accounts}): ${item.row.description}`), imagePart(item.thumb, "image/jpeg")];
    }),
  ];
  const picked = await runStep(ctx, stepKey(ctx, "banco", { runId: run.id, attempt: run.attempts }), async () => {
    const answer = await gateway.call({
      tier: "medium",
      stepKey: stepKey(ctx, "banco", { runId: run.id, attempt: run.attempts }),
      userId: ctx.userId,
      productId: ctx.productId,
      rules,
      instructions: BANK_INSTRUCTIONS,
      content,
      maxTokens: 3_000,
      schema: pickSchema,
    });
    return answer.data!;
  });
  const chosen = [...new Map(picked.picks.filter((p) => p.n >= 1 && p.n <= shown.length).map((p) => [p.n, p])).values()].slice(0, MAX_PINTEREST_REFS);
  if (chosen.length === 0) {
    await failRun(run, `No se eligió ninguna referencia del banco (${picked.rejected})`);
    return;
  }
  const fromBank: PinterestRef[] = chosen.map((pick) => {
    const { row } = shown[pick.n - 1];
    return { sha256: row.sha256, query: `banco ${row.code}`, pinId: row.code, sourceUrl: `banco:${row.code}`, reason: pick.reason };
  });
  const refs = manualRealism ? [fromBank[0], userRef(manualRealism.sha256, "Subida a mano: realismo.")] : fromBank;
  await finishWithRefs(run, ctx, gateway, rules, refs, frameJpeg, product, scene, false);
}

/** Las referencias subidas a mano del vídeo (tabla `video_references`), en orden. */
async function manualReferences(videoId: number): Promise<Array<{ sha256: string; role: string }>> {
  return getDb()
    .select({ sha256: schema.videoReferences.sha256, role: schema.videoReferences.role })
    .from(schema.videoReferences)
    .where(eq(schema.videoReferences.videoId, videoId))
    .orderBy(schema.videoReferences.position);
}

/** Escribe el prompt con la sala elegida (del banco o subida a mano) y deja lista la búsqueda. */
async function finishWithRefs(
  run: Run,
  ctx: JobContext,
  gateway: LlmGateway,
  rules: Awaited<ReturnType<typeof loadRules>>,
  refs: PinterestRef[],
  frameJpeg: Buffer | null,
  product: { name: string },
  scene: PinterestScene,
  userSelected: boolean,
): Promise<void> {
  const composed = await composeFramePrompt(run, ctx, gateway, rules, refs, frameJpeg, userSelected);
  if (!composed) return;
  const [current] = await getDb().select({ scene: runs.scene }).from(runs).where(eq(runs.id, run.id));
  await setRun(run.id, {
    status: "ready",
    refs,
    error: null,
    framePrompt: composed.prompt,
    basePromptSha: composed.baseSha,
    scene: {
      ...((current?.scene as object | null) ?? {}),
      productHidden: composed.productHidden,
      packagingHidden: composed.packagingHidden,
      effectVisible: composed.effectVisible,
      effectPrompt: composed.effectPrompt,
    },
  });
  console.log(`[pinterest] Prompt con la sala del vídeo ${run.videoId}:\n${composed.prompt}`);
  console.log(
    `[pinterest] Vídeo ${run.videoId} (${product.name}): ${refs.length} referencia(s) del banco de aprobadas para «${scene.place}»: ${refs.map((r) => r.pinId).join(", ")} (${refs.map((r) => r.sha256).join(", ")})`,
  );
}

// ───────────────────────── Prompt con la sala (método aprobado) ─────────────────────────

/** Las fotos del producto que Claude mira al escribir el prompt (artículo, funcionamiento, caja), con su marca de cita. */
async function productPhotosFor(videoId: number): Promise<Array<{ tag: string; label: string; jpeg: Buffer }>> {
  const [video] = await getDb().select({ productId: schema.videos.productId }).from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video) return [];
  const rows = await getDb()
    .select({ role: schema.productPhotos.role, data: schema.productPhotos.data })
    .from(schema.productPhotos)
    .where(and(eq(schema.productPhotos.productId, video.productId), inArray(schema.productPhotos.role, ["articulo", "funcionamiento", "embalaje"])))
    .orderBy(schema.productPhotos.id);
  const tags: Record<string, { tag: string; label: string }[]> = {
    articulo: [
      { tag: "{ARTICLE}", label: "el artículo del encargo (forma, color y materiales exactos)" },
      { tag: "{ARTICLE2}", label: "otra vista del artículo del encargo" },
    ],
    funcionamiento: [{ tag: "{EFFECT}", label: "el producto del encargo funcionando: su efecto exacto (forma, color, luz)" }],
    embalaje: [{ tag: "{PACKAGING}", label: "la caja del producto del encargo" }],
  };
  const out: Array<{ tag: string; label: string; jpeg: Buffer }> = [];
  const used: Record<string, number> = {};
  for (const row of rows) {
    const slot = tags[row.role]?.[used[row.role] ?? 0];
    if (!slot) continue;
    used[row.role] = (used[row.role] ?? 0) + 1;
    try {
      out.push({ ...slot, jpeg: await makeThumbnail(Buffer.from(row.data), "image", 768) });
    } catch {
      // Una foto que no se puede leer no se enseña.
    }
  }
  return out;
}

/**
 * Método del sistema anterior, copiado tal cual (orden del dueño, 23/11/2026; ver
 * `reglas/imagen-nano-banana.md`, «Fondo con referencia»). Ocho párrafos: composición, identidad,
 * producto, entorno (la sala descrita elemento a elemento), luz + `LIGHTING_POLICY`, realismo,
 * negativos y formato. Los cuatro últimos textos fijos son literales de los prompts aprobados.
 */
export const LIGHTING_POLICY =
  "When a room, space or environment reference is supplied, its observed lighting is the primary authority for the entire scene, overriding conflicting lighting in composition, avatar, product or style references and generic lighting recipes. Match its light direction, sources, colour temperature, intensity, contrast, exposure and falloff across the person, skin, clothing, hands, product and packaging. Re-light inserted elements to that environment, including cast and contact shadows, occlusion, reflections and colour bounce; match perspective, scale, depth, sharpness and image texture. Preserve real differences between illuminated and shaded areas: coherent integration does not mean flat or evenly filled lighting. No pasted cutouts, halos, floating objects, isolated portrait lighting or independent exposure. If no environment reference is supplied, retain the scene-specific lighting described above.";
const realismParagraph = (tag: string) =>
  `${tag[0].toUpperCase()}${tag.slice(1)} is realism reference only for texture. The scene-specific light in the previous paragraph controls all lighting; do not import the style photograph lighting or setting. If an environment reference is supplied, this style reference supplies texture only and must not override that environment lighting. Everyday phone-video softness varies with subject distance, light and movement; do not give skin, fabric and background identical fine detail. Do not copy its person, pose, face, clothing, product, logos or overlays. Preserve the identity and action already specified. No artificial HDR or cosmetic skin smoothing.`;
export const NEGATIVE_PARAGRAPH =
  "NEGATIVE: no source captions, watermarks, interface, extra fingers, fused hands, floating objects, pasted edges, redesigned products, mixed identities, isolated portrait light or artificial background blur.";
export const FORMAT_PARAGRAPH =
  "Vertical 9:16 mobile frame. No captions, subtitles, emojis, overlays, play controls or interface. Only authentic physical package or storefront print belongs in the scene.";
/** Marcas de los números de las dos fotos en el prompt guardado (se sustituyen al pedir la imagen). */
export const ROOM_TAG = "{ROOM}";
export const REALISM_TAG = "{REALISM}";

const oneParagraph = z
  .string()
  .min(40)
  .refine((text) => !/\n\s*\n/.test(text), "Un solo párrafo");
const composedSchema = z.object({
  productVisible: z.boolean().describe("Si el artículo o su efecto se ven en esta toma (false si aún está envuelto, tapado o fuera de plano)."),
  packagingVisible: z.boolean().describe("Si la caja o el envase del producto se ve en esta toma."),
  effectVisible: z.boolean().describe("Si en esta toma se ve el efecto del producto funcionando (proyección, luz, resultado) y hay foto de funcionamiento."),
  effectPrompt: z
    .string()
    .nullable()
    .describe("Con effectVisible: el prompt corto, en inglés, del paso de edición del efecto (empieza por «Edit image 1.»); si no, null."),
  composition: oneParagraph.describe("Párrafo 1, en inglés."),
  identity: oneParagraph.describe("Párrafo 2, en inglés."),
  product: oneParagraph.describe("Párrafo 3, en inglés."),
  environment: oneParagraph.describe("Párrafo 4, en inglés: la sala de {ROOM} elemento a elemento con su posición."),
  lighting: oneParagraph.describe("Párrafo 5, en inglés: la luz que se ve en {ROOM} (sin la frase fija, la añade la aplicación)."),
});

const COMPOSE_INSTRUCTIONS = `Reescribes el prompt de la imagen inicial de un anuncio con el método aprobado de la regla «Imágenes con Nano Banana», sección «Fondo con referencia de salón o espacio» (sigue sus ejemplos aprobados A, C y D al pie de la letra en estructura y tono). Tienes: el prompt del desglose (acción, identidad, producto y cambios que se conservan), el fotograma original (image 1) y la foto de la sala elegida, que es el fondo EXACTO.

Escribe en inglés, en prosa corrida, cinco párrafos (cada uno de un solo bloque):
1. composition: «Use image 1 ONLY for the exact opening action and foreground arrangement: …» con punto de vista, manos, objeto, su tamaño en porcentaje del ancho del encuadre y el momento de la acción, tal como dice el prompt del desglose. Termina con «Replace all original … scenery with the exact … in image {ROOM}.» y nombra los muebles y objetos del fondo del original que NO pasan («Do not copy the source …»). Quita los rótulos del original.
2. identity: la identidad solo del avatar con su número, como en el desglose (manos, piel, ropa).
3. product: el producto como en el desglose (si aún no se ve, no se anticipa ni se añade la caja).
4. environment: «Reference image {ROOM} is the EXACT requested background, not an inspiration. Preserve its …» y entre 6 y 12 elementos que VES en esa foto, cada uno con su posición (LEFT, RIGHT, centre, foreground, background). Mete la cámara dentro de esa sala desde el punto de vista del fotograma original («Camera is … looking into this same room»), «Preserve recognizable architecture, furniture, ornaments and natural spatial depth.», «Do not add …» con lo que no debe aparecer, y «Never raise the camera just to fit the whole room.». Mantén la acción, las manos y el momento intactos.
5. lighting: «Match the actual … light in reference image {ROOM}» con las fuentes, direcciones y temperatura que se ven en esa foto, y cómo comparten esa luz las manos, la persona y el objeto (sombras de contacto). Sin la frase fija de luz: la añade la aplicación.

Primero decide productVisible (si el artículo o su efecto se ven en esta toma) y packagingVisible (si se ve la caja). Lo que no se ve no se adjunta, como en el método aprobado: no lo cites.

Cita cada imagen por su papel, literal y con llaves, nunca con un número: el fotograma original es image 1; la sala, image {ROOM}; el avatar, image {AVATAR}; la primera foto del artículo, image {ARTICLE} (la segunda, image {ARTICLE2}…); la foto del producto funcionando o de su efecto, image {EFFECT}; la caja, image {PACKAGING}; las referencias que el dueño subió a mano para la ropa u otra cosa, image {MANUAL1}, image {MANUAL2}… (con su papel: «Image {MANUAL1} is the user-selected outfit reference: …»). La aplicación pone los números reales. Si en la lista de adjuntos no hay foto de funcionamiento, no cites {EFFECT}.

EL PRODUCTO SIEMPRE ES EL DEL ENCARGO, y se nombra como en el método aprobado: nunca por su nombre de marca ni por el nombre o la marca del producto de image 1 (Higgsfield bloquea un nombre de marca como si fuera ajena). En el párrafo product escribe «Image {ARTICLE} is the exact selected product» (y si se ve la caja, «image {PACKAGING} is its exact retail packaging»), «Retain its geometry, markings, materials and realistic scale», descríbelo con palabras genéricas (p. ej. «the small black collar projector with a cylindrical module») y ordena sustituir el objeto de image 1 descrito también de forma genérica («the glowing collar gadget of image 1 is replaced by the exact selected product of image {ARTICLE}»). Si hay foto de funcionamiento, «image {EFFECT} shows the exact selected product working: its exact effect». La marca propia solo aparece como marca física impresa en el producto o en su caja. De image 1 solo se conservan la posición, el tamaño en el encuadre, la orientación y cómo se usa o se sujeta; nunca su forma, su color ni su efecto («never the one in image 1»). No escribas «same as image 1» ni «as the … in image 1» para el aspecto del producto o de su efecto. Si el producto produce un efecto (una proyección, una luz, un resultado) y hay foto de funcionamiento, el efecto de image 1 se BORRA entero y se dibuja el de image {EFFECT}: escribe «Erase the projected effect of image 1 completely; it must not survive in shape, outline or texture. Draw instead the exact effect of image {EFFECT}» y describe su forma con detalle, mirando image {EFFECT} (p. ej. «two butterfly wings on each side: a large rounded forewing above and a smaller rounded hindwing below, scalloped edges, translucent pink fading to lilac, a network of thin white veins radiating from the body, small sparkles»), con su tamaño y posición respecto al sujeto tal como en image {EFFECT}, y añade «not feathers, not angel wings, not dragon wings, no pointed feather tips». Para el efecto no cites image 1 ni su tamaño, y no nombres la forma del efecto original más que para borrarlo.

Los demás objetos del fotograma que sostiene o toca la persona y que NO son el producto (envoltorio de regalo, papel, ropa, correa) se conservan tal cual salvo que el dueño haya pedido cambiarlos: aunque el prompt del desglose proponga cambiar el papel o el envoltorio, no lo cambies.

En lighting, además de la luz de la sala, di cómo se vuelve a iluminar el sujeto (manos, brazos, persona, objeto) con esa misma luz: dirección, exposición, color, contraste, el lado en sombra, sombras de contacto y rebote de color, y que no conserva la luz de image 1. Nada de aspecto de recorte pegado.

Decide también effectVisible: si en esta toma se ve el efecto del producto funcionando (una proyección, una luz, un resultado) y en los adjuntos hay foto de funcionamiento. Entonces escribe effectPrompt: el prompt corto de un segundo paso de edición, sobre la imagen ya generada (image 1) con la foto del producto funcionando (image 2), que cambia SOLO el efecto. En inglés, así (adaptándolo a lo que ves): «Edit image 1. Change only the [efecto, p. ej. two glowing light projections on the ground on each side of the dog]; keep everything else in image 1 exactly as it is: the same [lugar, luz, personas, manos, objetos], framing and camera. The [efecto] in image 1 may have the wrong shape. Erase it completely and draw instead the exact [efecto] of image 2: [forma, estructura, colores y detalles que ves en la foto de funcionamiento]. [Dónde empieza y cómo se apoya en la escena, en perspectiva, y el tinte de luz que deja cerca.] Not [formas incorrectas, p. ej. feathers, angel wings, dragon wings]. Do not copy the [sujeto], the floor or the background of image 2: from image 2 take only the shape, colours, details and glow of the effect. Vertical 9:16 phone photo, no text, no captions, no watermark.» Sin nombres de marca. Si no se ve el efecto, effectVisible false y effectPrompt null.

No uses palabras de la lista negra de la regla. Nada de títulos en mayúsculas.`;

/**
 * Escribe el prompt de la imagen con la sala elegida (método aprobado): Claude mira la sala y el
 * fotograma original y escribe los párrafos 1–5; el código pone los fijos. `null` si no se pudo
 * (la búsqueda queda para reintentarse).
 */
async function composeFramePrompt(
  run: Run,
  ctx: JobContext,
  gateway: LlmGateway,
  rules: Awaited<ReturnType<typeof loadRules>>,
  refs: PinterestRef[],
  frameJpeg: Buffer | null,
  userSelected = false,
): Promise<{
  prompt: string;
  baseSha: string;
  productHidden: boolean;
  packagingHidden: boolean;
  effectVisible: boolean;
  effectPrompt: string | null;
} | null> {
  const [video] = await getDb().select({ imagePrompt: schema.videos.imagePrompt }).from(schema.videos).where(eq(schema.videos.id, run.videoId));
  const base = video?.imagePrompt ?? null;
  if (!base) {
    await failRun(run, "El vídeo aún no tiene prompt de imagen");
    return null;
  }
  const room = await makeThumbnail((await readPinterestImage(refs[0].sha256)).data, "image", 1024);
  const productPhotos = await productPhotosFor(run.videoId);
  const extras = (await manualReferences(run.videoId)).filter((ref) => ref.role === "ropa" || ref.role === "otro");
  const extraParts: Array<ReturnType<typeof textPart>> = [];
  for (const [i, ref] of extras.entries()) {
    try {
      const jpeg = await makeThumbnail((await readPinterestImage(ref.sha256)).data, "image", 768);
      const label = ref.role === "ropa" ? "la ropa que debe llevar la persona (subida a mano)" : "otra referencia subida a mano por el dueño (úsala por lo que muestra)";
      extraParts.push(textPart(`image {MANUAL${i + 1}} — ${label}:`), imagePart(jpeg, "image/jpeg"));
    } catch {
      // Una referencia que no se puede leer no se enseña.
    }
  }
  const content: LlmContent = [
    textPart(`Prompt del desglose (lo que se conserva: acción, identidad, producto):\n${base}`),
    ...productPhotos.flatMap((photo) => [textPart(`image ${photo.tag} — ${photo.label}:`), imagePart(photo.jpeg, "image/jpeg")]),
    ...(frameJpeg ? [textPart("image 1 — fotograma original (composición):"), imagePart(frameJpeg, "image/jpeg")] : []),
    textPart(
      userSelected
        ? "image {ROOM} — el fondo que el dueño subió a mano en la tarjeta, fondo EXACTO. En el párrafo environment empieza con «Image {ROOM} is the user-selected room background only, not product identity.»:"
        : "image {ROOM} — la sala elegida, fondo EXACTO:",
    ),
    imagePart(room, "image/jpeg"),
    ...extraParts,
  ];
  const imageRules = await loadRules([RULE_SLUGS.imagen]);
  const written = await runStep(ctx, stepKey(ctx, "prompt-sala", { runId: run.id, attempt: run.attempts, room: refs[0].sha256 }), async () => {
    const answer = await gateway.call({
      tier: "medium",
      stepKey: stepKey(ctx, "prompt-sala", { runId: run.id, attempt: run.attempts, room: refs[0].sha256 }),
      userId: ctx.userId,
      productId: ctx.productId,
      rules: [...imageRules, ...rules],
      instructions: COMPOSE_INSTRUCTIONS,
      content,
      maxTokens: 6_000,
      schema: composedSchema,
    });
    return answer.data!;
  });
  const paragraphs = [
    written.composition.trim(),
    written.identity.trim(),
    written.product.trim(),
    written.environment.trim(),
    `${written.lighting.trim()} ${LIGHTING_POLICY}`,
    ...(refs.length > 1 ? [realismParagraph(`image ${REALISM_TAG}`)] : []),
    NEGATIVE_PARAGRAPH,
    FORMAT_PARAGRAPH,
  ];
  return {
    prompt: paragraphs.join("\n\n"),
    baseSha: crypto.createHash("sha256").update(base).digest("hex"),
    productHidden: !written.productVisible,
    packagingHidden: !written.packagingVisible,
    effectVisible: written.effectVisible && !!written.effectPrompt,
    effectPrompt: written.effectVisible ? written.effectPrompt : null,
  };
}

/**
 * El prompt que se manda con la sala: el reescrito con el método aprobado si sigue valiendo (el
 * prompt del vídeo no cambió), con los números reales de las fotos; si no, el del desglose con
 * el párrafo de papeles (`withPinterestRoles`).
 */
export async function framePromptFor(videoId: number, imagePrompt: string, manifest: ManifestItem[]): Promise<string> {
  const tags = manifest.filter((item) => item.source.kind === "pinterest").map((item) => item.tag);
  if (tags.length === 0) return imagePrompt;
  const analysisId = await latestDoneAnalysisId(videoId);
  const run = analysisId === null ? null : await runOf(videoId, analysisId);
  const sha = crypto.createHash("sha256").update(imagePrompt).digest("hex");
  if (!run?.framePrompt || run.basePromptSha !== sha) return withPinterestRoles(imagePrompt, manifest);
  const number = (item: ManifestItem | undefined) => (item ? String(item.index) : "?");
  const byRole = (role: ManifestItem["role"]) => manifest.filter((item) => item.role === role);
  const pins = byRole("pinterest");
  const articles = byRole("articulo");
  return run.framePrompt
    .replaceAll(ROOM_TAG, number(pins[0]))
    .replaceAll(REALISM_TAG, number(pins[1] ?? pins[0]))
    .replaceAll("{AVATAR}", number(byRole("avatar")[0]))
    .replaceAll("{PACKAGING}", number(byRole("embalaje")[0]))
    .replaceAll("{EFFECT}", number(byRole("funcionamiento")[0]))
    .replace(/\{MANUAL(\d)\}/g, (_, n: string) => number(byRole("referencia")[Number(n) - 1]))
    .replace(/\{ARTICLE(\d?)\}/g, (_, n: string) => number(articles[(n ? Number(n) : 1) - 1]));
}

// ───────────────────────── El trabajo ─────────────────────────

async function setRun(runId: number, changes: Partial<typeof runs.$inferInsert>): Promise<void> {
  await getDb()
    .update(runs)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(runs.id, runId));
}

async function failRun(run: Run, message: string): Promise<void> {
  const attempts = run.attempts + 1;
  if (attempts < MAX_PINTEREST_ATTEMPTS) {
    // Otra vez desde el principio (otras consultas), sin molestar.
    await setRun(run.id, { status: "pending", attempts, error: message, scene: null, queries: null, refs: null });
    return;
  }
  await setRun(run.id, { status: "failed", attempts, error: message });
}

/**
 * Hace la búsqueda `runId`: consultas, búsqueda (nube o Mac), elección y guardado. Si tiene que
 * esperar al Mac, se queda en `waiting_mac` y el seguimiento la vuelve a encolar cuando el Mac
 * contesta. Repetirla no cobra dos veces a Claude (cada llamada va en su paso).
 */
export async function runPinterest(runId: number, deps: PinterestDeps = {}): Promise<void> {
  try {
    await runPinterestOnce(runId, deps);
  } catch (error) {
    const [run] = await getDb().select().from(runs).where(eq(runs.id, runId));
    if (run && run.status !== "ready" && run.status !== "failed") {
      if (error instanceof JobPausedError) {
        // Sin saldo en la API de Claude (o el tope de gasto): espera sin gastar intentos y la
        // tarjeta lo dice; el seguimiento la vuelve a intentar sola.
        await setRun(run.id, { status: "pending", error: error.scope === "saldo" ? NO_CREDIT : "En pausa: se ha alcanzado el tope de gasto." });
      } else {
        // Otro fallo (Claude, la red…): otro intento con pasos nuevos, hasta rendirse y decirlo.
        await failRun(run, error instanceof Error ? error.message : "La búsqueda falló");
      }
    }
    throw error;
  }
}

async function runPinterestOnce(runId: number, deps: PinterestDeps): Promise<void> {
  const [run] = await getDb().select().from(runs).where(eq(runs.id, runId));
  if (!run || run.status === "ready" || run.status === "failed") return;
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, run.videoId));
  const [analysis] = await getDb().select().from(schema.videoAnalyses).where(eq(schema.videoAnalyses.id, run.analysisId));
  if (!video || !analysis) return;
  if (video.environmentPhotoId !== null) {
    // El dueño puso una referencia de entorno a mano: no se busca (y no se adjunta nada de Pinterest).
    await setRun(run.id, { status: "ready", refs: [], error: null });
    return;
  }
  const user = await getActiveUser(video.createdBy);
  if (!user) throw new StepFailedError("Esta cuenta está desactivada.");
  await setRun(run.id, { status: "searching" });

  const ctx: JobContext = { jobName: PINTEREST_JOB, userId: video.createdBy, productId: video.productId };
  const gateway = deps.gateway ?? getGateway();
  const product = await getProductFor(user, video.productId);
  const rules = await loadRules([RULE_SLUG]);
  const [frame] = await getDb()
    .select({ mime: schema.videoFrames.mime, data: schema.videoFrames.data })
    .from(schema.videoFrames)
    .where(eq(schema.videoFrames.videoId, video.id))
    .orderBy(schema.videoFrames.index)
    .limit(1);
  const frameJpeg = frame ? await makeThumbnail(Buffer.from(frame.data), "image", 768) : null;
  const month = (deps.now ?? new Date()).toLocaleDateString("es-ES", { month: "long" });

  // 1. Escena y consultas.
  let scene = run.scene as PinterestScene | null;
  if (!scene) {
    const content: LlmContent = [
      textPart(
        [
          `Producto: ${product.name}`,
          `Qué hace: ${product.summary}`,
          `Idioma del anuncio: ${product.language}`,
          `Países: ${product.countries.join(", ")}`,
          `Mes actual: ${month}`,
          video.note ? `Cambios pedidos para este vídeo: ${video.note}` : "",
          video.adaptation ? `Adaptación pedida: ${video.adaptation}` : "",
          "",
          "Desglose de la referencia:",
          analysisText(analysis.result as Record<string, unknown> | null),
        ]
          .filter((line) => line !== null)
          .join("\n"),
      ),
      ...(frameJpeg ? [textPart("Primer fotograma de la referencia (la composición que se conserva):"), imagePart(frameJpeg, "image/jpeg")] : []),
    ];
    const planned = await runStep(ctx, stepKey(ctx, "consultas", { runId: run.id, attempt: run.attempts }), async () => {
      const answer = await gateway.call({
        tier: "medium",
        stepKey: stepKey(ctx, "consultas", { runId: run.id, attempt: run.attempts }),
        userId: ctx.userId,
        productId: ctx.productId,
        rules,
        instructions: PLAN_INSTRUCTIONS,
        content,
        maxTokens: 4_000,
        schema: sceneSchema,
      });
      return answer.data!;
    });
    scene = { ...planned, queries: [...new Set(planned.queries.map((q) => q.trim()).filter(Boolean))] };
    await setRun(run.id, { scene, queries: scene.queries });
  }

  // 2. Orden del dueño (23/11): de momento no se busca en Pinterest; se elige del banco de aprobadas.
  if (BANK_ONLY) {
    await pickFromBank(run, ctx, gateway, rules, scene, product, frameJpeg);
    return;
  }

  // 2. Buscar (nube; si no deja, el Mac). Retirado de momento (`BANK_ONLY`).
  // Se carga aquí: `pinterest-searches` arrastra la cola de trabajos (subidas → trabajos de vídeo →
  // este módulo), y cargarlo arriba crea un ciclo de importaciones que rompe la compilación.
  const search = deps.search ?? (await import("@/server/pinterest-searches")).searchPins;
  const found: Array<PinCandidate & { query: string }> = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  for (const query of scene.queries) {
    const state = await search(query, { now: deps.now });
    if (state.status === "waiting_mac") {
      await setRun(run.id, { status: "waiting_mac" });
      return;
    }
    if (state.status === "failed") {
      failures.push(state.error);
      continue;
    }
    for (const candidate of state.candidates) {
      if (seen.has(candidate.imageUrl)) continue;
      seen.add(candidate.imageUrl);
      found.push({ ...candidate, query });
    }
  }
  // Repartidas entre las consultas (las primeras de cada una), hasta `MAX_CANDIDATES`.
  const perQuery = Math.ceil(MAX_CANDIDATES / Math.max(1, scene.queries.length));
  const shortlist = scene.queries.flatMap((query) => found.filter((c) => c.query === query).slice(0, perQuery)).slice(0, MAX_CANDIDATES);
  if (shortlist.length === 0) {
    await failRun(run, failures[0] ?? "Pinterest no devolvió ninguna foto para estas búsquedas");
    return;
  }

  // 3. Elegir con visión.
  const fetchImage = deps.fetchImage ?? fetchBytes;
  const thumbs: Array<{ candidate: (typeof shortlist)[number]; jpeg: Buffer }> = [];
  // De 4 en 4: muchas ffmpeg a la vez agotan los hilos del servidor y fallan otras tareas.
  for (let start = 0; start < shortlist.length; start += THUMB_PARALLEL) {
    await Promise.all(
      shortlist.slice(start, start + THUMB_PARALLEL).map(async (candidate, offset) => {
        try {
          thumbs[start + offset] = { candidate, jpeg: await makeThumbnail(await fetchImage(candidate.thumbUrl), "image", THUMB_SIDE) };
        } catch {
          // Una miniatura que no baja no se enseña.
        }
      }),
    );
  }
  const shown = thumbs.filter(Boolean);
  if (shown.length === 0) {
    await failRun(run, "No se pudo bajar ninguna foto de Pinterest");
    return;
  }
  const pickContent: LlmContent = [
    textPart(
      [
        `Producto: ${product.name}. Países: ${product.countries.join(", ")}.`,
        `Sitio de la toma: ${scene.place}. Época: ${scene.season ?? "sin época concreta"}. Luz: ${scene.light}. Estilo: ${scene.style}.`,
        `Tiene que verse: ${scene.needs}.`,
      ].join("\n"),
    ),
    ...(frameJpeg ? [textPart("Primer fotograma de la referencia (composición que se conserva):"), imagePart(frameJpeg, "image/jpeg")] : []),
    ...shown.flatMap((item, i) => [textPart(`Candidata ${i + 1} (búsqueda «${item.candidate.query}»)`), imagePart(item.jpeg, "image/jpeg")]),
  ];
  const picked = await runStep(ctx, stepKey(ctx, "eleccion", { runId: run.id, attempt: run.attempts }), async () => {
    const answer = await gateway.call({
      tier: "medium",
      stepKey: stepKey(ctx, "eleccion", { runId: run.id, attempt: run.attempts }),
      userId: ctx.userId,
      productId: ctx.productId,
      rules,
      instructions: PICK_INSTRUCTIONS,
      content: pickContent,
      maxTokens: 3_000,
      schema: pickSchema,
    });
    return answer.data!;
  });
  const chosen = [...new Map(picked.picks.filter((p) => p.n >= 1 && p.n <= shown.length).map((p) => [p.n, p])).values()].slice(0, MAX_PINTEREST_REFS);
  if (chosen.length === 0) {
    await failRun(run, `Ninguna foto de Pinterest valía (${picked.rejected})`);
    return;
  }

  // 4. Bajar a tamaño original y guardar.
  const refs: PinterestRef[] = [];
  for (const pick of chosen) {
    const { candidate } = shown[pick.n - 1];
    let jpeg: Buffer | null = null;
    for (const url of [candidate.imageUrl, candidate.mediumUrl].filter((u): u is string => !!u)) {
      try {
        jpeg = await makeThumbnail(await fetchImage(url), "image", STORED_SIDE);
        break;
      } catch {
        // Se prueba con la siguiente versión.
      }
    }
    if (!jpeg) continue;
    const hash = await storePinterestImage(jpeg, { url: candidate.imageUrl, pinId: candidate.pinId, width: candidate.width, height: candidate.height });
    refs.push({ sha256: hash, query: candidate.query, pinId: candidate.pinId, sourceUrl: candidate.imageUrl, reason: pick.reason });
  }
  if (refs.length === 0) {
    await failRun(run, "No se pudieron bajar las fotos elegidas de Pinterest");
    return;
  }
  await setRun(run.id, { status: "ready", refs, error: null });
  console.log(
    `[pinterest] Vídeo ${video.id} (${product.name}): ${refs.length} referencia(s) para «${scene.place}» (${scene.queries.join(" | ")}): ${refs.map((r) => r.sha256).join(", ")}`,
  );
}

// ───────────────────────── Seguimiento ─────────────────────────

/** Vídeos que se ponen en marcha por pasada, como mucho (cada uno son dos llamadas a Claude). */
const BACKFILL_PER_SWEEP = 5;
/** Solo desgloses de estos últimos días (los viejos se buscan al pedir su imagen). */
const BACKFILL_DAYS = 7;

/**
 * Vídeos que aún esperan su imagen (sin imagen aprobada), sin entorno a mano y con un desglose
 * reciente hecho sin búsqueda de Pinterest (p. ej. desglosados antes de esta regla): se ponen en
 * marcha ya, para que la tarjeta las enseñe antes de pedir la imagen.
 */
async function startMissingRuns(now: Date): Promise<void> {
  const since = new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60_000);
  const { rows } = await getDb().execute<{ video_id: string; analysis_id: string }>(sql`
    select v.id as video_id, a.id as analysis_id
    from videos v
    join lateral (
      select id, updated_at from video_analyses
      where video_id = v.id and status = 'done'
      order by version desc limit 1
    ) a on true
    where v.environment_photo_id is null
      and v.approved_frame_result_id is null
      and a.updated_at > ${since}
      and not exists (select 1 from video_pinterest_refs r where r.video_id = v.id and r.analysis_id = a.id)
    order by a.updated_at desc
    limit ${BACKFILL_PER_SWEEP}`);
  for (const row of rows) {
    try {
      await ensurePinterestRun(Number(row.video_id), Number(row.analysis_id));
    } catch (error) {
      console.error(`[pinterest] No se pudo poner en marcha la búsqueda del vídeo ${row.video_id}:`, error);
    }
  }
}

/**
 * Dentro del seguimiento de vídeos (cada minuto): vuelve a encolar las búsquedas pendientes sin
 * novedades, las que esperaban al Mac (cuando ya contestó o se cansó) y las que se quedaron a
 * medias. Devuelve cuántas encoló.
 */
export async function sweepPinterest(now: Date = new Date()): Promise<number> {
  await startMissingRuns(now);
  const rows = await getDb()
    .select()
    .from(runs)
    .where(
      or(
        // Sin saldo en la API de Claude, cada 10 minutos (no cada 2).
        and(eq(runs.status, "pending"), lt(runs.updatedAt, new Date(now.getTime() - REQUEUE_MS)), or(isNull(runs.error), ne(runs.error, NO_CREDIT))),
        and(eq(runs.status, "pending"), lt(runs.updatedAt, new Date(now.getTime() - STALE_SEARCH_MS)), eq(runs.error, NO_CREDIT)),
        eq(runs.status, "waiting_mac"),
        and(eq(runs.status, "searching"), lt(runs.updatedAt, new Date(now.getTime() - STALE_SEARCH_MS))),
      ),
    )
    .limit(50);
  let queued = 0;
  for (const run of rows) {
    if (run.status === "waiting_mac") {
      const queries = ((run.queries as string[] | null) ?? []).map((q) => q.replace(/\s+/g, " ").trim().toLowerCase());
      const waiting = queries.length
        ? await getDb()
            .select({ id: schema.pinterestSearches.id })
            .from(schema.pinterestSearches)
            .where(and(inArray(schema.pinterestSearches.query, queries), eq(schema.pinterestSearches.status, "pending")))
        : [];
      if (waiting.length > 0) continue;
    }
    if (run.status === "searching") {
      // Se quedó a medias (el proceso se paró o sus pasos se agotaron): otro intento con pasos nuevos.
      if (run.attempts + 1 >= MAX_PINTEREST_ATTEMPTS) {
        await setRun(run.id, { status: "failed", attempts: run.attempts + 1, error: run.error ?? "La búsqueda se quedó a medias varias veces" });
        continue;
      }
      await setRun(run.id, { status: "pending", attempts: run.attempts + 1, scene: null, queries: null, refs: null });
    } else await setRun(run.id, {});
    try {
      await enqueue(run);
      queued += 1;
    } catch (error) {
      console.error(`[pinterest] No se pudo volver a encolar la búsqueda ${run.id}:`, error);
    }
  }
  return queued;
}
