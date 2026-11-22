import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimPreview } from "@/components/library/preview-slot";
import { createLatestSaver } from "@/lib/latest-saver";

/** Un guardado que se termina a mano, para simular uno que tarda. */
function slowSave() {
  const calls: number[] = [];
  const finish: Array<(ok?: boolean) => void> = [];
  const save = (value: number) => {
    calls.push(value);
    return new Promise<void>((resolve, reject) => finish.push((ok = true) => (ok ? resolve() : reject(new Error("fallo")))));
  };
  return { calls, save, finish: async (ok?: boolean) => finish.shift()!(ok) };
}

const tick = async (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe("guardar lo último (la duración del gancho)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("varios clics seguidos son un solo guardado, con el último valor, al dejar de pulsar", async () => {
    const { calls, save, finish } = slowSave();
    const idle = vi.fn();
    const saver = createLatestSaver(save, { delayMs: 450, onIdle: idle });
    saver.push(5);
    await tick(200);
    saver.push(6);
    await tick(200);
    saver.push(7);
    await tick(449);
    expect(calls).toEqual([]);
    expect(saver.busy()).toBe(true);
    await tick(1);
    expect(calls).toEqual([7]);
    expect(idle).not.toHaveBeenCalled();
    await finish();
    await tick();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(saver.busy()).toBe(false);
  });

  it("un clic hecho mientras se guarda no se pierde: se guarda después, y nunca hay dos guardados a la vez", async () => {
    const { calls, save, finish } = slowSave();
    const idle = vi.fn();
    const saver = createLatestSaver(save, { delayMs: 450, onIdle: idle });
    saver.push(5);
    await tick(450);
    expect(calls).toEqual([5]);
    // Guardando el 5, se pulsa dos veces más; pasa de sobra la espera y el 5 sigue sin terminar.
    saver.push(6);
    saver.push(7);
    await tick(2000);
    expect(calls).toEqual([5]);
    expect(idle).not.toHaveBeenCalled();
    // Al terminar el 5 se guarda lo último (el 7); el 6 intermedio no hace falta.
    await finish();
    await tick();
    expect(calls).toEqual([5, 7]);
    expect(idle).not.toHaveBeenCalled();
    await finish();
    await tick();
    expect(calls).toEqual([5, 7]);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("si se pulsa justo al terminar un guardado, sigue ocupado hasta guardar eso también", async () => {
    const { calls, save, finish } = slowSave();
    const idle = vi.fn();
    const saver = createLatestSaver(save, { delayMs: 450, onIdle: idle });
    saver.push(5);
    await tick(450);
    saver.push(6);
    // El 5 termina antes de que pase la espera del 6: el 6 se guarda enseguida, sin esperar más.
    await finish();
    await tick();
    expect(calls).toEqual([5, 6]);
    await finish();
    await tick();
    // La espera del 6 seguía en marcha: no se da por terminado hasta que pasa.
    expect(idle).not.toHaveBeenCalled();
    await tick(450);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([5, 6]);
  });

  it("un guardado que falla no deja sin guardar lo siguiente", async () => {
    const { calls, save, finish } = slowSave();
    const idle = vi.fn();
    const saver = createLatestSaver(save, { delayMs: 450, onIdle: idle });
    saver.push(5);
    await tick(450);
    saver.push(6);
    await finish(false);
    await tick();
    expect(calls).toEqual([5, 6]);
    await finish();
    await tick(450);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("`flush` guarda ya lo que estuviera esperando (al salir de la pantalla)", async () => {
    const { calls, save, finish } = slowSave();
    const saver = createLatestSaver(save, { delayMs: 450 });
    saver.flush();
    expect(calls).toEqual([]);
    saver.push(3);
    saver.flush();
    await tick();
    expect(calls).toEqual([3]);
    await finish();
    await tick(1000);
    expect(calls).toEqual([3]);
  });
});

describe("una sola vista previa a la vez", () => {
  it("al empezar una se apaga la anterior; soltar el turno de una que ya no lo tiene no apaga a la nueva", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    const releaseA = claimPreview(stopA);
    expect(stopA).not.toHaveBeenCalled();
    const releaseB = claimPreview(stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
    // La primera suelta tarde su turno: la segunda sigue.
    releaseA();
    const stopC = vi.fn();
    const releaseC = claimPreview(stopC);
    expect(stopB).toHaveBeenCalledTimes(1);
    // Volver a tomarlo una misma no se apaga a sí misma.
    claimPreview(stopC);
    expect(stopC).not.toHaveBeenCalled();
    releaseB();
    releaseC();
    // Sin nadie con el turno, la siguiente no apaga a nadie.
    const stopD = vi.fn();
    claimPreview(stopD)();
    expect(stopC).not.toHaveBeenCalled();
    expect(stopD).not.toHaveBeenCalled();
  });
});
