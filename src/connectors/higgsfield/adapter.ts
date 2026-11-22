import { McpUnauthorizedError, openMcp, type McpCaller } from "./mcp";
import { accessTokenFor, refreshNow } from "./oauth";
import {
  HiggsfieldAuthError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  isHiggsfieldError,
  type HfBalance,
  type HfHistoryItem,
  type HfImageRequest,
  type HfJob,
  type HfSubmitResult,
  type HfVideoRequest,
  type HiggsfieldPort,
} from "./port";

/**
 * `HiggsfieldPort` real: solo este archivo conoce los nombres de las herramientas MCP de
 * Higgsfield. Abre un cliente por llamada con el token de la persona, lo cierra siempre y, ante
 * un 401, refresca y repite UNA vez. Las respuestas se leen contra
 * `tests/fixtures/higgsfield/*.json` (forma supuesta hasta la PUERTA).
 */

const PROBE_PROMPT = "Diagnóstico de PRINCIPAL: solo presupuesto, no generar.";

/**
 * Herramientas que usa el diagnóstico, con sus argumentos exactos del contrato: solo lecturas y
 * presupuestos, que no gastan créditos (resolución del coordinador). Nunca una que genere.
 */
export const DIAGNOSTIC_TOOLS: ReadonlyArray<{ name: string; args: Record<string, unknown> }> = [
  { name: "balance", args: {} },
  {
    name: "estimate_image_cost",
    args: {
      params: {
        model: "nano_banana_pro",
        prompt: PROBE_PROMPT,
        aspect_ratio: "9:16",
        resolution: "2k",
        count: 2,
        use_unlim: false,
      },
    },
  },
  {
    name: "estimate_video_cost",
    args: {
      params: {
        model: "seedance_2_5",
        mode: "omni_reference",
        prompt: PROBE_PROMPT,
        aspect_ratio: "9:16",
        duration: 10,
        resolution: "480p",
        generate_audio: false,
        bitrate_mode: "high",
        use_unlim: false,
      },
    },
  },
  { name: "show_generations", args: { only_completed: false, type: "video", size: 50 } },
];

const num = (value: unknown): number | null => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Lee créditos y plan de la respuesta de `balance`. Admite variantes razonables de nombres y un
 * nivel de anidación; si no reconoce un número de créditos, `null` (nunca inventa un saldo).
 * Los créditos son enteros: una fracción se redondea hacia abajo.
 */
export function readBalance(data: unknown): HfBalance | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const layers = [root, ...["balance", "data", "result", "credits"].map((k) => root[k]).filter((v) => v && typeof v === "object")] as Array<
    Record<string, unknown>
  >;
  let credits: number | null = null;
  let plan: string | null = null;
  for (const layer of layers) {
    for (const key of ["credits", "available_credits", "credits_available", "balance", "total_credits", "total"]) {
      if (credits === null) credits = num(layer[key]);
    }
    for (const key of ["plan", "subscription_plan", "plan_name", "subscription", "tier"]) {
      const value = layer[key];
      if (plan !== null) break;
      if (typeof value === "string" && value.trim()) plan = value.trim();
      else if (value && typeof value === "object") {
        const named = (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).plan;
        if (typeof named === "string" && named.trim()) plan = named.trim();
      }
    }
  }
  return credits === null ? null : { credits: Math.floor(credits), plan };
}

/** Tope para subir un archivo a la dirección firmada (hasta 100 MB). */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

const firstString = (layer: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = layer[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

/**
 * Lee de la respuesta de `media_upload` el identificador del medio y la dirección firmada a la
 * que subirlo. Admite la lista en `files`/`uploads`/`items`/`results`/`data`, una lista suelta o
 * un objeto solo, y variantes de nombre. La dirección tiene que ser `https`; si falta algo, `null`.
 */
export function readUploadTarget(data: unknown): { mediaId: string; uploadUrl: string } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const list = Array.isArray(data) ? data : ["files", "uploads", "items", "results", "data"].map((k) => root[k]).find(Array.isArray);
  const entry = (list ? list[0] : root) as unknown;
  if (!entry || typeof entry !== "object") return null;
  const layer = entry as Record<string, unknown>;
  const mediaId = firstString(layer, ["media_id", "mediaId", "id"]);
  const uploadUrl = firstString(layer, ["upload_url", "uploadUrl", "presigned_url", "url"]);
  if (!mediaId || !uploadUrl) return null;
  try {
    if (new URL(uploadUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { mediaId, uploadUrl };
}

// ───────────────────────── Generaciones: argumentos ─────────────────────────

/** Parámetros de `estimate_image_cost` / `generate_image_batch` (siempre con créditos, nunca ilimitadas). */
function imageParams(request: HfImageRequest, count: number): Record<string, unknown> {
  return {
    model: request.model,
    prompt: request.prompt,
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
    count,
    use_unlim: false,
    medias: request.medias.map(({ role, value }) => ({ role, value })),
  };
}

/** Parámetros de `estimate_video_cost` / `generate_video_batch` (sin `count`: lo añade el envío). */
function videoParams(request: HfVideoRequest): Record<string, unknown> {
  return {
    model: request.model,
    mode: request.mode,
    prompt: request.prompt,
    aspect_ratio: request.aspectRatio,
    duration: request.duration,
    resolution: request.resolution,
    generate_audio: request.generateAudio,
    bitrate_mode: request.bitrateMode,
    use_unlim: false,
    medias: request.medias.map(({ role, value }) => ({ role, value })),
  };
}

/** `jobs_wait` admite como mucho 12 trabajos por llamada y 15 s de espera. */
const JOBS_PER_WAIT = 12;
const MAX_WAIT_SECONDS = 15;

/** Lo que se guarda de una respuesta en crudo (`generations.raw`). */
const RAW_LIMIT = 20_000;

// ───────────────────────── Generaciones: lectores de respuestas ─────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** La primera lista que encuentre en esas claves (o la respuesta, si es una lista), también un nivel más abajo. */
function listIn(data: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isObject(data)) return null;
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  for (const key of ["data", "result"]) {
    const inner = data[key];
    if (isObject(inner)) {
      const found = listIn(inner, keys);
      if (found) return found;
    }
  }
  return null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Créditos de un presupuesto. Admite variantes de nombre y un nivel de anidación; un número con
 * decimales se redondea hacia ARRIBA (mejor pedir de más que quedarse corto). `null` si no hay cifra.
 */
export function readQuote(data: unknown): { credits: number } | null {
  if (!isObject(data)) return null;
  const layers = [data, ...["estimate", "cost", "quote", "data", "result", "price"].map((k) => data[k]).filter(isObject)];
  for (const layer of layers) {
    for (const key of ["credits", "total_credits", "estimated_credits", "credits_cost", "cost", "total_cost", "total", "price", "amount"]) {
      const n = num(layer[key]);
      if (n !== null) return { credits: Math.ceil(n) };
    }
  }
  return null;
}

/** ¿Higgsfield pregunta si pagar con generaciones ilimitadas? Entonces no ha enviado nada. */
function isUnlimChoice(data: unknown): boolean {
  if (!isObject(data)) return false;
  if ("unlim_choice" in data) return true;
  return ["status", "type", "kind", "action"].some((key) => data[key] === "unlim_choice");
}

const jobIdOf = (entry: Record<string, unknown>) => text(entry.job_id) ?? text(entry.jobId) ?? text(entry.id);
const reasonOf = (entry: Record<string, unknown>) =>
  text(entry.error) ?? text(entry.reason) ?? text(entry.message) ?? (isObject(entry.error) ? text(entry.error.message) : null);

/**
 * Lee la respuesta de `generate_*_batch`: identificadores de los trabajos aceptados y motivos de
 * los rechazados (en la misma lista o aparte). `null` si no se entiende nada.
 */
export function readSubmit(data: unknown): { jobIds: string[]; rejected: string[] } | null {
  const jobIds: string[] = [];
  const rejected: string[] = [];
  for (const entry of listIn(data, ["jobs", "results", "items", "generations", "requests"]) ?? []) {
    if (typeof entry === "string" && entry.trim()) {
      jobIds.push(entry.trim());
      continue;
    }
    if (!isObject(entry)) continue;
    const jobId = jobIdOf(entry);
    if (jobId) jobIds.push(jobId);
    else rejected.push(reasonOf(entry) ?? "Rechazada sin motivo.");
  }
  if (isObject(data)) {
    for (const key of ["rejected", "errors", "failed", "failures"]) {
      const list = data[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        rejected.push(text(entry) ?? (isObject(entry) ? reasonOf(entry) : null) ?? "Rechazada sin motivo.");
      }
    }
  }
  if (jobIds.length === 0 && rejected.length === 0) return null;
  return { jobIds: [...new Set(jobIds)], rejected };
}

const DONE = new Set(["completed", "complete", "done", "succeeded", "success", "finished", "ready"]);
const FAILED = new Set(["failed", "failure", "error", "errored", "canceled", "cancelled", "rejected", "expired"]);
const BLOCKED = new Set(["nsfw", "ip_detected"]);

const URL_KEYS = ["url", "raw_url", "video_url", "image_url", "full_url", "download_url", "min_url", "src"];

/** Direcciones de los resultados de un trabajo, en las formas razonables. */
function urlsOf(entry: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && /^(https?:|data:)/.test(value.trim())) urls.push(value.trim());
    else if (isObject(value)) {
      const found = URL_KEYS.map((k) => value[k]).find((v) => typeof v === "string" && v.trim());
      if (found) add(found);
    }
  };
  for (const key of ["urls", "results", "result", "outputs", "output", "media", "files"]) {
    const value = entry[key];
    if (Array.isArray(value)) value.forEach(add);
    else if (value !== undefined) add(value);
  }
  for (const key of URL_KEYS) add(entry[key]);
  return [...new Set(urls)];
}

/** Un trabajo de `jobs_wait`. Un estado que no se reconoce se trata como pendiente. */
function readJob(jobId: string, entry: Record<string, unknown> | undefined): HfJob {
  const pending: HfJob = { jobId, status: "pending", failure: null, error: null, urls: [] };
  if (!entry) return pending;
  const status = (text(entry.status) ?? text(entry.state) ?? "").toLowerCase();
  const error = reasonOf(entry);
  if (BLOCKED.has(status)) return { jobId, status: "failed", failure: status as "nsfw" | "ip_detected", error, urls: [] };
  if (FAILED.has(status)) return { jobId, status: "failed", failure: "failed", error, urls: [] };
  if (DONE.has(status)) return { jobId, status: "done", failure: null, error: null, urls: urlsOf(entry) };
  return pending;
}

/**
 * Lee la respuesta de `jobs_wait` para los trabajos pedidos, en ese orden. Cada entrada se asocia
 * por `job_id` o, si no lo trae, por su índice. Un trabajo que no aparece sigue pendiente. `null`
 * si la respuesta no tiene ninguna lista.
 */
export function readJobs(data: unknown, jobIds: string[]): HfJob[] | null {
  const entries = listIn(data, ["jobs", "results", "items", "statuses"]);
  if (!entries) return null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const id = jobIdOf(entry) ?? (typeof entry.index === "number" ? jobIds[entry.index] : undefined);
    if (id) byId.set(id, entry);
  }
  return jobIds.map((jobId) => readJob(jobId, byId.get(jobId)));
}

/** Una fecha en segundos, milisegundos o ISO; `null` si no se entiende. */
function dateOf(value: unknown): Date | null {
  const n = num(value);
  if (n !== null && n > 0) return new Date(n < 1e12 ? n * 1000 : n);
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Lee la respuesta de `show_generations`. Las entradas sin identificador se saltan. `null` si no hay lista. */
export function readHistory(data: unknown, type: "image" | "video"): HfHistoryItem[] | null {
  const entries = listIn(data, ["generations", "items", "results", "jobs"]);
  if (!entries) return null;
  const items: HfHistoryItem[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const jobId = jobIdOf(entry);
    if (!jobId) continue;
    const params = isObject(entry.params) ? entry.params : {};
    const kind = text(entry.type);
    items.push({
      jobId,
      type: kind === "image" || kind === "video" ? kind : type,
      model: text(entry.model) ?? text(params.model) ?? "",
      prompt: text(params.prompt) ?? text(entry.prompt),
      createdAt: dateOf(entry.created_at ?? entry.createdAt ?? entry.created),
    });
  }
  return items;
}

/** La respuesta en crudo para guardar: el JSON si lo hay; si no, el texto, recortado. */
function rawOf(result: { text: string; data: unknown }): unknown {
  if (result.data !== null && result.data !== undefined) {
    const json = JSON.stringify(result.data);
    if (json && json.length <= RAW_LIMIT) return result.data;
    return { recortado: (json ?? "").slice(0, RAW_LIMIT) };
  }
  return { texto: result.text.slice(0, RAW_LIMIT) };
}

export function createHiggsfieldPort(
  deps: {
    open?: (userId: number) => Promise<McpCaller>;
    refresh?: (userId: number) => Promise<void>;
    fetch?: typeof fetch;
  } = {},
): HiggsfieldPort {
  const oauthDeps = deps.fetch ? { fetch: deps.fetch } : undefined;
  const open = deps.open ?? (async (userId: number) => openMcp(await accessTokenFor(userId, oauthDeps), oauthDeps));
  const refresh =
    deps.refresh ??
    (async (userId: number) => {
      await refreshNow(userId, oauthDeps);
    });

  async function withCaller<T>(userId: number, fn: (caller: McpCaller) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let caller: McpCaller | null = null;
      try {
        caller = await open(userId);
        return await fn(caller);
      } catch (error) {
        if (error instanceof McpUnauthorizedError) {
          if (attempt === 0) {
            await refresh(userId);
            continue;
          }
          // Un token recién refrescado tampoco vale: no se insiste (ni se entra en bucle).
          console.warn(`[higgsfield] El servidor MCP rechazó también el token renovado (persona ${userId}).`);
          throw new HiggsfieldAuthError();
        }
        if (isHiggsfieldError(error)) throw error;
        console.warn(`[higgsfield] Fallo al hablar con el MCP (persona ${userId}): ${error instanceof Error ? error.name : "desconocido"}`);
        throw new HiggsfieldUnavailableError();
      } finally {
        await caller?.close().catch(() => {});
      }
    }
  }

  /** Un presupuesto: no gasta. */
  function quote(userId: number, tool: string, params: Record<string, unknown>): Promise<{ credits: number }> {
    return withCaller(userId, async (caller) => {
      const result = await caller.callTool(tool, { params });
      const quoted = result.isError ? null : readQuote(result.data);
      if (!quoted) {
        console.warn(`[higgsfield] Respuesta de \`${tool}\` que no se entiende.`);
        throw new HiggsfieldUnavailableError();
      }
      return quoted;
    });
  }

  /**
   * Un envío que GASTA. Un 401 prueba que no se ejecutó (se refresca y se repite una vez, en
   * `withCaller`). Cualquier otro fallo de la llamada, o una respuesta que no se entiende, deja el
   * resultado en duda: `HiggsfieldUnknownOutcomeError`, y quien llama no lo repite.
   */
  function submit(userId: number, tool: string, requests: Array<{ index: number; params: Record<string, unknown> }>): Promise<HfSubmitResult> {
    return withCaller(userId, async (caller) => {
      let result: { isError: boolean; text: string; data: unknown };
      try {
        result = await caller.callTool(tool, { requests });
      } catch (error) {
        if (error instanceof McpUnauthorizedError) throw error;
        console.warn(`[higgsfield] \`${tool}\` se cortó sin respuesta: ${error instanceof Error ? error.name : "desconocido"}`);
        throw new HiggsfieldUnknownOutcomeError();
      }
      const raw = rawOf(result);
      if (result.isError) {
        throw new HiggsfieldRejectedError(result.text.trim().slice(0, 500) || "Higgsfield no ha aceptado la petición.", raw);
      }
      if (isUnlimChoice(result.data)) {
        throw new HiggsfieldRejectedError("Higgsfield ha preguntado si pagar con generaciones ilimitadas; no se ha enviado nada.", raw);
      }
      const read = readSubmit(result.data);
      if (!read) {
        console.warn(`[higgsfield] Respuesta de \`${tool}\` que no se entiende.`);
        throw new HiggsfieldUnknownOutcomeError(raw);
      }
      if (read.jobIds.length === 0) throw new HiggsfieldRejectedError(read.rejected.join(" · ").slice(0, 500), raw);
      return { ...read, raw };
    });
  }

  return {
    async balance(userId) {
      return withCaller(userId, async (caller) => {
        const result = await caller.callTool("balance", {});
        const balance = result.isError ? null : readBalance(result.data);
        if (!balance) {
          console.warn("[higgsfield] Respuesta de `balance` que no se entiende.");
          throw new HiggsfieldUnavailableError();
        }
        return balance;
      });
    },
    async uploadMedia(userId, file) {
      return withCaller(userId, async (caller) => {
        const requested = await caller.callTool("media_upload", {
          files: [{ filename: file.filename, content_type: file.contentType }],
          method: "upload_url",
        });
        const target = requested.isError ? null : readUploadTarget(requested.data);
        if (!target) {
          console.warn("[higgsfield] Respuesta de `media_upload` que no se entiende.");
          throw new HiggsfieldUnavailableError();
        }
        // Solo se confirma lo que de verdad ha llegado: sin un 2xx del PUT, no hay `media_confirm`.
        const response = await (deps.fetch ?? fetch)(target.uploadUrl, {
          method: "PUT",
          body: new Uint8Array(file.bytes),
          headers: { "Content-Type": file.contentType },
          redirect: "error",
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        }).catch((error: unknown) => {
          console.warn(`[higgsfield] La subida del archivo falló: ${error instanceof Error ? error.name : "desconocido"}`);
          return null;
        });
        if (!response?.ok) {
          if (response) console.warn(`[higgsfield] La subida del archivo respondió ${response.status}.`);
          throw new HiggsfieldUnavailableError();
        }
        const confirmed = await caller.callTool("media_confirm", { media_ids: [target.mediaId], type: file.type });
        if (confirmed.isError) {
          console.warn("[higgsfield] `media_confirm` respondió con error.");
          throw new HiggsfieldUnavailableError();
        }
        return { mediaId: target.mediaId };
      });
    },
    async diagnostics(userId) {
      return withCaller(userId, async (caller) => {
        const report: Record<string, unknown> = { tools: await caller.listTools() };
        for (const { name, args } of DIAGNOSTIC_TOOLS) {
          try {
            const result = await caller.callTool(name, args);
            report[name] = { isError: result.isError, data: result.data ?? result.text };
          } catch (error) {
            // Un 401 se trata fuera (refresco y una repetición); otro fallo no tapa las demás.
            if (error instanceof McpUnauthorizedError) throw error;
            report[name] = { failed: error instanceof Error ? error.name : "desconocido" };
          }
        }
        return report;
      });
    },
    async quoteImages(userId, request, count) {
      return quote(userId, "estimate_image_cost", imageParams(request, count));
    },
    async quoteVideo(userId, request) {
      return quote(userId, "estimate_video_cost", videoParams(request));
    },
    async submitImages(userId, request, count) {
      // Una petición por candidata (el lote solo admite `count: 1`).
      const params = imageParams(request, 1);
      return submit(userId, "generate_image_batch", Array.from({ length: count }, (_, index) => ({ index, params })));
    },
    async submitVideo(userId, request) {
      return submit(userId, "generate_video_batch", [{ index: 0, params: { ...videoParams(request), count: 1 } }]);
    },
    async jobs(userId, jobIds, waitSeconds) {
      if (jobIds.length === 0) return [];
      const timeout = Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.floor(waitSeconds)));
      return withCaller(userId, async (caller) => {
        const found: HfJob[] = [];
        for (let start = 0; start < jobIds.length; start += JOBS_PER_WAIT) {
          const group = jobIds.slice(start, start + JOBS_PER_WAIT);
          const result = await caller.callTool("jobs_wait", {
            jobs: group.map((job_id, index) => ({ index, job_id })),
            timeout_seconds: timeout,
          });
          const jobs = result.isError ? null : readJobs(result.data, group);
          if (!jobs) {
            console.warn("[higgsfield] Respuesta de `jobs_wait` que no se entiende.");
            throw new HiggsfieldUnavailableError();
          }
          found.push(...jobs);
        }
        return found;
      });
    },
    async history(userId, type, limit) {
      return withCaller(userId, async (caller) => {
        const result = await caller.callTool("show_generations", { only_completed: false, type, size: limit });
        const items = result.isError ? null : readHistory(result.data, type);
        if (!items) {
          console.warn("[higgsfield] Respuesta de `show_generations` que no se entiende.");
          throw new HiggsfieldUnavailableError();
        }
        return items;
      });
    },
  };
}
