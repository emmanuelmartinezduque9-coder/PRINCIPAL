import type { HfHistoryItem, HfImageRequest, HfJob, HfVideoRequest, HiggsfieldPort } from "./port";

/**
 * Higgsfield simulado en memoria: lo usan las pruebas y el modo local
 * (`PRINCIPAL_HIGGSFIELD_FAKE=1`, nunca en la nube). No sabe nada de permisos: quien lo usa ya
 * comprobó que la persona está conectada.
 */

export interface FakeHiggsfield {
  port: HiggsfieldPort;
  calls: Array<{ method: string; userId: number; args: unknown }>;
  state: {
    credits: number;
    plan: string | null;
    /** Trabajos por identificador; se pueden cambiar a mano (p. ej. pasarlos a `done`). */
    jobs: Record<string, HfJob>;
    /** Historial que devuelve `history`, el más reciente primero. Cada envío añade lo suyo delante. */
    history: HfHistoryItem[];
    /** Si es un número, cada envío acepta como mucho esas peticiones y rechaza las demás. */
    maxAccepted: number | null;
  };
  /**
   * La próxima llamada a ese método lanza `error`. Llamarlo varias veces encadena fallos: cada
   * llamada al método consume el primero que quede.
   */
  failNext(method: keyof HiggsfieldPort, error: Error): void;
}

/** Créditos del simulado: 2 por imagen; por clip, `duration × 3` a 480p (× 5 a 720p, × 8 a 1080p). */
const IMAGE_CREDITS = 2;
const VIDEO_CREDITS_PER_SECOND: Record<HfVideoRequest["resolution"], number> = { "480p": 3, "720p": 5, "1080p": 8 };

/** Muestras para el modo local: una imagen PNG de 90×160 y un vídeo MP4 de 1 s, como direcciones `data:`. */
export const SAMPLE_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAACgCAIAAAADw+wqAAAACXBIWXMAAAABAAAAAQBPJcTWAAAA5klEQVR4nO3QMQ0AIADAMHQiBfGEDwmMo8kELB1rbt1GfvBVOHDgwIEDBw4cOHD04cCBAwcOHDhw4MDRhwMHDhw4cODAgQNHHw4cOHDgwIEDBw4cfThw4MCBAwcOHDhw9OHAgQMHDhw4cODA0YcDBw4cOHDgwIEDRx8OHDhw4MCBAwcOHH04cODAgQMHDhw4cPThwIEDBw4cOHDgwNGHAwcOHDhw4MCBA0cfDhw4cODAgQMHDhx9OHDgwIEDBw4cOHD04cCBAwcOHDhw4MDRhwMHDhw4cODAgQNHHw4cOHDgwIEDx6sO8wJqewPb8XEAAAAASUVORK5CYII=";

/** Ver `SAMPLE_IMAGE_URL`. */
export const SAMPLE_VIDEO_URL =
  "data:video/mp4;base64,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";

/**
 * Por defecto 1 000 créditos, plan "plus". `uploadMedia` devuelve `media-1`, `media-2`… en orden;
 * los envíos crean `job-1`, `job-2`… pendientes (y descuentan sus créditos). Con
 * `options.autoComplete` (modo local) cada trabajo termina a la segunda consulta con una muestra.
 */
export function createFakeHiggsfield(
  initial: Partial<Pick<FakeHiggsfield["state"], "credits" | "plan">> = {},
  options: { autoComplete?: boolean } = {},
): FakeHiggsfield {
  const calls: FakeHiggsfield["calls"] = [];
  const state: FakeHiggsfield["state"] = { credits: 1000, plan: "plus", jobs: {}, history: [], maxAccepted: null, ...initial };
  const failures = new Map<keyof HiggsfieldPort, Error[]>();
  const queried = new Map<string, number>();
  const kinds = new Map<string, "image" | "video">();
  let uploads = 0;
  let jobCounter = 0;

  function record(method: keyof HiggsfieldPort, userId: number, args: unknown): void {
    calls.push({ method, userId, args });
    const error = failures.get(method)?.shift();
    if (error) throw error;
  }

  const imageCost = (count: number) => IMAGE_CREDITS * count;
  const videoCost = (request: HfVideoRequest) => request.duration * VIDEO_CREDITS_PER_SECOND[request.resolution];

  function submit(type: "image" | "video", request: HfImageRequest | HfVideoRequest, count: number, unitCost: number) {
    const accepted = Math.min(count, state.maxAccepted ?? count);
    const jobIds: string[] = [];
    for (let i = 0; i < accepted; i++) {
      jobCounter += 1;
      const jobId = `job-${jobCounter}`;
      jobIds.push(jobId);
      kinds.set(jobId, type);
      state.jobs[jobId] = { jobId, status: "pending", failure: null, error: null, urls: [] };
      state.history.unshift({ jobId, type, model: request.model, prompt: request.prompt, createdAt: new Date() });
    }
    state.credits -= unitCost * accepted;
    const rejected = Array.from({ length: count - accepted }, () => "Rechazada por el simulado.");
    return { jobIds, rejected, raw: { jobs: jobIds.map((job_id, index) => ({ index, job_id })), rejected } };
  }

  const port: HiggsfieldPort = {
    async balance(userId) {
      record("balance", userId, {});
      return { credits: state.credits, plan: state.plan };
    },
    async uploadMedia(userId, file) {
      record("uploadMedia", userId, { ...file });
      uploads += 1;
      return { mediaId: `media-${uploads}` };
    },
    async diagnostics(userId) {
      record("diagnostics", userId, {});
      return { tools: ["balance"], balance: { credits: state.credits, plan: state.plan } };
    },
    async quoteImages(userId, request, count) {
      record("quoteImages", userId, { request, count });
      return { credits: imageCost(count) };
    },
    async quoteVideo(userId, request) {
      record("quoteVideo", userId, { request });
      return { credits: videoCost(request) };
    },
    async submitImages(userId, request, count) {
      record("submitImages", userId, { request, count });
      return submit("image", request, count, imageCost(1));
    },
    async submitVideo(userId, request) {
      record("submitVideo", userId, { request });
      return submit("video", request, 1, videoCost(request));
    },
    async jobs(userId, jobIds, waitSeconds) {
      record("jobs", userId, { jobIds, waitSeconds });
      return jobIds.map((jobId) => {
        const seen = (queried.get(jobId) ?? 0) + 1;
        queried.set(jobId, seen);
        const job = state.jobs[jobId];
        if (options.autoComplete && job?.status === "pending" && seen >= 2) {
          job.status = "done";
          job.urls = [kinds.get(jobId) === "video" ? SAMPLE_VIDEO_URL : SAMPLE_IMAGE_URL];
        }
        return job ? { ...job, urls: [...job.urls] } : { jobId, status: "pending", failure: null, error: null, urls: [] };
      });
    },
    async history(userId, type, limit) {
      record("history", userId, { type, limit });
      return state.history.filter((item) => item.type === type).slice(0, limit);
    },
  };

  return {
    port,
    calls,
    state,
    failNext: (method, error) => void failures.set(method, [...(failures.get(method) ?? []), error]),
  };
}
