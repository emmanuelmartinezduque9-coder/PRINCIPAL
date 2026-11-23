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
    // Una vez (23/11/2026): la imagen de prueba del método aprobado que el dueño aprobó para el vídeo 2
    // entra como candidata, sin gastar otra vez (ver `importar-imagen.ts`).
    void import("@/server/videos/importar-imagen")
      .then(({ importFrameCandidate }) =>
        importFrameCandidate(
          2,
          "https://d8j0ntlcm91z4.cloudfront.net/user_3K2PXlowqZBlWpF8Twpyltbd8YU/hf_20261123_052010_3d2e4e67-2ac6-45ee-9147-cd9badaf63df.png",
          "Prueba del método aprobado (orden de adjuntos de Codex, sala R33), aprobada por el dueño al verla",
        ),
      )
      .catch((error) => console.error("[imagen] No se pudo importar la imagen aprobada del vídeo 2:", error));
    // Una vez (23/11/2026): FalterPfote recibe su foto «funcionamiento» (alas de mariposa proyectadas)
    // y la imagen del vídeo 6 se rechaza para que el lote la regenere con ese efecto.
    void import("@/server/videos/importar-imagen")
      .then(({ ensureWorkingPhoto }) =>
        ensureWorkingPhoto(
          "FalterPfote",
          "activos/falterpfote/funcionamiento-c67c4de4926b8503.png",
          6,
          "Alas de mariposa de la foto de funcionamiento y producto nombrado sin marca (método aprobado), para que Higgsfield no lo bloquee",
        ),
      )
      .catch((error) => console.error("[imagen] No se pudo preparar la foto de funcionamiento de FalterPfote:", error));
    // Una vez (23/11/2026): la imagen del vídeo 6 con las alas de mariposa corregidas (segundo paso de
    // edición del efecto, revisada) entra como candidata para «Aprobar», sin gastar otra vez.
    void import("@/server/videos/importar-imagen")
      .then(({ importFrameCandidate }) =>
        importFrameCandidate(
          6,
          "https://d8j0ntlcm91z4.cloudfront.net/user_3K2PXlowqZBlWpF8Twpyltbd8YU/hf_20261123_171720_a0cf828e-aac8-498e-ba40-7cf395bfd6b0.png",
          "Alas de mariposa de la foto de funcionamiento (segundo paso de edición del efecto), revisada",
        ),
      )
      .catch((error) => console.error("[imagen] No se pudo importar la imagen corregida del vídeo 6:", error));
  },
  (error) => {
    // Sin cola no hay nada que hacer: se sale con error para que el servicio se reinicie.
    console.error(`[worker] No se pudo arrancar: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
