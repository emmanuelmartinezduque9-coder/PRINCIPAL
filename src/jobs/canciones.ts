import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { jobKey } from "@/jobs/steps";
import { CANCION_JOB, pendingSongVideos } from "@/server/videos/canciones";

/** Encola cada referencia una sola vez, también al recuperar referencias antiguas. */
export async function queuePendingSongs(): Promise<void> {
  for (const row of await pendingSongVideos()) {
    const identity = { videoId: row.id, referenceMediaId: row.referenceMediaId };
    const [existing] = await getDb().select({ key: schema.jobSteps.key }).from(schema.jobSteps)
      .where(eq(schema.jobSteps.key, jobKey(CANCION_JOB, row.userId, row.productId, identity)));
    if (!existing) await enqueueJob(CANCION_JOB, { userId: row.userId, productId: row.productId }, identity);
  }
}
