import { describe, expect, it } from "vitest";
import { computeCostMicros, EFFORT, estimateMaxCostMicros, hasPrice, MODELS, type Usage } from "@/llm/models";

const u = (over: Partial<Usage>): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

describe("modelos y niveles", () => {
  it("dos niveles: el pequeño es Haiku con esfuerzo bajo y el mediano Sonnet con esfuerzo medio", () => {
    expect(MODELS).toEqual({ small: "claude-haiku-5-5", medium: "claude-sonnet-5-5" });
    expect(EFFORT).toEqual({ small: "low", medium: "medium" });
  });
});

describe("computeCostMicros", () => {
  it("Haiku: 0,10 US$ de entrada y 0,50 US$ de salida por millón", () => {
    expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 10_000, outputTokens: 2_000 }))).toBe(2_000);
  });

  it("Sonnet: 2 US$ de entrada, 10 US$ de salida y 0,10 US$ de lectura de caché por millón", () => {
    expect(
      computeCostMicros("claude-sonnet-5-5", u({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 100_000 })),
    ).toBe(50_000);
  });

  it("escribir en la caché cuesta 1,25 veces la entrada", () => {
    expect(computeCostMicros("claude-sonnet-5-5", u({ cacheWriteTokens: 100_000 }))).toBe(250_000);
    expect(computeCostMicros("claude-haiku-5-5", u({ cacheWriteTokens: 80_000 }))).toBe(10_000);
  });

  it("Haiku por encima de 100 000 tokens de entrada cobra toda la petición a la tarifa cara", () => {
    expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 200_000, outputTokens: 0 }))).toBe(100_000); // tramo > 100K
    // También la salida y la caché van a la tarifa cara: 2,50 US$ y 0,05 US$ por millón.
    expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 200_000, outputTokens: 1_000 }))).toBe(102_500);
    expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 1_000, cacheReadTokens: 200_000 }))).toBe(10_500);
  });

  it("para el tramo cuenta toda la entrada, también lo leído y lo escrito en caché", () => {
    // 60 000 + 30 000 + 10 000 = 100 000: justo en el umbral, tarifa normal.
    const atThreshold = u({ inputTokens: 60_000, cacheReadTokens: 30_000, cacheWriteTokens: 10_000 });
    expect(computeCostMicros("claude-haiku-5-5", atThreshold)).toBe(6_000 + 300 + 1_250);
    // Un token más y todo pasa a la tarifa cara.
    const over = u({ inputTokens: 60_001, cacheReadTokens: 30_000, cacheWriteTokens: 10_000 });
    expect(computeCostMicros("claude-haiku-5-5", over)).toBe(Math.ceil(30_000.5 + 1_500 + 6_250));
  });

  it("Sonnet no tiene tramo caro", () => {
    expect(computeCostMicros("claude-sonnet-5-5", u({ inputTokens: 200_000 }))).toBe(400_000);
  });

  it("redondea hacia arriba: nunca apunta menos de lo que cuesta", () => {
    expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 1 }))).toBe(1);
    expect(computeCostMicros("claude-haiku-5-5", u({}))).toBe(0);
  });

  it("conoce el precio del modelo de reserva de Sonnet (lectura de caché a 0,20 US$)", () => {
    expect(computeCostMicros("claude-sonnet-5", u({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 100_000 }))).toBe(
      60_000,
    );
  });

  it("lanza si el modelo no está en la tabla de precios", () => {
    expect(() => computeCostMicros("modelo-desconocido", u({}))).toThrow();
    expect(hasPrice("modelo-desconocido")).toBe(false);
    expect(hasPrice("claude-haiku-5-5")).toBe(true);
  });

  it("lanza si los tokens no son enteros no negativos", () => {
    expect(() => computeCostMicros("claude-haiku-5-5", u({ inputTokens: -1 }))).toThrow();
    expect(() => computeCostMicros("claude-haiku-5-5", u({ outputTokens: 1.5 }))).toThrow();
    expect(() => computeCostMicros("claude-haiku-5-5", u({ cacheReadTokens: Number.NaN }))).toThrow();
  });
});

describe("estimateMaxCostMicros", () => {
  it("peor caso: un token por cada 3 caracteres a precio de escritura en caché, más toda la salida", () => {
    expect(estimateMaxCostMicros("claude-sonnet-5-5", 3_000, 1_000)).toBeGreaterThanOrEqual(12_000);
    expect(estimateMaxCostMicros("claude-sonnet-5-5", 3_000, 1_000)).toBe(2_500 + 10_000);
    expect(estimateMaxCostMicros("claude-haiku-5-5", 3_001, 1_000)).toBe(Math.ceil(125.125 + 500));
  });

  it("nunca queda por debajo del coste real de una llamada de ese tamaño", () => {
    const usage = u({ cacheWriteTokens: 1_000, outputTokens: 1_000 });
    for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5"]) {
      expect(estimateMaxCostMicros(model, 3_000, 1_000)).toBeGreaterThanOrEqual(computeCostMicros(model, usage));
    }
  });

  it("Haiku cerca del umbral de 100 000 tokens ya reserva a la tarifa cara", () => {
    // 270 000 caracteres ≈ 90 000 tokens estimados: la cuenta es aproximada y podrían ser más de 100 000.
    expect(estimateMaxCostMicros("claude-haiku-5-5", 270_000, 1_000)).toBe(56_250 + 2_500);
    // Lejos del umbral, tarifa normal.
    expect(estimateMaxCostMicros("claude-haiku-5-5", 30_000, 1_000)).toBe(1_250 + 500);
  });

  it("lanza con un modelo sin precio o con tamaños que no valen", () => {
    expect(() => estimateMaxCostMicros("modelo-desconocido", 100, 100)).toThrow();
    expect(() => estimateMaxCostMicros("claude-haiku-5-5", -1, 100)).toThrow();
    expect(() => estimateMaxCostMicros("claude-haiku-5-5", 100, 0.5)).toThrow();
  });
});
