import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Herramientas de vídeo con ffmpeg. Siempre `spawn` con lista de argumentos (nunca shell). */

export const MAX_FRAMES = 24;
export const FRAME_MAX_SIDE = 768;
export const MAX_SEGMENT_MS = 30_000;
export const MIN_REFERENCE_MS = 2_000;

const PROCESS_TIMEOUT_MS = 120_000;
const STDERR_LOG_CHARS = 2_000;
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const UNREADABLE = "No hemos podido leer este vídeo.";

type RunResult = { stdout: Buffer; stderr: string };

/** Ejecuta un programa; `stderr` completo en el resultado, recortado en los errores (solo para el registro del servidor). */
function run(cmd: string, args: string[]): Promise<RunResult> {
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
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`${cmd} tardó más de ${PROCESS_TIMEOUT_MS / 1000} s`)));
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error(`${cmd} produjo demasiada salida`)));
        return;
      }
      out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < MAX_CAPTURE_BYTES) err += chunk.toString("utf8");
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
        else reject(new Error(`${cmd} terminó con código ${code}: ${err.slice(-STDERR_LOG_CHARS)}`));
      }),
    );
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

export async function probeVideo(filePath: string): Promise<{ durationMs: number; width: number; height: number }> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      filePath,
    ]);
    const data = JSON.parse(stdout.toString("utf8")) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const stream = data.streams?.[0];
    const seconds = Number(data.format?.duration);
    if (!stream?.width || !stream.height || !Number.isFinite(seconds) || seconds <= 0) throw new Error("sin vídeo");
    return { durationMs: Math.round(seconds * 1000), width: stream.width, height: stream.height };
  } catch (error) {
    console.error(`[ffmpeg] probe: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(UNREADABLE);
  }
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
  const frames: Array<{ timeMs: number; jpeg: Buffer }> = new Array(timesMs.length);
  let next = 0;
  const worker = async () => {
    while (next < timesMs.length) {
      const i = next++;
      const { stdout } = await run("ffmpeg", [
        "-v", "error", "-nostdin",
        "-ss", toSeconds(timesMs[i]),
        "-i", filePath,
        "-frames:v", "1",
        "-vf", scaleFilter(FRAME_MAX_SIDE),
        "-q:v", "5",
        "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1",
      ]);
      if (stdout.length === 0) throw new Error(`ffmpeg no devolvió fotograma en ${timesMs[i]} ms`);
      frames[i] = { timeMs: timesMs[i], jpeg: stdout };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, timesMs.length) }, worker));
  return frames;
}

export async function detectCuts(filePath: string): Promise<number[]> {
  const { stderr } = await run("ffmpeg", [
    "-nostdin", "-i", filePath,
    "-an",
    "-vf", "select='gt(scene,0.35)',showinfo",
    "-f", "null", "-",
  ]);
  const cuts: number[] = [];
  for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) cuts.push(Math.round(Number(match[1]) * 1000));
  return cuts;
}

/** MP4 H.264, sin audio, lado largo ≤ 1280, 30 fps, desde 0 y `durationMs` como mucho. */
export async function normalizeClip(filePath: string, outPath: string, durationMs: number): Promise<void> {
  await run("ffmpeg", [
    "-v", "error", "-nostdin", "-y",
    "-i", filePath,
    "-t", toSeconds(durationMs),
    "-an",
    "-vf", `${scaleFilter(1280)},fps=30,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-movflags", "+faststart",
    outPath,
  ]);
}

/** Miniatura JPEG (sin ampliar; lado largo ≤ `maxSide`). De un vídeo, su primer fotograma. */
export async function makeThumbnail(input: Buffer, kind: "image" | "video", maxSide = 540): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "miniatura-"));
  try {
    const src = path.join(dir, "entrada");
    await fs.writeFile(src, input);
    const { stdout } = await run("ffmpeg", [
      "-v", "error", "-nostdin",
      "-i", src,
      "-frames:v", "1",
      "-vf", scaleFilter(maxSide),
      "-q:v", "4",
      "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1",
    ]);
    if (stdout.length === 0) throw new Error(`ffmpeg no pudo sacar la miniatura (${kind})`);
    return stdout;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
