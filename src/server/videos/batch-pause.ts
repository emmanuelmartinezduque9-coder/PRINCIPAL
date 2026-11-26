import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { HttpError } from "@/server/http";

/** Una pausa de lote requiere reanudación explícita, también para trabajo ya encolado. */
export async function batchPaused(videoId: number): Promise<boolean> {
  const [row] = await getDb().select({ status: schema.batches.status }).from(schema.videos)
    .innerJoin(schema.batches, eq(schema.batches.id, schema.videos.batchId))
    .where(eq(schema.videos.id, videoId));
  return row?.status === "pausado";
}

export async function requireBatchRunning(videoId: number): Promise<void> {
  if (await batchPaused(videoId)) throw new HttpError(409, "El lote está en pausa.");
}

/** Solo el trabajo concreto pedido desde la tarjeta puede atravesar una pausa manual. */
export async function ownerRedoPending(videoId: number, kind: "frame" | "clip"): Promise<boolean> {
  const [video] = await getDb().select({ redo: schema.videos.ownerRedo }).from(schema.videos).where(eq(schema.videos.id, videoId));
  return video?.redo?.kind === kind;
}
