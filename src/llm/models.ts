/**
 * Modelos de Claude que usa la aplicación y lo que cuestan. Dos niveles: el pequeño para tareas
 * sencillas y de mucho volumen, el mediano para las que piden más criterio. Los precios salen de
 * la página de precios de Anthropic (comprobados el 22-11-2026); si cambian, se cambian aquí.
 */

export type ModelTier = "small" | "medium";

export const MODELS: Record<ModelTier, string> = { small: "claude-haiku-5-5", medium: "claude-sonnet-5-5" };

/** Esfuerzo (`output_config.effort`) de cada nivel. Va fijo por nivel: cambiarlo invalida la caché. */
export const EFFORT: Record<ModelTier, "low" | "medium"> = { small: "low", medium: "medium" };

/**
 * Modelo al que el servidor pasa un rechazo de los filtros de seguridad (`fallbacks: "default"`).
 * Haiku no tiene. Se usa para reservar también ese segundo intento.
 */
export const FALLBACK_MODELS: Partial<Record<ModelTier, string>> = { medium: "claude-sonnet-5" };

export interface Usage {
  /** Tokens de entrada a precio normal (sin contar lo leído o escrito en caché). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Precio por token en nano-dólares (milésimas de micro-dólar): el precio en US$ por millón de
 * tokens multiplicado por 1 000. Así todas las cuentas son con enteros.
 */
interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  /** Escritura en la caché de 5 minutos (1,25 veces la entrada), la única que usa la pasarela. */
  cacheWrite: number;
}

interface Pricing {
  rates: Rates;
  /** Tarifa de toda la petición cuando su entrada total supera `overTokens`. */
  longPrompt?: { overTokens: number; rates: Rates };
}

const PRICING: Record<string, Pricing> = {
  // 0,10 / 0,50 US$ por millón hasta 100 000 tokens de entrada; 0,50 / 2,50 US$ por encima.
  "claude-haiku-5-5": {
    rates: { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
    longPrompt: { overTokens: 100_000, rates: { input: 500, output: 2_500, cacheRead: 50, cacheWrite: 625 } },
  },
  // 2 / 10 US$ por millón; leer de la caché, 0,10 US$.
  "claude-sonnet-5-5": { rates: { input: 2_000, output: 10_000, cacheRead: 100, cacheWrite: 2_500 } },
  // Modelo de reserva del mediano: mismos precios salvo la lectura de caché, 0,20 US$.
  "claude-sonnet-5": { rates: { input: 2_000, output: 10_000, cacheRead: 200, cacheWrite: 2_500 } },
};

const NANOS_PER_MICRO = 1_000;

/** Caracteres por token al estimar: a la baja, para que salgan tokens de más. */
const CHARS_PER_TOKEN = 3;

/**
 * La cuenta por caracteres es aproximada: desde este tanto del umbral de la tarifa cara ya se
 * reserva a esa tarifa, por si los tokens reales lo superan.
 */
const LONG_PROMPT_MARGIN = 0.8;

export function hasPrice(model: string): boolean {
  return Object.hasOwn(PRICING, model);
}

function pricingOf(model: string): Pricing {
  if (!hasPrice(model)) throw new Error(`No hay precio para el modelo «${model}».`);
  return PRICING[model];
}

function assertCount(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${what} debe ser un número entero no negativo.`);
}

/**
 * Coste real de una llamada, en micro-dólares, redondeado hacia arriba. En los modelos con
 * tarifa por tramos, la entrada total (normal + leída de caché + escrita en caché) decide la
 * tarifa de toda la petición, salida incluida. Lanza si el modelo no está en la tabla de precios.
 */
export function computeCostMicros(model: string, usage: Usage): number {
  const pricing = pricingOf(model);
  assertCount(usage.inputTokens, "Los tokens de entrada");
  assertCount(usage.outputTokens, "Los tokens de salida");
  assertCount(usage.cacheReadTokens, "Los tokens leídos de caché");
  assertCount(usage.cacheWriteTokens, "Los tokens escritos en caché");

  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const long = pricing.longPrompt;
  const rates = long && promptTokens > long.overTokens ? long.rates : pricing.rates;
  const nanos =
    usage.inputTokens * rates.input +
    usage.outputTokens * rates.output +
    usage.cacheReadTokens * rates.cacheRead +
    usage.cacheWriteTokens * rates.cacheWrite;
  return Math.ceil(nanos / NANOS_PER_MICRO);
}

/**
 * Peor caso de una llamada, en micro-dólares, para reservarlo antes de llamar:
 * `ceil(inputChars / 3)` tokens de entrada, todos a precio de escritura en caché (el más caro
 * de la entrada), más `maxTokens` de salida. Lanza si el modelo no está en la tabla de precios.
 */
export function estimateMaxCostMicros(model: string, inputChars: number, maxTokens: number): number {
  const pricing = pricingOf(model);
  assertCount(inputChars, "El tamaño de la entrada");
  assertCount(maxTokens, "El máximo de tokens de salida");

  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN);
  const long = pricing.longPrompt;
  const rates = long && inputTokens > long.overTokens * LONG_PROMPT_MARGIN ? long.rates : pricing.rates;
  return Math.ceil((inputTokens * rates.cacheWrite + maxTokens * rates.output) / NANOS_PER_MICRO);
}
