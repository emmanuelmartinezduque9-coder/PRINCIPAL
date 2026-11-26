import type { Serialized } from "@/lib/api";
import type { BatchSummary, BatchView } from "@/server/videos/batches";
import type { AutoView, BatchQuestion, BatchQuote } from "@/server/videos/lote";
import { canRequestRound, RUNNING_STATUSES, type GenerationJson } from "@/components/videos/labels";

/** El tablero tal como llega por JSON (`GET /api/lotes/[id]`). */
export type BatchViewJson = Serialized<BatchView & { auto: AutoView }>;
export type AutoViewJson = BatchViewJson["auto"];
export type BatchQuestionJson = Serialized<BatchQuestion>;
export type BatchQuoteJson = Serialized<BatchQuote>;
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
  /**
   * Referencia lista (y preparada con el gancho actual), quién sale (avatar, «sin sustitución» o «nadie»), la adaptación si es una
   * adaptación, y sin desglose (o el último falló o ya no corresponde).
   */
  breakdown(row: BatchRowJson): boolean {
    if (!row.mine || row.referenceStatus !== "ready" || row.referenceOutdated || row.needsAdaptation) return false;
    if (row.avatarMode === "elegido" && row.avatarPhotoId === null) return false;
    if (row.avatarMode === "biblioteca" && row.libraryAvatar === null) return false;
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
  /** Ya montado (la última versión). */
  edited(row: BatchRowJson): boolean {
    return row.edit.latest !== null;
  },
};

/** Con un clip apuntado o hecho, la imagen aprobada ya no cambia. */
export function frameLocked(row: BatchRowJson): boolean {
  return row.clip.current !== null && row.clip.current.rejectReason === null && !CLIP_RELEASES_FRAME.includes(row.clip.current.status);
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

/** El enlace pegado que el Mac aún tiene que traer (en cola o descargando), o `null`. */
export function pendingLink(row: BatchRowJson): NonNullable<BatchRowJson["link"]> | null {
  return row.link && row.link.status !== "failed" ? row.link : null;
}

/** El enlace pegado que falló (con su motivo), o `null`. La referencia que hubiera sigue valiendo. */
export function failedLink(row: BatchRowJson): NonNullable<BatchRowJson["link"]> | null {
  return row.link?.status === "failed" ? row.link : null;
}

export function referenceState(row: BatchRowJson, upload: LocalUpload): StepState {
  if (upload.kind === "uploading") {
    return upload.queued ? { label: "En cola", tone: "busy" } : { label: `Subiendo ${Math.round(upload.fraction * 100)} %`, tone: "busy" };
  }
  if (upload.kind === "failed") return { label: "Error", tone: "error", detail: upload.message };
  // Un enlace pegado: mientras el Mac lo trae, eso es lo que pasa con la referencia (la que hubiera sigue lista).
  const link = pendingLink(row);
  if (link && row.referenceStatus !== "processing") {
    return link.status === "queued" ? { label: "En cola", tone: "busy" } : { label: "Descargando en el Mac…", tone: "busy" };
  }
  // El enlace no llegó (ni con los reintentos automáticos): estado neutro, no un error.
  if (failedLink(row) && row.referenceStatus === "failed") return { label: "No disponible", tone: "off" };
  switch (row.referenceStatus) {
    case "ready":
      if (row.referenceOutdated) return { label: "Resubir", tone: "error", detail: "El gancho ha cambiado: vuelve a subir el vídeo de referencia en su página." };
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

/**
 * Lo que falla en una fila y se enseña bajo ella: el primer paso con error. Si lo que falló es la
 * referencia porque el Mac no pudo traer su enlace, `link` es esa dirección (se puede reintentar o
 * cambiar) y `neutral` dice que se enseña como estado, no como error.
 */
export function rowProblem(row: BatchRowJson, states: StepState[]): { message: string; link: string | null; neutral?: true } | null {
  const link = failedLink(row);
  if (link && row.referenceStatus !== "ready") {
    return { message: link.error ?? "Enlace no disponible", link: row.mine ? link.url : null, neutral: true };
  }
  const detail = states.find((state) => state.tone === "error" && state.detail && !state.quiet)?.detail;
  return detail ? { message: detail, link: null } : null;
}

/**
 * Un enlace que no se pudo traer cuando la fila **ya tenía una referencia que sigue lista**: no es
 * un fallo de la fila (se puede seguir trabajando con ella), solo un aviso aparte con su
 * «Reintentar enlace». No la manda a «Por revisar».
 */
export function linkNotice(row: BatchRowJson): { message: string; link: string | null } | null {
  const link = failedLink(row);
  if (!link || row.referenceStatus !== "ready") return null;
  return { message: "El enlace nuevo no se pudo traer; sigue la referencia anterior.", link: row.mine ? link.url : null };
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
      if (!analysis.stale) return { label: "Hecho", tone: "ok" };
      return {
        label: "Repetir",
        tone: "error",
        detail: analysis.staleReason === "brief" ? "Las indicaciones han cambiado." : "La referencia ha cambiado.",
      };
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

/** El montaje de una fila, como chip del tablero. */
export function editState(edit: BatchRowJson["edit"]): StepState {
  switch (edit.status) {
    case "en_cola":
      return { label: "En cola", tone: "busy" };
    case "montando":
      return { label: "Montando", tone: "busy" };
    case "hecho":
      return { label: "Montado", tone: "ok" };
    case "fallido":
      return { label: edit.latest ? "Error" : "Sin montar", tone: "error", detail: edit.error };
  }
  return NONE;
}

/**
 * ¿Hay algo en marcha? Mientras lo haya, el tablero se vuelve a pedir solo (cada 3 s; enlaces que
 * el Mac va trayendo, cada 5 s; lo lento, cada 15 s).
 */
export function pollEvery(view: BatchViewJson | undefined, uploading: boolean): number | false {
  if (!view) return false;
  let slow = false;
  let links = false;
  for (const row of view.rows) {
    if (pendingLink(row)) links = true;
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
  if (links) return 5000;
  // Montajes en la cola o montándose.
  if (view.rows.some((row) => row.edit.status === "en_cola" || row.edit.status === "montando")) return 5000;
  // «Enviar lote» en marcha: lo que avanza el servidor solo (desgloses, envíos, el paso siguiente).
  if (["preguntas", "imagenes", "revision_imagenes", "clips"].includes(view.auto.status)) return 5000;
  return slow ? 15_000 : false;
}

/** Huella del estado de una fila: cambia cuando la fila avanza (o cambia) en cualquier paso. */
export function rowState(row: BatchRowJson): string {
  const gen = (g: GenerationJson) => `${g.current?.id ?? 0}:${g.current?.status ?? ""}:${g.current?.rejectReason ?? ""}:${g.approvedResultId ?? 0}`;
  return [row.updatedAt, row.referenceStatus, row.link?.status ?? "", row.analysis?.status ?? "", gen(row.frame), gen(row.clip)].join("|");
}

/** Ruta de la pantalla de un vídeo. */
export const videoHref = (row: Pick<BatchRowJson, "productId" | "id">) => `/productos/${row.productId}/videos/${row.id}`;

/**
 * «Por revisar»: filas con algo que mirar antes de seguir: un paso con error (también la subida en
 * este navegador, o una referencia que el Mac no pudo traer), un desglose que ya no vale,
 * candidatas esperando aprobación o una generación en duda. Un enlace fallido sobre una referencia
 * que sigue lista no cuenta: la fila se puede seguir trabajando.
 */
export function needsReview(row: BatchRowJson, upload: LocalUpload = { kind: "idle" }): boolean {
  if (ready.review(row)) return true;
  if (failedLink(row) && row.referenceStatus !== "ready" && upload.kind !== "uploading") return true;
  if ([row.frame.current?.status, row.clip.current?.status].includes("unknown")) return true;
  // Sin el desglose: un fallo suyo se repite solo y no es nada que mirar (orden del 24/11/2026).
  const states = [referenceState(row, upload), generationState(row.frame, "frame"), generationState(row.clip, "clip")];
  return states.some((state) => state.tone === "error" && !state.quiet);
}

/** Nombre automático de un lote sin nombre: «dd/mm · Producto1, Producto2» (como mucho 100 caracteres). */
export function autoBatchName(date: Date, productNames: string[]): string {
  const day = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const names = [...new Set(productNames.filter(Boolean))].join(", ");
  const name = names ? `${day} · ${names}` : day;
  return name.length > 100 ? `${name.slice(0, 99)}…` : name;
}

/** Nombre de cada riesgo del desglose, para el aviso de la fila. */
export const RISK_LABELS: Record<BatchRowJson["risks"][number]["kind"], string> = {
  funcion_inexistente: "Función que no tiene",
  reveal_adelantado: "Reveal adelantado",
  escala: "Escala",
  identidad: "Identidad",
  texto_en_pantalla: "Texto en pantalla",
  marca_ajena: "Marca ajena",
  otro: "Otro",
};
