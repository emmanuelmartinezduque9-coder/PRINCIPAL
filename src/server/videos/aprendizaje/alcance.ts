import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveUser } from "@/server/auth";
import { requestAnalysis } from "@/server/videos/analysis";
import { learningError } from "./preferencias";

type Scope = "global" | "producto" | "pais" | "toma";

/**
 * Una preferencia solo vale para todo un país (o para todo) si la sostienen al menos dos productos. Si toda la
 * evidencia es de un producto, se queda en ese producto. Caso real (25/11/2026): «ambientar en las calles de Berlín»
 * salió de dos tarjetas de KreuzKapuze y Haiku la propuso para toda Alemania; acabó en el desglose de EisWerk.
 */
export function narrowScope(scope: Scope, scopeValue: string, evidence: Array<{ productId: number | null }>): { scope: Scope; scopeValue: string } {
  if (scope !== "pais" && scope !== "global") return { scope, scopeValue };
  const products = [...new Set(evidence.flatMap((s) => (s.productId === null ? [] : [s.productId])))];
  return products.length === 1 ? { scope: "producto", scopeValue: String(products[0]) } : { scope, scopeValue };
}

/** Cambia el ámbito de la clave (`tema:ámbito:valor:pasos`) sin tocar lo demás. */
export function keyWithScope(key: string, scope: Scope, scopeValue: string): string {
  const parts = key.split(":");
  if (parts.length < 4) return `${key}:${scope}:${scopeValue}`;
  return [parts[0], scope, scopeValue, ...parts.slice(3)].join(":");
}

/**
 * Arreglo en el barrido (idempotente):
 * 1. Las preferencias de país o globales sostenidas por un solo producto pasan a ser de ese producto. Si ya existe esa
 *    misma preferencia del producto, la de país se retira.
 * 2. Sus aplicaciones en vídeos de otro producto no valían. Si fueron en el desglose y el vídeo aún no tiene imagen,
 *    se repite el desglose (ya sin ella). En los demás casos se borra la aplicación (no cuenta para el peso).
 */
export async function repairScopes(): Promise<void> {
  try {
    const db = getDb();
    const prefs = await db.select().from(schema.learnedPreferences).where(and(eq(schema.learnedPreferences.status, "activa"), inArray(schema.learnedPreferences.scope, ["pais", "global"]), isNull(schema.learnedPreferences.choice)));
    for (const p of prefs) {
      const ids = p.sourceSignalIds;
      const evidence = ids.length ? await db.select({ productId: schema.learningSignals.productId }).from(schema.learningSignals).where(inArray(schema.learningSignals.id, ids)) : [];
      const narrowed = narrowScope(p.scope as Scope, p.scopeValue, evidence);
      if (narrowed.scope === p.scope) continue;
      const key = keyWithScope(p.key, narrowed.scope, narrowed.scopeValue);
      const [clash] = await db.select({ id: schema.learnedPreferences.id }).from(schema.learnedPreferences).where(and(eq(schema.learnedPreferences.key, key), ne(schema.learnedPreferences.id, p.id)));
      if (clash) await db.update(schema.learnedPreferences).set({ status: "retirada", retiredBy: "peso", updatedAt: new Date() }).where(eq(schema.learnedPreferences.id, p.id));
      else await db.update(schema.learnedPreferences).set({ key, scope: narrowed.scope, scopeValue: narrowed.scopeValue, updatedAt: new Date() }).where(eq(schema.learnedPreferences.id, p.id));
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
