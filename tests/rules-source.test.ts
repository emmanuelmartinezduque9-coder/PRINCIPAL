import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const text = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const indice = JSON.parse(text("reglas/indice.json")) as Array<{
  slug: string;
  title: string;
  description: string;
  file: string;
  source: string;
}>;
const filesFromIndice = () => indice.map((entry) => `reglas/${entry.file}`);

describe("reglas sembradas: la copia limpia está limpia y conserva el criterio", () => {
  it("el índice lista las tres reglas con su original", () => {
    expect(indice.map((e) => e.slug)).toEqual(["angulos-de-venta", "angulos-ejemplos", "angulos-metodo-juanma"]);
    for (const entry of indice) {
      expect(entry.title && entry.description).toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, entry.source))).toBe(true);
      expect(text(`reglas/${entry.file}`).split("\n")[0]).toContain(entry.source);
    }
  });

  it("no queda nada del sistema anterior", () => {
    for (const file of filesFromIndice()) {
      expect(text(file), file).not.toMatch(
        /\/Volumes\/|\/Users\/|generacion-de-videos-por-idea|fondos-pinterest-por-toma|^---\nname:|\]\(references\//m,
      );
    }
  });

  it("conserva el criterio", () => {
    const angulos = text("reglas/angulos-de-venta.md");
    expect(angulos).toContain("ventas verificadas");
    expect(angulos).toContain("normalmente 3–5");
    expect(angulos).toContain(
      "característica comprobada → utilidad plausible → situación reconocible → motivo para pagar",
    );
  });
});
