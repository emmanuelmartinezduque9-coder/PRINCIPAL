import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  detectCuts, extractFrames, FfmpegMissingError, ffmpegAvailable, frameTimesMs, makeThumbnail, MediaError, normalizeClip, probeVideo,
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

  it("con un límite, solo lee y busca cortes en ese tramo del principio", async () => {
    const cuts = await detectCuts(sample, 3000);
    expect(cuts).toHaveLength(1);
    expect(Math.abs(cuts[0] - 2000)).toBeLessThanOrEqual(200);
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

  it("un archivo que no es vídeo no deja filtrar rutas ni mensajes técnicos", async () => {
    const fake = path.join(dir, "falso2.mp4");
    fs.writeFileSync(fake, "esto no es un vídeo");
    const error = await probeVideo(fake).catch((e) => e);
    expect(error).toBeInstanceOf(MediaError);
    expect(error.message).not.toContain(dir);
  });
});

describe("endurecimiento", () => {
  const secretFile = () => {
    const secret = path.join(dir, "secreto.txt");
    fs.writeFileSync(secret, "CONTENIDO-SECRETO");
    return secret;
  };

  it("una lista de reproducción hostil no se lee como vídeo ni como imagen", async () => {
    const secret = secretFile();
    const hostile = [
      `#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1,\n${secret}\n`,
      `ffconcat version 1.0\nfile '${secret}'\n`,
      // Cabecera de vídeo válida seguida de texto hostil: el demultiplexor forzado (mov) no interpreta listas.
      `\0\0\0\x18ftypisom\0\0\0\0#EXTM3U\n${secret}\n`,
    ];
    for (const text of hostile) {
      const file = path.join(dir, "hostil.mp4");
      fs.writeFileSync(file, text, "latin1");
      for (const call of [
        () => probeVideo(file),
        () => extractFrames(file, [0]),
        () => detectCuts(file),
        () => normalizeClip(file, path.join(dir, "hostil-salida.mp4"), 1000),
        () => makeThumbnail(Buffer.from(text, "latin1"), "video"),
        () => makeThumbnail(Buffer.from(text, "latin1"), "image"),
      ]) {
        const error = await call().then(() => null, (e) => e);
        expect(error).toBeInstanceOf(MediaError);
        expect(error.message).not.toContain("SECRETO");
        expect(error.message).not.toContain(dir);
      }
    }
    expect(fs.existsSync(path.join(dir, "hostil-salida.mp4"))).toBe(false);
  });

  it("rechaza rutas relativas o que empiezan por guion", async () => {
    await expect(probeVideo("-i")).rejects.toBeInstanceOf(MediaError);
    await expect(probeVideo("-foo.mp4")).rejects.toBeInstanceOf(MediaError);
    await expect(probeVideo("muestra.mp4")).rejects.toBeInstanceOf(MediaError);
    await expect(normalizeClip(sample, "-salida.mp4", 1000)).rejects.toBeInstanceOf(MediaError);
  });

  it("rechaza vídeos de dimensiones o duración absurdas", async () => {
    const big = path.join(dir, "enorme.mp4");
    const r1 = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=4096x4096:r=1:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", big]);
    expect(r1.status).toBe(0);
    await expect(probeVideo(big)).rejects.toThrow("demasiado grande");
    const long = path.join(dir, "largo.mp4");
    const r2 = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=1:d=700", "-c:v", "libx264", "-g", "300", "-pix_fmt", "yuv420p", long]);
    expect(r2.status).toBe(0);
    await expect(probeVideo(long)).rejects.toThrow("dura demasiado");
  });

  it("sin ffmpeg instalado da un error propio, no «no es un vídeo»", async () => {
    const empty = fs.mkdtempSync(path.join(dir, "vacio-"));
    const oldPath = process.env.PATH;
    process.env.PATH = empty;
    try {
      expect(await ffmpegAvailable()).toBe(false);
      const error = await probeVideo(sample).catch((e) => e);
      expect(error).toBeInstanceOf(FfmpegMissingError);
      expect(error.message).toBe("El servidor no puede procesar vídeos ahora mismo.");
      await expect(extractFrames(sample, [0])).rejects.toBeInstanceOf(FfmpegMissingError);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("al fallar el recorte no queda un archivo a medias", async () => {
    const out = path.join(dir, "parcial.mp4");
    const broken = path.join(dir, "roto.mp4");
    fs.writeFileSync(broken, Buffer.concat([fs.readFileSync(sample).subarray(0, 40), Buffer.alloc(100)]));
    fs.writeFileSync(out, "resto");
    await expect(normalizeClip(broken, out, 1000)).rejects.toBeInstanceOf(MediaError);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("usa la duración del flujo o la decodificada si la cabecera no la trae (WebM del navegador)", async () => {
    const webm = path.join(dir, "navegador.webm");
    const r = spawnSync("sh", ["-c", `ffmpeg -v error -y -f lavfi -i testsrc=s=320x240:r=30:d=2 -c:v libvpx -f webm pipe:1 > "${webm}"`]);
    expect(r.status).toBe(0);
    const info = await probeVideo(webm);
    expect(Math.abs(info.durationMs - 2000)).toBeLessThanOrEqual(150);
    expect(info).toMatchObject({ width: 320, height: 240 });
  });

  it("informa del tamaño mostrado cuando el vídeo lleva rotación", async () => {
    const rotated = path.join(dir, "girado.mp4");
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-display_rotation", "90", "-i", sample, "-c", "copy", rotated]);
    expect(r.status).toBe(0);
    expect(await probeVideo(rotated)).toMatchObject({ width: 640, height: 360 });
    const out = path.join(dir, "girado-norm.mp4");
    await normalizeClip(rotated, out, 1000);
    expect(await probeVideo(out)).toMatchObject({ width: 640, height: 360 });
  });
});
