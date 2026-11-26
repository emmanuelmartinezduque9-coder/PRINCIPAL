import { sweepOwnerRedos } from "@/server/videos/owner-redo";
import { sweepPublications } from "@/server/videos/publications";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { expireLeases } from "@/server/agent";
import { ANALYSIS_INTERRUPTED, ANALYSIS_STALE_MS, autoAnalyzePending, failOrphanedPausedAnalyses } from "@/server/videos/analysis";
import { settleEditedBatches } from "@/server/videos/edits";
import { sweepGenerations, type GenDeps } from "@/server/videos/generations";
import { advanceRunningBatches } from "@/server/videos/lote";
import { advanceSoloVideos } from "@/server/videos/autopilot";
import { sweepPinterest } from "@/server/videos/pinterest";
import { cleanStaleUploads, PREPARE_FAILED } from "@/server/videos/upload";

/**
 * Seguimiento de los vídeos (tarea programada `video.seguimiento`, cada minuto). Cada parte va en
 * su propio `try`: si una falla, las demás se hacen igual y la siguiente pasada lo vuelve a intentar.
 */

/** Una referencia que lleva más que esto «preparándose» se da por perdida. */
const STUCK_PROCESSING_MS = 60 * 60 * 1000;

/** Las referencias que llevan más de una hora preparándose pasan a error. Devuelve cuántas. */
async function failStuckReferences(now: Date): Promise<number> {
  const rows = await getDb()
    .update(schema.videos)
    .set({ referenceStatus: "failed", referenceError: PREPARE_FAILED, updatedAt: now })
    .where(
      and(eq(schema.videos.referenceStatus, "processing"), lt(schema.videos.updatedAt, new Date(now.getTime() - STUCK_PROCESSING_MS))),
    )
    .returning({ id: schema.videos.id });
  return rows.length;
}

/**
 * Los desgloses en cola o en marcha sin novedades desde hace más de una hora pasan a error (la
 * cola ya los habrá reintentado). Los que están en pausa por el tope esperan saldo. Devuelve cuántos.
 */
async function failStaleAnalyses(now: Date): Promise<number> {
  const rows = await getDb()
    .update(schema.videoAnalyses)
    .set({ status: "failed", error: ANALYSIS_INTERRUPTED, updatedAt: now })
    .where(
      and(
        inArray(schema.videoAnalyses.status, ["queued", "running"]),
        lt(schema.videoAnalyses.updatedAt, new Date(now.getTime() - ANALYSIS_STALE_MS)),
      ),
    )
    .returning({ id: schema.videoAnalyses.id });
  return rows.length;
}

export async function videoSweep(now: Date = new Date(), deps: GenDeps = {}): Promise<void> {
  try { await sweepPublications(now); } catch (error) { console.error("[moviles] No se pudo avanzar la cola:", error); }
  try {
    await sweepGenerations({ now: () => now, ...deps });
  } catch (error) {
    console.error("[videos] No se pudieron revisar las generaciones:", error);
  }
  try {
    await cleanStaleUploads(now);
  } catch (error) {
    console.error("[videos] No se pudieron limpiar las subidas antiguas:", error);
  }
  try {
    await expireLeases(now);
  } catch (error) {
    console.error("[videos] No se pudieron revisar las tareas del Mac:", error);
  }
  try {
    const stuck = await failStuckReferences(now);
    if (stuck > 0) console.warn(`[videos] ${stuck} referencia(s) llevaban más de una hora preparándose: quedan en error.`);
  } catch (error) {
    console.error("[videos] No se pudieron revisar las referencias atascadas:", error);
  }
  try {
    const stale = await failStaleAnalyses(now);
    if (stale > 0) console.warn(`[videos] ${stale} desglose(s) llevaban más de una hora sin terminar: quedan en error.`);
  } catch (error) {
    console.error("[videos] No se pudieron revisar los desgloses atascados:", error);
  }
  try {
    await autoAnalyzePending();
  } catch (error) {
    console.error("[videos] No se pudieron pedir los desgloses automáticos:", error);
  }
  try {
    await sweepPinterest(now);
  } catch (error) {
    console.error("[videos] No se pudieron revisar las búsquedas de Pinterest:", error);
  }
  try {
    await sweepOwnerRedos(deps);
    await advanceRunningBatches(deps);
  } catch (error) {
    console.error("[videos] No se pudieron avanzar los lotes:", error);
  }
  try {
    await advanceSoloVideos(now, deps);
  } catch (error) {
    console.error("[videos] No se pudieron avanzar los vídeos sueltos:", error);
  }
  try {
    await settleEditedBatches();
  } catch (error) {
    console.error("[videos] No se pudieron cerrar los lotes montados:", error);
  }
  try {
    const orphaned = await failOrphanedPausedAnalyses();
    if (orphaned > 0) console.warn(`[videos] ${orphaned} desglose(s) en pausa ya no se podían reanudar: quedan en error.`);
  } catch (error) {
    console.error("[videos] No se pudieron revisar los desgloses en pausa:", error);
  }
}
