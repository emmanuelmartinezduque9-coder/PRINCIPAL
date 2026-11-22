/**
 * Guarda «lo último» de un control que se pulsa varias veces seguidas (− y + de una duración):
 * espera a que se deje de pulsar (`delayMs`) y guarda solo el valor final. Nunca hay dos
 * guardados a la vez: lo que se pulsa mientras uno está en marcha queda en cola y se guarda (solo
 * lo último) en cuanto ese termina, así que ningún clic se pierde ni dos guardados se cruzan.
 */
export interface LatestSaver<T> {
  /** El valor que se quiere guardar ahora; sustituye al que estuviera esperando. */
  push(value: T): void;
  /** Guarda ya lo que esté esperando, sin esperar a `delayMs` (al salir de la pantalla). */
  flush(): void;
  /** `true` mientras hay algo esperando o guardándose. */
  busy(): boolean;
}

export function createLatestSaver<T>(
  save: (value: T) => Promise<unknown>,
  options: {
    delayMs: number;
    /** Se llama cuando ya no queda nada esperando ni guardándose. */
    onIdle?: () => void;
  },
): LatestSaver<T> {
  let waiting: { value: T } | null = null;
  let saving = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run(): Promise<void> {
    // Con un guardado en marcha no se empieza otro: ese mismo bucle recoge lo que haya llegado.
    if (saving) return;
    saving = true;
    try {
      while (waiting !== null) {
        const { value } = waiting;
        waiting = null;
        try {
          await save(value);
        } catch {
          // El fallo lo cuenta quien guarda; aquí solo importa que lo siguiente no se quede sin guardar.
        }
      }
    } finally {
      saving = false;
    }
    // Algo pulsado justo al terminar ya tiene su propia espera en marcha.
    if (timer === null) options.onIdle?.();
  }

  function stopTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  return {
    push(value) {
      waiting = { value };
      stopTimer();
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, options.delayMs);
    },
    flush() {
      stopTimer();
      if (waiting !== null) void run();
    },
    busy: () => saving || waiting !== null,
  };
}
