import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/vault";

const original = process.env.VAULT_KEY;
afterEach(() => {
  process.env.VAULT_KEY = original;
});

describe("bóveda en sobre", () => {
  it("lo cifrado se descifra con el mismo contexto", () => {
    expect(decryptSecret(encryptSecret({ t: "abc" }, "7:higgsfield"), "7:higgsfield")).toEqual({ t: "abc" });
  });

  it("tiene el formato v1.<clave>.<iv>.<etiqueta>.<cuerpo> y no contiene el secreto", () => {
    const enc = encryptSecret({ t: "abc-secreto" }, "7:higgsfield");
    expect(enc.split(".")).toHaveLength(5);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("abc-secreto");
  });

  it("cifrar dos veces lo mismo da textos distintos", () => {
    const a = encryptSecret({ t: "abc" }, "7:higgsfield");
    const b = encryptSecret({ t: "abc" }, "7:higgsfield");
    expect(a).not.toBe(b);
    // Cada registro lleva su propia clave de datos.
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("un texto cifrado movido a otra persona no se puede descifrar", () => {
    expect(() => decryptSecret(encryptSecret({ t: "abc" }, "7:higgsfield"), "8:higgsfield")).toThrow();
    expect(() => decryptSecret(encryptSecret({ t: "abc" }, "7:higgsfield"), "7:otra")).toThrow();
  });

  it("un texto manipulado no se descifra (cuerpo, etiqueta, iv o clave envuelta)", () => {
    const enc = encryptSecret({ t: "abc" }, "7:higgsfield");
    const parts = enc.split(".");
    for (const i of [1, 2, 3, 4]) {
      const buf = Buffer.from(parts[i], "base64");
      buf[0] ^= 1;
      const bad = [...parts];
      bad[i] = buf.toString("base64");
      expect(() => decryptSecret(bad.join("."), "7:higgsfield"), `parte ${i}`).toThrow();
    }
  });

  it("rechaza formatos que no son v1 de cinco partes", () => {
    expect(() => decryptSecret("v2.a.b.c.d", "7:x")).toThrow("Formato de secreto no reconocido");
    expect(() => decryptSecret("v1.a.b.c", "7:x")).toThrow("Formato de secreto no reconocido");
    expect(() => decryptSecret("", "7:x")).toThrow();
  });

  it("no se descifra con otra clave maestra", () => {
    const enc = encryptSecret({ t: "abc" }, "7:higgsfield");
    process.env.VAULT_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(enc, "7:higgsfield")).toThrow();
  });

  it("VAULT_KEY que no mide 32 bytes se rechaza", () => {
    process.env.VAULT_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret({ t: "abc" }, "7:higgsfield")).toThrow(
      "VAULT_KEY debe ser una clave de 32 bytes en base64",
    );
  });
});
