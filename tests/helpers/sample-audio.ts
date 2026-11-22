import { spawn } from "node:child_process";
import path from "node:path";

/** Una canción de prueba: un tono de `seconds` segundos en MP3, M4A (AAC) o WAV, guardada en `dir`. */
export function makeSampleAudio(dir: string, format: "mp3" | "m4a" | "wav", opts: { seconds?: number; frequency?: number } = {}): Promise<string> {
  const seconds = opts.seconds ?? 3;
  const out = path.join(dir, `tono-${opts.frequency ?? 440}-${seconds}.${format}`);
  const codec = { mp3: ["-c:a", "libmp3lame", "-b:a", "64k"], m4a: ["-c:a", "aac", "-b:a", "64k"], wav: ["-c:a", "pcm_s16le"] }[format];
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${opts.frequency ?? 440}:duration=${seconds}`, ...codec, out];
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg ${code}: ${err}`))));
  });
}
