import { spawn } from "node:child_process";

/**
 * ffmpeg «en crudo» para leer la edición de una referencia (`src/server/videos/edicion-referencia.ts`):
 * fotogramas de muestra, franjas en gris para afinar un cambio de rótulo y el registro del filtro de escena.
 * Siempre con lista de argumentos (nunca shell).
 */

/** Corre ffmpeg y devuelve lo que escribe por la salida estándar; lanza con la última línea de error. */
export function ffmpegOutput(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (err = (err + chunk.toString()).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg: ${err.trim().split("\n").at(-1) ?? code}`))));
  });
}

/** Corre ffmpeg y devuelve todo lo que escribe por error (donde `showinfo` deja los tiempos); vacío si no se puede. */
export function ffmpegLog(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(err));
  });
}
