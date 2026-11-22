/**
 * Lo que la aplicación puede pedirle al Higgsfield de una persona. Sin importar el SDK de MCP:
 * las pruebas y el modo local usan un simulado (`fake.ts`) con esta misma interfaz.
 */

export const HIGGSFIELD_KIND = "higgsfield";

export interface HfBalance {
  /** Créditos enteros de Higgsfield (no se convierten a dólares). */
  credits: number;
  plan: string | null;
}

/** Un archivo para subir al Higgsfield de una persona (vídeo de referencia, foto de producto…). */
export interface HfMediaFile {
  bytes: Buffer;
  filename: string;
  contentType: string;
  type: "image" | "video";
}

/** Una entrada de una generación: un `media_id` subido o el `job_id` de una generación anterior (nunca una URL). */
export interface HfMediaRef {
  role: "image_references" | "video_references" | "start_image";
  value: string;
}

export interface HfImageRequest {
  model: string;
  prompt: string;
  aspectRatio: "9:16";
  resolution: "2k";
  medias: HfMediaRef[];
}

export interface HfVideoRequest {
  model: "seedance_2_5";
  mode: "omni_reference";
  prompt: string;
  aspectRatio: "9:16";
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  generateAudio: false;
  bitrateMode: "high";
  medias: HfMediaRef[];
}

export interface HfSubmitResult {
  /** Trabajos que Higgsfield aceptó (uno por candidata aceptada). */
  jobIds: string[];
  /** Motivos de las peticiones que Higgsfield no aceptó. */
  rejected: string[];
  /** La respuesta tal cual, para guardarla (sin secretos). */
  raw?: unknown;
}

export interface HfJob {
  jobId: string;
  status: "pending" | "done" | "failed";
  failure: "failed" | "nsfw" | "ip_detected" | null;
  error: string | null;
  urls: string[];
}

export interface HfHistoryItem {
  jobId: string;
  type: "image" | "video";
  model: string;
  prompt: string | null;
  createdAt: Date | null;
}

export interface HiggsfieldPort {
  balance(userId: number): Promise<HfBalance>;
  /** Sube el archivo y lo confirma; el `mediaId` sirve después como entrada de una generación. */
  uploadMedia(userId: number, file: HfMediaFile): Promise<{ mediaId: string }>;
  /** Respuestas en crudo de las herramientas gratuitas, para el informe. Sin secretos. */
  diagnostics(userId: number): Promise<Record<string, unknown>>;
  /** Presupuesto (no gasta) de `count` imágenes con la misma petición. */
  quoteImages(userId: number, request: HfImageRequest, count: number): Promise<{ credits: number }>;
  /** Presupuesto (no gasta) de un clip. */
  quoteVideo(userId: number, request: HfVideoRequest): Promise<{ credits: number }>;
  /**
   * GASTA: envía `count` imágenes, una petición por candidata. Lanza `HiggsfieldRejectedError`
   * si es seguro que no se envió nada y `HiggsfieldUnknownOutcomeError` si no se sabe.
   */
  submitImages(userId: number, request: HfImageRequest, count: number): Promise<HfSubmitResult>;
  /** GASTA: envía un clip. Mismos errores que `submitImages`. */
  submitVideo(userId: number, request: HfVideoRequest): Promise<HfSubmitResult>;
  /** Estado de los trabajos, esperando como mucho `waitSeconds` (0–15). En el orden pedido. */
  jobs(userId: number, jobIds: string[], waitSeconds: number): Promise<HfJob[]>;
  /** Las últimas generaciones de la persona, en cualquier estado (para reconciliar un envío dudoso). */
  history(userId: number, type: "image" | "video", limit: number): Promise<HfHistoryItem[]>;
}

/** La persona no tiene su Higgsfield conectado. */
export class HiggsfieldNotConnectedError extends Error {
  constructor() {
    super("Conecta tu Higgsfield en Ajustes.");
    this.name = "HiggsfieldNotConnectedError";
  }
}

/** El permiso caducó o Higgsfield lo rechazó: hay que volver a conectar (no se reintenta solo). */
export class HiggsfieldAuthError extends Error {
  constructor() {
    super("Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.");
    this.name = "HiggsfieldAuthError";
  }
}

/** Higgsfield no respondió o respondió algo que no se entiende. */
export class HiggsfieldUnavailableError extends Error {
  constructor() {
    super("Higgsfield no responde. Inténtalo dentro de unos minutos.");
    this.name = "HiggsfieldUnavailableError";
  }
}

/** Higgsfield dijo que no a un envío: es seguro que no se envió nada (no se gastó). */
export class HiggsfieldRejectedError extends Error {
  constructor(
    /** El motivo, con el texto de Higgsfield. */
    public reason: string,
    public raw?: unknown,
  ) {
    super(reason);
    this.name = "HiggsfieldRejectedError";
  }
}

/** No se sabe si un envío llegó a Higgsfield (corte de conexión, respuesta ilegible…). Nunca se reenvía solo. */
export class HiggsfieldUnknownOutcomeError extends Error {
  constructor(public raw?: unknown) {
    super("No sabemos si la petición llegó a Higgsfield.");
    this.name = "HiggsfieldUnknownOutcomeError";
  }
}

export const isHiggsfieldError = (error: unknown): error is Error =>
  error instanceof HiggsfieldNotConnectedError ||
  error instanceof HiggsfieldAuthError ||
  error instanceof HiggsfieldUnavailableError ||
  error instanceof HiggsfieldRejectedError ||
  error instanceof HiggsfieldUnknownOutcomeError;
