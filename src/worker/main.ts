import { startWorker, stopWorker } from "@/jobs/boss";
import "@/jobs/system-check";
import "@/jobs/video-jobs";

/**
 * Proceso en segundo plano: ejecuta los trabajos de la cola y las tareas programadas. Los módulos
 * que definen trabajos (`defineJob`) se importan aquí, antes de arrancar.
 */

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
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
  () => console.log("[worker] en marcha"),
  (error) => {
    // Sin cola no hay nada que hacer: se sale con error para que el servicio se reinicie.
    console.error(`[worker] No se pudo arrancar: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
