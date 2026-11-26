import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { jobKey } from "@/jobs/steps";
import { CANCION_JOB, pendingSongVideos } from "@/server/videos/canciones";

/** Un intento fallido (p. ej. esperando al desglose) se vuelve a encolar pasado este tiempo. */
export const SONG_RETRY_MS = 5 * 60_000;

/**
 * Encola cada vídeo de canción que aún no tiene la suya. Uno en cola o en marcha no se repite;
 * uno terminado sin canción enlazada (se quitó para rehacerla) o uno fallido hace un rato, sí:
 * los pasos ya confirmados no se repiten, así que no se paga dos veces lo que ya salió bien.
 */
export async function queuePendingSongs(now: Date = new Date()): Promise<void> {
  for (const row of await pendingSongVideos()) {
    const identity = { videoId: row.id, referenceMediaId: row.referenceMediaId };
    const [existing] = await getDb().select({ status: schema.jobSteps.status, finishedAt: schema.jobSteps.finishedAt, updatedAt: schema.jobSteps.updatedAt })
      .from(schema.jobSteps)
      .where(eq(schema.jobSteps.key, jobKey(CANCION_JOB, row.userId, row.productId, identity)));
    const last = existing?.finishedAt ?? existing?.updatedAt;
    const retry = existing?.status === "done" || (existing?.status === "failed" && (!last || now.getTime() - last.getTime() >= SONG_RETRY_MS));
    if (!existing || retry) await enqueueJob(CANCION_JOB, { userId: row.userId, productId: row.productId }, identity);
  }
}
