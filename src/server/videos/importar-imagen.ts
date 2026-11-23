import { and, desc, eq, inArray } from "drizzle-orm";
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
  const { SYSTEM_REJECT_PREFIX } = await import("@/server/videos/generations");
  await rejectFrame(owner, videoId, `${SYSTEM_REJECT_PREFIX}${reason}`.slice(0, 300));
  console.log(`[imagen] Vídeo ${videoId}: ronda ${round} rechazada para regenerarla (${reason}).`);
}

/**
 * Una vez (23/11/2026): la foto «funcionamiento» de FalterPfote (el perro con el collar
 * proyectando las alas de mariposa, asset del sistema anterior subido al almacén) entra en el
 * producto si aún no tiene ninguna con ese papel. Después se rehacen los prompts con sala de sus
 * vídeos y la última imagen del vídeo `videoId` (si no está aprobada ni rechazada) se rechaza con
 * `reason` para que el lote la regenere con el efecto correcto. Una sola vez: si ya hay una ronda
 * rechazada con `reason`, no hace nada más.
 */
export async function ensureWorkingPhoto(productName: string, objectKey: string, videoId: number, reason: string): Promise<void> {
  const { getObjectStore } = await import("@/lib/object-store");
  const { listProductsFor } = await import("@/server/products");
  const { addProductPhoto, listProductPhotos } = await import("@/server/photos");
  const owners = await getDb().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "dueno"));
  const owner = owners.length > 0 ? await getActiveUser(owners[0].id) : null;
  if (!owner) return;
  const product = (await listProductsFor(owner, "todos")).find((p) => p.name.toLowerCase() === productName.toLowerCase());
  if (!product) return;
  const photos = await listProductPhotos(owner, product.id);
  if (!photos.some((photo) => photo.role === "funcionamiento")) {
    const store = getObjectStore();
    if (!store) return;
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "activo-"));
    try {
      const file = path.join(dir, "funcionamiento.png");
      await store.download(objectKey, file);
      await addProductPhoto(owner, product.id, await fs.readFile(file), "funcionamiento");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
    console.log(`[imagen] ${product.name}: foto «funcionamiento» añadida.`);
  }
  const [done] = await getDb()
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), inArray(schema.generations.rejectReason, [reason, `Corrección automática: ${reason}`.slice(0, 300)])))
    .limit(1);
  if (done) return;
  // Los prompts con sala de sus vídeos se rehacen (ahora ven y citan la foto de funcionamiento).
  const videos = await getDb().select({ id: schema.videos.id }).from(schema.videos).where(eq(schema.videos.productId, product.id));
  for (const { id } of videos) await getDb().delete(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.videoId, id));
  const [last] = await getDb()
    .select({ round: schema.generations.round })
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, "frame")))
    .orderBy(desc(schema.generations.round))
    .limit(1);
  if (last) await rejectFrameOnce(videoId, last.round, reason);
}
