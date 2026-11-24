import fs from "node:fs/promises";
import { and, eq, ne, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import { HttpError } from "@/server/http";
import { appendTaskFileChunk, completeTaskFile, openSongUpload, removeSongFile } from "@/server/song-downloads";
import { CHUNK_BYTES } from "@/server/videos/upload";
import { z } from "zod";
import { nextPublicationSlot } from "@/server/videos/publications";
const tasks = schema.agentTasks;
const MAX = 4 * 1024 * 1024;
export interface ClaimedPhoneTask {
  taskId: number; kind: "phone_publish"; uploadId: string; chunkBytes: number; maxBytes: number;
  phoneId: number; wdaUrl: string | null; videoId: number; network: "instagram" | "facebook"; account: string; description: string; url: string;
}
export async function claimPhoneTask(id: number, queued: SQL | undefined, lease: PgUpdateSetSource<typeof tasks>): Promise<ClaimedPhoneTask | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(824119)`);
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), queued)).for("update", { skipLocked: true });
    if (!task) return null;
    const [pub] = await tx.select().from(schema.publications).where(eq(schema.publications.agentTaskId, id));
    if (!pub) return null;
    const [phone] = await tx.select().from(schema.phones).where(eq(schema.phones.id, pub.phoneId));
    if (phone.paused) return null;
    // Recomprueba el ritmo al ejecutar: un Mac apagado no debe vaciar días de cola en minutos.
    const now = new Date();
    const previous = await tx.select({ at: schema.publications.startedAt }).from(schema.publications).where(and(
      eq(schema.publications.network, pub.network), eq(schema.publications.account, pub.account),
      pub.account ? undefined : eq(schema.publications.phoneId, pub.phoneId),
      ne(schema.publications.id, pub.id), isNotNull(schema.publications.startedAt),
    ));
    const slot = nextPublicationSlot(previous.map(p => p.at!), now, pub.gapHours);
    if (slot.getTime() > now.getTime()) {
      await tx.update(tasks).set({ availableAt: slot }).where(eq(tasks.id, id));
      await tx.update(schema.publications).set({ scheduledFor: slot }).where(eq(schema.publications.id, pub.id));
      return null;
    }
    const { uploadId } = await openSongUpload(tx, id);
    await tx.update(tasks).set(lease).where(eq(tasks.id, id));
    await tx.update(schema.publications).set({ startedAt: new Date() }).where(eq(schema.publications.id, pub.id));
    await tx.update(schema.phones).set({ activity: `Publicando vídeo ${pub.videoId} en ${pub.network === "instagram" ? "Instagram" : "Facebook"}…` }).where(eq(schema.phones.id, phone.id));
    return { taskId: id, kind: "phone_publish", uploadId, chunkBytes: CHUNK_BYTES, maxBytes: MAX, phoneId: phone.id, wdaUrl: phone.wdaUrl, videoId: pub.videoId, network: pub.network, account: pub.account, description: pub.description, url: `/api/agente/tareas/${id}/video-publicacion` };
  });
}
export function appendPhoneChunk(id: number, uploadId: string, index: number, bytes: Buffer) {
  return appendTaskFileChunk(id, "phone_publish", uploadId, index, bytes, { maxBytes: MAX, accepts: (head) => head[0] === 123, badType: "Resultado no válido.", tooBig: "La captura pesa demasiado." });
}
const outcome = z.object({ ok: z.boolean(), code: z.number().int(), error: z.string().max(2000).optional(), resultUrl: z.url().optional(), screenshot: z.string().max(MAX).optional() });
export async function finishPhoneTask(agentId: number, id: number, result: { ok: boolean; uploadId: string; totalBytes?: number; error?: string }, now: Date) {
  const [task] = await getDb().select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.agentId, agentId), eq(tasks.uploadId, result.uploadId), eq(tasks.status, "leased")));
  if (!task) throw new HttpError(409, "Esta tarea ya no es tuya.");
  try {
    const file = result.ok ? await completeTaskFile(result.uploadId, task.uploadReceived, result.totalBytes ?? 0, MAX) : null;
    const data = file ? outcome.parse(JSON.parse(await fs.readFile(file, "utf8"))) : { ok: false, code: -1, error: result.error ?? "El Mac perdió la publicación." };
    const screenshot = data.screenshot ? Buffer.from(data.screenshot, "base64") : null;
    await getDb().transaction(async (tx) => {
      const changed = await tx.update(tasks).set({ status: data.ok ? "done" : "failed", error: data.error ?? null, leaseExpiresAt: null, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.status, "leased"), eq(tasks.uploadId, result.uploadId))).returning();
      if (!changed.length) throw new HttpError(409, "Esta tarea ya no es tuya.");
      const [pub] = await tx.select({phoneId: schema.publications.phoneId}).from(schema.publications).where(eq(schema.publications.agentTaskId, id));
      if (pub) await tx.update(schema.phones).set({activity:"Esperando"}).where(eq(schema.phones.id,pub.phoneId));
      await tx.update(schema.publications).set({ status: data.ok ? "publicada" : "fallida", resultUrl: data.resultUrl && /^https:\/\//.test(data.resultUrl) ? data.resultUrl : null, screenshot, error: data.ok ? null : `Código ${data.code}: ${data.error ?? "No se pudo publicar."}`, finishedAt: now }).where(eq(schema.publications.agentTaskId, id));
    });
  } finally { await removeSongFile(result.uploadId); }
}
export async function failPhoneTask(id: number, condition: SQL | undefined, reason: string, now: Date) {
  await getDb().transaction(async (tx) => {
    const changed = await tx.update(tasks).set({ status: "failed", error: reason, leaseExpiresAt: null, updatedAt: now }).where(and(eq(tasks.id, id), condition)).returning();
    if (changed.length) {
      const [pub] = await tx.update(schema.publications).set({ status: "fallida", error: reason, finishedAt: now }).where(eq(schema.publications.agentTaskId, id)).returning({phoneId:schema.publications.phoneId});
      if (pub) await tx.update(schema.phones).set({activity:"Esperando"}).where(eq(schema.phones.id,pub.phoneId));
    }
  });
}
export async function receiveScreen(raw: unknown) {
  const input = z.object({ phoneId: z.number().int().positive(), activity: z.string().max(200), screenshot: z.string().max(700_000).optional() }).parse(raw);
  const now = new Date();
  // El bucle de pantalla no pisa la actividad de una publicación reservada.
  await getDb().update(schema.phones).set({ lastSeenAt: now, activity: sql`case when exists (select 1 from publications where phone_id = ${input.phoneId} and status = 'publicando') then ${schema.phones.activity} else ${input.activity} end`, ...(input.screenshot ? { screenshot: Buffer.from(input.screenshot, "base64"), screenshotAt: now } : {}) }).where(eq(schema.phones.id, input.phoneId));
}
