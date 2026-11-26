import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor } from "@/server/products";
import { getVideoFor, requireVideoOwner } from "@/server/videos/videos";
import { rejectRound, requestGeneration, SYSTEM_REJECT_PREFIX, type GenDeps } from "@/server/videos/generations";
import { ALREADY_RUNNING, queueEdit } from "@/server/videos/edits";
import { MAX_UPSCALE_ATTEMPTS } from "@/server/videos/lote";
import { getBatchFor } from "@/server/videos/batches";

/** Solo la tarjeta del dueño inicia esta excepción; el avance automático no la solicita. */
export async function redoFromCard(user: AuthUser, batchId: number, videoId: number, kind: unknown, reason: string, deps: GenDeps = {}) {
  if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño puede rehacer a mano.");
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (video.batchId !== batchId) throw new HttpError(404, "Vídeo fuera del lote.");
  if (kind !== "frame" && kind !== "clip") throw new HttpError(400, "Elige imagen o vídeo.");
  if (video.ownerRedo) throw new HttpError(409, "Ya hay una petición manual en marcha.");
  if (kind === "clip" && !video.approvedFrameResultId) throw new HttpError(409, "Aprueba primero la imagen.");
  const all = await getDb().select().from(schema.generations).where(eq(schema.generations.videoId, videoId)).orderBy(asc(schema.generations.id));
  if (all.some((g) => ["intent", "submitting", "submitted", "unknown"].includes(g.status))) throw new HttpError(409, "Ya hay una generación en marcha.");
  const last = all.filter((g) => g.kind === kind).at(-1);
  if (!last) throw new HttpError(409, "Todavía no hay una ronda que rehacer.");
  // El rechazo y la intención manual quedan bajo el mismo cerrojo que las generaciones.
  await rejectRound(user, videoId, kind, reason, { guard: async (tx) => {
    const [current] = await tx.select().from(schema.videos).where(eq(schema.videos.id, videoId));
    if (current.ownerRedo) throw new HttpError(409, "Ya hay una petición manual en marcha.");
    const active = await tx.select().from(schema.generations).where(eq(schema.generations.videoId, videoId));
    if (active.some((g) => ["intent", "submitting", "submitted", "unknown"].includes(g.status))) throw new HttpError(409, "Ya hay una generación en marcha.");
    if (kind === "frame") {
      const clip = active.filter((g) => g.kind === "clip").at(-1);
      if (clip && !clip.rejectReason) await tx.update(schema.generations).set({ rejectReason: `${SYSTEM_REJECT_PREFIX}apertura rehecha por el dueño` }).where(eq(schema.generations.id, clip.id));
      await tx.delete(schema.videoPinterestRefs).where(and(eq(schema.videoPinterestRefs.videoId, videoId), eq(schema.videoPinterestRefs.tramo, 0)));
    }
    // Un montaje anterior en cola o trabajando ya no puede publicar el clip sustituido.
    await tx.update(schema.editRuns).set({ status: "failed", error: "Sustituido por la petición manual del dueño.", finishedAt: new Date() })
      .where(and(eq(schema.editRuns.videoId, videoId), inArray(schema.editRuns.status, ["queued", "running"])));
    await tx.update(schema.videos).set({ ownerRedo: { kind, afterId: last.id }, autoSkipped: false, autoStop: null,
      ...(kind === "frame" ? { approvedFrameResultId: null } : {}),
      approvedClipResultId: null, editStatus: null, editRunId: null, updatedAt: new Date() }).where(eq(schema.videos.id, videoId));
  } });
  const batch = await getBatchFor(user, batchId);
  const maxPause = batch.status === "pausado" && batch.pause?.videoId === videoId && batch.pause.reason.includes("llegado al máximo");
  if (maxPause || ["listo", "montado"].includes(batch.status)) {
    await getDb().update(schema.batches).set({ status: kind === "frame" ? "imagenes" : "clips", pause: null }).where(and(eq(schema.batches.id, batchId), eq(schema.batches.status, batch.status), batch.pause ? eq(schema.batches.pause, batch.pause) : isNull(schema.batches.pause)));
  }
  await advanceOwnerRedo(videoId, deps);
}

/** Peticiones persistidas: Pinterest → imagen → revisión normal; clip → Topaz → montaje. */
export async function advanceOwnerRedo(videoId: number, deps: GenDeps = {}) {
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video?.ownerRedo) return;
  const user = await getActiveUser(video.createdBy);
  if (!user || user.role !== "dueno") return;
  const pending = video.ownerRedo;
  const rows = await getDb().select().from(schema.generations).where(eq(schema.generations.videoId, videoId)).orderBy(asc(schema.generations.id));
  const generation = rows.find((g) => g.id > pending.afterId && g.kind === pending.kind);
  try {
    if (!generation) {
      await requestGeneration(user, videoId, pending.kind, { expectedCredits: Number.MAX_SAFE_INTEGER, ownerOverride: true }, deps);
      return;
    }
    if (["failed", "not_sent"].includes(generation.status)) {
      await getDb().update(schema.videos).set({ ownerRedo: null, autoStop: generation.error }).where(eq(schema.videos.id, videoId));
      return;
    }
    if (generation.status !== "done") return;
    if (pending.kind === "frame") {
      await getDb().update(schema.videos).set({ ownerRedo: null }).where(eq(schema.videos.id, videoId));
      return;
    }
    const upscales = rows.filter((g) => g.id > generation.id && g.kind === "upscale");
    const upscale = upscales.at(-1);
    const failed = upscales.filter((g) => ["failed", "not_sent"].includes(g.status)).length;
    const retry = upscale && ["failed", "not_sent"].includes(upscale.status) && failed < MAX_UPSCALE_ATTEMPTS;
    if (!upscale || retry) {
      // Igual que el lote: esperar las generaciones que aún pueden llegar tarde.
      if (upscale?.recheckUntil && upscale.recheckUntil > new Date()) return;
      const old = rows.filter((g) => g.kind === "upscale").at(-1);
      if (old && !old.rejectReason) await rejectRound(user, videoId, "upscale", `${SYSTEM_REJECT_PREFIX}clip rehecho por el dueño`);
      await requestGeneration(user, videoId, "upscale", { expectedCredits: Number.MAX_SAFE_INTEGER, ownerOverride: true }, deps);
      return;
    }
    if (upscale.status !== "done" && failed < MAX_UPSCALE_ATTEMPTS) return;
    if (video.editStatus === null) await queueEdit(video, await getProductFor(user, video.productId), user.id, new Date(), { ownerOverride: true });
    if (video.editStatus === "hecho" || video.editStatus === "fallido") await getDb().update(schema.videos).set({ ownerRedo: null }).where(eq(schema.videos.id, videoId));
  } catch (error) {
    if (error instanceof HttpError && error.message === ALREADY_RUNNING) return;
    if (error instanceof HttpError && /Buscando referencias de Pinterest|No se encontraron referencias de Pinterest|Ya hay/.test(error.message)) return;
    await getDb().update(schema.videos).set({ ownerRedo: null, autoStop: error instanceof Error ? error.message : "No se pudo rehacer." }).where(eq(schema.videos.id, videoId));
    throw error;
  }
}

export async function sweepOwnerRedos(deps: GenDeps = {}) {
  const rows = await getDb().select({ id: schema.videos.id }).from(schema.videos).where(isNotNull(schema.videos.ownerRedo));
  for (const row of rows) {
    try { await advanceOwnerRedo(row.id, deps); } catch (error) { console.error(`[videos] Rehacer ${row.id}:`, error); }
  }
}
