import { spawn } from "node:child_process";
import path from "node:path";

/** Vídeo de prueba 360×640, 30 fps, tres colores (cortes en 1/3 y 2/3) y con audio. */
export function makeSampleVideo(dir: string, opts: { seconds?: number } = {}): Promise<string> {
  const seconds = opts.seconds ?? 6;
  const part = (seconds / 3).toFixed(3);
  const out = path.join(dir, "muestra.mp4");
  const args = ["-v", "error", "-y"];
  for (const color of ["red", "cyan", "yellow"]) {
    args.push("-f", "lavfi", "-i", `color=c=${color}:s=360x640:r=30:d=${part}`);
  }
  args.push(
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
    "-map", "[v]", "-map", "3:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    out,
  );
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg ${code}: ${err}`))));
  });
}
