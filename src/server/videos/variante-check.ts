import { z } from "zod";
import { imagePart, textPart } from "@/llm/content";
import type { LlmGateway } from "@/llm/gateway";

/**
 * Comprobación con visión de que un texto describe la variante de la tarjeta (vídeo 71, lote 12: con
 * la variante azul, el prompt decía «pink glossy body» y la imagen salió rosa). La usan el desglose
 * (`analysis.ts`) y el escritor del prompt con la sala (`pinterest.ts`).
 */
export const variantCheckSchema = z.object({
  matches: z.boolean().describe("true si el color, el acabado y la forma descritos en el texto coinciden con la foto de la variante."),
  problem: z.string().nullable().describe("Si no coinciden: qué está mal (p. ej. «dice pink, la foto es turquesa»); si coinciden, null."),
});

export const VARIANT_CHECK_INSTRUCTIONS = `Compruebas cómo describe el producto un prompt de imagen o de vídeo. El vídeo usa una variante concreta del producto, y la foto adjunta es ESA variante. Mira el color del cuerpo, de las tapas o piezas, el acabado y la forma de la foto, y compáralos con lo que dice el texto (en inglés) del producto del encargo. matches es false si el texto atribuye al producto del encargo un color, un acabado o una forma que no es el de la foto (p. ej. dice «pink» y la foto es azul turquesa), o si describe otra variante. Lo que el texto diga del objeto ORIGINAL de la referencia que se sustituye no cuenta. Un texto que no nombra colores pero no contradice la foto vale.`;

/** Veces que se reescribe si la descripción del producto no coincide con la variante. */
export const MAX_VARIANT_REWRITES = 2;

/** `null` si el texto describe bien la variante; si no, qué está mal. */
export async function variantMismatch(
  gateway: LlmGateway,
  call: { stepKey: string; userId: number; productId: number | null },
  variantName: string,
  text: string,
  photo: Buffer,
): Promise<string | null> {
  const answer = await gateway.call({
    tier: "small",
    stepKey: call.stepKey,
    userId: call.userId,
    productId: call.productId,
    rules: [],
    instructions: VARIANT_CHECK_INSTRUCTIONS,
    content: [textPart(`Variante: «${variantName}». Texto:\n${text}`), textPart("Foto de la variante:"), imagePart(photo, "image/jpeg")],
    maxTokens: 400,
    schema: variantCheckSchema,
  });
  const check = answer.data!;
  return check.matches ? null : check.problem ?? "el color o el acabado no son los de la foto de la variante";
}
