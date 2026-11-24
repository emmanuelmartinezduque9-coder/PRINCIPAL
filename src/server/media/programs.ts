import { spawn, type ChildProcess } from "node:child_process";

/**
 * Lanzar programas de vídeo que no son ffmpeg (el montador en Python, rea-video, yt-dlp): siempre
 * con lista de argumentos (nunca shell), con tope de tiempo y guardando el final de lo que dicen
 * por error. Los procesos en marcha se pueden matar todos a la vez al parar el proceso.
 */

const children = new Set<ChildProcess>();

export interface ProgramResult {
  /** Código de salida; -1 si no se pudo lanzar (no está, sin permiso). */
  code: number | null;
  /** La señal que lo paró (p. ej. `SIGKILL` si el sistema lo mató por memoria), o `null`. */
  signal?: NodeJS.Signals | null;
  timedOut: boolean;
  /** Lo que escribió por error (los últimos 50.000 caracteres como mucho), o el motivo de no lanzarse. */
  stderr: string;
}

export function runProgram(cmd: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number }): Promise<ProgramResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "ignore", "pipe"] });
    children.add(child);
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-50_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code: -1, timedOut, stderr: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, signal, timedOut, stderr });
    });
  });
}

/** La última línea con texto de lo que un programa dijo por error. */
export const lastLine = (text: string): string | null => text.trim().split("\n").filter(Boolean).at(-1) ?? null;

/** Mata todos los programas en marcha (al parar el proceso). */
export function killPrograms(): void {
  for (const child of children) child.kill("SIGKILL");
}
