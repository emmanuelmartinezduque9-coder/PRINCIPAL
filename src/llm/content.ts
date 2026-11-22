import type { LlmCall } from "@/llm/gateway";

/**
 * Bloques para construir `LlmCall.content` (el mensaje de la persona) sin importar el SDK de
 * Anthropic fuera de `src/llm`. La pasarela cuenta cada imagen por lo alto al reservar el gasto.
 */

export type LlmContent = LlmCall<unknown>["content"];
type ContentBlock = Exclude<LlmContent, string>[number];

export function textPart(text: string): ContentBlock {
  return { type: "text", text };
}

/** Imagen en base64 con su tipo. */
export function imagePart(bytes: Buffer, mime: "image/jpeg" | "image/png" | "image/webp"): ContentBlock {
  return { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } };
}
