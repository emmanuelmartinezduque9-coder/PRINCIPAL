import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainSeconds, shutdownBudget, stopChildren, type StoppableChild } from "@/lib/shutdown";

/** Proceso de mentira: al recibir SIGTERM sale tras `exitsAfterMs` (o nunca); SIGKILL lo mata al momento. */
class FakeChild extends EventEmitter implements StoppableChild {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  signals: string[] = [];

  constructor(
    private exitsAfterMs: number | null,
    private spawned = true,
  ) {
    super();
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (!this.spawned || this.exitCode !== null || this.signalCode !== null) return false;
    this.signals.push(signal);
    if (signal === "SIGKILL") this.exit(null, "SIGKILL");
    else if (this.exitsAfterMs !== null) setTimeout(() => this.exit(0, null), this.exitsAfterMs);
    return true;
  }

  private exit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parada ordenada de los procesos", () => {
  it("espera a que cada proceso salga y no mata a ninguno si salen a tiempo", async () => {
    const web = new FakeChild(50);
    const worker = new FakeChild(8_000);
    let result: boolean | undefined;
    void stopChildren([web, worker], 28_000).then((clean) => (result = clean));

    await vi.advanceTimersByTimeAsync(7_999);
    expect(result).toBeUndefined(); // el proceso en segundo plano sigue terminando su paso
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(true);
    expect(web.signals).toEqual(["SIGTERM"]);
    expect(worker.signals).toEqual(["SIGTERM"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si un proceso no sale, al acabarse el tiempo lo mata y lo dice", async () => {
    const web = new FakeChild(50);
    const stuck = new FakeChild(null);
    let result: boolean | undefined;
    void stopChildren([web, stuck], 28_000).then((clean) => (result = clean));

    await vi.advanceTimersByTimeAsync(27_999);
    expect(result).toBeUndefined();
    expect(stuck.signals).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    expect(stuck.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(web.signals).toEqual(["SIGTERM"]);
  });

  it("no espera a un proceso que ya había salido ni a uno que no llegó a arrancar", async () => {
    const gone = new FakeChild(0);
    gone.exitCode = 1;
    const neverSpawned = new FakeChild(null, false);
    await expect(stopChildren([gone, neverSpawned], 28_000)).resolves.toBe(true);
    await expect(stopChildren([], 28_000)).resolves.toBe(true);
    expect(gone.signals).toEqual([]);
  });
});

describe("tiempo para parar", () => {
  it("sale de RAILWAY_DEPLOYMENT_DRAINING_SECONDS y, si falta o no vale, son 30 segundos", () => {
    expect(drainSeconds({})).toBe(30);
    expect(drainSeconds({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "120" })).toBe(120);
    expect(drainSeconds({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: " 45 " })).toBe(45);
    for (const bad of ["", "0", "-5", "abc", "1.5"]) {
      expect(drainSeconds({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: bad })).toBe(30);
    }
    expect(drainSeconds({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "999999" })).toBe(600);
  });

  it("el proceso en segundo plano deja de esperar antes que el arranque, y los dos antes del límite", () => {
    expect(shutdownBudget({})).toEqual({ parentMs: 28_000, workerMs: 25_000 });
    expect(shutdownBudget({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "120" })).toEqual({ parentMs: 118_000, workerMs: 115_000 });
    expect(shutdownBudget({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "2" })).toEqual({ parentMs: 1_000, workerMs: 1_000 });
  });
});
