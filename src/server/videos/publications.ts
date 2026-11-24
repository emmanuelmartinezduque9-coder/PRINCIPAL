import { and, asc, desc, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { textPart } from "@/llm/content";
import { getGateway } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, productDelegation, productNamesByIds } from "@/server/products";
import { getVideoFor } from "@/server/videos/videos";
import { requestEditChange } from "@/server/videos/cambio-montaje";
import { marketOf } from "@/server/videos/localization";
import { getBatchFor } from "@/server/videos/batches";
import { macOwnerId } from "@/server/agent-tasks";

const berlinDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
/** Separación por defecto entre dos vídeos de la misma cuenta (orden de Emmanuel, 24/11/2026). */
export const DEFAULT_GAP_HOURS = 3;
/** Primer instante libre (máximo 2 al día por cuenta y `gapHours` entre vídeos), incluso en los cambios de hora de Berlín. */
export function nextPublicationSlot(booked: Date[], now: Date, gapHours = DEFAULT_GAP_HOURS): Date {
  const GAP = gapHours * 60 * 60_000;
  let candidate = new Date(now);
  for (;;) {
    const day = berlinDay(candidate);
    const sameDay = booked.filter((d) => berlinDay(d) === day);
    if (sameDay.length >= 2) {
      do { candidate = new Date(candidate.getTime() + 60_000); } while (berlinDay(candidate) === day);
      candidate.setUTCSeconds(0, 0);
      continue;
    }
    const conflict = booked.find((d) => Math.abs(d.getTime() - candidate.getTime()) < GAP);
    if (conflict) { candidate = new Date(conflict.getTime() + GAP); continue; }
    return candidate;
  }
}
export async function approveEdit(user: AuthUser, videoId: number) {
  const video = await getVideoFor(user, videoId);
  const product = await getProductFor(user, video.productId);
  if (!product.phoneId) throw new HttpError(400, "Este producto no está delegado a un móvil.");
  if (video.editReview !== "pendiente" || video.editStatus !== "hecho") return;
  const [edit] = await getDb().select({ id: schema.edits.id }).from(schema.edits).where(eq(schema.edits.videoId, videoId)).orderBy(desc(schema.edits.version)).limit(1);
  if (!edit) throw new HttpError(400, "El vídeo aún no está montado.");
  const answer = await getGateway().call<{ text: string }>({
    tier: "small", stepKey: `publicacion:${edit.id}`, userId: user.id, productId: product.id, rules: [],
    instructions: "Escribe una descripción orgánica de 2–4 líneas con CTA para comentar y 5–10 hashtags del nicho. Usa exclusivamente el idioma indicado. No nombres marcas ajenas, tiendas ni competidores: la única marca permitida es el nombre del producto. No inventes precios ni promesas. Devuelve {text}.",
    content: [textPart(JSON.stringify({ producto: product.name, descripcion: product.summary, idioma: product.language, pais: marketOf(product).countryLocal, nicho: product.niche }))],
    maxTokens: 700, schema: z.object({ text: z.string().trim().min(1).max(2200) }),
  });
  if (!answer.data?.text) throw new Error("No se pudo preparar la descripción.");
  await getDb().transaction(async (tx) => {
    // Serializa el calendario de todas las cuentas, también si comparten distintos móviles.
    await tx.execute(sql`select pg_advisory_xact_lock(824119)`);
    const assigned = (await productDelegation(product.id))!;
    if (assigned.phoneId !== product.phoneId || assigned.instagramAccount !== product.instagramAccount || assigned.facebookAccount !== product.facebookAccount || assigned.publishGapHours !== product.publishGapHours) throw new HttpError(409, "Las cuentas han cambiado; vuelve a aprobar el vídeo.");
    const [current] = await tx.select().from(schema.videos).where(eq(schema.videos.id, videoId)).for("update");
    const [latest] = await tx.select({ id: schema.edits.id }).from(schema.edits).where(eq(schema.edits.videoId, videoId)).orderBy(desc(schema.edits.version)).limit(1);
    if (current.editReview !== "pendiente" || current.editStatus !== "hecho" || latest?.id !== edit.id) return;
    for (const network of ["instagram", "facebook"] as const) {
      const account = (network === "instagram" ? product.instagramAccount : product.facebookAccount) ?? "";
      // Una cuenta vacía identifica la abierta en ese móvil, sin mezclar otros teléfonos.
      const rows = await tx.select({ at: schema.publications.scheduledFor }).from(schema.publications).where(and(eq(schema.publications.network, network), eq(schema.publications.account, account), account ? undefined : eq(schema.publications.phoneId, product.phoneId!), ne(schema.publications.status, "cancelada")));
      await tx.insert(schema.publications).values({ videoId, editId: edit.id, phoneId: product.phoneId!, network, account, description: answer.data!.text, gapHours: product.publishGapHours, scheduledFor: nextPublicationSlot(rows.map((r) => r.at), new Date(), product.publishGapHours) }).onConflictDoNothing();
    }
    await tx.update(schema.videos).set({ editReview: "aprobado", editReviewReason: null }).where(eq(schema.videos.id, videoId));
  });
}
export async function approveEdits(user: AuthUser, batchId: number) {
  await getBatchFor(user, batchId);
  const rows = await getDb().select({ id: schema.videos.id, productId: schema.videos.productId }).from(schema.videos).where(and(eq(schema.videos.batchId, batchId), eq(schema.videos.editReview, "pendiente")));
  // Autoriza el lote completo antes de iniciar las llamadas; solo los vídeos de productos delegados.
  const delegated: number[] = [];
  for (const row of rows) {
    await getVideoFor(user, row.id);
    if ((await getProductFor(user, row.productId)).phoneId) delegated.push(row.id);
  }
  for (const id of delegated) await approveEdit(user, id);
}
export async function rejectEdit(user: AuthUser, videoId: number, reason: string) {
  const video = await getVideoFor(user, videoId);
  const product = await getProductFor(user, video.productId);
  if (!product.phoneId || video.editReview !== "pendiente") throw new HttpError(409, "Este vídeo no está pendiente de revisión.");
  if (!reason.trim()) throw new HttpError(400, "Escribe qué quieres cambiar.");
  const changed = await getDb().update(schema.videos).set({ editReview: "rechazado", editReviewReason: reason.trim() }).where(and(eq(schema.videos.id, videoId), eq(schema.videos.editReview, "pendiente"))).returning({ id: schema.videos.id });
  if (!changed.length) throw new HttpError(409, "Este vídeo ya se ha revisado.");
  try { await requestEditChange(user, videoId, reason); }
  catch (error) {
    await getDb().update(schema.videos).set({ editReview: "pendiente", editReviewReason: null }).where(and(eq(schema.videos.id, videoId), eq(schema.videos.editReview, "rechazado")));
    throw error;
  }
}
export async function sweepPublications(now = new Date()) {
  const owner = await macOwnerId();
  if (owner === null) return;
  await getDb().transaction(async (tx) => {
    const phones = await tx.select().from(schema.phones).where(eq(schema.phones.paused, false)).for("update", { skipLocked: true });
    for (const phone of phones) {
      // Una reserva perdida nunca vuelve a publicar: se desconoce si llegó a enviar.
      const active = await tx.select().from(schema.publications).where(and(eq(schema.publications.phoneId, phone.id), eq(schema.publications.status, "publicando")));
      if (active.length) {
        for (const pub of active) {
          const [task] = pub.agentTaskId ? await tx.select().from(schema.agentTasks).where(eq(schema.agentTasks.id, pub.agentTaskId)) : [];
          if (!task || ["failed", "cancelled"].includes(task.status)) await tx.update(schema.publications).set({ status: "fallida", error: task?.error ?? "Se perdió la reserva del Mac.", finishedAt: now }).where(eq(schema.publications.id, pub.id));
        }
        continue;
      }
      const [pub] = await tx.select().from(schema.publications).where(and(eq(schema.publications.phoneId, phone.id), eq(schema.publications.status, "en_cola"), lte(schema.publications.scheduledFor, now))).orderBy(asc(schema.publications.scheduledFor), asc(schema.publications.id)).limit(1);
      if (!pub) continue;
      const [task] = await tx.insert(schema.agentTasks).values({ kind: "phone_publish", createdBy: owner, url: "phone", payload: { publicationId: pub.id, phoneId: phone.id } }).returning();
      await tx.update(schema.publications).set({ status: "publicando", agentTaskId: task.id }).where(eq(schema.publications.id, pub.id));
    }
  });
}
export async function publicationsForPhone(phoneId: number) {
  const rows = await getDb()
    .select({ id: schema.publications.id, videoId: schema.publications.videoId, productId: schema.videos.productId, network: schema.publications.network, account: schema.publications.account, status: schema.publications.status, scheduledFor: schema.publications.scheduledFor, resultUrl: schema.publications.resultUrl, error: schema.publications.error, hasScreenshot: sql<boolean>`${schema.publications.screenshot} is not null` })
    .from(schema.publications)
    .innerJoin(schema.videos, eq(schema.videos.id, schema.publications.videoId))
    .where(eq(schema.publications.phoneId, phoneId))
    .orderBy(desc(schema.publications.scheduledFor))
    .limit(100);
  const names = await productNamesByIds(rows.map((row) => row.productId));
  return rows.map(({ productId, ...row }) => ({ ...row, productName: names.get(productId) ?? "" }));
}

/** La captura de una publicación (PNG), o `null`. */
export async function publicationScreenshot(id: number): Promise<Buffer | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await getDb().select({ screenshot: schema.publications.screenshot }).from(schema.publications).where(eq(schema.publications.id, id));
  return row?.screenshot ?? null;
}
export async function reviewBatch(user: AuthUser, batchId: number) {
  await getBatchFor(user, batchId);
  const rows = await getDb().select().from(schema.videos).where(and(eq(schema.videos.batchId, batchId), inArray(schema.videos.editReview, ["pendiente", "aprobado", "rechazado"])));
  const result = [];
  for (const video of rows) {
    await getVideoFor(user, video.id);
    const product = await getProductFor(user, video.productId);
    if (!product.phoneId) continue;
    const [edit] = await getDb().select({ id: schema.edits.id }).from(schema.edits).where(eq(schema.edits.videoId, video.id)).orderBy(desc(schema.edits.version)).limit(1);
    result.push({ id: video.id, title: video.title, productName: product.name, editReview: video.editReview, reason: video.editReviewReason, editId: edit?.id, publications: await getDb().select({ status: schema.publications.status, network: schema.publications.network, scheduledFor: schema.publications.scheduledFor, resultUrl: schema.publications.resultUrl }).from(schema.publications).where(eq(schema.publications.videoId, video.id)) });
  }
  return result;
}

/** Montaje que el agente tiene que subir para su tarea `phone_publish` (solo si la tarea sigue siendo suya). */
export async function publicationEditForTask(agentId: number, taskId: number): Promise<{ id: number; size: number; storageKey: string | null } | null> {
  if (!Number.isSafeInteger(taskId)) return null;
  const [row] = await getDb()
    .select({ id: schema.edits.id, size: schema.edits.size, storageKey: schema.edits.storageKey })
    .from(schema.agentTasks)
    .innerJoin(schema.publications, eq(schema.publications.agentTaskId, schema.agentTasks.id))
    .innerJoin(schema.edits, eq(schema.edits.id, schema.publications.editId))
    .where(
      and(
        eq(schema.agentTasks.id, taskId),
        eq(schema.agentTasks.agentId, agentId),
        eq(schema.agentTasks.status, "leased"),
        eq(schema.agentTasks.kind, "phone_publish"),
      ),
    );
  return row ?? null;
}
