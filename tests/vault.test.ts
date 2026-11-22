import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/vault";

afterEach(() => {
  vi.unstubAllEnvs();
});

const key = (bytes: number) => Buffer.alloc(bytes, 5).toString("base64");

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
    vi.stubEnv("VAULT_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(() => decryptSecret(enc, "7:higgsfield")).toThrow();
  });

  it("VAULT_KEY que no mide 32 bytes se rechaza", () => {
    for (const bad of [key(16), key(33), "no es base64 válido!!", key(32) + "A"]) {
      vi.stubEnv("VAULT_KEY", bad);
      expect(() => encryptSecret({ t: "abc" }, "7:higgsfield"), bad).toThrow(
        "VAULT_KEY debe ser una clave de 32 bytes en base64",
      );
    }
  });

  it("VAULT_KEY vacía se rechaza y no cae al archivo local", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-vacia-"));
    vi.stubEnv("PRINCIPAL_DATA_DIR", dir);
    vi.stubEnv("VAULT_KEY", "");
    expect(() => encryptSecret({ t: "abc" }, "7:x")).toThrow("VAULT_KEY debe ser");
    expect(fs.existsSync(path.join(dir, "vault.key"))).toBe(false);
  });

  it("en la nube sin VAULT_KEY falla y no crea archivo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-nube-"));
    vi.stubEnv("PRINCIPAL_DATA_DIR", dir);
    vi.stubEnv("PRINCIPAL_CLOUD", "1");
    vi.stubEnv("VAULT_KEY", undefined as unknown as string);
    expect(() => encryptSecret({ t: "abc" }, "7:x")).toThrow("Falta VAULT_KEY");
    expect(fs.existsSync(path.join(dir, "vault.key"))).toBe(false);
    vi.stubEnv("VAULT_KEY", "");
    expect(() => encryptSecret({ t: "abc" }, "7:x")).toThrow("VAULT_KEY debe ser");
  });

  it("en la nube con una clave válida funciona (Railway también cuenta como nube)", () => {
    vi.stubEnv("RAILWAY_PROJECT_ID", "proyecto");
    vi.stubEnv("VAULT_KEY", key(32));
    expect(decryptSecret(encryptSecret({ t: 1 }, "7:x"), "7:x")).toEqual({ t: 1 });
  });

  it("en local sin VAULT_KEY crea un archivo 0600 y lo reutiliza", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-local-"));
    vi.stubEnv("PRINCIPAL_DATA_DIR", dir);
    vi.stubEnv("PRINCIPAL_CLOUD", undefined as unknown as string);
    vi.stubEnv("RAILWAY_PROJECT_ID", undefined as unknown as string);
    vi.stubEnv("VAULT_KEY", undefined as unknown as string);
    const enc = encryptSecret({ t: "abc" }, "7:x");
    const file = path.join(dir, "vault.key");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(decryptSecret(enc, "7:x")).toEqual({ t: "abc" });
    fs.writeFileSync(file, "corrupta");
    expect(() => decryptSecret(enc, "7:x")).toThrow("no es válida");
  });
});
