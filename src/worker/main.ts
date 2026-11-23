import { startWorker, stopWorker } from "@/jobs/boss";
import "@/jobs/system-check";
import "@/jobs/video-jobs";
import "@/jobs/product-jobs";
import { startEditLoop, stopEditLoop } from "@/server/videos/montaje-nube";

/**
 * Proceso en segundo plano: ejecuta los trabajos de la cola y las tareas programadas. Los módulos
 * que definen trabajos (`defineJob`) se importan aquí, antes de arrancar.
 */

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    // Los montajes en marcha vuelven a la cola para el proceso siguiente.
    await stopEditLoop();
    await stopWorker();
  } catch (error) {
    console.error(`[worker] No se pudo parar con limpieza: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log("[worker] detenido");
  process.exit(0);
}

process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

startWorker().then(
  () => {
    console.log("[worker] en marcha");
    startEditLoop();
    // TEMPORAL: volcado para comparar la imagen del vídeo 2 con el método anterior (se quita después).
    void import("@/server/videos/volcado-temporal")
      .then(({ dumpVideoForDebug }) => dumpVideoForDebug(2))
      .catch((error) => console.error("[depuracion] No se pudo volcar el vídeo 2:", error));
  },
  (error) => {
    // Sin cola no hay nada que hacer: se sale con error para que el servicio se reinicie.
    console.error(`[worker] No se pudo arrancar: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
