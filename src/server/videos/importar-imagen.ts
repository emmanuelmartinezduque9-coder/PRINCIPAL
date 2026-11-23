import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { makeThumbnail } from "@/server/media/ffmpeg";

/**
 * Mete en un vídeo, como candidata de imagen lista para «Aprobar», una imagen ya generada fuera de
 * la aplicación (la prueba del método aprobado del 23/11/2026, que el dueño aprobó al verla), sin
 * gastar otra vez. Se sube al Higgsfield de quien creó el vídeo para que el clip la pueda usar (su
 * identificador queda como `job_id` del resultado). Una sola vez por dirección.
 */
export async function importFrameCandidate(videoId: number, url: string, note: string): Promise<void> {
  const [already] = await getDb().select({ id: schema.generationResults.id }).from(schema.generationResults).where(eq(schema.generationResults.url, url));
  if (already) return;
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video || !(await getActiveUser(video.createdBy))) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`No se pudo bajar la imagen (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mediaId = await ensureMedia(video.createdBy, { bytes, filename: `imagen-aprobada-${videoId}.png`, contentType: "image/png", type: "image" });
  const thumb = await makeThumbnail(bytes, "image");
  const [last] = await getDb()
    .select({ round: schema.generations.round })
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, "frame")))
    .orderBy(desc(schema.generations.round))
    .limit(1);
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [generation] = await tx
      .insert(schema.generations)
      .values({
        videoId,
        kind: "frame",
        round: (last?.round ?? 0) + 1,
        status: "done",
        userId: video.createdBy,
        request: { importada: true, nota: note, url },
        count: 1,
        quotedCredits: 0,
        creditsSpent: 0,
        jobIds: [mediaId],
        intentAt: now,
        submittedAt: now,
        finishedAt: now,
      })
      .returning({ id: schema.generations.id });
    await tx
      .insert(schema.generationResults)
      .values({ generationId: generation.id, index: 0, jobId: mediaId, ok: true, url, thumbMime: "image/jpeg", thumb });
  });
  console.log(`[imagen] Vídeo ${videoId}: imagen importada como candidata (${note}).`);
}

/**
 * Una vez: rechaza la imagen de un vídeo (con su motivo) para que el lote la regenere solo con
 * las reglas nuevas. Solo si su última ronda es `round`, está hecha, sin rechazar y sin aprobar.
 */
export async function rejectFrameOnce(videoId: number, round: number, reason: string): Promise<void> {
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video || video.approvedFrameResultId !== null) return;
  const [last] = await getDb()
    .select({ round: schema.generations.round, status: schema.generations.status, rejectReason: schema.generations.rejectReason })
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, "frame")))
    .orderBy(desc(schema.generations.round))
    .limit(1);
  if (!last || last.round !== round || last.status !== "done" || last.rejectReason !== null) return;
  const owner = await getActiveUser(video.createdBy);
  if (!owner) return;
  const { rejectFrame } = await import("@/server/videos/frame");
  await rejectFrame(owner, videoId, reason);
  console.log(`[imagen] Vídeo ${videoId}: ronda ${round} rechazada para regenerarla (${reason}).`);
}
