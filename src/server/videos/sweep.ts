import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
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

export async function videoSweep(now: Date = new Date()): Promise<void> {
  try {
    await cleanStaleUploads(now);
  } catch (error) {
    console.error("[videos] No se pudieron limpiar las subidas antiguas:", error);
  }
  try {
    const stuck = await failStuckReferences(now);
    if (stuck > 0) console.warn(`[videos] ${stuck} referencia(s) llevaban más de una hora preparándose: quedan en error.`);
  } catch (error) {
    console.error("[videos] No se pudieron revisar las referencias atascadas:", error);
  }
}
