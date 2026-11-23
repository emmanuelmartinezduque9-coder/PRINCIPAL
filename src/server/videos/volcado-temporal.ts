import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getObjectStore } from "@/lib/object-store";
import { getActiveUser } from "@/server/auth";
import { readAvatarImage } from "@/server/avatars";
import { readProductPhoto } from "@/server/photos";
import { imageManifest } from "@/server/videos/manifest";
import { readPinterestImage } from "@/server/videos/pinterest";
import { manifestRefsFor, readVideoFrame } from "@/server/videos/videos";

/**
 * TEMPORAL (23/11/2026, se quita en cuanto se haya leído): deja en el almacén, en
 * `depuracion/video-<id>/`, los prompts de imagen que se enviaron de verdad, el desglose y los
 * archivos de cada referencia con su papel, para comparar con el método del sistema anterior sin
 * acceso a la base de datos. Sin datos personales ni enlaces firmados.
 */
export async function dumpVideoForDebug(videoId: number): Promise<void> {
  const store = getObjectStore();
  if (!store) return;
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video) return;
  const user = await getActiveUser(video.createdBy);
  if (!user) return;
  const base = `depuracion/video-${videoId}`;
  const gens = await getDb()
    .select({ round: schema.generations.round, status: schema.generations.status, request: schema.generations.request, createdAt: schema.generations.intentAt })
    .from(schema.generations)
    .where(eq(schema.generations.videoId, videoId))
    .orderBy(asc(schema.generations.id));
  const analyses = await getDb()
    .select({ version: schema.videoAnalyses.version, status: schema.videoAnalyses.status, result: schema.videoAnalyses.result })
    .from(schema.videoAnalyses)
    .where(eq(schema.videoAnalyses.videoId, videoId));
  const manifest = imageManifest(video, await manifestRefsFor(user, video));
  const json = { video: { id: video.id, kind: video.kind, note: video.note, adaptation: video.adaptation, imagePrompt: video.imagePrompt }, manifest, generations: gens, analyses };
  await store.putBuffer(`${base}/datos.json`, Buffer.from(JSON.stringify(json, null, 2)), { contentType: "application/json" });
  for (const item of manifest) {
    const s = item.source;
    let file: { data: Buffer } | null = null;
    if (s.kind === "reference_frame") file = await readVideoFrame(user, video.id, 0);
    else if (s.kind === "photo") file = await readProductPhoto(user, s.photoId);
    else if (s.kind === "avatar") file = await readAvatarImage(s.avatarId);
    else if (s.kind === "pinterest") file = await readPinterestImage(s.sha256);
    if (file) await store.putBuffer(`${base}/image-${item.index}-${item.role}.jpg`, file.data, { contentType: "image/jpeg" });
  }
  console.log(`[depuracion] Vídeo ${videoId} volcado en ${base}/ (${gens.length} generaciones, ${manifest.length} referencias).`);
}
