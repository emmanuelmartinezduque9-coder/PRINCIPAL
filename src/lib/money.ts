/**
 * Dinero en micro-dólares (1 USD = 1 000 000): enteros, porque una llamada al modelo pequeño
 * cuesta menos de un céntimo. Formato español: coma decimal y punto para los miles.
 */

export const MICROS_PER_USD = 1_000_000;
const MICROS_PER_CENT = 10_000;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** `"12,35 US$"`; por debajo de un céntimo, con las cifras necesarias: `"0,004 US$"`. */
export function formatUsd(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(Math.round(micros));
  if (abs === 0 || abs >= MICROS_PER_CENT) {
    const cents = Math.round(abs / MICROS_PER_CENT);
    const whole = Math.floor(cents / 100);
    const fraction = String(cents % 100).padStart(2, "0");
    return `${sign}${groupThousands(String(whole))},${fraction} US$`;
  }
  // Menos de un céntimo: las dos primeras cifras significativas, sin ceros sobrantes al final.
  const fraction = String(abs).padStart(6, "0");
  const firstDigit = fraction.search(/[1-9]/);
  const kept = fraction.slice(0, firstDigit + 2).replace(/0+$/, "");
  return `${sign}0,${kept.padEnd(3, "0")} US$`;
}

/**
 * Importe escrito por una persona (`"12,50"`, `"12.5"`, `"30"`) en micro-dólares, o `null` si no
 * es un importe. Admite un solo separador, que siempre es el decimal (coma o punto), y hasta 6
 * decimales: no hay separador de miles, así que `"1.234,56"` no vale y `"1.234"` es 1,234 USD.
 */
export function parseUsd(text: string): number | null {
  const match = /^(-?)(\d+)(?:[.,](\d{1,6}))?$/.exec(text.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const micros = Number(whole) * MICROS_PER_USD + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(micros)) return null;
  return sign ? -micros : micros;
}
