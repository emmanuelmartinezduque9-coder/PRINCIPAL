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
 * - Con `resume` (la subida que dio `onSession` en un intento anterior) sigue esa misma subida
 *   desde donde la tenga el servidor; si ya no existe (404 o 410), empieza otra.
 * - Un 404 al repetir «terminar» tras un corte cuenta como hecho: el primer intento llegó y la
 *   preparación ya recogió la subida.
 * - `signal` cancela también durante una espera.
 */

export const GIVE_UP = "La conexión se ha cortado demasiadas veces. Vuelve a intentarlo con mejor cobertura.";
const WAITS_MS = [1000, 2000, 4000, 8000, 16000];
const FALLBACK = "No se pudo subir el vídeo.";

/** Una subida empezada en el servidor: su identificador y el tamaño de sus trozos. */
export interface UploadSession {
  uploadId: string;
  chunkBytes: number;
}

export interface UploadOptions {
  onProgress(fraction: number): void;
  fetch?: typeof fetch;
  sleep?(ms: number): Promise<void>;
  signal?: AbortSignal;
  /** Seguir esta subida en vez de empezar otra. */
  resume?: UploadSession;
  /** Avisa de la subida que se acaba de empezar (para poder seguirla con `resume`). */
  onSession?(session: UploadSession): void;
}

/** El servidor perdió la subida (410): hay que empezar de nuevo. */
class UploadGone extends Error {}

type Outcome =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "retry" }
  | { kind: "gone"; message: string }
  | { kind: "missing"; message: string };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function uploadInChunks(file: Blob & { name: string }, videoId: number, opts: UploadOptions): Promise<void> {
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const { signal } = opts;
  const cancelled = () => signal?.reason ?? new DOMException("Subida cancelada.", "AbortError");
  /** Espera que se corta en cuanto se cancela. */
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(cancelled());
      const onAbort = () => reject(cancelled());
      signal?.addEventListener("abort", onAbort, { once: true });
      (opts.sleep ?? defaultSleep)(ms).then(
        () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
        (error) => {
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
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
    if (signal?.aborted) throw cancelled();
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
    if (response.status === 404) return { kind: "missing", message };
    if (response.status >= 500 || (retryOn409 && response.status === 409)) return { kind: "retry" };
    throw new ApiError(message, response.status);
  }

  /** Espera antes del reintento número `failures`; con más de 5 fallos seguidos, se rinde. */
  async function backOff(failures: number): Promise<void> {
    if (failures > WAITS_MS.length) throw new ApiError(GIVE_UP, 0);
    await sleep(WAITS_MS[failures - 1]);
    stopIfCancelled();
  }

  /**
   * Empezar y terminar: idempotentes, así que se repiten tal cual tras un corte. Con
   * `missingIsDone`, un 404 en una repetición (no en el primer intento) cuenta como hecho.
   */
  async function withRetries(url: string, init: RequestInit, missingIsDone = false): Promise<Record<string, unknown>> {
    for (let failures = 0; ; ) {
      const outcome = await request(url, init);
      if (outcome.kind === "ok") return outcome.body;
      if (outcome.kind === "gone") throw new UploadGone(outcome.message);
      if (outcome.kind === "missing") {
        if (missingIsDone && failures > 0) return {};
        throw new ApiError(outcome.message, 404);
      }
      failures += 1;
      await backOff(failures);
    }
  }

  /** Cuántos trozos tiene ya una subida anterior, o `null` si ya no existe. */
  async function resumePoint(sessionUrl: string): Promise<number | null> {
    for (let failures = 0; ; ) {
      const outcome = await request(sessionUrl, { method: "GET" });
      if (outcome.kind === "ok") {
        const received = Number(outcome.body.received);
        return Number.isSafeInteger(received) && received >= 0 ? received : 0;
      }
      if (outcome.kind === "gone" || outcome.kind === "missing") return null;
      failures += 1;
      await backOff(failures);
    }
  }

  async function uploadOnce(resume: UploadSession | undefined): Promise<void> {
    let session = resume;
    let index = 0;
    if (session) {
      const received = await resumePoint(`${base}/${encodeURIComponent(session.uploadId)}`);
      if (received === null) session = undefined;
      else index = received;
    }
    if (!session) {
      const started = await withRetries(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, totalBytes: file.size }),
      });
      session = { uploadId: String(started.uploadId), chunkBytes: Number(started.chunkBytes) };
      opts.onSession?.(session);
    }
    const { uploadId, chunkBytes } = session;
    const sessionUrl = `${base}/${encodeURIComponent(uploadId)}`;
    const total = Math.ceil(file.size / chunkBytes);
    index = Math.min(index, total);
    report(index / total);

    let failures = 0;
    while (index < total) {
      const chunk = file.slice(index * chunkBytes, Math.min(file.size, (index + 1) * chunkBytes));
      const sent = await request(
        `${sessionUrl}?indice=${index}`,
        { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk },
        true,
      );
      if (sent.kind === "gone") throw new UploadGone(sent.message);
      if (sent.kind === "missing") throw new ApiError(sent.message, 404);
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
      if (progress.kind === "missing") throw new ApiError(progress.message, 404);
      if (progress.kind === "ok") {
        const received = Number(progress.body.received);
        if (Number.isSafeInteger(received) && received >= 0 && received <= total) {
          if (received > index) failures = 0;
          index = received;
        }
      }
    }

    await withRetries(sessionUrl, { method: "POST" }, true);
    report(1);
  }

  for (let restarted = false; ; restarted = true) {
    try {
      await uploadOnce(restarted ? undefined : opts.resume);
      return;
    } catch (error) {
      if (!(error instanceof UploadGone)) throw error;
      if (restarted) throw new ApiError(error.message, 410);
    }
  }
}
