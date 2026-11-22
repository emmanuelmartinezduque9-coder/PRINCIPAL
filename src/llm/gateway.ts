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
import type { RuleSnapshot } from "@/server/rules";
import { releaseSpend, reserveSpend, settleSpend, SpendCapError } from "@/server/spend";

/**
 * Pasarela única a Claude: toda llamada a un modelo pasa por aquí. Antes de llamar reserva en el
 * libro de gasto el peor caso de la llamada (si no cabe en el tope, no se llama) y al volver
 * apunta el coste real. Solo `src/llm` importa el SDK de Anthropic.
 *
 * Orden de una llamada: clave → validar → reservar (queda confirmado en la base de datos antes
 * de llamar) → llamar → liquidar con el coste real → mirar por qué paró → validar los datos.
 */

/** Máximo de salida por llamada: por encima, el SDK exige respuesta en flujo y la pasarela no la usa. */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Cabecera beta del modelo de reserva del servidor (`fallbacks`). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Tokens de entrada que puede llegar a contar una foto; en caracteres, a 3 por token. */
const IMAGE_CHARS = 5_000 * 3;

/** Margen por lo que la API añade a la entrada (marcas de mensaje y de sistema). */
const FRAMING_CHARS = 600;

type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;
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
}

export interface LlmGateway {
  call<T = unknown>(request: LlmCall<T>): Promise<LlmResult<T>>;
}

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
    public scope: "global" | "persona",
    message: string,
  ) {
    super(message);
    this.name = "LlmCapReachedError";
  }
}

/**
 * La llamada no dio respuesta. `charged` dice si el proveedor pudo cobrarla: `"no"` (la rechazó
 * sin procesarla o no llegó a salir: la reserva se liberó) o `"desconocido"` (se cortó a medias
 * o falló en el servidor: lo reservado queda apuntado como gastado).
 */
export class LlmCallError extends Error {
  constructor(
    public charged: "no" | "desconocido",
    public status: number | null,
    cause: unknown,
  ) {
    super(
      status === 401
        ? "Claude no acepta la clave configurada (ANTHROPIC_API_KEY)."
        : "Claude no ha respondido. Inténtalo de nuevo dentro de unos minutos.",
      { cause },
    );
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
  constructor() {
    super("La respuesta de Claude se ha cortado antes de terminar.");
    this.name = "LlmTruncatedError";
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
  if (request.schema) {
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
  if (FALLBACK_MODELS[request.tier]) {
    // Si los filtros de seguridad rechazan la petición, el servidor la reintenta en el modelo
    // de reserva dentro de la misma llamada.
    params.fallbacks = "default";
    params.betas = [FALLBACK_BETA];
  }
  return params;
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
function worstCaseMicros(tier: ModelTier, params: CreateParams): number {
  const chars = inputChars(params);
  let micros = estimateMaxCostMicros(MODELS[tier], chars, params.max_tokens);
  const fallback = FALLBACK_MODELS[tier];
  if (fallback) micros += estimateMaxCostMicros(fallback, chars, params.max_tokens);
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
  const usage: Usage = {
    inputTokens: counts.input_tokens ?? 0,
    outputTokens: counts.output_tokens ?? 0,
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

/** Estados con los que la API rechaza la petición sin procesarla: no se cobra. */
const NOT_PROCESSED_STATUSES = new Set([400, 401, 402, 403, 404, 413, 422, 429]);

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
 * enviarla. Tiempo agotado, corte a medias, error del servidor o cualquier fallo no reconocido
 * cuentan como «no se sabe».
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
 * Crea una pasarela. Sin `client` usa el cliente real, con la clave de `ANTHROPIC_API_KEY` (que
 * solo se lee del entorno, no se guarda en ningún otro sitio y nunca se escribe en registros ni
 * respuestas). `client` y `now` existen para las pruebas: `now` fija la fecha del apunte y el
 * código de la aplicación no debe pasarlo.
 */
export function createGateway(deps: { client?: MessagesClient; now?: () => Date } = {}): LlmGateway {
  let realClient: MessagesClient | null = null;

  function resolveClient(): MessagesClient {
    if (deps.client) return deps.client;
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new LlmNotConfiguredError();
    // Sin reintentos automáticos: cada intento podría cobrarse y solo hay una reserva. Reintenta
    // quien llama, con una reserva nueva.
    realClient ??= new Anthropic({ apiKey, maxRetries: 0 }).beta.messages;
    return realClient;
  }

  return {
    async call<T = unknown>(request: LlmCall<T>): Promise<LlmResult<T>> {
      const client = resolveClient();
      validate(request);

      const model = MODELS[request.tier];
      const params = buildParams(request);
      const reservedMicros = worstCaseMicros(request.tier, params);
      const ruleVersions = Object.fromEntries(request.rules.map((rule) => [rule.slug, rule.version]));
      const baseDetail = { tier: request.tier, ruleVersions };

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
        response = await client.create(params);
      } catch (error) {
        const unknownOutcome = couldHaveCharged(error);
        const status = httpStatus(error);
        try {
          if (unknownOutcome) {
            const name = error instanceof Error ? error.constructor.name : typeof error;
            await settleSpend(entryId, {
              costMicros: reservedMicros,
              detail: { ...baseDetail, outcome: "unknown", error: { name, status } },
            });
          } else {
            await releaseSpend(entryId);
          }
        } catch {
          // Si el libro no se puede actualizar, la reserva sigue contando entera: es lo prudente.
          // El error que importa a quien llama es el de la llamada.
        }
        throw new LlmCallError(unknownOutcome ? "desconocido" : "no", status, error);
      }

      const attempts = attemptsOf(model, response);
      const priced = attempts.every((attempt) => attempt.costMicros !== null);
      const region = response.usage.inference_geo;
      const surcharged = typeof region === "string" && region !== "global";
      const attemptsMicros = sum(attempts.map((attempt) => attempt.costMicros ?? 0));
      // Sin precio conocido no se puede calcular: se apunta lo reservado, que es el peor caso previsto.
      const costMicros = !priced ? reservedMicros : surcharged ? withRegionSurcharge(attemptsMicros) : attemptsMicros;
      const usage: Usage = {
        inputTokens: sum(attempts.map((attempt) => attempt.inputTokens)),
        outputTokens: sum(attempts.map((attempt) => attempt.outputTokens)),
        cacheReadTokens: sum(attempts.map((attempt) => attempt.cacheReadTokens)),
        cacheWriteTokens: sum(attempts.map((attempt) => attempt.cacheWriteTokens)),
      };
      const stopReason = response.stop_reason;
      const refusalCategory = stopReason === "refusal" ? (response.stop_details?.category ?? null) : null;

      await settleSpend(entryId, {
        costMicros,
        inputTokens: ledgerTokens(usage.inputTokens),
        outputTokens: ledgerTokens(usage.outputTokens),
        cacheReadTokens: ledgerTokens(usage.cacheReadTokens),
        cacheWriteTokens: ledgerTokens(usage.cacheWriteTokens),
        model: response.model,
        detail: {
          ...baseDetail,
          stopReason,
          ...(stopReason === "refusal" ? { refusalCategory } : {}),
          ...(priced ? {} : { outcome: "unpriced" }),
          ...(costMicros > reservedMicros ? { overrun: true } : {}),
          ...(attempts.length > 1 || attempts[0].type !== "message" || !priced ? { attempts } : {}),
          ...(surcharged ? { inferenceGeo: region } : {}),
        },
      });

      if (stopReason === "refusal") throw new LlmRefusalError(refusalCategory);
      if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") throw new LlmTruncatedError();

      const text = textOf(response);
      const data = request.schema ? parseData(request.schema, text) : null;
      return { text, data, model: response.model, usage, costMicros, spendEntryId: entryId, ruleVersions };
    },
  };
}

let gateway: LlmGateway | null = null;

/** La pasarela de la aplicación: una sola, con el cliente real. */
export function getGateway(): LlmGateway {
  gateway ??= createGateway();
  return gateway;
}
