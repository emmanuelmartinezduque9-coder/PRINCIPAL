import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { HttpError } from "@/server/http";
import { usesPlaces, type AnalysisPlace } from "@/server/videos/analysis";
import type { GenerationKind } from "@/server/videos/generations";
import type { Video } from "@/server/videos/videos";

/**
 * Orden de Emmanuel, 25/11/2026: un frame, un clip con la fuente entera y un Topaz.
 * Los sitios solo describen entornos y tiempos absolutos; nunca parten la generación.
 * Los frame:N aprobados antiguos se reutilizan como referencias, sin generar imágenes.
 */

/** Un sitio de la referencia, en milisegundos del tramo. */
export interface Tramo {
  shortPlaces?: Array<{ startMs: number; endMs: number; place: string; action: string; keepObjects: string[] }>;
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

/** Como mucho, sitios por vídeo. */
export const MAX_TRAMOS = 6;

export const LONG_PLACE_MIN_SHOTS = 2;
export const LONG_PLACE_MIN_MS = 4000;
export const LONG_PLACE_MIN_SHARE = 0.25;

// ───────────────────────── Tipos de generación ─────────────────────────

export type BaseKind = "frame" | "clip" | "upscale";

/** Identifica resultados históricos y parámetros de revisión; generar con sufijo devuelve 409. */
export function tramoKind(base: BaseKind, index: number): GenerationKind {
  return (index === 0 ? base : `${base}:${index}`) as GenerationKind;
}

// ───────────────────────── Los sitios ─────────────────────────

/** Texto literal de las tomas cortas, con tiempos absolutos del vídeo entero. */
export function shortPlacePrompt(tramo: Tramo): string {
  return (tramo.shortPlaces ?? []).map((p) =>
    `From ${p.startMs / 1000}s to ${p.endMs / 1000}s the shot cuts to ${p.place}: keep ${p.keepObjects.join(", ")} and the action (${p.action}) exactly there; restyle its design, colour and contents to fit the ad and the target country; never replace it with the setting of the other shots.`
  ).join("\n\n");
}

/** Sitios con índices estables; las tomas cortas se describen sin adjuntar fotos. */
export function clipPlaces(places: AnalysisPlace[] | null | undefined, segmentMs: number, shots: Array<{ startS: number }> = []): Tramo[] | null {
  if (!places?.length || segmentMs <= 0) return null;
  return places.filter((p) => Number.isFinite(p.startS) && Number.isFinite(p.endS))
    .toSorted((a, b) => a.startS - b.startS).slice(0, MAX_TRAMOS).map((p, index) => {
      const startMs = Math.max(0, Math.round(p.startS * 1000));
      const endMs = Math.min(segmentMs, Math.round(p.endS * 1000));
      const multi = endMs - startMs >= LONG_PLACE_MIN_MS && (endMs - startMs) / segmentMs >= LONG_PLACE_MIN_SHARE && shots.filter((shot) => shot.startS * 1000 >= startMs && shot.startS * 1000 < endMs).length >= LONG_PLACE_MIN_SHOTS;
      return { ...p, index, startMs, endMs, shortPlaces: multi || index === 0 ? [] : [{ ...p, startMs, endMs }] };
    });
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
 * o su tipo no usan sitios: ver `usesPlaces`).
 */
export async function tramosOf(
  video: Pick<Video, "id" | "kind" | "clipModel" | "segmentDurationMs" | "referenceStorageKey">,
  result?: Record<string, unknown> | null,
): Promise<Tramo[] | null> {
  if (!video.segmentDurationMs) return null;
  if (!usesPlaces(video.kind as Parameters<typeof usesPlaces>[0])) return null;
  const found = result === undefined ? await latestResult(video.id) : result;
  return clipPlaces(found?.places as AnalysisPlace[] | null, video.segmentDurationMs, found?.shots as Array<{ startS: number }> | undefined);
}

/** Los sitios de un desglose ya leído (para `pinterest.ts`, que tiene el suyo). */
export function placeOf(result: Record<string, unknown> | null, segmentMs: number | null, index: number): Tramo | null {
  if (!segmentMs) return null;
  return clipPlaces(result?.places as AnalysisPlace[] | null, segmentMs, result?.shots as Array<{ startS: number }> | undefined)?.[index] ?? null;
}

/** Solo se generan los tipos únicos; los sufijos antiguos son referencias de entorno. */
export async function videoForKind(video: Video, kind: GenerationKind): Promise<Video> {
  if (kind.includes(":")) throw new HttpError(409, "Este vídeo lleva una sola imagen");
  if (kind !== "frame") return video;
  const first = (await tramosOf(video))?.[0];
  return first ? { ...video, environmentPhotoId: first.ownerEnvironment ? video.environmentPhotoId : null } : video;
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
  void video;
  void viewerId;
  return [];
}

/** El sitio pedido por la pantalla (`tramo` del cuerpo): 0 si no viene, `NaN` si no vale. */
export function tramoParam(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_TRAMOS ? value : Number.NaN;
}
