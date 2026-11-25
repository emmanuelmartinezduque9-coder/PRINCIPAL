import { asc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { assignedProductIds } from "@/server/access";
import { productNamesByIds } from "@/server/products";
import type { AuthUser } from "@/server/auth";

const KIND_LABELS: Record<string, string> = {
  rechazado: "Rechazó",
  aprobado: "Aprobó",
  candidata_descartada: "Descartó una candidata de",
  instruccion_tarjeta: "Pidió en la tarjeta",
  instruccion_lote: "Pidió en el lote",
  respuesta: "Respondió",
  cambio_pedido: "Pidió un cambio en",
  reporte: "Reportó un problema en",
  montaje_aprobado: "Aprobó",
  montaje_rechazado: "Rechazó",
  eleccion: "Eligió",
};
const STAGE_LABELS: Record<string, string> = {
  desglose: "el desglose",
  imagen: "la imagen",
  pinterest: "las fotos de Pinterest",
  clip: "el clip",
  rotulos: "los rótulos",
  doblaje: "el doblaje",
  montaje: "el montaje",
  variante: "la variante",
  cancion: "la canción",
  avatar: "el avatar",
};
/** «Rechazó la imagen», «Eligió la variante»…; las instrucciones no llevan paso. */
export function signalLabel(s: { kind: string; stage: string }): string {
  const verb = KIND_LABELS[s.kind] ?? s.kind;
  return s.kind.startsWith("instruccion") || s.kind === "respuesta" ? verb : `${verb} ${STAGE_LABELS[s.stage] ?? s.stage}`;
}

/** La selección de vídeos limita también la evidencia y las aplicaciones que puede ver un colaborador. */
export async function learningByBatch(viewer: AuthUser) {
  const db = getDb();
  const assigned = viewer.role === "dueno" ? [] : await assignedProductIds(viewer.id);
  const videos = await db.select().from(schema.videos).where(viewer.role === "dueno" ? undefined : or(eq(schema.videos.createdBy, viewer.id), inArray(schema.videos.productId, assigned))).orderBy(asc(schema.videos.id));
  const ids = videos.map((v) => v.id);
  if (!ids.length) return [];
  const batches = await db.select().from(schema.batches).where(inArray(schema.batches.id, videos.flatMap((v) => v.batchId ? [v.batchId] : []))).orderBy(asc(schema.batches.id));
  const signals = await db.select().from(schema.learningSignals);
  const visible = signals.filter((s) => s.videoId ? ids.includes(s.videoId) : viewer.role === "dueno" || s.productId !== null && assigned.includes(s.productId));
  const apps = await db.select().from(schema.preferenceApplications).where(inArray(schema.preferenceApplications.videoId, ids));
  const prefs = await db.select().from(schema.learnedPreferences);
  const names = await productNamesByIds(prefs.filter((p) => p.scope === "producto").map((p) => Number(p.scopeValue)));
  const correction = (s: typeof signals[number]) => s.polarity === -1 && s.kind !== "candidata_descartada";
  return batches.map((batch) => {
    const rows = videos.filter((v) => v.batchId === batch.id);
    const batchSignals = visible.filter((s) => s.batchId === batch.id);
    const corrections = batchSignals.filter(correction);
    const repeated = corrections.filter((s) => s.topic && visible.some((old) => correction(old) && old.topic === s.topic && old.country === s.country && old.batchId !== null && old.batchId < batch.id)).length;
    const firstPass = rows.filter((v) => {
      const own = batchSignals.filter((s) => s.videoId === v.id);
      return !own.some(correction) && own.some((s) => s.kind === "aprobado" && s.stage === "imagen") && own.some((s) => s.kind === "aprobado" && s.stage === "clip");
    }).length;
    return { batchId: batch.id, name: batch.name, videos: rows.length, corrections: corrections.length, correctionsPerVideo: rows.length ? corrections.length / rows.length : 0, repeated, firstPass: rows.length ? firstPass / rows.length : null,
      learned: prefs.filter((p) => p.firstBatchId === batch.id && (viewer.role === "dueno" || p.sourceSignalIds.some((id) => visible.some((s) => s.id === id)))).map((preference) => ({ preference: { ...preference, scopeLabel: preference.scope === "producto" ? names.get(Number(preference.scopeValue)) ?? preference.scopeValue : preference.scopeValue }, appliedIn: apps.filter((a) => a.preferenceId === preference.id && a.batchId !== null && a.batchId > batch.id).map(({ videoId, batchId, stage, outcome }) => ({ videoId, batchId, stage, outcome })) })),
      videoDetail: rows.map((v) => ({ videoId: v.id, productId: v.productId, title: v.title, signals: visible.filter((s) => s.videoId === v.id).map((s) => ({ ...s, label: signalLabel(s) })), applied: apps.filter((a) => a.videoId === v.id).map((a) => ({ ...a, directive: prefs.find((p) => p.id === a.preferenceId)?.directive ?? "" })) })),
    };
  });
}

export type LearningBatch = Awaited<ReturnType<typeof learningByBatch>>[number];
export type LearningView = { batches: LearningBatch[]; videoProducts: Record<number, number> };

/** Contrato de la vista: añade los destinos de los enlaces sin consultar tablas desde la ruta. */
export async function learningView(viewer: AuthUser): Promise<LearningView> {
  const batches = await learningByBatch(viewer);
  return { batches, videoProducts: Object.fromEntries(batches.flatMap((b) => b.videoDetail.map((v) => [v.videoId, v.productId]))) };
}
