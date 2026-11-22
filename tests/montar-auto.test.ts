import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `montador/montar_auto.py` (el montaje automático que lanza el Mac) tiene sus pruebas en Python
 * (`montador/test_montar_auto.py`): el plan de cada ficha, las pistas de la referencia de edición y
 * un montaje de verdad con clips y canción diminutos (se salta solo si faltan ffmpeg, numpy, Pillow
 * o una fuente). Aquí se lanzan con el Python del sistema, aislado (`-I`) y sin escribir `.pyc`.
 */
const python = spawnSync("python3", ["--version"], { encoding: "utf8" });

describe.skipIf(python.status !== 0)("montar_auto.py", () => {
  it("pasa sus pruebas", () => {
    const run = spawnSync("python3", ["-I", "-B", path.resolve(__dirname, "..", "montador", "test_montar_auto.py")], {
      encoding: "utf8",
      timeout: 300_000,
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stderr).toMatch(/\nOK/);
  }, 320_000);
});
