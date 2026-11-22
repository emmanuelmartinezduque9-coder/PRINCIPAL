import { describe, expect, it } from "vitest";
import { formatUsd, parseUsd } from "@/lib/money";

describe("dinero en micro-dólares", () => {
  it("formatUsd usa coma decimal y dos decimales desde un céntimo", () => {
    expect(formatUsd(12_350_000)).toBe("12,35 US$");
    expect(formatUsd(30_000_000)).toBe("30,00 US$");
    expect(formatUsd(0)).toBe("0,00 US$");
    expect(formatUsd(10_000)).toBe("0,01 US$");
    expect(formatUsd(1_234_560_000)).toBe("1.234,56 US$");
  });

  it("formatUsd enseña lo que cuesta menos de un céntimo", () => {
    expect(formatUsd(4_000)).toBe("0,004 US$");
    expect(formatUsd(4_500)).toBe("0,0045 US$");
    expect(formatUsd(123)).toBe("0,00012 US$");
  });

  it("parseUsd acepta coma o punto", () => {
    expect(parseUsd("12,50")).toBe(12_500_000);
    expect(parseUsd("12.5")).toBe(12_500_000);
    expect(parseUsd(" 30 ")).toBe(30_000_000);
    expect(parseUsd("0,015")).toBe(15_000);
    expect(parseUsd("-1")).toBe(-1_000_000);
  });

  it("parseUsd rechaza lo que no es un importe", () => {
    expect(parseUsd("abc")).toBeNull();
    expect(parseUsd("")).toBeNull();
    expect(parseUsd("1.234,56")).toBeNull();
    expect(parseUsd("1,2,3")).toBeNull();
    expect(parseUsd("0,0000001")).toBeNull();
    expect(parseUsd("99999999999999")).toBeNull();
  });
});
