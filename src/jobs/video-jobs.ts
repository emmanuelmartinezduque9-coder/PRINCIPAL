import { defineJob, defineSchedule } from "@/jobs/registry";
import { StepFailedError } from "@/jobs/steps";
import { probeConnections } from "@/server/higgsfield";
import { processReference } from "@/server/videos/intake";
import { videoSweep } from "@/server/videos/sweep";
import { REFERENCE_JOB } from "@/server/videos/upload";

/**
 * Trabajos y tareas programadas de la producción de vídeo. Se importa en `src/worker/main.ts`
 * antes de arrancar la cola, y en las rutas que encolan (para que el trabajo esté definido).
 */

/** Cada 6 horas, una lectura de saldo por persona conectada (mide la duración del permiso; no gasta). */
defineSchedule("higgsfield.sonda", "0 */6 * * *", () => probeConnections());

/** Prepara el vídeo de referencia recién subido (fotogramas, cortes, recorte subido a Higgsfield). */
defineJob<{ videoId: number; uploadId: string }>(
  REFERENCE_JOB,
  async ({ videoId, uploadId }) => {
    if (typeof videoId !== "number" || typeof uploadId !== "string") throw new StepFailedError("Datos del trabajo no válidos.");
    await processReference(videoId, uploadId);
  },
  "Preparar el vídeo de referencia",
);

/** Cada minuto: subidas abandonadas y referencias atascadas. */
defineSchedule("video.seguimiento", "* * * * *", () => videoSweep());
