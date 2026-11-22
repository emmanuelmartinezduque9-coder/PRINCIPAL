/**
 * Parada ordenada al desplegar. Railway avisa con SIGTERM y espera
 * `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` antes de matar el servicio; ese es el tiempo que hay para
 * que el proceso en segundo plano termine el paso que tenga a medias.
 */

type Env = Record<string, string | undefined>;

const DEFAULT_DRAIN_SECONDS = 30;
const MAX_DRAIN_SECONDS = 600;

/** Margen para que el arranque (`cloud.ts`) salga antes de que el servicio lo mate. */
const PARENT_MARGIN_MS = 2_000;
/** El proceso en segundo plano deja de esperar un poco antes, para parar él solo y con limpieza. */
const WORKER_MARGIN_MS = 5_000;

/** Segundos que el despliegue da para parar: `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, o 30. */
export function drainSeconds(env: Env): number {
  const text = env.RAILWAY_DEPLOYMENT_DRAINING_SECONDS?.trim() ?? "";
  if (!/^\d+$/.test(text)) return DEFAULT_DRAIN_SECONDS;
  const seconds = Number(text);
  return seconds >= 1 ? Math.min(seconds, MAX_DRAIN_SECONDS) : DEFAULT_DRAIN_SECONDS;
}

/**
 * Cuánto espera cada pieza al parar: `workerMs`, el proceso en segundo plano a sus pasos en
 * marcha; `parentMs`, el arranque a que salgan sus procesos. Nunca menos de un segundo.
 */
export function shutdownBudget(env: Env): { parentMs: number; workerMs: number } {
  const total = drainSeconds(env) * 1000;
  return {
    parentMs: Math.max(1_000, total - PARENT_MARGIN_MS),
    workerMs: Math.max(1_000, total - WORKER_MARGIN_MS),
  };
}

/** Lo que hace falta de un proceso hijo para pararlo (lo cumple `ChildProcess`). */
export interface StoppableChild {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit", listener: () => void): unknown;
}

const running = (child: StoppableChild) => child.exitCode === null && child.signalCode === null;

/**
 * Pide a los procesos que terminen (SIGTERM) y espera a que salgan, como mucho `budgetMs`. A los
 * que entonces sigan vivos los mata (SIGKILL). Devuelve `true` si todos salieron a tiempo.
 */
export async function stopChildren(children: StoppableChild[], budgetMs: number): Promise<boolean> {
  const exited = new Map<StoppableChild, Promise<void>>();
  for (const child of children.filter(running)) {
    exited.set(child, new Promise<void>((resolve) => child.once("exit", () => resolve())));
  }
  // Solo se espera a los que han recibido el aviso (uno que no llegó a arrancar no lo recibe).
  const pending = [...exited.keys()].filter((child) => child.kill("SIGTERM"));
  if (pending.length === 0) return true;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), budgetMs);
  });
  const all = Promise.all(pending.map((child) => exited.get(child))).then(() => true as const);
  const clean = await Promise.race([all, timeout]);
  clearTimeout(timer);
  if (!clean) for (const child of pending.filter(running)) child.kill("SIGKILL");
  return clean;
}
