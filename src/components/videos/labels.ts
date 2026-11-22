import type { Serialized } from "@/lib/api";
import type { PhotoRole } from "@/lib/photo-roles";
import type { Analysis } from "@/server/videos/analysis";
import type { VideoView } from "@/server/videos/videos";

/** El vídeo tal como llega por JSON (`GET /api/videos/[id]`). */
export type VideoViewJson = Serialized<VideoView>;
export type VideoJson = VideoViewJson["video"];
export type AnalysisJson = NonNullable<VideoViewJson["analysis"]>;
export type RiskKind = Analysis["risks"][number]["kind"];

export interface ProductPhoto {
  id: number;
  role: PhotoRole;
}

export type ReferenceStatus = "none" | "uploading" | "processing" | "ready" | "failed";

/** Estado de la referencia en palabras, con su tono. */
export const REFERENCE_STATUS: Record<ReferenceStatus, { label: string; tone: "off" | "busy" | "ok" | "error" }> = {
  none: { label: "Sin referencia", tone: "off" },
  uploading: { label: "Subiendo", tone: "busy" },
  processing: { label: "Preparando", tone: "busy" },
  ready: { label: "Referencia lista", tone: "ok" },
  failed: { label: "Error", tone: "error" },
};

export const referenceStatus = (status: string) => REFERENCE_STATUS[status as ReferenceStatus] ?? REFERENCE_STATUS.none;

export const TONE_DOT: Record<"off" | "busy" | "ok" | "error", string> = {
  off: "bg-foreground/25",
  busy: "bg-amber-500",
  ok: "bg-emerald-500",
  error: "bg-destructive",
};

/** 34 500 ms → «0:34»; 75 000 → «1:15». */
export function clockTime(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 1,5 → «1,5 s» (una cifra decimal, coma). */
export const secondsLabel = (s: number) => `${(Math.round(s * 10) / 10).toString().replace(".", ",")} s`;

/** Segundos máximos del tramo que usa el modelo. */
export const MAX_SEGMENT_MS = 30_000;

/** Dirección de un fotograma; `v` cambia cuando se sustituye la referencia (mismos índices, otra imagen). */
export const frameUrl = (videoId: number, index: number, version: string) =>
  `/api/videos/${videoId}/fotogramas/${index}?v=${encodeURIComponent(version)}`;

/** Pasos del flujo que ya se pueden abrir; el elegido va en la dirección (`?paso=desglose`). */
export const FLOW_STEPS = ["referencia", "desglose"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export const isFlowStep = (value: unknown): value is FlowStep => FLOW_STEPS.includes(value as FlowStep);
