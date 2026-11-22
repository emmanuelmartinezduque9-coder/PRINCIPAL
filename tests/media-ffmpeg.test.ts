import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  detectCuts, extractFrames, ffmpegAvailable, frameTimesMs, makeThumbnail, normalizeClip, probeVideo,
} from "@/server/media/ffmpeg";
import { makeSampleVideo } from "./helpers/sample-video";

let dir: string;
let sample: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-video-"));
  sample = await makeSampleVideo(dir, { seconds: 6 });
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Medidas de un JPEG, leídas de su marcador SOF. */
function jpegSize(buf: Buffer): { w: number; h: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("JPEG sin SOF");
}

describe("frameTimesMs", () => {
  it("reparte los fotogramas cada ~500 ms con tope de 24 y mínimo de 2", () => {
    expect(frameTimesMs(10_000)).toHaveLength(20);
    expect(frameTimesMs(10_000).slice(0, 3)).toEqual([0, 500, 1000]);
    expect(frameTimesMs(30_000)).toHaveLength(24);
    expect(frameTimesMs(30_000)[1]).toBe(1250);
    expect(frameTimesMs(3_000)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(frameTimesMs(800)).toEqual([0, 400]);
  });
});

describe("ffmpeg", () => {
  it("ffmpeg está disponible en el entorno de pruebas", async () => {
    expect(await ffmpegAvailable()).toBe(true);
  });

  it("lee duración y tamaño", async () => {
    const info = await probeVideo(sample);
    expect(Math.abs(info.durationMs - 6000)).toBeLessThanOrEqual(100);
    expect(info).toMatchObject({ width: 360, height: 640 });
  });

  it("saca un JPEG pequeño por cada tiempo pedido", async () => {
    const times = frameTimesMs(6000);
    expect(times).toHaveLength(12);
    const frames = await extractFrames(sample, times);
    expect(frames.map((f) => f.timeMs)).toEqual(times);
    for (const f of frames) {
      expect([...f.jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      const { w, h } = jpegSize(f.jpeg);
      expect(Math.max(w, h)).toBeLessThanOrEqual(768);
      expect(f.jpeg.length).toBeLessThan(150 * 1024);
    }
  });

  it("encuentra los cortes", async () => {
    const cuts = await detectCuts(sample);
    expect(cuts).toHaveLength(2);
    expect(Math.abs(cuts[0] - 2000)).toBeLessThanOrEqual(200);
    expect(Math.abs(cuts[1] - 4000)).toBeLessThanOrEqual(200);
  });

  it("el recorte normalizado no tiene audio, dura lo pedido y no pasa de 1280 px", async () => {
    const out = path.join(dir, "recorte.mp4");
    await normalizeClip(sample, out, 3000);
    const info = await probeVideo(out);
    expect(Math.abs(info.durationMs - 3000)).toBeLessThanOrEqual(100);
    expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(1280);
    const streams = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", out])
      .stdout.toString();
    expect(streams.trim()).toBe("h264,video");
  });

  it("hace miniaturas de imagen y de vídeo", async () => {
    const fromVideo = await makeThumbnail(fs.readFileSync(sample), "video");
    expect([...fromVideo.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpegSize(fromVideo)).toEqual({ w: 304, h: 540 });

    const bigPath = path.join(dir, "grande.jpg");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", sample, "-frames:v", "1", "-vf", "scale=720:1280", bigPath]);
    const fromImage = await makeThumbnail(fs.readFileSync(bigPath), "image");
    expect([...fromImage.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpegSize(fromImage)).toEqual({ w: 304, h: 540 });
  });

  it("un archivo que no es vídeo da un error claro", async () => {
    const fake = path.join(dir, "falso.mp4");
    fs.writeFileSync(fake, "esto no es un vídeo");
    await expect(probeVideo(fake)).rejects.toThrow("No hemos podido leer este vídeo.");
  });
});
