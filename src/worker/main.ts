import { startWorker, stopWorker } from "@/jobs/boss";
import "@/jobs/system-check";
import "@/jobs/video-jobs";
import "@/jobs/product-jobs";
import "@/jobs/mejoras-jobs";
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
    // Una vez (24/11/2026): correcciones de Emmanuel a imágenes del lote 6.
    void import("@/server/videos/importar-imagen")
      .then(({ applyOwnerCorrections }) =>
        applyOwnerCorrections(6, [
          { videoId: 9, text: "Tiene que empezar igual que el fotograma de la referencia: el producto agarrado como si estuviera debajo del árbol de Navidad, que se entienda que es un regalo de Navidad." },
          { videoId: 18, text: "La mano agarra la nada. Como en la referencia: frente al escaparate con las cajas del producto, agarrando el producto, el cepillo rosa." },
          { videoId: 17, text: "El fondo no tiene nada que ver con el producto: tiene que ser dentro de una tienda Sephora de Alemania, con el cepillo rosa de verdad en la mano y sin franjas blancas." },
          { videoId: 16, text: "Tiene una franja blanca abajo y el cepillo sale oscuro: el cepillo tiene que ser el rosa del producto, imagen completa sin franjas, dentro de la tienda Sephora." },
        ]),
      )
      .catch((error) => console.error("[imagen] No se pudieron aplicar las correcciones del lote 6:", error));
    // Una vez (24/11/2026): en el lote 6, las imágenes que pedían una tienda concreta (dm, Sephora,
    // Lidl) salieron con un fondo del banco; se regeneran con el interior real de esa tienda.
    void import("@/server/videos/importar-imagen")
      .then(({ redoNamedStoreFrames }) => redoNamedStoreFrames(6, "El fondo tiene que ser la tienda que pide la tarjeta (su interior real), no un supermercado cualquiera"))
      .catch((error) => console.error("[imagen] No se pudieron rehacer las imágenes con tienda del lote 6:", error));
    // Una vez (24/11/2026): el vídeo 16 (Sephora) vuelve al lote con su prompt sin nombres de marca.
    void import("@/server/videos/importar-imagen")
      .then(({ bringBackBlocked }) => bringBackBlocked(16, "sin marcas"))
      .catch((error) => console.error("[imagen] No se pudo devolver el vídeo 16 al lote:", error));
    // Una vez (24/11/2026): los vídeos de los lotes de hoy ya montados se vuelven a montar con el doblaje por defecto.
    void import("@/server/videos/edits")
      .then(async ({ redubTodaysEdits, recheckDubbedEdits, remountDubbedWithoutEdit, relaunchEditsWithoutClaude, relaunchFailedEditsOnce, remountEditsOnce }) => {
        await redubTodaysEdits();
        // Una vez (24/11/2026): los montajes que fallaron o salieron sin leer la referencia por la API sin saldo.
        await relaunchEditsWithoutClaude();
        // Una vez (24/11/2026): los montajes fallidos del lote 6 (vídeos 15, 16 y 22), para ver su motivo en el registro.
        await relaunchFailedEditsOnce("montaje.relanzado-lote6-15-16-22-20261124", [15, 16, 22]);
        // Y otra vez el 16 (falló sin dejar resultado), ahora con cómo terminó el montador en el registro.
        await relaunchFailedEditsOnce("montaje.relanzado-lote6-16-salida-20261124", [16]);
        // Una vez: el 15 se vuelve a montar con los emojis arreglados (salía un recuadro en el primer rótulo).
        await remountEditsOnce("montaje.remontado-15-emojis-20261124", [15]);
        // TEMPORAL: enlaces para comprobar a mano el sonido y los rótulos de los ya montados.
        await (await import("@/server/videos/montaje-nube")).logVerifyLinks([15, 22]);
        // Y los doblados antes de la comprobación con Whisper (el vídeo 6 dejó una frase en inglés).
        await recheckDubbedEdits();
        // En cada arranque: los que tienen el doblaje hecho pero se quedaron sin montar (montaje cortado).
        await remountDubbedWithoutEdit();
      })
      .catch((error) => console.error("[montaje] No se pudieron volver a montar los vídeos de hoy para doblarlos:", error));
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
