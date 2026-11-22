import type { Serialized } from "@/lib/api";
import type { BatchSummary, BatchView } from "@/server/videos/batches";
import { canRequestRound, RUNNING_STATUSES, type GenerationJson } from "@/components/videos/labels";

/** El tablero tal como llega por JSON (`GET /api/lotes/[id]`). */
export type BatchViewJson = Serialized<BatchView>;
export type BatchRowJson = BatchViewJson["rows"][number];
export type BatchSummaryJson = Serialized<BatchSummary>;

/** La subida de la referencia en este navegador, si la hay (del `ReferenceUploadsProvider`). */
export type LocalUpload = { kind: "idle" } | { kind: "uploading"; fraction: number; queued?: boolean } | { kind: "failed"; message: string };

const ANALYSIS_ACTIVE = ["queued", "running", "paused"];
/** Estados del clip que ya no atan la imagen aprobada (como `CLIP_RELEASES_FRAME` en el servidor). */
const CLIP_RELEASES_FRAME = ["not_sent", "failed"];

/**
 * Qué filas están listas para cada acción en bloque. Es lo mismo que comprueba el servidor (que
 * sigue siendo quien decide): solo cuentan los vídeos propios.
 */
export const ready = {
  /** Referencia lista, avatar o «sin persona», y sin desglose (o el último falló o es de otra referencia). */
  breakdown(row: BatchRowJson): boolean {
    if (!row.mine || row.referenceStatus !== "ready" || (!row.noPerson && row.avatarPhotoId === null)) return false;
    const analysis = row.analysis;
    if (!analysis) return true;
    if (ANALYSIS_ACTIVE.includes(analysis.status)) return false;
    return analysis.status === "failed" || analysis.stale;
  },
  /** Desglose hecho y de la referencia actual, se puede pedir otra ronda y ningún clip ata la imagen. */
  frame(row: BatchRowJson): boolean {
    return row.mine && row.analysis?.status === "done" && !row.analysis.stale && canRequestRound(row.frame) && !frameLocked(row);
  },
  /** Candidatas terminadas sin aprobar ni rechazar. */
  review(row: BatchRowJson): boolean {
    const current = row.frame.current;
    return (
      row.mine &&
      !frameLocked(row) &&
      current?.status === "done" &&
      current.rejectReason === null &&
      row.frame.approvedResultId === null &&
      current.results.some((result) => result.ok)
    );
  },
  /** Imagen aprobada y se puede pedir otra ronda de clip. */
  clip(row: BatchRowJson): boolean {
    return row.mine && row.frame.approvedResultId !== null && canRequestRound(row.clip);
  },
  download(row: BatchRowJson): boolean {
    return row.clipReady;
  },
};

/** Con un clip apuntado o hecho, la imagen aprobada ya no cambia. */
export function frameLocked(row: BatchRowJson): boolean {
  return row.clip.current !== null && !CLIP_RELEASES_FRAME.includes(row.clip.current.status);
}

export type Tone = "off" | "busy" | "review" | "ok" | "error";
export interface StepState {
  label: string;
  tone: Tone;
  /** Detalle (un error) para el título del chip. */
  detail?: string | null;
  /** No es un fallo (un rechazo con su motivo): el tablero no lo repite bajo la fila. */
  quiet?: boolean;
}

const NONE: StepState = { label: "—", tone: "off" };

export function referenceState(row: BatchRowJson, upload: LocalUpload): StepState {
  if (upload.kind === "uploading") {
    return upload.queued ? { label: "En cola", tone: "busy" } : { label: `Subiendo ${Math.round(upload.fraction * 100)} %`, tone: "busy" };
  }
  if (upload.kind === "failed") return { label: "Error", tone: "error", detail: upload.message };
  switch (row.referenceStatus) {
    case "ready":
      return { label: "Lista", tone: "ok" };
    case "processing":
      return { label: "Preparando", tone: "busy" };
    case "uploading":
      return { label: "Interrumpida", tone: "error", detail: "La subida no terminó. Vuelve a elegir el vídeo en su página." };
    case "failed":
      return { label: "Error", tone: "error", detail: row.referenceError };
    default:
      return { label: "Sin subir", tone: "off" };
  }
}

export function analysisState(row: BatchRowJson): StepState {
  const analysis = row.analysis;
  if (!analysis) return NONE;
  switch (analysis.status) {
    case "queued":
      return { label: "En cola", tone: "busy" };
    case "running":
      return { label: "Desglosando", tone: "busy" };
    case "paused":
      return { label: "En pausa", tone: "busy", detail: analysis.error };
    case "failed":
      return { label: "Error", tone: "error", detail: analysis.error };
    default:
      return analysis.stale ? { label: "Repetir", tone: "error", detail: "La referencia ha cambiado." } : { label: "Hecho", tone: "ok" };
  }
}

export function generationState(generation: GenerationJson, kind: "frame" | "clip"): StepState {
  const current = generation.current;
  if (!current) return NONE;
  if (RUNNING_STATUSES.includes(current.status)) return { label: "Generando", tone: "busy" };
  switch (current.status) {
    case "unknown":
      return { label: "En duda", tone: "busy", detail: current.error };
    case "not_sent":
      return { label: "No enviada", tone: "error", detail: current.error };
    case "failed":
      return { label: "Error", tone: "error", detail: current.error };
  }
  if (generation.approvedResultId !== null) return { label: kind === "frame" ? "Aprobada" : "Aprobado", tone: "ok" };
  if (current.rejectReason !== null) return { label: kind === "frame" ? "Rechazada" : "Rechazado", tone: "error", detail: current.rejectReason, quiet: true };
  return kind === "frame" ? { label: "Revisar", tone: "review" } : { label: "Listo", tone: "ok" };
}

/** ¿Hay algo en marcha? Mientras lo haya, el tablero se vuelve a pedir solo (cada 3 s; lo lento, cada 15 s). */
export function pollEvery(view: BatchViewJson | undefined, uploading: boolean): number | false {
  if (!view) return false;
  let slow = false;
  for (const row of view.rows) {
    if (row.referenceStatus === "processing") return 3000;
    const analysis = row.analysis?.status;
    if (analysis === "queued" || analysis === "running") return 3000;
    if (analysis === "paused") slow = true;
    for (const status of [row.frame.current?.status, row.clip.current?.status]) {
      if (status && RUNNING_STATUSES.includes(status)) return 3000;
      if (status === "unknown") slow = true;
    }
  }
  if (uploading) return 3000;
  return slow ? 15_000 : false;
}

/** Huella del estado de una fila: cambia cuando la fila avanza (o cambia) en cualquier paso. */
export function rowState(row: BatchRowJson): string {
  const gen = (g: GenerationJson) => `${g.current?.id ?? 0}:${g.current?.status ?? ""}:${g.current?.rejectReason ?? ""}:${g.approvedResultId ?? 0}`;
  return [row.updatedAt, row.referenceStatus, row.analysis?.status ?? "", gen(row.frame), gen(row.clip)].join("|");
}

/** Ruta de la pantalla de un vídeo. */
export const videoHref = (row: Pick<BatchRowJson, "productId" | "id">) => `/productos/${row.productId}/videos/${row.id}`;
