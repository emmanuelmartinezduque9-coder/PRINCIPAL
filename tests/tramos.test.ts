import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeClip, probeVideo, spliceClips } from "@/server/media/ffmpeg";
import type { AnalysisPlace } from "@/server/videos/analysis";
import { normalizePlaces, parseKind, sourceMsFor, tramoKind } from "@/server/videos/tramos";

/** Sitios de la referencia (regla de Emmanuel, 24/11/2026): cómo se parte y cómo se empalma. */

const place = (startS: number, endS: number, name: string, prompts = true): AnalysisPlace => ({
  startS,
  endS,
  place: name,
  action: "",
  keepObjects: [],
  ownerEnvironment: false,
  imagePrompt: prompts ? `opening of ${name}` : "",
  videoPrompt: prompts ? `source of ${name}` : "",
});

describe("normalizePlaces", () => {
  it("un solo sitio (o ninguno) no parte nada", () => {
    expect(normalizePlaces(null, 6000)).toBeNull();
    expect(normalizePlaces([place(0, 6, "kitchen")], 6000)).toBeNull();
  });

  it("los sitios cubren el tramo entero, sin huecos ni solapes", () => {
    const tramos = normalizePlaces([place(0.2, 2.4, "supermarket"), place(2.5, 7, "street")], 6000)!;
    expect(tramos.map((t) => [t.index, t.startMs, t.endMs, t.place])).toEqual([
      [0, 0, 2500, "supermarket"],
      [1, 2500, 6000, "street"],
    ]);
  });

  it("un sitio de menos de 1 s se junta con el anterior", () => {
    const tramos = normalizePlaces([place(0, 3, "supermarket"), place(3, 3.5, "door"), place(3.5, 6, "street")], 6000)!;
    expect(tramos.map((t) => [t.startMs, t.endMs, t.place])).toEqual([
      [0, 3500, "supermarket"],
      [3500, 6000, "street"],
    ]);
  });

  it("un sitio siguiente sin sus prompts no se puede generar: se queda con el anterior", () => {
    expect(normalizePlaces([place(0, 3, "supermarket"), place(3, 6, "street", false)], 6000)).toBeNull();
  });

  it("tipos de generación por sitio", () => {
    expect(tramoKind("frame", 0)).toBe("frame");
    expect(tramoKind("clip", 2)).toBe("clip:2");
    expect(parseKind("upscale:3")).toEqual({ base: "upscale", index: 3 });
    expect(parseKind("frame")).toEqual({ base: "frame", index: 0 });
  });

  it("un sitio corto se congela hasta el mínimo de Motion Transfer (3 s)", () => {
    expect(sourceMsFor({ clipModel: "hf_mult_motion_control" }, 2000)).toBe(3100);
    expect(sourceMsFor({ clipModel: "hf_mult_motion_control" }, 5000)).toBe(5000);
  });
});

describe("recorte y empalme con ffmpeg", () => {
  let dir: string;
  const ffmpeg = (args: string[]) => {
    const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
    if (made.status !== 0) throw new Error(made.stderr.toString());
  };
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-tramos-"));
    ffmpeg([
      "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=2",
      "-f", "lavfi", "-i", "color=c=green:s=360x640:r=30:d=4",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "ref.mp4"),
    ]);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  /** El color medio del fotograma en `seconds` (R, G, B). */
  function colorAt(file: string, seconds: number): number[] {
    const out = spawnSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    return [...out.stdout];
  }

  it("el vídeo fuente de un sitio empieza en su sitio y, si es corto, se congela hasta el mínimo", async () => {
    const out = path.join(dir, "sitio.mp4");
    await normalizeClip(path.join(dir, "ref.mp4"), out, 2000, { padToMs: 3100 });
    const { durationMs } = await probeVideo(out);
    expect(durationMs).toBeGreaterThanOrEqual(3000);
    expect(colorAt(out, 2.8)[0]).toBeGreaterThan(200); // congelado en rojo, sin tomar prestada la calle verde

    const street = path.join(dir, "calle.mp4");
    await normalizeClip(path.join(dir, "ref.mp4"), street, 4000, { startMs: 2000 });
    expect(colorAt(street, 0.1)[1]).toBeGreaterThan(100);
  });

  it("el empalme corta lo congelado y deja cada sitio en su sitio", async () => {
    const red = path.join(dir, "r.mp4");
    const green = path.join(dir, "g.mp4");
    await normalizeClip(path.join(dir, "ref.mp4"), red, 2000, { padToMs: 3100 });
    await normalizeClip(path.join(dir, "ref.mp4"), green, 4000, { startMs: 2000 });
    const out = path.join(dir, "empalme.mp4");
    await spliceClips([{ path: red, durationMs: 2000 }, { path: green, durationMs: 4000 }], out);
    const { durationMs } = await probeVideo(out);
    expect(Math.abs(durationMs - 6000)).toBeLessThan(120);
    expect(colorAt(out, 1.9)[0]).toBeGreaterThan(200);
    expect(colorAt(out, 2.1)[1]).toBeGreaterThan(100);
  });
});
