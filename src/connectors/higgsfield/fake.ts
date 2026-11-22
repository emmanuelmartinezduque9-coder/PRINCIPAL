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

/** Miniatura de muestra (SVG vertical con un degradado distinto por clip) para la biblioteca del modo local. */
function sampleThumb(index: number): string {
  const hue = (index * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 45% 28%)"/></linearGradient></defs><rect width="90" height="160" fill="url(#g)"/><circle cx="45" cy="${56 + (index % 5) * 8}" r="${14 + (index % 3) * 4}" fill="hsl(${hue} 60% 86% / .55)"/><rect x="18" y="112" width="54" height="26" rx="6" fill="hsl(${hue} 30% 14% / .45)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const SAMPLE_MODELS = ["seedance_2_5", "seedance_2_5", "topaz_video", "kling3_0"];

/** Historial de muestra para el modo local: `count` vídeos terminados, uno cada tres horas hacia atrás. */
function sampleLibrary(count: number): HfHistoryItem[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i): HfHistoryItem => ({
    jobId: `muestra-${count - i}`,
    type: "video",
    model: SAMPLE_MODELS[i % SAMPLE_MODELS.length],
    prompt: i % 3 === 2 ? "" : `Clip de muestra ${count - i}: plano vertical de producto en mano, luz natural.`,
    createdAt: new Date(now - (i + 1) * 3 * 60 * 60 * 1000),
    media: [],
    resolution: "480p",
    thumbUrl: sampleThumb(count - i),
    completed: true,
    resultUrl: SAMPLE_VIDEO_URL,
  }));
}

/**
 * Por defecto 1 000 créditos, plan "plus". `uploadMedia` devuelve `media-1`, `media-2`… en orden;
 * los envíos crean `job-1`, `job-2`… pendientes (y descuentan sus créditos). Con
 * `options.autoComplete` (modo local) cada trabajo termina a la segunda consulta con una muestra.
 * Con `options.sampleLibrary` (modo local) el historial empieza con esos vídeos de muestra, para
 * que la biblioteca de clips tenga algo que enseñar.
 */
export function createFakeHiggsfield(
  initial: Partial<Pick<FakeHiggsfield["state"], "credits" | "plan">> = {},
  options: { autoComplete?: boolean; sampleLibrary?: number } = {},
): FakeHiggsfield {
  const calls: FakeHiggsfield["calls"] = [];
  const state: FakeHiggsfield["state"] = {
    credits: 1000,
    plan: "plus",
    jobs: {},
    history: options.sampleLibrary ? sampleLibrary(options.sampleLibrary) : [],
    maxAccepted: null,
    ...initial,
  };
  const failures = new Map<keyof HiggsfieldPort, Error[]>();
  const queried = new Map<string, number>();
  const kinds = new Map<string, "image" | "video">();
  let uploads = 0;
  let jobCounter = 0;
  let quotes = 0;

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
      state.history.unshift({
        jobId,
        type,
        model: request.model,
        prompt: request.prompt,
        createdAt: new Date(),
        media: request.medias.map((media) => ({ id: media.value, url: null })),
        resolution: request.resolution,
        thumbUrl: null,
        // Mientras el trabajo exista en `state.jobs`, `history` lee de él si terminó y su dirección.
        completed: false,
        resultUrl: null,
      });
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
      quotes += 1;
      return { credits: imageCost(count), quoteRef: `quote:fake-${quotes}` };
    },
    async quoteVideo(userId, request) {
      record("quoteVideo", userId, { request });
      quotes += 1;
      return { credits: videoCost(request), quoteRef: `quote:fake-${quotes}` };
    },
    async submitImages(userId, request, count) {
      record("submitImages", userId, { request, count });
      return submit("image", request, count, imageCost(1));
    },
    async submitVideo(userId, request, submitOptions = {}) {
      record("submitVideo", userId, { request, quoteRef: submitOptions.quoteRef ?? null });
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
    async history(userId, type, limit, cursor = null, historyOptions = {}) {
      record("history", userId, { type, limit, cursor, ...(historyOptions.onlyCompleted ? { onlyCompleted: true } : {}) });
      // Como el real: de la más reciente a la más antigua; el cursor es la fecha (en segundos) de la última.
      const seconds = (item: HfHistoryItem) => (item.createdAt ? item.createdAt.getTime() / 1000 : 0);
      const before = cursor === null ? null : Number(cursor);
      // Lo enviado por el simulado termina cuando termina su trabajo, con su dirección.
      const current = (item: HfHistoryItem): HfHistoryItem => {
        const job = state.jobs[item.jobId];
        return job ? { ...item, completed: job.status === "done", resultUrl: job.urls[0] ?? null } : item;
      };
      const older = state.history
        .map(current)
        .filter((item) => item.type === type && (before === null || seconds(item) < before))
        .filter((item) => !historyOptions.onlyCompleted || item.completed);
      const items = older.slice(0, limit);
      const more = older.length > limit;
      // Como el real: `next_cursor: null` explícito en la última página.
      return { items, nextCursor: more ? seconds(items[items.length - 1]) : null, end: !more };
    },
  };

  return {
    port,
    calls,
    state,
    failNext: (method, error) => void failures.set(method, [...(failures.get(method) ?? []), error]),
  };
}
