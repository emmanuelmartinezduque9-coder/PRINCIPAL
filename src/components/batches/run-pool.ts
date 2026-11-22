/**
 * Hace `task` con cada elemento, como mucho `limit` a la vez, y devuelve los resultados en el mismo
 * orden. Un fallo no para a los demás: cada resultado dice si salió bien (`ok`) o con qué error.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await task(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Un turno compartido: `limit(task)` espera a que haya hueco (como mucho `max` tareas a la vez,
 * vengan de donde vengan) y devuelve lo que dé la tarea.
 */
export function createLimiter(max: number): <R>(task: () => Promise<R>) => Promise<R> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <R>(task: () => Promise<R>) => {
    // Al terminar, el hueco pasa directamente al siguiente que espera (no queda libre ni un instante).
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
