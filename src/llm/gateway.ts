import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  computeCostMicros,
  EFFORT,
  estimateMaxCostMicros,
  FALLBACK_MODELS,
  hasPrice,
  MODELS,
  type ModelTier,
  type Usage,
} from "@/llm/models";
import { macBridge } from "@/server/claude-mac";
import type { RuleSnapshot } from "@/server/rules";
import { recordMacSpend, releaseSpend, reserveSpend, settleSpend, SpendCapError } from "@/server/spend";

/**
 * Pasarela única a Claude: toda llamada a un modelo pasa por aquí. Antes de llamar reserva en el
 * libro de gasto el peor caso de la llamada (si no cabe en el tope, no se llama) y al volver
 * apunta el coste real. Solo `src/llm` importa el SDK de Anthropic.
 *
 * Orden de una llamada: validar → (dueño con Mac: su Claude Code, ver abajo) → clave → reservar
 * (queda confirmado en la base de datos antes de llamar) → llamar → liquidar con el coste real →
 * mirar por qué paró → validar los datos.
 *
 * Las llamadas del dueño con un Mac conectado van primero a ese Mac (`src/server/claude-mac.ts`):
 * su Claude Code con el plan de suscripción, a 0 $ en el libro. Si el Mac está apagado, llegó al
 * límite del plan o falla, siguen por la API de siempre (modo «Mac primero») o quedan en pausa
 * (modo «solo Mac»). Para quien llama no cambia nada.
 */

/**
 * Máximo de salida por llamada. La pasarela no pide la respuesta en flujo: espera la respuesta
 * entera, y una más larga no cabría en el tiempo máximo de la llamada. Este es el único límite
 * (con el tiempo máximo fijado, el SDK no pone el suyo).
 */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Cabecera beta del modelo de reserva del servidor (`fallbacks`). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Tokens de entrada que puede llegar a contar una foto; en caracteres, a 3 por token. */
const IMAGE_CHARS = 5_000 * 3;

/** Lo más que se deja leer de una página con `web_fetch`, en tokens. */
export const WEB_FETCH_MAX_TOKENS = 8_000;
/** Lo que puede añadir a la entrada cada resultado de búsqueda, en tokens (por lo alto). */
const WEB_SEARCH_RESULT_TOKENS = 6_000;
/** Precio de cada búsqueda: 10 US$ por cada 1 000 (precios de Anthropic, 23-11-2026). Leer páginas no se cobra aparte. */
export const WEB_SEARCH_MICROS = 10_000;
/** Lo más que se deja buscar y leer en una llamada. */
const MAX_WEB_USES = 25;
/** Vueltas del servidor que se reservan como mucho con búsqueda (cada una relee lo encontrado). */
const WEB_ROUNDS = 4;
/** Veces que se continúa una respuesta que el servidor pausó (`pause_turn`) en mitad de las búsquedas. */
const MAX_CONTINUATIONS = 2;

/** Margen por lo que la API añade a la entrada (marcas de mensaje y de sistema). */
const FRAMING_CHARS = 600;

/**
 * Tiempo máximo de una llamada: 10 minutos, porque una respuesta de `MAX_OUTPUT_TOKENS` en el
 * nivel mediano puede tardar más de 7. Si se agota no se sabe si el proveedor la cobró. Por eso
 * las llamadas van en el proceso en segundo plano, no dentro de una petición web.
 */
const REQUEST_TIMEOUT_MS = 600_000;

type MessagesClient = Pick<Anthropic["beta"]["messages"], "create"> & Partial<Pick<Anthropic["beta"]["messages"], "stream">>;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type ApiMessage = Anthropic.Beta.Messages.BetaMessage;

export interface LlmCall<T> {
  tier: ModelTier;
  /** Qué paso gasta; queda en el libro de gasto. */
  stepKey: string;
  userId: number;
  productId: number | null;
  /** Reglas vigentes (de `loadRules`): van al principio de `system`, en caché. */
  rules: RuleSnapshot[];
  /** Instrucciones propias del paso: van después de las reglas. */
  instructions: string;
  /** Lo que cambia en cada llamada (ficha del producto, fotos…): el mensaje del usuario. */
  content: Anthropic.MessageParam["content"];
  /** Máximo de tokens de salida; incluye lo que el modelo gaste en pensar. */
  maxTokens: number;
  /** Si se pasa, se pide la respuesta en JSON con esta forma y se valida. */
  schema?: z.ZodType<T>;
  /**
   * Búsqueda en internet (herramientas del servidor de Anthropic `web_search` y `web_fetch`):
   * cuántas búsquedas y lecturas de páginas puede hacer como mucho, y el país desde el que se
   * busca (código ISO, p. ej. `DE`). Con búsqueda, el JSON de `schema` se pide al final del
   * texto (no con `output_config.format`) y se valida igual.
   */
  web?: WebAccess;
}

export interface WebAccess {
  searches: number;
  fetches: number;
  country?: string;
}

export interface LlmResult<T> {
  text: string;
  /** Datos validados con `schema`; `null` si no se pasó. */
  data: T | null;
  /** Modelo que respondió (puede ser el de reserva). */
  model: string;
  /** Tokens de todos los intentos de la llamada. */
  usage: Usage;
  costMicros: number;
  spendEntryId: number;
  ruleVersions: Record<string, number>;
  /**
   * Direcciones que de verdad devolvieron las herramientas de internet (resultados de búsqueda y
   * páginas leídas), sin repetir. Sirve para comprobar que una prueba citada existe. Vacío sin `web`.
   */
  webSources: string[];
}

export interface LlmGateway {
  call<T = unknown>(request: LlmCall<T>): Promise<LlmResult<T>>;
}

// ───────────────────────── Claude Code del Mac del dueño ─────────────────────────

/** Lo que se manda al Mac: lo mismo que se mandaría a la API, ya montado. Nunca secretos. */
export interface MacJob {
  /** Reglas + instrucciones del paso (+ el aviso del JSON final con búsqueda). */
  system: string;
  /** El mensaje de la persona, tal cual (texto y fotos en base64). */
  content: LlmCall<unknown>["content"];
  /** Esquema JSON de la salida (`--json-schema`), o `null`. Con búsqueda va en `system`. */
  jsonSchema: Record<string, unknown> | null;
  model: string;
  effort: string;
  maxTokens: number;
  web: WebAccess | null;
}

export interface MacAnswer {
  /** El texto de la respuesta (con `jsonSchema`, el JSON en texto). */
  text: string;
  /** El JSON ya validado por Claude Code con `jsonSchema`, o `null`. */
  structured: unknown;
  model: string;
  usage: Usage;
  /** Lo que habría costado en la API, según Claude Code; `null` si no lo dijo. */
  apiEquivalentMicros: number | null;
  webSources: string[];
  stopReason: "end" | "max_turns" | "refusal";
}

export type MacFailure = "apagado" | "limite" | "fallo" | "grande";
export type MacOutcome = { ok: true; taskId: number; answer: MacAnswer } | { ok: false; reason: MacFailure; detail: string };
export type MacRoute = { mode: "mac_primero" | "solo_mac"; usable: true } | { mode: "mac_primero" | "solo_mac"; usable: false; reason: MacFailure };

/** El puente con el Mac (el real está en `src/server/claude-mac.ts`; en pruebas, uno de mentira). */
export interface MacBridge {
  /** `null`: esta llamada va a la API como siempre. */
  route(userId: number): Promise<MacRoute | null>;
  run(input: { userId: number; stepKey: string; job: MacJob }): Promise<MacOutcome>;
}

const MAC_PAUSED: Record<MacFailure, string> = {
  apagado: "El Mac está apagado: las llamadas a Claude siguen cuando vuelva a estar conectado.",
  limite: "Claude Code del Mac ha llegado al límite del plan: se sigue cuando se renueve.",
  fallo: "El Mac no ha podido hacer esta llamada a Claude.",
  grande: "Esta llamada es demasiado grande para el Mac.",
};

/** Falta la clave: no se reserva ni se llama. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super("Falta la clave de Claude (ANTHROPIC_API_KEY).");
    this.name = "LlmNotConfiguredError";
  }
}

/**
 * No queda saldo para el peor caso de esta llamada; no se ha llamado al modelo. Solo lleva el
 * mensaje y de quién es el tope: cuánto hay gastado y el tope son datos de todos y no salen de aquí.
 */
export class LlmCapReachedError extends Error {
  constructor(
    /** `saldo`: la cuenta de la API de Claude se quedó sin créditos (se reanuda sola al recargar). */
    public scope: "global" | "persona" | "saldo",
    message: string,
  ) {
    super(message);
    this.name = "LlmCapReachedError";
  }
}

/** Estados que no se arreglan reintentando: la petición está mal hecha o no está permitida. */
const INVALID_REQUEST_STATUSES = new Set([400, 403, 404, 413, 422]);

const RETRY_LATER = "Claude no ha respondido. Inténtalo de nuevo dentro de unos minutos.";
const INVALID_REQUEST = "La petición a Claude no es válida; avisa al dueño.";
const UNREADABLE_ANSWER = "Claude ha devuelto una respuesta que no se entiende; avisa al dueño.";

export const NO_CREDIT = "Sin saldo en la API de Claude: se sigue solo en cuanto se recargue.";

/** ¿La API de Claude rechazó la llamada por falta de créditos? */
export function isNoCredit(error: unknown, status: number | null): boolean {
  if (status !== 400 && status !== 402) return false;
  const text = error instanceof Error ? error.message : String(error);
  return status === 402 || /credit balance|billing|purchase credits/i.test(text);
}

/** Mensaje para quien usa la aplicación. Solo invita a reintentar cuando el fallo puede ser pasajero. */
function failureMessage(error: unknown, status: number | null): string {
  if (status === 401) return "Claude no acepta la clave configurada (ANTHROPIC_API_KEY); avisa al dueño.";
  if (status === 402) return "La cuenta de Claude no tiene saldo; avisa al dueño.";
  if (status !== null) return INVALID_REQUEST_STATUSES.has(status) ? INVALID_REQUEST : RETRY_LATER;
  // Sin estado HTTP: fallo de conexión, tiempo agotado o petición cancelada.
  if (error instanceof Anthropic.APIError) return RETRY_LATER;
  // El propio SDK paró la petición antes de enviarla: está mal hecha.
  if (error instanceof Anthropic.AnthropicError) return INVALID_REQUEST;
  return "La llamada a Claude ha fallado de forma inesperada; avisa al dueño.";
}

/**
 * La llamada no dio una respuesta que sirva. `charged` dice si el proveedor pudo cobrarla: `"no"`
 * (la rechazó sin procesarla o no llegó a salir: la reserva se liberó) o `"desconocido"` (se
 * cortó a medias, falló en el servidor o la respuesta no se entiende: lo reservado queda
 * apuntado como gastado). El mensaje es apto para mostrarse.
 */
export class LlmCallError extends Error {
  constructor(
    public charged: "no" | "desconocido",
    public status: number | null,
    message: string,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = "LlmCallError";
  }
}

/** Los filtros de seguridad rechazaron la petición. La llamada queda cobrada. */
export class LlmRefusalError extends Error {
  constructor(public category: string | null) {
    super("Claude ha rechazado esta petición.");
    this.name = "LlmRefusalError";
  }
}

/** La respuesta se cortó antes de terminar (por `maxTokens` o por tamaño). La llamada queda cobrada. */
export class LlmTruncatedError extends Error {
  /**
   * Lo que sí llegó a contestar y lo que costó (ya apuntado en el libro). No enumerable: al
   * registrar o serializar el error no sale la respuesta.
   */
  declare readonly partial?: { text: string; model: string; costMicros: number; spendEntryId: number };

  constructor(partial?: { text: string; model: string; costMicros: number; spendEntryId: number }) {
    super("La respuesta de Claude se ha cortado antes de terminar.");
    this.name = "LlmTruncatedError";
    Object.defineProperty(this, "partial", { value: partial, enumerable: false });
  }
}

/** La respuesta no tiene la forma pedida con `schema`. La llamada queda cobrada. */
export class LlmInvalidOutputError extends Error {
  constructor() {
    super("La respuesta de Claude no tiene el formato esperado.");
    this.name = "LlmInvalidOutputError";
  }
}

function validate(request: LlmCall<unknown>): void {
  if (!Object.hasOwn(MODELS, request.tier)) throw new Error("Nivel de modelo desconocido.");
  if (!request.stepKey) throw new Error("Falta la clave del paso.");
  if (typeof request.instructions !== "string" || request.instructions.trim() === "") {
    throw new Error("Faltan las instrucciones del paso.");
  }
  const { content } = request;
  const empty = typeof content === "string" ? content.trim() === "" : !Array.isArray(content) || content.length === 0;
  if (empty) throw new Error("Falta el contenido de la petición.");
  if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > MAX_OUTPUT_TOKENS) {
    throw new Error(`El máximo de tokens de salida debe ser un entero entre 1 y ${MAX_OUTPUT_TOKENS}.`);
  }
  if (request.web) {
    const { searches, fetches, country } = request.web;
    const ok = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_WEB_USES;
    if (!ok(searches) || !ok(fetches) || searches + fetches === 0) throw new Error("Búsqueda en internet mal configurada.");
    if (country !== undefined && !/^[A-Z]{2}$/.test(country)) throw new Error("País de búsqueda no válido.");
  }
  const seen = new Set<string>();
  for (const rule of request.rules) {
    if (seen.has(rule.slug)) throw new Error(`Regla repetida: «${rule.slug}».`);
    seen.add(rule.slug);
  }
}

/**
 * Texto de las reglas tal como va a la caché. Solo depende de las reglas: ordenadas por `slug`,
 * con separador fijo y sin fechas, versiones ni nada de la persona o del paso, porque un solo
 * carácter distinto obliga a pagar de nuevo la escritura en caché.
 */
function rulesBlock(rules: RuleSnapshot[]): string {
  return [...rules]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((rule) => `<regla nombre="${rule.slug}">\n${rule.body}\n</regla>`)
    .join("\n\n");
}

function buildParams(request: LlmCall<unknown>): CreateParams {
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];
  if (request.rules.length > 0) {
    system.push({ type: "text", text: rulesBlock(request.rules), cache_control: { type: "ephemeral" } });
  }
  system.push({ type: "text", text: request.instructions });

  const outputConfig: NonNullable<CreateParams["output_config"]> = { effort: EFFORT[request.tier] };
  if (request.schema && request.web) {
    // Con búsqueda, el texto lleva citas y resultados intercalados: el JSON va al final del texto.
    const { schema } = zodOutputFormat(request.schema);
    system.push({
      type: "text",
      text: `Termina SIEMPRE la respuesta con un único bloque \`\`\`json … \`\`\` que cumpla este esquema JSON (sin nada después):\n${JSON.stringify(schema)}`,
    });
  } else if (request.schema) {
    const { type, schema } = zodOutputFormat(request.schema);
    outputConfig.format = { type, schema };
  }

  // Sin `thinking` (estos modelos piensan lo que ven necesario según el esfuerzo), sin
  // `temperature`, sin `tool_choice` y sin relleno previo: en estos modelos dan error.
  const params: CreateParams = {
    model: MODELS[request.tier],
    max_tokens: request.maxTokens,
    system,
    messages: [{ role: "user", content: request.content }],
    output_config: outputConfig,
  };
  if (request.web) {
    const location = request.web.country ? { user_location: { type: "approximate" as const, country: request.web.country } } : {};
    const tools: NonNullable<CreateParams["tools"]> = [];
    if (request.web.searches > 0) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: request.web.searches, ...location });
    if (request.web.fetches > 0) {
      tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: request.web.fetches, max_content_tokens: WEB_FETCH_MAX_TOKENS });
    }
    params.tools = tools;
  }
  if (FALLBACK_MODELS[request.tier]) {
    // Si los filtros de seguridad rechazan la petición, el servidor la reintenta en el modelo
    // de reserva dentro de la misma llamada.
    params.fallbacks = "default";
    params.betas = [FALLBACK_BETA];
  }
  return params;
}

/** La llamada tal como se manda al Claude Code del Mac. */
export function macJobOf(request: LlmCall<unknown>): MacJob {
  const params = buildParams(request);
  const system = (params.system as Anthropic.Beta.Messages.BetaTextBlockParam[]).map((block) => block.text);
  if (request.web?.country) system.push(`Busca y lee como alguien que está en el país ${request.web.country}.`);
  const format = params.output_config?.format as { schema?: Record<string, unknown> } | undefined;
  return {
    system: system.join("\n\n"),
    content: request.content,
    jsonSchema: format?.schema ?? null,
    model: MODELS[request.tier],
    effort: EFFORT[request.tier],
    maxTokens: request.maxTokens,
    web: request.web ?? null,
  };
}

/** Caracteres de entrada de la petición, tirando por lo alto, para estimar sus tokens. */
function inputChars(params: CreateParams): number {
  let chars = FRAMING_CHARS;
  for (const block of params.system as Anthropic.Beta.Messages.BetaTextBlockParam[]) chars += block.text.length;
  if (params.output_config?.format) chars += JSON.stringify(params.output_config.format).length;
  for (const message of params.messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const block of message.content ?? []) {
      if (block.type === "text") chars += block.text.length;
      // Una foto cuenta por sus píxeles, no por el tamaño del archivo.
      else if (block.type === "image") chars += IMAGE_CHARS;
      else chars += JSON.stringify(block).length;
    }
  }
  return chars;
}

/** Recargo del 10 % cuando la inferencia está fijada a una región (p. ej. Estados Unidos). */
function withRegionSurcharge(micros: number): number {
  return Math.ceil((micros * 11) / 10);
}

/**
 * Lo máximo que puede costar la llamada: toda la entrada a precio de escritura en caché y toda
 * la salida permitida, también en el modelo de reserva si lo hay, y con el recargo de región.
 */
function worstCaseMicros(tier: ModelTier, params: CreateParams, web?: WebAccess): number {
  let chars = inputChars(params);
  if (params.tools) chars += JSON.stringify(params.tools).length;
  if (web) {
    // Cada vuelta del servidor vuelve a leer todo lo encontrado hasta entonces: como mucho una
    // vuelta por búsqueda o lectura, más la última, con todo lo encontrado.
    // La búsqueda nueva agrupa consultas desde código y el servidor reutiliza la caché: como mucho
    // unas pocas vueltas releen todo lo encontrado (medido: ~0,25 US$ con 20 búsquedas).
    const found = (web.searches * WEB_SEARCH_RESULT_TOKENS + web.fetches * WEB_FETCH_MAX_TOKENS) * 3;
    chars = (chars + found) * Math.min(web.searches + web.fetches + 1, WEB_ROUNDS);
  }
  let micros = estimateMaxCostMicros(MODELS[tier], chars, params.max_tokens);
  const fallback = FALLBACK_MODELS[tier];
  if (fallback) micros += estimateMaxCostMicros(fallback, chars, params.max_tokens);
  if (web) micros += web.searches * WEB_SEARCH_MICROS * (fallback ? 2 : 1);
  return withRegionSurcharge(micros);
}

interface Attempt {
  type: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `null` si no se conoce el precio de ese modelo o los tokens no son válidos. */
  costMicros: number | null;
}

interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}

function attemptOf(type: string, model: string, counts: TokenCounts): Attempt {
  // Sin la cuenta de entrada y de salida no se sabe qué costó: nunca se da por gratis.
  if (typeof counts.input_tokens !== "number" || typeof counts.output_tokens !== "number") {
    throw new TypeError("La respuesta no trae la cuenta de tokens.");
  }
  const usage: Usage = {
    inputTokens: counts.input_tokens,
    outputTokens: counts.output_tokens,
    cacheReadTokens: counts.cache_read_input_tokens ?? 0,
    cacheWriteTokens: counts.cache_creation_input_tokens ?? 0,
  };
  let costMicros: number | null = null;
  if (hasPrice(model)) {
    try {
      costMicros = computeCostMicros(model, usage);
    } catch {
      costMicros = null; // tokens que no son números válidos: no se puede poner precio
    }
  }
  return { type, model, ...usage, costMicros };
}

/**
 * Intentos que hubo que pagar. Si el servidor pasó a un modelo de reserva, `usage.iterations`
 * trae uno por modelo y es la cuenta completa (los campos de arriba de `usage` describen solo
 * el intento que respondió); cada intento se cobra a la tarifa de su modelo. Se cuenta todo lo
 * que la respuesta declara, también un rechazo sin salida que el proveedor quizá no cobre:
 * el apunte puede quedar algo por encima, nunca por debajo.
 */
function attemptsOf(requestedModel: string, response: ApiMessage): Attempt[] {
  const iterations = response.usage.iterations;
  if (!iterations || iterations.length === 0) return [attemptOf("message", response.model, response.usage)];
  return iterations.map((iteration) =>
    attemptOf(iteration.type, ("model" in iteration && iteration.model) || requestedModel, iteration),
  );
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Tokens para la columna del libro, o nada si el número no cabe en ella. */
function ledgerTokens(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : undefined;
}

/**
 * Estados con los que la API rechaza la petición sin procesarla: no se cobra. Incluye los de
 * saturación (409, 429, 503 y 529), que se devuelven antes de que el modelo empiece.
 */
const NOT_PROCESSED_STATUSES = new Set([400, 401, 402, 403, 404, 409, 413, 422, 429, 503, 529]);

/** Fallos de red en los que la petición no llegó a salir. */
const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

function neverSent(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NOT_SENT_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * ¿Pudo cobrar el proveedor una llamada que falló? Solo se responde que no cuando es seguro:
 * la rechazó sin procesarla, la conexión no llegó a abrirse o el propio SDK la paró antes de
 * enviarla. Tiempo agotado, corte a medias, error del servidor (500, 502, 504) o cualquier fallo
 * no reconocido cuentan como «no se sabe».
 */
function couldHaveCharged(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) return true;
  if (error instanceof Anthropic.APIConnectionError) return !neverSent(error);
  if (error instanceof Anthropic.APIError) return !(typeof error.status === "number" && NOT_PROCESSED_STATUSES.has(error.status));
  if (error instanceof Anthropic.AnthropicError) return false;
  return true;
}

function httpStatus(error: unknown): number | null {
  return error instanceof Anthropic.APIError && typeof error.status === "number" ? error.status : null;
}

function textOf(response: ApiMessage): string {
  let text = "";
  for (const block of response.content) if (block.type === "text") text += block.text;
  return text;
}

/** Direcciones que trajeron los resultados de `web_search` y `web_fetch` de la respuesta. */
export function webSourcesOf(content: unknown): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.add(value);
  };
  if (!Array.isArray(content)) return [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content as Array<Record<string, unknown>>) if (result?.type === "web_search_result") add(result.url);
    } else if (block.type === "web_fetch_tool_result" && block.content && typeof block.content === "object") {
      const fetched = block.content as Record<string, unknown>;
      if (fetched.type === "web_fetch_result") add(fetched.url);
    }
  }
  return [...urls];
}

/**
 * El JSON del final de una respuesta con búsqueda: el último bloque \`\`\`json, o si no hay, del
 * primer «{» al último «}» del texto que sigue a la última herramienta.
 */
export function trailingJson(text: string): string {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fences.length > 0) return fences[fences.length - 1][1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

interface Reading {
  model: string;
  text: string;
  stopReason: string | null;
  refusalCategory: string | null;
  attempts: Attempt[];
  usage: Usage;
  /** `null` si algún intento no tiene precio conocido. */
  costMicros: number | null;
  /** Región fija en la que se ejecutó, si lleva recargo. */
  surchargedRegion: string | null;
  /** Búsquedas en internet que hizo (se cobran aparte). */
  webSearches: number;
}

/**
 * Saca de la respuesta lo que hace falta para cobrarla y devolverla. Lanza si no tiene la forma
 * de un mensaje (sin `content`, sin `usage` o sin su cuenta de tokens de entrada y de salida,
 * arriba o en alguno de los intentos): entonces no se puede saber cuánto costó.
 */
function readResponse(requestedModel: string, response: ApiMessage): Reading {
  const shaped =
    typeof response === "object" &&
    response !== null &&
    typeof response.model === "string" &&
    Array.isArray(response.content) &&
    typeof response.usage === "object" &&
    response.usage !== null &&
    (response.stop_reason === null || typeof response.stop_reason === "string");
  if (!shaped) throw new TypeError("La respuesta no tiene la forma de un mensaje.");

  const attempts = attemptsOf(requestedModel, response);
  const priced = attempts.every((attempt) => attempt.costMicros !== null);
  const region = response.usage.inference_geo;
  const surchargedRegion = typeof region === "string" && region !== "global" ? region : null;
  const attemptsMicros = sum(attempts.map((attempt) => attempt.costMicros ?? 0));
  const stopReason = response.stop_reason;
  const searched = response.usage.server_tool_use?.web_search_requests;
  const webSearches = typeof searched === "number" && Number.isSafeInteger(searched) && searched > 0 ? searched : 0;
  const tokensMicros = !priced ? null : surchargedRegion ? withRegionSurcharge(attemptsMicros) : attemptsMicros;
  return {
    model: response.model,
    text: textOf(response),
    stopReason,
    refusalCategory: stopReason === "refusal" ? (response.stop_details?.category ?? null) : null,
    attempts,
    usage: {
      inputTokens: sum(attempts.map((attempt) => attempt.inputTokens)),
      outputTokens: sum(attempts.map((attempt) => attempt.outputTokens)),
      cacheReadTokens: sum(attempts.map((attempt) => attempt.cacheReadTokens)),
      cacheWriteTokens: sum(attempts.map((attempt) => attempt.cacheWriteTokens)),
    },
    costMicros: tokensMicros === null ? null : tokensMicros + webSearches * WEB_SEARCH_MICROS,
    surchargedRegion,
    webSearches,
  };
}

function parseData<T>(schema: z.ZodType<T>, text: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LlmInvalidOutputError();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new LlmInvalidOutputError();
  return parsed.data;
}

/**
 * Crea una pasarela. Sin `client` usa el cliente real, con la clave de `ANTHROPIC_API_KEY`, que
 * se lee del entorno en cada llamada (si cambia, el cliente se crea de nuevo), solo vive en la
 * memoria del proceso y nunca se escribe en registros ni respuestas. `client` y `now` existen
 * para las pruebas: `now` fija la fecha del apunte y el código de la aplicación no debe pasarlo.
 */
export function createGateway(deps: { client?: MessagesClient; now?: () => Date; mac?: MacBridge | null } = {}): LlmGateway {
  const mac = deps.mac === undefined ? macBridge : deps.mac;
  let real: { apiKey: string; client: MessagesClient } | null = null;

  function resolveClient(): MessagesClient {
    if (deps.client) return deps.client;
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new LlmNotConfiguredError();
    if (real?.apiKey !== apiKey) {
      const sdk = new Anthropic({
        apiKey,
        // Sin reintentos automáticos: cada intento podría cobrarse y solo hay una reserva.
        // Reintenta quien llama, con una reserva nueva.
        maxRetries: 0,
        timeout: REQUEST_TIMEOUT_MS,
        // Fijo: con `ANTHROPIC_LOG=debug` en el entorno el SDK escribiría las peticiones enteras
        // (reglas, fichas, fotos) en el registro.
        logLevel: "warn",
      });
      real = { apiKey, client: sdk.beta.messages };
    }
    return real.client;
  }

  /** La respuesta del Mac con el mismo contrato que la de la API; el libro la apunta a 0 $. */
  async function macResult<T>(request: LlmCall<T>, outcome: Extract<MacOutcome, { ok: true }>, ruleVersions: Record<string, number>): Promise<LlmResult<T>> {
    const { answer } = outcome;
    const model = answer.model || MODELS[request.tier];
    const { entryId } = await recordMacSpend({
      userId: request.userId,
      productId: request.productId,
      model,
      stepKey: request.stepKey,
      inputTokens: ledgerTokens(answer.usage.inputTokens),
      outputTokens: ledgerTokens(answer.usage.outputTokens),
      cacheReadTokens: ledgerTokens(answer.usage.cacheReadTokens),
      cacheWriteTokens: ledgerTokens(answer.usage.cacheWriteTokens),
      detail: {
        tier: request.tier,
        ruleVersions,
        macTaskId: outcome.taskId,
        stopReason: answer.stopReason,
        ...(answer.apiEquivalentMicros !== null ? { apiEquivalentMicros: answer.apiEquivalentMicros } : {}),
      },
      ...(deps.now ? { now: deps.now() } : {}),
    });
    if (answer.stopReason === "refusal") throw new LlmRefusalError(null);
    if (answer.stopReason === "max_turns") throw new LlmTruncatedError({ text: answer.text, model, costMicros: 0, spendEntryId: entryId });
    let data: T | null = null;
    if (request.schema) {
      if (answer.structured !== null && answer.structured !== undefined) {
        const parsed = request.schema.safeParse(answer.structured);
        if (!parsed.success) throw new LlmInvalidOutputError();
        data = parsed.data;
      } else {
        data = parseData(request.schema, request.web ? trailingJson(answer.text) : answer.text);
      }
    }
    const text = request.schema && !request.web && answer.structured !== null && answer.structured !== undefined ? JSON.stringify(answer.structured) : answer.text;
    return { text, data, model, usage: answer.usage, costMicros: 0, spendEntryId: entryId, ruleVersions, webSources: answer.webSources };
  }

  /** No se sabe si el proveedor cobró: lo reservado queda apuntado como gastado y marcado. */
  async function bookUnknown(entryId: number, reservedMicros: number, detail: Record<string, unknown>): Promise<void> {
    try {
      await settleSpend(entryId, { costMicros: reservedMicros, detail: { ...detail, outcome: "unknown" } });
    } catch {
      // Si el libro no se puede actualizar, la reserva sigue contando entera: es lo prudente.
      // El error que importa a quien llama es el de la llamada.
    }
  }

  return {
    async call<T = unknown>(request: LlmCall<T>): Promise<LlmResult<T>> {
      validate(request);
      const ruleVersions = Object.fromEntries(request.rules.map((rule) => [rule.slug, rule.version]));

      // El dueño con Mac: primero su Claude Code (0 $). Si no puede, la API (o pausa con «solo Mac»).
      let macFallback: MacFailure | null = null;
      const route = mac ? await mac.route(request.userId) : null;
      if (route && mac) {
        const outcome: MacOutcome = route.usable
          ? await mac.run({ userId: request.userId, stepKey: request.stepKey, job: macJobOf(request) })
          : { ok: false, reason: route.reason, detail: MAC_PAUSED[route.reason] };
        if (outcome.ok) return macResult(request, outcome, ruleVersions);
        if (route.mode === "solo_mac") {
          if (outcome.reason === "apagado" || outcome.reason === "limite") throw new LlmCapReachedError("persona", MAC_PAUSED[outcome.reason]);
          throw new LlmCallError("no", null, MAC_PAUSED[outcome.reason], new Error(outcome.detail));
        }
        macFallback = outcome.reason;
        console.warn(`[claude] ${request.stepKey}: el Mac no pudo (${outcome.reason}: ${outcome.detail}); va por la API.`);
      }

      const client = resolveClient();
      const model = MODELS[request.tier];
      const params = buildParams(request);
      const baseDetail = { tier: request.tier, ruleVersions, ...(macFallback ? { macFallback } : {}) };

      /**
       * Una vuelta: reserva, llama, liquida. Con búsqueda en internet el servidor puede pausar la
       * respuesta (`pause_turn`); entonces se continúa con otra vuelta, con su propia reserva.
       */
      const round = async (roundParams: CreateParams) => {
        const reservedMicros = worstCaseMicros(request.tier, roundParams, request.web);
        let entryId: number;
        try {
          ({ entryId } = await reserveSpend({
            userId: request.userId,
            productId: request.productId,
            provider: "claude",
            model,
            stepKey: request.stepKey,
            estimateMicros: reservedMicros,
            ...(deps.now ? { now: deps.now() } : {}),
          }));
        } catch (error) {
          if (error instanceof SpendCapError) throw new LlmCapReachedError(error.scope, error.message);
          throw error;
        }

        let response: ApiMessage;
        try {
          // Con búsqueda en internet la respuesta puede tardar más de un minuto en silencio, y la
          // conexión se cortaba a los ~60 s: se pide en flujo, que la mantiene viva.
          response = request.web && client.stream ? await client.stream(roundParams).finalMessage() : await client.create(roundParams);
        } catch (error) {
          const unknownOutcome = couldHaveCharged(error);
          const status = httpStatus(error);
          if (unknownOutcome) {
            const name = error instanceof Error ? error.constructor.name : typeof error;
            await bookUnknown(entryId, reservedMicros, { ...baseDetail, error: { name, status } });
          } else {
            // Si no se puede liberar, la reserva sigue contando: es lo prudente.
            await releaseSpend(entryId).catch(() => undefined);
          }
          // Sin créditos en la API (Anthropic responde 400 «credit balance is too low»): no es una
          // petición mal hecha. Pausa como un tope, sin gastar intentos, y se reanuda sola.
          if (!unknownOutcome && isNoCredit(error, status)) throw new LlmCapReachedError("saldo", NO_CREDIT);
          throw new LlmCallError(unknownOutcome ? "desconocido" : "no", status, failureMessage(error, status), error);
        }

        // El proveedor respondió, así que pudo cobrar. Si la respuesta no se entiende, no se deja
        // la fila a medias: se apunta lo reservado.
        let reading: Reading;
        try {
          reading = readResponse(model, response);
        } catch (error) {
          await bookUnknown(entryId, reservedMicros, { ...baseDetail, error: { name: "MalformedResponse", status: null } });
          throw new LlmCallError("desconocido", null, UNREADABLE_ANSWER, error);
        }

        const { attempts, usage, stopReason, refusalCategory } = reading;
        const priced = reading.costMicros !== null;
        // Sin precio conocido no se puede calcular: se apunta lo reservado, que es el peor caso previsto.
        const costMicros = reading.costMicros ?? reservedMicros;

        await settleSpend(entryId, {
          costMicros,
          inputTokens: ledgerTokens(usage.inputTokens),
          outputTokens: ledgerTokens(usage.outputTokens),
          cacheReadTokens: ledgerTokens(usage.cacheReadTokens),
          cacheWriteTokens: ledgerTokens(usage.cacheWriteTokens),
          model: reading.model,
          detail: {
            ...baseDetail,
            stopReason,
            ...(stopReason === "refusal" ? { refusalCategory } : {}),
            ...(priced ? {} : { outcome: "unpriced" }),
            ...(costMicros > reservedMicros ? { overrun: true } : {}),
            ...(attempts.length > 1 || attempts[0].type !== "message" || !priced ? { attempts } : {}),
            ...(reading.surchargedRegion ? { inferenceGeo: reading.surchargedRegion } : {}),
            ...(reading.webSearches > 0 ? { webSearches: reading.webSearches } : {}),
          },
        });
        return { response, reading, costMicros, entryId };
      };

      let roundParams = params;
      let text = "";
      let costMicros = 0;
      const sources = new Set<string>();
      const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      for (let continuation = 0; ; continuation += 1) {
        const done = await round(roundParams);
        text += done.reading.text;
        costMicros += done.costMicros;
        for (const url of webSourcesOf(done.response.content)) sources.add(url);
        usage.inputTokens += done.reading.usage.inputTokens;
        usage.outputTokens += done.reading.usage.outputTokens;
        usage.cacheReadTokens += done.reading.usage.cacheReadTokens;
        usage.cacheWriteTokens += done.reading.usage.cacheWriteTokens;
        const { stopReason, refusalCategory } = done.reading;
        const partial = { text, model: done.reading.model, costMicros, spendEntryId: done.entryId };

        if (stopReason === "refusal") throw new LlmRefusalError(refusalCategory);
        if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") throw new LlmTruncatedError(partial);
        if (stopReason === "pause_turn") {
          // Se sigue donde lo dejó: la respuesta en pausa va como turno del asistente, tal cual.
          if (continuation >= MAX_CONTINUATIONS) throw new LlmTruncatedError(partial);
          roundParams = {
            ...params,
            messages: [...roundParams.messages, { role: "assistant", content: done.response.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }],
          };
          text = "";
          continue;
        }

        const raw = request.web && request.schema ? trailingJson(text) : text;
        const data = request.schema ? parseData(request.schema, raw) : null;
        return {
          text,
          data,
          model: done.reading.model,
          usage,
          costMicros,
          spendEntryId: done.entryId,
          ruleVersions,
          webSources: [...sources],
        };
      }
    },
  };
}

let gateway: LlmGateway | null = null;

/** La pasarela de la aplicación: una sola, con el cliente real. */
export function getGateway(): LlmGateway {
  gateway ??= createGateway();
  return gateway;
}
