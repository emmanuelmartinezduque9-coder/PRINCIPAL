import { defineJob, defineSchedule } from "@/jobs/registry";
import { StepFailedError } from "@/jobs/steps";
import { probeConnections } from "@/server/higgsfield";
import { ANALYSIS_JOB, runAnalysis } from "@/server/videos/analysis";
import { FINALIZE_JOB, finalizeGeneration, SUBMIT_JOB, submitGeneration } from "@/server/videos/generations";
import { startBatchEdits } from "@/server/videos/edits";
import { ADVANCE_JOB, advanceBatch, onBatchReady } from "@/server/videos/lote";
import { advanceVideo, AUTO_JOB, kickVideo, kickVideoOfAnalysis, kickVideoOfGeneration } from "@/server/videos/autopilot";
import { afterFrameDone } from "@/server/videos/efecto";
import { processReference } from "@/server/videos/intake";
import { PINTEREST_JOB, runPinterest } from "@/server/videos/pinterest";
import { archiveSweep } from "@/server/videos/archive";
import { videoSweep } from "@/server/videos/sweep";
import { REFERENCE_JOB } from "@/server/videos/upload";

/**
 * Trabajos y tareas programadas de la producción de vídeo. Se importa en `src/worker/main.ts`
 * antes de arrancar la cola, y en las rutas que encolan (para que el trabajo esté definido).
 */

/** Con todos los clips del lote hechos, cada vídeo se monta en el Mac del dueño (`edits.ts`). */
onBatchReady((batchId) => startBatchEdits(batchId));

/** Cada 6 horas, una lectura de saldo por persona conectada (mide la duración del permiso; no gasta). */
defineSchedule("higgsfield.sonda", "0 */6 * * *", () => probeConnections());

/** Prepara el vídeo de referencia recién subido (fotogramas, cortes, recorte subido a Higgsfield). */
defineJob<{ videoId: number; uploadId: string }>(
  REFERENCE_JOB,
  async ({ videoId, uploadId }) => {
    if (typeof videoId !== "number" || typeof uploadId !== "string") throw new StepFailedError("Datos del trabajo no válidos.");
    await processReference(videoId, uploadId);
    // Con la referencia lista, el vídeo sigue solo (desglose y lo demás).
    await kickVideo(videoId);
  },
  "Preparar el vídeo de referencia",
);

/** Desglosa la referencia con Claude (planos, adaptación, riesgos y los dos prompts). */
defineJob<{ analysisId: number }>(
  ANALYSIS_JOB,
  async ({ analysisId }) => {
    if (typeof analysisId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await runAnalysis(analysisId);
    // Con el desglose hecho, la imagen se pide sola (vídeo suelto) o el lote sigue.
    await kickVideoOfAnalysis(analysisId);
  },
  "Desglosar el vídeo de referencia",
);

/**
 * Envía una generación a Higgsfield, una sola vez (sin `runStep` dentro: repetir sería cobrar dos
 * veces). Si el trabajo se repite, `submitGeneration` ya no encuentra la fila en `intent` y no hace nada.
 */
defineJob<{ generationId: number }>(
  SUBMIT_JOB,
  async ({ generationId }) => {
    if (typeof generationId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await submitGeneration(generationId);
  },
  "Enviar a Higgsfield",
);

/** Descarga los resultados de una generación terminada y hace sus miniaturas (con su propia reserva; no gasta). */
defineJob<{ generationId: number }>(
  FINALIZE_JOB,
  async ({ generationId }) => {
    if (typeof generationId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await finalizeGeneration(generationId);
    // Paso del efecto del producto (si hace falta) y su comprobación, antes de que siga el vídeo.
    await afterFrameDone(generationId);
    // El vídeo (o su lote) sigue sin esperar al seguimiento.
    await kickVideoOfGeneration(generationId);
  },
  "Guardar los resultados de Higgsfield",
);

/**
 * «Enviar lote»: avanza un lote que va solo (desgloses que faltan, imágenes, clips), como mucho 2
 * generaciones en marcha. Repetirlo no envía dos veces (ver `advanceBatch`).
 */
defineJob<{ batchId: number }>(
  ADVANCE_JOB,
  async ({ batchId }) => {
    if (typeof batchId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await advanceBatch(batchId);
  },
  "Avanzar el lote",
);

/**
 * Flujo automático de un vídeo suelto (`autopilot.ts`): pide lo siguiente que toque (desglose,
 * imagen, clip, montaje). Repetirlo no envía dos veces.
 */
defineJob<{ videoId: number }>(
  AUTO_JOB,
  async ({ videoId }) => {
    if (typeof videoId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await advanceVideo(videoId);
  },
  "Seguir con el vídeo",
);

/** Cada minuto: subidas abandonadas, referencias atascadas, desgloses que no terminan y generaciones en curso o en duda. */
defineSchedule("video.seguimiento", "* * * * *", () => videoSweep());

/**
 * Cada minuto: copia al almacén propio lo que haya generado Higgsfield y aún no esté (vídeos e
 * imágenes, con miniatura y vista ligera; `archive.ts`). Sin bucket configurado no hace nada.
 */
defineSchedule("medios.copia", "* * * * *", () => archiveSweep());

/**
 * Busca en Pinterest las referencias de la imagen inicial de un vídeo (regla fija del dueño: siempre,
 * salvo entorno puesto a mano): consultas, búsqueda (nube o Mac), elección con visión y guardado.
 */
defineJob<{ runId: number }>(
  PINTEREST_JOB,
  async ({ runId }) => {
    if (typeof runId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await runPinterest(runId);
  },
  "Buscar referencias en Pinterest",
);
