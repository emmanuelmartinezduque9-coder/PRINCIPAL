import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Límites de la arquitectura que se comprueban leyendo el código fuente. */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("._")) return []; // copias de macOS en discos exFAT
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((file) => ({
  rel: path.relative(ROOT, file).split(path.sep).join("/"),
  text: fs.readFileSync(file, "utf8"),
}));

/** Formas de llegar a las tablas de productos sin pasar por la capa de acceso. */
const PRODUCT_TABLE_PATTERNS = [
  /schema\.products\b/,
  /schema\.productAssignments\b/,
  /\bproduct_assignments\b/,
  /import\s*\{[^}]*\b(products|productAssignments)\b[^}]*\}\s*from\s*["'][^"']*db\/schema["']/,
];
const PRODUCT_LAYER = new Set(["src/server/access.ts", "src/server/products.ts"]);

/** Importar el cliente de la base de datos, con alias o con ruta relativa, estático o dinámico. */
const DB_CLIENT_IMPORT = /(from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*db\/client["']/;
// Salud comprueba que la base de datos responde: necesita abrirla.
const DB_CLIENT_EXEMPT = new Set(["src/app/api/health/route.ts"]);

/** El SDK de Anthropic, se importe como se importe (también sus subrutas). */
const ANTHROPIC_SDK = /@anthropic-ai\/sdk/;
const LLM_LAYER = "src/llm/";

describe("límites del código", () => {
  it("encuentra el código fuente (la comprobación no pasa por no mirar nada)", () => {
    expect(files.some((f) => f.rel === "src/server/access.ts")).toBe(true);
    const access = files.find((f) => f.rel === "src/server/access.ts")!;
    expect(PRODUCT_TABLE_PATTERNS.some((p) => p.test(access.text))).toBe(true);
    expect(DB_CLIENT_IMPORT.test('import { getDb } from "@/db/client";')).toBe(true);
    expect(DB_CLIENT_IMPORT.test('const { getDb } = await import("../../db/client");')).toBe(true);
    const gateway = files.find((f) => f.rel === "src/llm/gateway.ts");
    expect(gateway && ANTHROPIC_SDK.test(gateway.text)).toBe(true);
  });

  it("solo access.ts y products.ts tocan las tablas de productos", () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith("src/db/") && !PRODUCT_LAYER.has(f.rel))
      .filter((f) => PRODUCT_TABLE_PATTERNS.some((p) => p.test(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("las rutas y pantallas no abren la base de datos por su cuenta", () => {
    const offenders = files
      .filter((f) => f.rel.startsWith("src/app/") || f.rel.startsWith("src/components/"))
      .filter((f) => !DB_CLIENT_EXEMPT.has(f.rel))
      .filter((f) => DB_CLIENT_IMPORT.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("solo src/llm importa el SDK de Anthropic", () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith(LLM_LAYER))
      .filter((f) => ANTHROPIC_SDK.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
