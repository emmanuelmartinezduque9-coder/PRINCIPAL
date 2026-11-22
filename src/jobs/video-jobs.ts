import { defineSchedule } from "@/jobs/registry";
import { probeConnections } from "@/server/higgsfield";

/**
 * Trabajos y tareas programadas de la producción de vídeo. Se importa en `src/worker/main.ts`
 * antes de arrancar la cola.
 */

/** Cada 6 horas, una lectura de saldo por persona conectada (mide la duración del permiso; no gasta). */
defineSchedule("higgsfield.sonda", "0 */6 * * *", () => probeConnections());
