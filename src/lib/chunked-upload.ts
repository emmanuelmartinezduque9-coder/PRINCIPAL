import { ApiError } from "@/lib/api";

/**
 * Subida del vídeo de referencia por trozos desde el navegador, pensada para una conexión mala.
 * Empieza la subida, manda cada trozo (`?indice=N`) y la termina, siempre en las rutas del vídeo
 * (`/api/videos/{videoId}/referencia/subida…`).
 *
 * - Un corte de red, un 5xx o un 409 en un trozo: espera (1, 2, 4, 8 y 16 s), pregunta al servidor
 *   cuántos trozos tiene y sigue desde ahí (un trozo que llegó pero cuya respuesta se perdió no se
 *   reenvía). Tras el primer intento y 5 reintentos fallidos del mismo trozo, se rinde.
 * - Un 410 (el servidor se reinició y perdió el archivo) vuelve a empezar la subida entera, una
 *   sola vez.
 * - Cualquier otro 4xx lanza `ApiError` con el mensaje del servidor, sin reintentar.
 * - El progreso (de 0 a 1) nunca retrocede, aunque haya que volver a empezar.
 */

export const GIVE_UP = "La conexión se ha cortado demasiadas veces. Vuelve a intentarlo con mejor cobertura.";
const WAITS_MS = [1000, 2000, 4000, 8000, 16000];
const FALLBACK = "No se pudo subir el vídeo.";

export interface UploadOptions {
  onProgress(fraction: number): void;
  fetch?: typeof fetch;
  sleep?(ms: number): Promise<void>;
  signal?: AbortSignal;
}

/** El servidor perdió la subida (410): hay que empezar de nuevo. */
class UploadGone extends Error {}

type Outcome = { kind: "ok"; body: Record<string, unknown> } | { kind: "retry" } | { kind: "gone"; message: string };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function uploadInChunks(file: Blob & { name: string }, videoId: number, opts: UploadOptions): Promise<void> {
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const { signal } = opts;
  const base = `/api/videos/${videoId}/referencia/subida`;

  let shown = 0;
  const report = (fraction: number) => {
    const value = Math.min(1, Math.max(0, fraction));
    if (value > shown) {
      shown = value;
      opts.onProgress(value);
    }
  };

  const stopIfCancelled = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Subida cancelada.", "AbortError");
  };

  /** Una petición. `retryOn409`: en un trozo, un 409 («faltan trozos») se arregla preguntando el progreso. */
  async function request(url: string, init: RequestInit, retryOn409 = false): Promise<Outcome> {
    stopIfCancelled();
    let response: Response;
    try {
      response = await doFetch(url, { ...init, signal });
    } catch (error) {
      stopIfCancelled();
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return { kind: "retry" };
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok) return { kind: "ok", body: body ?? {} };
    const message = typeof body?.error === "string" ? body.error : FALLBACK;
    if (response.status === 410) return { kind: "gone", message };
    if (response.status >= 500 || (retryOn409 && response.status === 409)) return { kind: "retry" };
    throw new ApiError(message, response.status);
  }

  /** Espera antes del reintento número `failures`; con más de 5 fallos seguidos, se rinde. */
  async function backOff(failures: number): Promise<void> {
    if (failures > WAITS_MS.length) throw new ApiError(GIVE_UP, 0);
    await sleep(WAITS_MS[failures - 1]);
    stopIfCancelled();
  }

  /** Empezar y terminar: idempotentes, así que se repiten tal cual tras un corte. */
  async function withRetries(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    for (let failures = 0; ; ) {
      const outcome = await request(url, init);
      if (outcome.kind === "ok") return outcome.body;
      if (outcome.kind === "gone") throw new UploadGone(outcome.message);
      failures += 1;
      await backOff(failures);
    }
  }

  async function uploadOnce(): Promise<void> {
    const started = await withRetries(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, totalBytes: file.size }),
    });
    const uploadId = String(started.uploadId);
    const chunkBytes = Number(started.chunkBytes);
    const sessionUrl = `${base}/${encodeURIComponent(uploadId)}`;
    const total = Math.ceil(file.size / chunkBytes);

    let index = 0;
    let failures = 0;
    while (index < total) {
      const chunk = file.slice(index * chunkBytes, Math.min(file.size, (index + 1) * chunkBytes));
      const sent = await request(
        `${sessionUrl}?indice=${index}`,
        { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk },
        true,
      );
      if (sent.kind === "gone") throw new UploadGone(sent.message);
      if (sent.kind === "ok") {
        const received = Number(sent.body.received);
        index = Number.isSafeInteger(received) && received > index ? received : index + 1;
        failures = 0;
        report(index / total);
        continue;
      }
      failures += 1;
      await backOff(failures);
      // ¿Cuántos tiene el servidor? Si no contesta, se reintenta el mismo trozo (y cuenta como fallo si vuelve a fallar).
      const progress = await request(sessionUrl, { method: "GET" });
      if (progress.kind === "gone") throw new UploadGone(progress.message);
      if (progress.kind === "ok") {
        const received = Number(progress.body.received);
        if (Number.isSafeInteger(received) && received >= 0 && received <= total) {
          if (received > index) failures = 0;
          index = received;
        }
      }
    }

    await withRetries(sessionUrl, { method: "POST" });
    report(1);
  }

  for (let restarted = false; ; restarted = true) {
    try {
      await uploadOnce();
      return;
    } catch (error) {
      if (!(error instanceof UploadGone)) throw error;
      if (restarted) throw new ApiError(error.message, 410);
    }
  }
}
