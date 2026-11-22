import { McpUnauthorizedError, openMcp, type McpCaller } from "./mcp";
import { accessTokenFor, refreshNow } from "./oauth";
import {
  HiggsfieldAuthError,
  HiggsfieldConnectError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  isHiggsfieldError,
  type HfBalance,
  type HfHistoryItem,
  type HfHistoryPage,
  type HfImageRequest,
  type HfJob,
  type HfQuote,
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
// Escritos contra las capturas reales del 22/11 (`tests/fixtures/higgsfield/*.json`).

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** La lista de `key` en la respuesta (o un nivel más abajo, en `data`/`result`). */
function listAt(data: unknown, key: string): unknown[] | null {
  return listWithHolder(data, key)?.list ?? null;
}

/** Como `listAt`, pero también devuelve el objeto donde estaba la lista (para leer lo que la acompaña). */
function listWithHolder(data: unknown, key: string): { list: unknown[]; holder: Record<string, unknown> } | null {
  if (!isObject(data)) return null;
  if (Array.isArray(data[key])) return { list: data[key] as unknown[], holder: data };
  for (const wrapper of ["data", "result"]) {
    const inner = data[wrapper];
    if (isObject(inner) && Array.isArray(inner[key])) return { list: inner[key] as unknown[], holder: inner };
  }
  return null;
}

/**
 * Un presupuesto: `{ cost: { credits, credits_exact }, quote_ref }`. Un número con decimales se
 * redondea hacia ARRIBA (mejor pedir de más que quedarse corto). `null` si no hay cifra.
 */
export function readQuote(data: unknown): HfQuote | null {
  if (!isObject(data)) return null;
  const cost = isObject(data.cost) ? data.cost : {};
  const credits = num(cost.credits) ?? num(cost.credits_exact) ?? num(data.credits);
  if (credits === null) return null;
  return { credits: Math.ceil(credits), quoteRef: text(data.quote_ref) };
}

/**
 * Texto de error de Higgsfield que prueba que la petición no se aceptó: validación (400/422),
 * créditos insuficientes o la pregunta de las generaciones ilimitadas. Forma real:
 * «… backend request failed (422): cost params failed validation [...]».
 */
const CERTAIN_REJECTION = /failed validation|validation error|request failed \((400|402|422)\)|insufficient (credits|balance)|not enough credits|unlim_choice/i;

/** ¿Higgsfield pregunta si pagar con generaciones ilimitadas? Entonces no ha enviado nada. */
function isUnlimChoice(data: unknown): boolean {
  if (!isObject(data)) return false;
  if ("unlim_choice" in data) return true;
  return ["status", "type", "kind", "action"].some((key) => data[key] === "unlim_choice");
}

const jobIdOf = (entry: Record<string, unknown>) => text(entry.job_id) ?? text(entry.jobId);
const reasonOf = (entry: Record<string, unknown>) =>
  text(entry.error) ?? text(entry.reason) ?? (isObject(entry.error) ? (text(entry.error.message) ?? text(entry.error.msg)) : null);

/**
 * Lee la respuesta de `generate_*_batch`, de forma real
 * `{ jobs: [{ index, job_id, status: "pending" }], submitted_count, failed_count }`.
 *
 * - `{ ok }`: identificadores aceptados y motivos de las peticiones rechazadas con un error explícito.
 * - `{ rejectedAll }`: todas rechazadas con error explícito (seguro que no se envió nada).
 * - `null`: cualquier otra cosa (sin lista, una entrada sin identificador ni error, cuentas que no
 *   cuadran): no se sabe qué se envió.
 */
export function readSubmit(data: unknown): { jobIds: string[]; rejected: string[] } | null {
  const entries = listAt(data, "jobs");
  if (!entries || entries.length === 0) return null;
  const jobIds: string[] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) return null;
    const jobId = jobIdOf(entry);
    const reason = reasonOf(entry);
    if (jobId) jobIds.push(jobId);
    else if (reason) rejected.push(reason);
    else return null;
  }
  const declared = isObject(data) ? num(data.submitted_count) : null;
  if (declared !== null && declared !== jobIds.length) return null;
  return { jobIds: [...new Set(jobIds)], rejected };
}

const DONE = new Set(["completed", "complete", "done", "succeeded", "success", "finished"]);
const FAILED = new Set(["failed", "failure", "error", "errored", "canceled", "cancelled", "rejected", "expired"]);
const BLOCKED = new Set(["nsfw", "ip_detected"]);
const NOT_FOUND = new Set(["not_found", "missing", "lookup_failed", "unknown_job"]);

const URL_KEYS = ["result_url", "rawUrl", "raw_url", "url", "video_url", "image_url"];

/** Direcciones de los resultados: `result_url` en `jobs_wait`, `results.rawUrl` en el historial. */
function urlsOf(entry: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && /^(https:|data:)/.test(value.trim())) urls.push(value.trim());
    else if (isObject(value)) {
      const found = URL_KEYS.map((k) => value[k]).find((v) => typeof v === "string" && v.trim());
      if (found) add(found);
    }
  };
  for (const key of URL_KEYS) add(entry[key]);
  for (const key of ["results", "result", "urls"]) {
    const value = entry[key];
    if (Array.isArray(value)) value.forEach(add);
    else if (value !== undefined) add(value);
  }
  return [...new Set(urls)];
}

/**
 * Un trabajo de `jobs_wait` (`{ index, job_id, status, type, model, result_url }`). Un estado que no
 * se reconoce, o un terminado sin dirección, sigue pendiente (el tope de una hora lo acaba cerrando).
 * Una entrada con error y sin estado es un fallo permanente de la consulta (`not_found`).
 */
function readJob(jobId: string, entry: Record<string, unknown> | undefined): HfJob {
  const pending: HfJob = { jobId, status: "pending", failure: null, error: null, urls: [] };
  if (!entry) return pending;
  const status = (text(entry.status) ?? text(entry.state) ?? "").toLowerCase();
  const error = reasonOf(entry);
  if (BLOCKED.has(status)) return { jobId, status: "failed", failure: status as "nsfw" | "ip_detected", error, urls: [] };
  if (FAILED.has(status)) return { jobId, status: "failed", failure: "failed", error, urls: [] };
  if (NOT_FOUND.has(status) || (!status && error)) return { jobId, status: "failed", failure: "not_found", error, urls: [] };
  if (DONE.has(status)) {
    const urls = urlsOf(entry);
    return urls.length > 0 ? { jobId, status: "done", failure: null, error: null, urls } : pending;
  }
  return pending;
}

/**
 * Lee la respuesta de `jobs_wait` para los trabajos pedidos, en ese orden. Cada entrada se asocia
 * por `job_id` o, si no lo trae, por su índice. Un trabajo que no aparece sigue pendiente. `null`
 * si la respuesta no tiene la lista `jobs`.
 */
export function readJobs(data: unknown, jobIds: string[]): HfJob[] | null {
  const entries = listAt(data, "jobs");
  if (!entries) return null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const id = jobIdOf(entry) ?? (typeof entry.index === "number" ? jobIds[entry.index] : undefined);
    if (id) byId.set(id, entry);
  }
  return jobIds.map((jobId) => readJob(jobId, byId.get(jobId)));
}

/** Una fecha en segundos (como la real, `createdAt: 1795304165.949`), milisegundos o ISO; `null` si no se entiende. */
function dateOf(value: unknown): Date | null {
  const n = num(value);
  if (n !== null && n > 0) return new Date(n < 1e12 ? n * 1000 : n);
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Las entradas que deja ver una generación del historial, con su identificador y su dirección si constan. */
function mediaOf(params: Record<string, unknown>): HfHistoryItem["media"] {
  const media: HfHistoryItem["media"] = [];
  const add = (value: unknown) => {
    if (isObject(value)) {
      const id = text(value.id) ?? text(value.media_id) ?? text(value.value);
      const url = text(value.url) ?? text(value.rawUrl);
      if (id || url) media.push({ id, url });
    } else if (typeof value === "string" && value.trim()) {
      const item = value.trim();
      media.push(/^https?:/.test(item) ? { id: null, url: item } : { id: item, url: null });
    }
  };
  for (const key of ["input_images", "input_videos", "medias", "media_inputs"]) {
    const value = params[key];
    if (Array.isArray(value)) value.forEach(add);
  }
  for (const key of ["input_image", "input_video", "start_image", "end_image"]) {
    if (params[key] !== null && params[key] !== undefined) add(params[key]);
  }
  return media;
}

/**
 * La miniatura del resultado de una generación del historial: solo `results.minUrl` (nunca el
 * resultado entero, `rawUrl`, que puede ser un vídeo de muchos megas).
 */
function thumbOf(entry: Record<string, unknown>): string | null {
  const results = isObject(entry.results) ? entry.results : {};
  const url = text(results.minUrl);
  return url && /^https:/.test(url) ? url : null;
}

/**
 * Lee una página de `show_generations`: `{ items: [{ id, type, status, model, params: { prompt,
 * resolution, input_images… }, results, createdAt }], next_cursor }`. Las entradas sin `id` se
 * saltan. `null` si no hay lista. `next_cursor` se lee del mismo objeto que trae la lista: un
 * número o un texto (opaco, se devuelve tal cual) es la página siguiente; un `null` explícito es el
 * final (`end`); si no viene o no se entiende, no se sabe (ni hay siguiente ni prueba el final).
 */
export function readHistory(data: unknown, type: "image" | "video"): HfHistoryPage | null {
  const found = listWithHolder(data, "items") ?? listWithHolder(data, "generations");
  if (!found) return null;
  const entries = found.list;
  const items: HfHistoryItem[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const jobId = text(entry.id) ?? jobIdOf(entry);
    if (!jobId) continue;
    const params = isObject(entry.params) ? entry.params : {};
    const kind = text(entry.type);
    items.push({
      jobId,
      type: kind === "image" || kind === "video" ? kind : type,
      model: text(entry.model) ?? text(params.model) ?? "",
      prompt: typeof params.prompt === "string" ? params.prompt : null,
      createdAt: dateOf(entry.createdAt ?? entry.created_at),
      media: mediaOf(params),
      resolution: text(params.resolution),
      thumbUrl: thumbOf(entry),
    });
  }
  const raw = found.holder.next_cursor;
  const end = Object.hasOwn(found.holder, "next_cursor") && raw === null;
  const nextCursor = typeof raw === "string" && raw.trim() !== "" ? raw : num(raw);
  return { items, nextCursor, end };
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

  /**
   * Un presupuesto: no gasta. Un error de validación de Higgsfield (forma real: «… failed (422):
   * cost params failed validation …») es `HiggsfieldRejectedError` con su texto; otra cosa que no
   * se entiende, `HiggsfieldUnavailableError`.
   */
  function quote(userId: number, tool: string, params: Record<string, unknown>): Promise<HfQuote> {
    return withCaller(userId, async (caller) => {
      const result = await caller.callTool(tool, { params });
      if (result.isError && CERTAIN_REJECTION.test(result.text)) {
        throw new HiggsfieldRejectedError(result.text.trim().slice(0, 500), rawOf(result));
      }
      const quoted = result.isError ? null : readQuote(result.data);
      if (!quoted) {
        console.warn(`[higgsfield] Respuesta de \`${tool}\` que no se entiende.`);
        throw new HiggsfieldUnavailableError();
      }
      return quoted;
    });
  }

  /**
   * Un envío que GASTA.
   * - No se llegó a llamar a la herramienta (token, refresco o conexión fallan antes; un 401 prueba
   *   que no se ejecutó y se repite una vez) → `HiggsfieldConnectError` (o el de permisos).
   * - Higgsfield dice que no de forma explícita (validación, créditos, `unlim_choice`, todas las
   *   peticiones con su error) → `HiggsfieldRejectedError`.
   * - Cualquier otra cosa (corte durante la llamada, error sin prueba de rechazo, respuesta que no
   *   cuadra) → `HiggsfieldUnknownOutcomeError`: quien llama no lo repite.
   */
  async function submit(
    userId: number,
    tool: string,
    requests: Array<{ index: number; params: Record<string, unknown> }>,
  ): Promise<HfSubmitResult> {
    let maybeSent = false;
    try {
      return await withCaller(userId, async (caller) => {
        let result: { isError: boolean; text: string; data: unknown };
        try {
          maybeSent = true;
          result = await caller.callTool(tool, { requests });
        } catch (error) {
          if (error instanceof McpUnauthorizedError) {
            maybeSent = false; // un 401 prueba que no se ejecutó
            throw error;
          }
          console.warn(`[higgsfield] \`${tool}\` se cortó sin respuesta: ${error instanceof Error ? error.name : "desconocido"}`);
          throw new HiggsfieldUnknownOutcomeError();
        }
        const raw = rawOf(result);
        if (isUnlimChoice(result.data)) {
          throw new HiggsfieldRejectedError("Higgsfield ha preguntado si pagar con generaciones ilimitadas; no se ha enviado nada.", raw);
        }
        if (result.isError) {
          if (CERTAIN_REJECTION.test(result.text)) {
            throw new HiggsfieldRejectedError(result.text.trim().slice(0, 500), raw);
          }
          console.warn(`[higgsfield] \`${tool}\` respondió con un error sin prueba de rechazo.`);
          throw new HiggsfieldUnknownOutcomeError(raw);
        }
        const read = readSubmit(result.data);
        if (!read) {
          console.warn(`[higgsfield] Respuesta de \`${tool}\` que no se entiende.`);
          throw new HiggsfieldUnknownOutcomeError(raw);
        }
        if (read.jobIds.length === 0) throw new HiggsfieldRejectedError(read.rejected.join(" · ").slice(0, 500), raw);
        return { ...read, raw };
      });
    } catch (error) {
      const certain = error instanceof HiggsfieldAuthError || error instanceof HiggsfieldNotConnectedError || error instanceof HiggsfieldRejectedError;
      if (!maybeSent && !certain && !(error instanceof HiggsfieldUnknownOutcomeError)) throw new HiggsfieldConnectError();
      throw error;
    }
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
      // Una petición por candidata (el lote solo admite `count: 1`; un presupuesto de `count` no se puede partir).
      const params = imageParams(request, 1);
      return submit(userId, "generate_image_batch", Array.from({ length: count }, (_, index) => ({ index, params })));
    },
    async submitVideo(userId, request, options = {}) {
      // Con el `quote_ref` se envía exactamente lo presupuestado (así lo hizo el piloto).
      const params = options.quoteRef ? { ref: options.quoteRef, use_unlim: false } : { ...videoParams(request), count: 1 };
      return submit(userId, "generate_video_batch", [{ index: 0, params }]);
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
    async history(userId, type, limit, cursor) {
      return withCaller(userId, async (caller) => {
        const args: Record<string, unknown> = { only_completed: false, type, size: limit };
        if (typeof cursor === "number" || typeof cursor === "string") args.cursor = cursor;
        const result = await caller.callTool("show_generations", args);
        const page = result.isError ? null : readHistory(result.data, type);
        if (!page) {
          console.warn("[higgsfield] Respuesta de `show_generations` que no se entiende.");
          throw new HiggsfieldUnavailableError();
        }
        return page;
      });
    },
  };
}
