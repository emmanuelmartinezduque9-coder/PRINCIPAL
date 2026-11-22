import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "@/llm/models";

/**
 * Cliente de Claude simulado para las pruebas: responde lo que diga el guion, en orden, y
 * guarda cada petición recibida. Nunca hay red ni se gasta nada.
 */

export interface FakeReply {
  text?: string;
  usage?: Partial<Usage>;
  /** Por defecto `"end_turn"`. */
  stopReason?: string;
  /** Modelo que dice haber respondido; por defecto, el que se pidió. */
  model?: string;
  /** En vez de responder, la llamada falla con este error. */
  error?: Error;
  /** Categoría del rechazo (`stop_details.category`) cuando `stopReason` es `"refusal"`. */
  refusalCategory?: string;
  /** Intentos que el servidor dice haber hecho (`usage.iterations`), p. ej. al pasar a un modelo de reserva. */
  attempts?: Array<{ type?: "message" | "fallback_message"; model: string; usage?: Partial<Usage> }>;
  /** Región donde dice haberse ejecutado (`usage.inference_geo`). */
  inferenceGeo?: string;
  /** Devuelve esto tal cual, sin darle forma de mensaje: para respuestas que no se entienden. */
  raw?: unknown;
}

export type FakeCall = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;

function tokenCounts(usage: Partial<Usage> = {}) {
  return {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    cache_read_input_tokens: usage.cacheReadTokens ?? 0,
    cache_creation_input_tokens: usage.cacheWriteTokens ?? 0,
  };
}

export function fakeMessages(script: FakeReply[]): { client: MessagesClient; calls: FakeCall[] } {
  const pending = [...script];
  const calls: FakeCall[] = [];

  const create = async (params: FakeCall) => {
    calls.push(structuredClone(params));
    const reply = pending.shift();
    if (!reply) throw new Error("fakeMessages: el guion no tiene más respuestas.");
    if (reply.error) throw reply.error;
    if ("raw" in reply) return reply.raw;
    const refused = reply.stopReason === "refusal";
    return {
      id: `msg_simulado_${calls.length}`,
      type: "message",
      role: "assistant",
      model: reply.model ?? params.model,
      content: reply.text === undefined ? [] : [{ type: "text", text: reply.text, citations: null }],
      stop_reason: reply.stopReason ?? "end_turn",
      stop_sequence: null,
      stop_details: refused ? { type: "refusal", category: reply.refusalCategory ?? null, explanation: null } : null,
      usage: {
        ...tokenCounts(reply.usage),
        inference_geo: reply.inferenceGeo ?? null,
        iterations:
          reply.attempts?.map((attempt) => ({
            type: attempt.type ?? "message",
            model: attempt.model,
            ...tokenCounts(attempt.usage),
          })) ?? null,
      },
    };
  };

  return { client: { create } as unknown as MessagesClient, calls };
}

/** Error como el que lanza el cliente real cuando la API responde con ese estado HTTP (400, 429, 500…). */
export function fakeApiError(status: number): Error {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type: "api_error", message: "Error simulado." } },
    undefined,
    new Headers(),
  );
}

/** Error de conexión del cliente real; `code` es el del sistema (`"ECONNREFUSED"`, `"ECONNRESET"`…). */
export function fakeConnectionError(code: string): Error {
  const socketError = Object.assign(new Error(`connect ${code}`), { code });
  return new Anthropic.APIConnectionError({ cause: new TypeError("fetch failed", { cause: socketError }) });
}

/** El propio SDK para la petición antes de enviarla (una comprobación suya que no pasa). */
export function fakeSdkValidationError(): Error {
  return new Anthropic.AnthropicError("Comprobación simulada del SDK antes de enviar.");
}

/** La llamada tardó demasiado: el cliente real corta y no se sabe si el proveedor la procesó. */
export function fakeTimeoutError(): Error {
  return new Anthropic.APIConnectionTimeoutError();
}
