import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getObjectStore } from "@/lib/object-store";
import { resolveClipModel, SEEDANCE, SOURCE_LIMITS } from "@/lib/clip-models";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { extractFrames, normalizeClip } from "@/server/media/ffmpeg";
import { usesPlaces, type AnalysisPlace } from "@/server/videos/analysis";
import type { GenDeps, GenerationKind } from "@/server/videos/generations";
import type { Video } from "@/server/videos/videos";

/**
 * Sitios de la referencia (regla fija de Emmanuel, 24/11/2026; el defecto que más le molestaba en
 * Codex): cada toma conserva su sitio y su acción. Si la nevera sale en una toma, la nevera se queda;
 * una referencia de entorno del dueño solo vale para las tomas de ese tipo de sitio; las demás buscan
 * su propio entorno en Pinterest, localizado al país.
 *
 * Cómo, copiando Codex («cada clip Genjutsu necesita su apertura»): el desglose agrupa las tomas
 * consecutivas del mismo sitio (`Analysis.places`). El primer sitio es el vídeo de siempre (tipos
 * `frame`, `clip`, `upscale`); cada sitio extra N lleva su propia apertura (`frame:N`), su tramo de
 * Motion Transfer (`clip:N`, con el vídeo fuente recortado a ese sitio) y su subida a 1080p
 * (`upscale:N`). El montaje los empalma por orden antes de montar (`montaje-nube.ts`).
 *
 * Las generaciones de un sitio usan los mismos constructores, con el vídeo «visto desde ese sitio»
 * (`tramoVideo`): su prompt, su referencia recortada, su duración y lo aprobado de ese sitio.
 */

/** Un sitio de la referencia, en milisegundos del tramo. */
export interface Tramo {
  index: number;
  startMs: number;
  endMs: number;
  place: string;
  action: string;
  keepObjects: string[];
  ownerEnvironment: boolean;
  imagePrompt: string;
  videoPrompt: string;
}

/** El vídeo visto desde uno de sus sitios (solo existe en memoria; ver `tramoVideo`). */
export type TramoVideo = Video & { tramo?: { index: number; startMs: number; endMs: number; place: string; base: Video } };

/** Lo que dura como mínimo un sitio (lo de menos se junta con el anterior). */
const MIN_TRAMO_MS = 1000;
/** Como mucho, sitios por vídeo. */
export const MAX_TRAMOS = 6;

// ───────────────────────── Tipos de generación ─────────────────────────

export type BaseKind = "frame" | "clip" | "upscale";

/** `frame` para el primer sitio, `frame:N` para el sitio N. */
export function tramoKind(base: BaseKind, index: number): GenerationKind {
  return (index === 0 ? base : `${base}:${index}`) as GenerationKind;
}

/** El tipo base y el sitio de un tipo de generación (`clip:2` → clip, 2). */
export function parseKind(kind: string): { base: BaseKind; index: number } {
  const [base, index] = kind.split(":");
  return { base: base as BaseKind, index: index === undefined ? 0 : Number(index) };
}

export const isTramoKind = (kind: string) => kind.includes(":");

// ───────────────────────── Los sitios ─────────────────────────

/**
 * Los sitios del desglose, ordenados, sin huecos ni solapes y cubriendo el tramo entero; los de
 * menos de 1 s se juntan con el anterior. `null` si hay uno solo (o el desglose no los trae).
 */
export function normalizePlaces(places: AnalysisPlace[] | null | undefined, segmentMs: number): Tramo[] | null {
  if (!Array.isArray(places) || places.length < 2 || segmentMs <= 0) return null;
  const sorted = [...places]
    .filter((p) => Number.isFinite(p.startS) && Number.isFinite(p.endS))
    .sort((a, b) => a.startS - b.startS)
    .slice(0, MAX_TRAMOS);
  const tramos: Tramo[] = [];
  for (const place of sorted) {
    const startMs = tramos.length === 0 ? 0 : Math.min(segmentMs, Math.max(0, Math.round(place.startS * 1000)));
    const previous = tramos.at(-1);
    if (previous) previous.endMs = startMs;
    const tramo: Tramo = {
      index: tramos.length,
      startMs,
      endMs: segmentMs,
      place: place.place,
      action: place.action,
      keepObjects: Array.isArray(place.keepObjects) ? place.keepObjects : [],
      ownerEnvironment: place.ownerEnvironment === true,
      imagePrompt: place.imagePrompt ?? "",
      videoPrompt: place.videoPrompt ?? "",
    };
    // Un sitio siguiente sin sus prompts no se puede generar: se queda con el anterior.
    if (previous && (!tramo.imagePrompt.trim() || !tramo.videoPrompt.trim())) {
      previous.endMs = segmentMs;
      continue;
    }
    tramos.push(tramo);
  }
  // Lo demasiado corto se junta con el anterior (o, el primero, con el siguiente).
  for (let i = tramos.length - 1; i >= 0 && tramos.length > 1; i--) {
    const t = tramos[i];
    if (t.endMs - t.startMs >= MIN_TRAMO_MS) continue;
    if (i > 0) {
      tramos[i - 1].endMs = t.endMs;
      tramos.splice(i, 1);
    } else {
      tramos[1].startMs = 0;
      tramos[1] = { ...tramos[1], imagePrompt: t.imagePrompt, videoPrompt: t.videoPrompt };
      tramos.splice(0, 1);
    }
  }
  if (tramos.length < 2) return null;
  return tramos.map((t, index) => ({ ...t, index }));
}

/** El resultado del último desglose hecho del vídeo (crudo), o `null`. */
async function latestResult(videoId: number): Promise<Record<string, unknown> | null> {
  const [done] = await getDb()
    .select({ result: schema.videoAnalyses.result })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  return (done?.result as Record<string, unknown> | null) ?? null;
}

/**
 * Los sitios del vídeo según su último desglose hecho, o `null` si va en un solo sitio (o su modelo
 * o su tipo no parten la referencia: ver `usesPlaces`).
 */
export async function tramosOf(
  video: Pick<Video, "id" | "kind" | "clipModel" | "segmentDurationMs" | "referenceStorageKey">,
  result?: Record<string, unknown> | null,
): Promise<Tramo[] | null> {
  // Partir la referencia necesita el archivo entero guardado (todas las subidas nuevas lo guardan);
  // sin él, el vídeo va como siempre, en un solo tramo.
  if (!video.segmentDurationMs || !video.referenceStorageKey) return null;
  const model = resolveClipModel(video.clipModel, video.segmentDurationMs);
  if (!usesPlaces(video.kind as Video["kind"] & Parameters<typeof usesPlaces>[0], model)) return null;
  const found = result === undefined ? await latestResult(video.id) : result;
  return normalizePlaces((found?.places as AnalysisPlace[] | null | undefined) ?? null, video.segmentDurationMs);
}

/** Los sitios de un desglose ya leído (para `pinterest.ts`, que tiene el suyo). */
export function placeOf(result: Record<string, unknown> | null, segmentMs: number | null, index: number): Tramo | null {
  if (!segmentMs) return null;
  return normalizePlaces((result?.places as AnalysisPlace[] | null | undefined) ?? null, segmentMs)?.[index] ?? null;
}

/**
 * El vídeo visto desde el sitio `index`: su referencia recortada (`referenceMediaId`) y su duración,
 * sus prompts (los del primero son los del vídeo), lo aprobado de ese sitio y la referencia de entorno
 * del dueño solo si es de ese tipo de sitio. `referenceMediaId` se rellena con `withTramoReference`.
 */
export function tramoVideo(video: Video, tramos: Tramo[], index: number): TramoVideo {
  const tramo = tramos[index];
  if (!tramo) throw new HttpError(409, "Ese sitio de la referencia ya no existe: el desglose cambió.");
  const approvals = video.tramoApprovals ?? {};
  return {
    ...video,
    // Lo que dura el vídeo fuente que se envía (lo corto, congelado hasta el mínimo del modelo): así
    // el modelo, la duración pedida y la previsión de Topaz son los de lo que de verdad se genera.
    segmentDurationMs: sourceMsFor(video, tramo.endMs - tramo.startMs),
    imagePrompt: index === 0 ? video.imagePrompt : tramo.imagePrompt,
    videoPrompt: index === 0 ? video.videoPrompt : tramo.videoPrompt,
    environmentPhotoId: tramo.ownerEnvironment ? video.environmentPhotoId : null,
    approvedFrameResultId: index === 0 ? video.approvedFrameResultId : (approvals[`frame:${index}`] ?? null),
    approvedClipResultId: index === 0 ? video.approvedClipResultId : (approvals[`clip:${index}`] ?? null),
    tramo: { index, startMs: tramo.startMs, endMs: tramo.endMs, place: tramo.place, base: video },
  };
}

/** El vídeo de siempre detrás de uno visto desde un sitio. */
export const baseVideo = (video: Video): Video => (video as TramoVideo).tramo?.base ?? video;

// ───────────────────────── La referencia de cada sitio ─────────────────────────

const NO_STORED = "No está guardada la referencia entera: vuelve a subirla para partirla por sitios.";

/** Descarga la referencia guardada a un directorio temporal y llama a `fn` con su ruta. */
async function withStoredReference<T>(video: Video, fn: (file: string, dir: string) => Promise<T>): Promise<T> {
  const store = getObjectStore();
  if (!store || !video.referenceStorageKey) throw new HttpError(409, NO_STORED);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `tramo-${video.id}-`));
  try {
    const file = path.join(dir, "referencia");
    await store.download(video.referenceStorageKey, file);
    return await fn(file, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Lo que dura el vídeo fuente que se envía para un sitio: el sitio entero o, si no llega al mínimo
 * del modelo (Motion Transfer pide 3 s), el sitio con su último fotograma congelado hasta llegar.
 * Lo congelado se corta al empalmar (nunca se toma prestado otro sitio).
 */
export function sourceMsFor(video: Pick<Video, "clipModel">, durationMs: number): number {
  const model = resolveClipModel(video.clipModel, 30_000);
  if (model === SEEDANCE) return durationMs;
  return Math.max(durationMs, SOURCE_LIMITS[model].min * 1000 + 100);
}

/** `media_id` en Higgsfield del vídeo fuente de un sitio (recortado de la referencia guardada; se sube una vez). */
export async function tramoReferenceMedia(video: TramoVideo, deps: GenDeps = {}): Promise<string> {
  const tramo = video.tramo!;
  const base = tramo.base;
  const durationMs = tramo.endMs - tramo.startMs;
  const sourceMs = sourceMsFor(base, durationMs);
  return withStoredReference(base, async (file, dir) => {
    const out = path.join(dir, `sitio-${tramo.index}.mp4`);
    await normalizeClip(file, out, durationMs, { startMs: tramo.startMs, padToMs: sourceMs });
    const bytes = await fs.readFile(out);
    return ensureMedia(base.createdBy, { bytes, filename: `referencia-${base.id}-sitio-${tramo.index}.mp4`, contentType: "video/mp4", type: "video" }, deps);
  });
}

/** El primer fotograma de un sitio (la composición que conserva su apertura), en JPEG. */
export async function tramoOpeningFrame(video: TramoVideo): Promise<{ mime: string; data: Buffer }> {
  const tramo = video.tramo!;
  return withStoredReference(tramo.base, async (file) => {
    const [frame] = await extractFrames(file, [tramo.startMs + 60]);
    return { mime: "image/jpeg", data: frame.jpeg };
  });
}

/**
 * El vídeo listo para pedir una generación de tipo `kind`: el de siempre si va en un solo sitio; si
 * no, visto desde su sitio con la referencia recortada. Un sitio que ya no existe, 409.
 */
export async function videoForKind(video: Video, kind: GenerationKind, deps: GenDeps = {}): Promise<Video> {
  const { index } = parseKind(kind);
  const tramos = await tramosOf(video);
  if (!tramos) {
    if (index > 0) throw new HttpError(409, "Ese sitio de la referencia ya no existe: el desglose cambió.");
    return video;
  }
  const seen = tramoVideo(video, tramos, index);
  // Solo el clip lleva el vídeo fuente (recortado a su sitio): la imagen y Topaz no lo usan.
  if (parseKind(kind).base !== "clip") return seen;
  return { ...seen, referenceMediaId: await tramoReferenceMedia(seen, deps) } as TramoVideo;
}

/** Para el montaje: los sitios del vídeo con lo que dura cada uno y su recorte. */
export interface SplicePart {
  index: number;
  durationMs: number;
}

export async function splicePlan(video: Video): Promise<SplicePart[] | null> {
  const tramos = await tramosOf(video);
  return tramos?.map((t) => ({ index: t.index, durationMs: t.endMs - t.startMs })) ?? null;
}

/** Lo que enseña la revisión de cada sitio extra: su nombre, su fotograma de la referencia y su apertura. */
export interface PlaceFrameView {
  tramo: number;
  place: string;
  startMs: number;
  /** El fotograma guardado de la referencia más cercano al principio del sitio (`video_frames.index`). */
  referenceFrameIndex: number;
  frame: import("@/server/videos/generations").GenerationView;
}

/** Las aperturas de los sitios extra de un vídeo, para la pantalla (vacío con un solo sitio). */
export async function placeFrameViews(video: Video, viewerId: number): Promise<PlaceFrameView[]> {
  const tramos = await tramosOf(video);
  if (!tramos) return [];
  const { generationView } = await import("@/server/videos/generations");
  const frames = await getDb()
    .select({ index: schema.videoFrames.index, timeMs: schema.videoFrames.timeMs })
    .from(schema.videoFrames)
    .where(eq(schema.videoFrames.videoId, video.id));
  const nearest = (ms: number) =>
    frames.filter((f) => f.timeMs >= ms).sort((a, b) => a.timeMs - b.timeMs)[0]?.index ?? frames.at(-1)?.index ?? 0;
  return Promise.all(
    tramos.slice(1).map(async (t) => ({
      tramo: t.index,
      place: t.place,
      startMs: t.startMs,
      referenceFrameIndex: nearest(t.startMs),
      frame: await generationView(tramoVideo(video, tramos, t.index), tramoKind("frame", t.index), viewerId),
    })),
  );
}

/** El sitio pedido por la pantalla (`tramo` del cuerpo): 0 si no viene, `NaN` si no vale. */
export function tramoParam(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_TRAMOS ? value : Number.NaN;
}
