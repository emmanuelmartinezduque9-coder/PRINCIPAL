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
  busy: "bg-warning",
  ok: "bg-success",
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

/** Pasos del flujo, en orden; el elegido va en la dirección (`?paso=desglose`). */
export const FLOW_STEPS = ["referencia", "desglose", "imagen", "clip"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export const isFlowStep = (value: unknown): value is FlowStep => FLOW_STEPS.includes(value as FlowStep);

// ───────────────────────── Generaciones ─────────────────────────

export type GenerationKind = "frame" | "clip";
export type GenerationJson = VideoViewJson["frame"];
export type CurrentGeneration = NonNullable<GenerationJson["current"]>;
export type GenerationResult = CurrentGeneration["results"][number];

/** Trozo de la ruta de cada tipo: `/api/videos/[id]/imagen/…` y `/api/videos/[id]/clip/…`. */
export const KIND_PATH: Record<GenerationKind, string> = { frame: "imagen", clip: "clip" };

/** Estados en los que la generación sigue en marcha (la pantalla se vuelve a pedir sola). */
export const RUNNING_STATUSES = ["intent", "submitting", "submitted"];

/** `1.234` también con cuatro cifras (en español, por defecto, no se agrupan). */
export const formatCredits = (n: number) => new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(n);

/** «1 crédito», «4 créditos». */
export const creditsLabel = (n: number) => `${formatCredits(n)} ${n === 1 ? "crédito" : "créditos"}`;

/** Huella corta de un texto (FNV-1a, 32 bits), para que la clave del presupuesto cambie cuando cambia el prompt. */
export function textHash(text: string | null): string {
  if (text === null) return "-";
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** `nano_banana_2_1` → «Nano Banana 2.1»; `seedance_2_5` → «Seedance 2.5». */
export function modelLabel(model: string): string {
  const words: string[] = [];
  for (const part of model.split(/[_\s-]+/).filter(Boolean)) {
    const last = words.length - 1;
    if (/^\d+$/.test(part) && last >= 0 && /\d$/.test(words[last])) words[last] += `.${part}`;
    else words.push(/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1));
  }
  return words.join(" ");
}

/** Miniatura (JPEG) de un resultado, hecha por el servidor al terminar la generación. */
export const thumbUrl = (resultId: number) => `/api/resultados/${resultId}/miniatura`;

/**
 * ¿Se puede pedir otra ronda? Sin ninguna, con la última «no enviada», o con la última fallida o
 * rechazada si quedan regeneraciones. Lo mismo que comprueba el servidor (`nextRound`).
 */
export function canRequestRound(generation: GenerationJson): boolean {
  const current = generation.current;
  if (!current || current.status === "not_sent") return true;
  const closed = current.status === "failed" || (current.status === "done" && current.rejectReason !== null);
  return closed && generation.regenerationsLeft > 0;
}
