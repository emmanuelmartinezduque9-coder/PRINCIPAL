import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveUser } from "@/server/auth";
import { requestAnalysis } from "@/server/videos/analysis";
import { prohibitsThirdParty } from "@/lib/mejoras";
import { learningError } from "./preferencias";

type Scope = "global" | "producto" | "pais" | "toma";
type Evidence = { id: number; productId: number | null; videoId: number | null; kind: string; batchId: number | null };

/**
 * Regla fija del dueño (25/11/2026): no se crea, amplía ni generaliza una regla sin su consentimiento. Una preferencia
 * vale solo para el producto en que la pidió, y solo si la pidió en el lote (vale para el producto) o en dos vídeos
 * distintos de ese producto. Devuelve, por producto, las señales que la sostienen allí. Caso real (25/11/2026): «en las
 * calles de Berlín» salió de dos tarjetas de KreuzKapuze y Haiku la propuso para toda Alemania.
 */
export function productGroups<T extends Evidence>(evidence: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const s of evidence) if (s.productId !== null) out.set(s.productId, [...(out.get(s.productId) ?? []), s]);
  for (const [productId, group] of out) {
    const forProduct = group.some((s) => s.kind === "instruccion_lote");
    const videos = new Set(group.flatMap((s) => (s.videoId ? [s.videoId] : [])));
    if (!forProduct && videos.size < 2) out.delete(productId);
  }
  return out;
}

/** Cambia el ámbito de la clave (`tema:ámbito:valor:pasos`) sin tocar lo demás. */
export function keyWithScope(key: string, scope: Scope, scopeValue: string): string {
  const parts = key.split(":");
  if (parts.length < 4) return `${key}:${scope}:${scopeValue}`;
  return [parts[0], scope, scopeValue, ...parts.slice(3)].join(":");
}

/**
 * Arreglo en el barrido (idempotente):
 * 1. Las que prohíben marcas de terceros se retiran. Las de país, de toma o globales se reparten en una por producto
 *    (donde él lo pidió) y se retiran.
 * 2. Sus aplicaciones en vídeos de otro producto no valían. Si fueron en el desglose y el vídeo aún no tiene imagen,
 *    se repite el desglose (ya sin ella). En los demás casos se borra la aplicación (no cuenta para el peso).
 */
export async function repairScopes(): Promise<void> {
  try {
    const db = getDb();
    const active = await db.select().from(schema.learnedPreferences).where(and(eq(schema.learnedPreferences.status, "activa"), isNull(schema.learnedPreferences.choice)));
    for (const p of active) {
      const retire = () => db.update(schema.learnedPreferences).set({ status: "retirada", retiredBy: "dueno", updatedAt: new Date() }).where(eq(schema.learnedPreferences.id, p.id));
      // Nada aprendido prohíbe marcas, tiendas, películas o personajes de terceros.
      if (prohibitsThirdParty(p.directive) || prohibitsThirdParty(p.directiveEn)) {
        await retire();
        continue;
      }
      if (p.scope === "producto") continue;
      // De país, de toma o global: se reparte en una por cada producto en que él lo pidió (lote o dos vídeos) y la
      // general se retira.
      const ids = p.sourceSignalIds;
      const evidence = ids.length ? await db.select({ id: schema.learningSignals.id, productId: schema.learningSignals.productId, videoId: schema.learningSignals.videoId, kind: schema.learningSignals.kind, batchId: schema.learningSignals.batchId }).from(schema.learningSignals).where(inArray(schema.learningSignals.id, ids)) : [];
      for (const [productId, group] of productGroups(evidence)) {
        const key = keyWithScope(p.key, "producto", String(productId));
        const [clash] = await db.select({ id: schema.learnedPreferences.id }).from(schema.learnedPreferences).where(eq(schema.learnedPreferences.key, key));
        if (clash) continue;
        await db.insert(schema.learnedPreferences).values({
          key, scope: "producto", scopeValue: String(productId), stages: p.stages, directive: p.directive, directiveEn: p.directiveEn, polarity: p.polarity, topic: p.topic,
          supports: group.length, weight: (1 + group.length) / (2 + group.length), firstBatchId: group[0].batchId ?? p.firstBatchId, sourceSignalIds: group.map((s) => s.id),
        });
      }
      await retire();
    }

    // Aplicaciones de preferencias de producto en vídeos de otro producto.
    const wrong = await db
      .select({ app: schema.preferenceApplications, productId: schema.videos.productId, createdBy: schema.videos.createdBy, scopeValue: schema.learnedPreferences.scopeValue })
      .from(schema.preferenceApplications)
      .innerJoin(schema.learnedPreferences, eq(schema.learnedPreferences.id, schema.preferenceApplications.preferenceId))
      .innerJoin(schema.videos, eq(schema.videos.id, schema.preferenceApplications.videoId))
      .where(and(eq(schema.learnedPreferences.scope, "producto"), isNull(schema.preferenceApplications.outcome)));
    for (const { app, productId, createdBy, scopeValue } of wrong) {
      if (String(productId) === scopeValue) continue;
      const drop = () => db.delete(schema.preferenceApplications).where(eq(schema.preferenceApplications.id, app.id));
      if (app.stage !== "desglose") {
        await drop();
        continue;
      }
      const [frame] = await db.select({ id: schema.generations.id }).from(schema.generations).where(and(eq(schema.generations.videoId, app.videoId), ne(schema.generations.status, "not_sent"))).limit(1);
      const [latest] = await db.select({ createdAt: schema.videoAnalyses.createdAt, status: schema.videoAnalyses.status }).from(schema.videoAnalyses).where(eq(schema.videoAnalyses.videoId, app.videoId)).orderBy(desc(schema.videoAnalyses.version)).limit(1);
      // Ya tiene imagen (tarde para repetir) o ya hay un desglose posterior: nada más que hacer.
      if (frame || (latest && latest.createdAt > app.createdAt && latest.status !== "running")) {
        await drop();
        continue;
      }
      if (latest?.status === "running" || latest?.status === "queued") continue; // se mira en la siguiente pasada
      const user = await getActiveUser(createdBy);
      if (!user) {
        await drop();
        continue;
      }
      try {
        await requestAnalysis(user, app.videoId);
        console.log(`[aprendizaje] Desglose repetido del vídeo ${app.videoId}: llevaba una preferencia de otro producto.`);
      } catch (error) {
        learningError(error);
      }
      await drop();
    }
  } catch (error) {
    learningError(error);
  }
}
