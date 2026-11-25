import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { productMarketsByIds } from "@/server/products";
import { shotTypesFor } from "./contexto";
import { marketOf } from "@/server/videos/localization";
import { learningError, settleApplications, type Signal } from "./preferencias";

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const SYSTEM = "Corrección automática:";
/** Solo la corrección automática expresamente dictada por el dueño cuenta. */
export function ownerRejection(text: string | null): string | null {
  if (!text) return null;
  if (!text.startsWith(SYSTEM)) return text;
  const own = text.slice(SYSTEM.length).trim();
  return own.toLowerCase().startsWith("del dueño:") ? own.slice("del dueño:".length).trim() : null;
}

/** Lee hechos guardados, nunca inventa eventos ni duplica las dos vías de captura. */
/**
 * `since`: solo los vídeos tocados desde esa fecha (el barrido de cada minuto); sin filtro, todo (la primera vez y el
 * destilado diario). Las acciones capturan su vídeo o lote al momento.
 */
export async function collectSignals(filter: { videoId?: number; batchId?: number; since?: Date } = {}): Promise<Signal[]> {
  const inserted: Signal[] = [];
  try {
    const db = getDb();
    const videos = await db.select().from(schema.videos).where(and(filter.videoId ? eq(schema.videos.id, filter.videoId) : undefined, filter.batchId ? eq(schema.videos.batchId, filter.batchId) : undefined, filter.since ? gte(schema.videos.updatedAt, filter.since) : undefined));
    const markets = await productMarketsByIds(videos.map((v) => v.productId));
    type Input = typeof schema.learningSignals.$inferInsert;
    const candidates: Input[] = [];
    for (const v of videos) {
      const market = markets.get(v.productId);
      const shotTypes = await shotTypesFor(v.id);
      const base = { shotType: shotTypes[0] ?? null, videoId: v.id, batchId: v.batchId, productId: v.productId, userId: v.createdBy, country: market ? marketOf(market).code : "", occurredAt: v.updatedAt };
      const add = (sourceKey: string, kind: string, stage: string, polarity: number, text = "", value: unknown = null, occurredAt = v.updatedAt, shotType = base.shotType) => candidates.push({ ...base, sourceKey, kind, stage, polarity, text: text.slice(0, 4000), value, occurredAt, shotType });
      const gens = await db.select().from(schema.generations).where(eq(schema.generations.videoId, v.id));
      const results = gens.length ? await db.select().from(schema.generationResults).where(inArray(schema.generationResults.generationId, gens.map((g) => g.id))) : [];
      const approved = [v.approvedFrameResultId, v.approvedClipResultId, ...Object.values(v.tramoApprovals)];
      for (const g of gens) {
        if (!/^(frame|clip)(:|$)/.test(g.kind)) continue;
        const stage = g.kind.startsWith("frame") ? "imagen" : "clip";
        const shotType = (await shotTypesFor(v.id, Number(g.kind.split(":")[1] ?? 0)))[0] ?? null;
        const reason = ownerRejection(g.rejectReason);
        if (reason) add(`gen:${g.id}:rechazo`, "rechazado", stage, -1, reason, null, v.updatedAt, shotType);
        const good = results.filter((r) => r.generationId === g.id && r.ok);
        if (good.some((r) => approved.includes(r.id))) for (const r of good) {
          const ok = approved.includes(r.id);
          add(`res:${r.id}:${ok ? "aprobado" : "descartada"}`, ok ? "aprobado" : "candidata_descartada", stage, ok ? 1 : -1, "", null, v.updatedAt, shotType);
        }
      }
      for (const [field, text] of [["nota", v.note], ["adaptacion", v.adaptation]] as const) if (text?.trim()) add(`video:${v.id}:${field}:${hash(text)}`, "instruccion_tarjeta", "desglose", 0, text);
      for (const a of v.ownerAnswers) add(`video:${v.id}:respuesta:${a.key}:${hash(a.answer)}`, "respuesta", /cancion/.test(a.key) ? "cancion" : /avatar|biblioteca/.test(a.key) ? "avatar" : /variante/.test(a.key) ? "variante" : "desglose", 0, `${a.question}: ${a.answer}`);
      if (v.editReview === "aprobado" || v.editReview === "rechazado") {
        const [edit] = await db.select({ id: schema.edits.id }).from(schema.edits).where(eq(schema.edits.videoId, v.id)).orderBy(desc(schema.edits.version));
        add(`video:${v.id}:montaje:${v.editReview}:${v.editRunId ?? edit?.id ?? 0}`, v.editReview === "aprobado" ? "montaje_aprobado" : "montaje_rechazado", "montaje", v.editReview === "aprobado" ? 1 : -1, v.editReviewReason ?? "");
      }
      // Solo lo que alguien eligió: los valores por defecto (fotos de siempre, audio original, avatar automático) los
      // pone el lote solo y no dicen nada de sus gustos. Los valores coinciden con las opciones de `lote.ts`.
      const choices = { variante: v.variantId === null ? null : `var:${v.variantId}`, cancion: v.songId === null ? null : `song:${v.songId}`, avatar: v.avatarMode === "biblioteca" && v.avatarLibraryId ? `bib:${v.avatarLibraryId}` : v.avatarMode === "elegido" && v.avatarPhotoId ? `foto:${v.avatarPhotoId}` : null };
      for (const [kind, value] of Object.entries(choices)) if (value) add(`video:${v.id}:eleccion:${kind}:${value}`, "eleccion", kind, 0, "", { kind, value, label: value });
    }
    const batches = await db.select().from(schema.batches).where(filter.batchId ? eq(schema.batches.id, filter.batchId) : filter.videoId || filter.since ? inArray(schema.batches.id, videos.flatMap((v) => v.batchId ? [v.batchId] : [])) : undefined);
    for (const b of batches) {
      const notes = await db.select().from(schema.batchProducts).where(eq(schema.batchProducts.batchId, b.id));
      const bm = await productMarketsByIds(notes.map((n) => n.productId));
      for (const n of notes) if (n.notes) candidates.push({ sourceKey: `lote:${b.id}:${n.productId}:notas:${hash(n.notes)}`, kind: "instruccion_lote", stage: "desglose", polarity: 0, batchId: b.id, productId: n.productId, country: bm.get(n.productId) ? marketOf(bm.get(n.productId)!).code : "", userId: b.createdBy, text: n.notes.slice(0, 4000), occurredAt: n.updatedAt });
    }
    const reports = await db.select().from(schema.problemReports).where(and(filter.videoId ? eq(schema.problemReports.videoId, filter.videoId) : undefined, filter.batchId ? eq(schema.problemReports.batchId, filter.batchId) : undefined, filter.since ? gte(schema.problemReports.updatedAt, filter.since) : undefined));
    const rm = await productMarketsByIds(reports.flatMap((r) => r.productId ? [r.productId] : []));
    for (const r of reports) {
      const change = r.body.startsWith("Cambio pedido en el montaje:");
      // Un reporte sin clasificar aún podría ser «uso»: se captura tras clasificarlo.
      if (!change && (r.fixKind === "uso" || r.fixKind === null)) continue;
      const stage = r.stage === "lote" || r.stage === "pantalla" ? "montaje" : r.stage;
      candidates.push({ sourceKey: `report:${r.id}`, kind: change ? "cambio_pedido" : "reporte", stage, polarity: -1, videoId: r.videoId, batchId: r.batchId, productId: r.productId, country: r.productId && rm.get(r.productId) ? marketOf(rm.get(r.productId)!).code : "", userId: videos.find((v) => v.id === r.videoId)?.createdBy ?? r.createdBy, text: r.body.slice(0, 4000), topic: r.problemType, occurredAt: r.createdAt });
    }
    // Orden temporal: un rechazo anterior debe cerrar antes que la aprobación posterior.
    candidates.sort((a, b) => new Date(a.occurredAt!).getTime() - new Date(b.occurredAt!).getTime() || (a.polarity ?? 0) - (b.polarity ?? 0));
    for (const candidate of candidates) {
      const [row] = await db.insert(schema.learningSignals).values(candidate).onConflictDoNothing({ target: schema.learningSignals.sourceKey }).returning();
      if (row) { inserted.push(row); if (row.videoId) await settleApplications(row); }
    }
  } catch (error) { learningError(error); }
  return inserted;
}

export async function captureVideoSignals(videoId: number): Promise<void> { await collectSignals({ videoId }); }
export async function captureBatchSignals(batchId: number): Promise<void> { await collectSignals({ batchId }); }

/** La clasificación puede llegar después de crear el reporte; sus fallos no cambian esa acción. */
export async function captureReportSignals(reportId: number): Promise<void> {
  try {
    const [source] = await getDb().select({ videoId: schema.problemReports.videoId, batchId: schema.problemReports.batchId }).from(schema.problemReports).where(eq(schema.problemReports.id, reportId));
    if (source?.videoId) await captureVideoSignals(source.videoId);
    else if (source?.batchId) await captureBatchSignals(source.batchId);
    else if (source) await collectSignals();
  } catch (error) { learningError(error); }
}
