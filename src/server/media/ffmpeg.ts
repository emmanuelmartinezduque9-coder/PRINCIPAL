import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectVideoType } from "./detect";

/** Herramientas de vídeo con ffmpeg. Siempre `spawn` con lista de argumentos (nunca shell). */

export const MAX_FRAMES = 24;
export const FRAME_MAX_SIDE = 768;
export const MAX_SEGMENT_MS = 30_000;
export const MIN_REFERENCE_MS = 2_000;

const PROCESS_TIMEOUT_MS = 120_000;
const STDERR_LOG_CHARS = 2_000;
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const UNREADABLE = "No hemos podido leer este vídeo.";

/** Error con mensaje en español apto para la persona; el detalle técnico solo va al registro del servidor. */
export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export class FfmpegMissingError extends MediaError {
  constructor() {
    super("El servidor no puede procesar vídeos ahora mismo.");
    this.name = "FfmpegMissingError";
  }
}

const MAX_PIXELS = 8_300_000; // por encima de 4K
const MAX_DURATION_MS = 600_000;
const GENERIC_FAILURE = "No hemos podido procesar este vídeo.";

type RunResult = { stdout: Buffer; stderr: string };

/** Ejecuta un programa; `stderr` completo en el resultado. Los errores no filtran stderr ni rutas: se registran aparte. */
function run(cmd: string, args: string[], failMessage = GENERIC_FAILURE): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const fail = (detail: string) =>
      finish(() => {
        console.error(`[ffmpeg] ${detail}`);
        reject(new MediaError(failMessage));
      });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(`${cmd} tardó más de ${PROCESS_TIMEOUT_MS / 1000} s`);
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGKILL");
        fail(`${cmd} produjo demasiada salida`);
        return;
      }
      out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < MAX_CAPTURE_BYTES) err += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") finish(() => reject(new FfmpegMissingError()));
      else fail(`${cmd}: ${error.message}`);
    });
    child.on("close", (code) => {
      if (code === 0) finish(() => resolve({ stdout: Buffer.concat(out), stderr: err }));
      else fail(`${cmd} terminó con código ${code}: ${err.slice(-STDERR_LOG_CHARS)}`);
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Opciones de entrada comunes: solo ficheros locales, demultiplexor forzado y ruta sin ambigüedad. */
function assertSafePath(p: string): void {
  if (!path.isAbsolute(p) || p.startsWith("-")) throw new MediaError(GENERIC_FAILURE);
}

function inputArgs(demuxer: string, filePath: string): string[] {
  assertSafePath(filePath);
  return ["-protocol_whitelist", "file", "-f", demuxer, "-i", `file:${filePath}`];
}

const MP4_DEMUXER = "mov,mp4,m4a,3gp,3g2,mj2";
const WEBM_DEMUXER = "matroska,webm";

/** Demultiplexor de un vídeo según su contenido verificado (nunca por nombre ni por autodetección de ffmpeg). */
function videoDemuxer(head: Buffer): string {
  const type = detectVideoType(head);
  if (!type) throw new MediaError(UNREADABLE);
  return type === "video/webm" ? WEBM_DEMUXER : MP4_DEMUXER;
}

async function fileDemuxer(filePath: string): Promise<string> {
  assertSafePath(filePath);
  let head = Buffer.alloc(16);
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const { bytesRead } = await handle.read(head, 0, 16, 0);
      head = head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    throw new MediaError(UNREADABLE);
  }
  return videoDemuxer(head);
}

/** Demultiplexor de imagen por los primeros bytes (JPEG, PNG, WebP, GIF). */
function imageDemuxer(head: Buffer): string {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg_pipe";
  if (head.length >= 4 && head.toString("latin1", 0, 4) === "\x89PNG") return "png_pipe";
  if (head.length >= 12 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "webp_pipe";
  if (head.length >= 4 && head.toString("latin1", 0, 4) === "GIF8") return "gif";
  throw new MediaError("No hemos podido leer esta imagen.");
}

/** Duración al decodificar todo el vídeo (WebM grabado en el navegador: sin duración en la cabecera). */
async function decodedDurationMs(filePath: string, demuxer: string): Promise<number> {
  const { stderr } = await run("ffmpeg", [
    "-nostdin", "-threads", "2", ...inputArgs(demuxer, filePath), "-map", "0:v:0", "-f", "null", "-",
  ], UNREADABLE);
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = times.at(-1);
  if (!last) throw new MediaError(UNREADABLE);
  return Math.round((Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])) * 1000);
}

export async function probeVideo(filePath: string): Promise<{ durationMs: number; width: number; height: number }> {
  const demuxer = await fileDemuxer(filePath);
  let data: {
    streams?: Array<{
      width?: number; height?: number; duration?: string;
      tags?: { rotate?: string }; side_data_list?: Array<{ rotation?: number }>;
    }>;
    format?: { duration?: string };
  };
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration",
      "-of", "json",
      ...inputArgs(demuxer, filePath),
    ], UNREADABLE);
    data = JSON.parse(stdout.toString("utf8"));
  } catch (error) {
    if (error instanceof FfmpegMissingError) throw error;
    throw new MediaError(UNREADABLE);
  }
  const stream = data.streams?.[0];
  if (!stream?.width || !stream.height) throw new MediaError(UNREADABLE);
  // El vídeo se muestra girado según los metadatos de rotación: se informa del tamaño mostrado.
  const rotation = Math.abs(Number(stream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0));
  const swap = rotation % 180 === 90;
  const width = swap ? stream.height : stream.width;
  const height = swap ? stream.width : stream.height;
  if (width * height > MAX_PIXELS) throw new MediaError("Este vídeo es demasiado grande: el máximo es 4K.");

  let seconds = Number(data.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = Number(stream.duration);
  let durationMs = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
  if (durationMs === 0) durationMs = await decodedDurationMs(filePath, demuxer);
  if (durationMs <= 0) throw new MediaError(UNREADABLE);
  if (durationMs > MAX_DURATION_MS) throw new MediaError("Este vídeo dura demasiado: el máximo es de 10 minutos.");
  return { durationMs, width, height };
}

/** count = clamp(ceil(durationMs / 500), 2, 24); tiempos = round(i * durationMs / count). */
export function frameTimesMs(durationMs: number): number[] {
  const count = Math.min(MAX_FRAMES, Math.max(2, Math.ceil(durationMs / 500)));
  return Array.from({ length: count }, (_, i) => Math.round((i * durationMs) / count));
}

/** Escala sin ampliar para que el lado largo no pase de `max`, con medidas pares. */
function scaleFilter(max: number): string {
  return `scale=w='if(gt(iw,ih),trunc(min(${max},iw)/2)*2,-2)':h='if(gt(iw,ih),-2,trunc(min(${max},ih)/2)*2)'`;
}

const toSeconds = (ms: number) => (ms / 1000).toFixed(3);

export async function extractFrames(
  filePath: string,
  timesMs: number[],
): Promise<Array<{ timeMs: number; jpeg: Buffer }>> {
  const demuxer = await fileDemuxer(filePath);
  const frames: Array<{ timeMs: number; jpeg: Buffer }> = new Array(timesMs.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < timesMs.length) {
      const i = next++;
      try {
        const { stdout } = await run("ffmpeg", [
          "-v", "error", "-nostdin", "-threads", "2",
          "-ss", toSeconds(timesMs[i]),
          ...inputArgs(demuxer, filePath),
          "-frames:v", "1",
          "-vf", scaleFilter(FRAME_MAX_SIDE),
          "-q:v", "5",
          "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1",
        ], UNREADABLE);
        if (stdout.length === 0) throw new MediaError(UNREADABLE);
        frames[i] = { timeMs: timesMs[i], jpeg: stdout };
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, timesMs.length) }, worker));
  return frames;
}

/** Cortes de plano, en ms. Con `limitMs`, solo se lee y se analiza ese tramo del principio (`-t`). */
export async function detectCuts(filePath: string, limitMs?: number): Promise<number[]> {
  const demuxer = await fileDemuxer(filePath);
  const limit = limitMs !== undefined && Number.isFinite(limitMs) && limitMs > 0 ? ["-t", toSeconds(limitMs)] : [];
  const { stderr } = await run("ffmpeg", [
    "-nostdin", "-threads", "2",
    ...limit,
    ...inputArgs(demuxer, filePath),
    "-an",
    // Se reduce antes de comparar escenas: mismo resultado, mucho menos trabajo con vídeos grandes.
    "-vf", "scale=-2:240,select='gt(scene,0.35)',showinfo",
    "-f", "null", "-",
  ], UNREADABLE);
  const cuts: number[] = [];
  for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) cuts.push(Math.round(Number(match[1]) * 1000));
  return cuts;
}

/** MP4 H.264, sin audio, lado largo ≤ 1280, 30 fps, desde 0 y `durationMs` como mucho. */
export async function normalizeClip(filePath: string, outPath: string, durationMs: number): Promise<void> {
  const demuxer = await fileDemuxer(filePath);
  assertSafePath(outPath);
  try {
    await run("ffmpeg", [
      "-v", "error", "-nostdin", "-y", "-threads", "2",
      ...inputArgs(demuxer, filePath),
      "-t", toSeconds(durationMs),
      "-an",
      "-vf", `${scaleFilter(1280)},fps=30,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-movflags", "+faststart",
      "-f", "mp4",
      `file:${outPath}`,
    ], UNREADABLE);
  } catch (error) {
    await fs.rm(outPath, { force: true });
    throw error;
  }
}

/** Miniatura JPEG (sin ampliar; lado largo ≤ `maxSide`). El contenido debe ser del tipo `kind`, comprobado por sus bytes. */
export async function makeThumbnail(input: Buffer, kind: "image" | "video", maxSide = 540): Promise<Buffer> {
  const head = input.subarray(0, 16);
  const demuxer = kind === "video" ? videoDemuxer(head) : imageDemuxer(head);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "miniatura-"));
  try {
    const src = path.join(dir, "entrada");
    await fs.writeFile(src, input);
    const { stdout } = await run("ffmpeg", [
      "-v", "error", "-nostdin", "-threads", "2",
      ...inputArgs(demuxer, src),
      "-frames:v", "1",
      "-vf", scaleFilter(maxSide),
      "-q:v", "4",
      "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1",
    ], "No hemos podido preparar la miniatura.");
    if (stdout.length === 0) throw new MediaError("No hemos podido preparar la miniatura.");
    return stdout;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
