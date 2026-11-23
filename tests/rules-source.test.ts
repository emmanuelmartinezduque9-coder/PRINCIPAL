import crypto from "node:crypto";
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
  sources?: string[];
}>;
const filesFromIndice = () => indice.map((entry) => `reglas/${entry.file}`);
const NUEVAS = ["adaptacion-de-conceptos", "imagen-nano-banana", "video-seedance", "video-genjutsu", "alta-de-producto", "nichos-con-datos", "referencias-pinterest", "doblaje-del-dialogo"];

describe("reglas sembradas: la copia limpia está limpia y conserva el criterio", () => {
  it("el índice lista las doce reglas y todos sus originales existen", () => {
    expect(indice.map((e) => e.slug)).toEqual([
      "angulos-de-venta",
      "angulos-ejemplos",
      "angulos-metodo-juanma",
      "adaptacion-de-conceptos",
      "imagen-nano-banana",
      "video-seedance",
      "video-genjutsu",
      "alta-de-producto",
      "nombres-de-marca",
      "nichos-con-datos",
      "referencias-pinterest",
      "doblaje-del-dialogo",
    ]);
    for (const entry of indice) {
      expect(entry.title && entry.description).toBeTruthy();
      expect(entry.source).toMatch(/^docs\//);
      expect(fs.existsSync(path.join(ROOT, entry.source)), entry.source).toBe(true);
      if (!NUEVAS.includes(entry.slug)) {
        expect(entry.source).toMatch(/^docs\/reglas-origen\//);
        continue;
      }
      // Las reglas nuevas declaran todos los originales usados, y el principal es uno de ellos.
      expect(entry.sources?.length, entry.slug).toBeGreaterThan(0);
      expect(entry.sources).toContain(entry.source);
      for (const source of entry.sources ?? []) {
        expect(source, source).toMatch(/^docs\//);
        expect(fs.existsSync(path.join(ROOT, source)), source).toBe(true);
      }
    }
  });

  it("no queda nada del sistema anterior en ninguna regla", () => {
    for (const file of filesFromIndice()) {
      expect(text(file), file).not.toMatch(
        /\/Volumes\/|\/Users\/|EDITOR\/|\.py\b|\.codex|memory\/context|fondos-pinterest-por-toma|generacion-de-videos-por-idea|nanobanana-pro-imagenes|\bCodex\b|\bSEGA\b|Sentinel_|^---\nname:|\]\(references\/|\[\[/m,
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

  it("la regla de Genjutsu y Wan conserva las órdenes de Codex", () => {
    const genjutsu = text("reglas/video-genjutsu.md");
    expect(genjutsu).toContain("Por defecto, la réplica se hace con Genjutsu Motion Transfer");
    expect(genjutsu).toContain("«Los vídeos con Genjutsu no se hacen sin el frame inicial»");
    expect(genjutsu).toContain("No text overlays, no captions.");
    expect(genjutsu).toContain("agrupar por lugar real, no por nombre de clip");
    expect(genjutsu).toContain("No aplicar los bloques estéticos de Genjutsu o Seedance");
  });

  it("conservan el criterio del dueño en producción de vídeo", () => {
    const adaptacion = text("reglas/adaptacion-de-conceptos.md");
    const imagen = text("reglas/imagen-nano-banana.md");
    const video = text("reglas/video-seedance.md");
    expect(adaptacion).toContain(
      "tiempo/función original → visual observado → equivalente para el producto elegido → acción física → resultado visible",
    );
    expect(adaptacion).toContain("si ocultamos el texto, ¿se entiende el mismo concepto con este otro producto?");
    expect(imagen).toContain("4.900");
    for (const word of ["cinematic", "studio lighting", "golden hour", "bokeh", "8K", "flawless skin"]) {
      expect(imagen).toContain(word);
    }
    expect(imagen).toContain("exclusivamente el avatar elegido");
    expect(imagen).toContain("No anticipar un reveal");
    expect(video).toContain("comparado con una mano humana");
    expect(video).toContain(
      "`@Video1` define solo el orden de los planos, el ritmo de los cortes, la cámara y el tipo de acción.",
    );
    expect(video).toContain("Movimientos parecidos, no idénticos.");
    expect(video).toContain("Sin texto en pantalla");
  });

  it("los textos enviados al modelo no contradicen los requisitos del dueño", () => {
    const imagen = text("reglas/imagen-nano-banana.md");
    const video = text("reglas/video-seedance.md");
    // @Video1 solo aporta estructura: nada de pose, bloqueo de escena ni luz.
    expect(video).not.toMatch(/bloqueo de escena/);
    expect(video).toContain("`primer fotograma`");
    expect(video).toContain("`referencia de contexto`");
    expect(video).toContain("{modo}");
    expect(video).not.toMatch(/@Image1 define a la mujer/);
    // La orden del 30/10 sobre texto en pantalla no admite excepciones.
    expect(imagen).not.toContain("salvo texto que el usuario solicite");
    // Las pautas del 02/09 sustituidas por el criterio del 03/10 ya no son instrucciones vivas.
    expect(imagen).not.toContain("Es el rasgo número uno");
    expect(imagen).not.toContain("tilted about two degrees");
    expect(imagen).toContain("Precedencia:");
    expect(text("reglas/adaptacion-de-conceptos.md")).toContain("inferido útil");
  });

  it("las referencias cruzadas entre reglas usan el título real de la otra regla", () => {
    const titles = new Map(indice.map((e) => [e.slug, e.title]));
    const adaptacion = text("reglas/adaptacion-de-conceptos.md");
    expect(adaptacion).toContain(`«${titles.get("imagen-nano-banana")}»`);
    expect(adaptacion).toContain(`«${titles.get("video-seedance")}»`);
    expect(text("reglas/imagen-nano-banana.md")).toContain(`«${titles.get("video-seedance")}»`);
  });

  it("la regla de imagen dice el generador que usa el dueño: Nano Banana 2.1 a 2K, no Pro", () => {
    const imagen = text("reglas/imagen-nano-banana.md");
    expect(indice.find((e) => e.slug === "imagen-nano-banana")?.title).toBe("Imágenes con Nano Banana");
    expect(imagen.split("\n")[0]).toBe("# Imágenes con Nano Banana");
    expect(imagen).toContain("Nano Banana 2.1 a 2K");
    expect(imagen).not.toContain("cambiar a otro generador por defecto");
  });

  it("cada corrección de una regla ya sembrada lleva nota y sustituye a otro texto, no al actual", () => {
    for (const entry of indice as Array<(typeof indice)[number] & { replacesSha256?: string[]; updateNote?: string }>) {
      if (!entry.replacesSha256) continue;
      expect(entry.updateNote?.trim(), entry.slug).toBeTruthy();
      const current = crypto.createHash("sha256").update(text(`reglas/${entry.file}`)).digest("hex");
      for (const old of entry.replacesSha256) {
        expect(old, entry.slug).toMatch(/^[0-9a-f]{64}$/);
        expect(old, entry.slug).not.toBe(current);
      }
    }
  });

  it("los cuatro ejemplos validados están íntegros en la regla de imagen", () => {
    const imagen = text("reglas/imagen-nano-banana.md");
    for (let n = 1; n <= 4; n++) {
      const original = text(
        `docs/reglas-origen/skills-codex/nanobanana-pro-imagenes/references/fewshot-emmanuel-${n}.txt`,
      );
      expect(imagen, `ejemplo ${n}`).toContain(original.trimEnd());
    }
  });
});
