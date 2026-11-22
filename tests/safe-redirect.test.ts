import { describe, expect, it } from "vitest";
import { safeBackPath } from "@/lib/safe-redirect";

const ORIGIN = "https://app.example.com";

describe("safeBackPath", () => {
  it.each(["/\\evil.com", "//evil.com", "https://evil.com", "/\\/evil.com", "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com", "javascript:alert(1)", "http://app.example.com.evil.com/"])(
    "no sigue %s",
    (back) => {
      expect(safeBackPath(back, ORIGIN)).toBe("/");
    },
  );

  it("deja pasar rutas de la propia aplicación con su consulta", () => {
    expect(safeBackPath("/productos", ORIGIN)).toBe("/productos");
    expect(safeBackPath("/productos?x=1#a", ORIGIN)).toBe("/productos?x=1#a");
    expect(safeBackPath("https://app.example.com/reglas", ORIGIN)).toBe("/reglas");
  });

  it("sin dirección va al inicio", () => {
    expect(safeBackPath(null, ORIGIN)).toBe("/");
    expect(safeBackPath("", ORIGIN)).toBe("/");
  });
});
