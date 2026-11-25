import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { productMarketsByIds } from "@/server/products";
import { shotTypesFor } from "./contexto";
import { marketOf } from "@/server/videos/localization";

export type Stage = "desglose" | "imagen" | "pinterest" | "clip" | "rotulos" | "doblaje" | "montaje" | "variante" | "cancion" | "avatar";
export type Signal = typeof schema.learningSignals.$inferSelect;
export type PreferenceContext = { videoId: number; productId?: number | null; country?: string; shotTypes?: string[]; record?: boolean; tramo?: number; choiceOptions?: string[] };
export const learningError = (error: unknown) => console.error("[aprendizaje]", error);

/** Nunca detiene el motor: contexto y aplicaciones se resuelven aquí también para pasos sin producto. */
export async function preferencesFor(stage: Stage, ctx: PreferenceContext): Promise<{ text: string; ids: number[] }> {
  try {
    const db = getDb();
    const [video] = await db.select().from(schema.videos).where(eq(schema.videos.id, ctx.videoId));
    if (!video) return { text: "", ids: [] };
    const productId = ctx.productId ?? video.productId;
    const market = (await productMarketsByIds([productId])).get(productId);
    const country = ctx.country ?? (market ? marketOf(market).code : "");
    const shotTypes = ctx.shotTypes ?? await shotTypesFor(video.id, ctx.tramo);
    const rows = await db.select().from(schema.learnedPreferences).where(and(eq(schema.learnedPreferences.status, "activa"), gte(schema.learnedPreferences.weight, 0.5))).orderBy(desc(schema.learnedPreferences.weight), schema.learnedPreferences.id);
    // Lo de su producto va antes que lo general; dentro, por peso. Los prompts de Higgsfield admiten menos texto que
    // las instrucciones de Claude.
    const limit = stage === "imagen" || stage === "clip" ? 5 : stage === "desglose" ? 14 : 10;
    const matches = rows.filter((p) => p.stages.includes(stage) && (ctx.choiceOptions === undefined || p.choice !== null && ctx.choiceOptions.includes(p.choice.value)) && (p.scope === "global" || p.scope === "producto" && p.scopeValue === String(productId) || p.scope === "pais" && p.scopeValue === country || p.scope === "toma" && shotTypes.includes(p.scopeValue)));
    const active = [...matches.filter((p) => p.scope !== "global"), ...matches.filter((p) => p.scope === "global")].slice(0, limit);
    if (!active.length) return { text: "", ids: [] };
    if (ctx.record !== false) await db.insert(schema.preferenceApplications).values(active.map((p) => ({ preferenceId: p.id, videoId: video.id, batchId: video.batchId, stage }))).onConflictDoNothing();
    const english = stage === "imagen" || stage === "clip";
    return { text: `\n\n${english ? "Owner preferences learned from previous batches (apply unless the video or batch instructions say otherwise)" : "Preferencias aprendidas del dueño en lotes anteriores (aplícalas salvo que la tarjeta o el lote digan otra cosa)"}:\n${active.map((p) => `- ${english ? p.directiveEn : p.directive}`).join("\n")}`, ids: active.map((p) => p.id) };
  } catch (error) { learningError(error); return { text: "", ids: [] }; }
}

/**
 * La primera decisión queda fijada. Solo cierra aplicaciones anteriores a la señal (con 1 s de margen: la base de
 * datos guarda microsegundos y la fecha de la señal llega en milisegundos).
 * Una elección igual no cierra la aplicación como corregida.
 */
export async function settleApplications(signal: Signal): Promise<void> {
  try {
    if (!signal.videoId) return;
    const db = getDb();
    let stages: string[] = [];
    let outcome = signal.polarity === 1 ? "aprobado" : "corregido";
    if (["aprobado", "rechazado"].includes(signal.kind)) stages = signal.stage === "imagen" ? ["desglose", "imagen", "pinterest"] : ["clip"];
    else if (signal.kind === "montaje_aprobado") { stages = ["rotulos", "doblaje", "montaje", "variante", "cancion", "avatar"]; outcome = "aprobado"; }
    else if (["montaje_rechazado", "cambio_pedido", "reporte"].includes(signal.kind)) stages = ["rotulos", "doblaje", "montaje"];
    else if (signal.kind === "eleccion") stages = [signal.stage];
    if (!stages.length) return;
    const pending = await db.select({ application: schema.preferenceApplications, preference: schema.learnedPreferences }).from(schema.preferenceApplications).innerJoin(schema.learnedPreferences, eq(schema.learnedPreferences.id, schema.preferenceApplications.preferenceId)).where(and(eq(schema.preferenceApplications.videoId, signal.videoId), inArray(schema.preferenceApplications.stage, stages), isNull(schema.preferenceApplications.outcome), sql`${schema.preferenceApplications.createdAt} <= ${signal.occurredAt.toISOString()}::timestamptz + interval '1 second'`));
    for (const { application, preference } of pending) {
      if (signal.kind === "eleccion" && preference.choice?.value === (signal.value as { value?: string } | null)?.value) continue;
      const changed = await db.update(schema.preferenceApplications).set({ outcome, signalId: signal.id, settledAt: new Date() }).where(and(eq(schema.preferenceApplications.id, application.id), isNull(schema.preferenceApplications.outcome))).returning();
      if (changed.length) await recomputeWeight(preference.id);
    }
  } catch (error) { learningError(error); }
}

/** Los refuerzos suman al prior; las contradicciones suman al denominador. */
export async function recomputeWeight(preferenceId: number): Promise<void> {
  try {
    await getDb().transaction(async (tx) => {
      const [p] = await tx.select().from(schema.learnedPreferences).where(eq(schema.learnedPreferences.id, preferenceId)).for("update");
      if (!p) return;
      const apps = await tx.select().from(schema.preferenceApplications).where(eq(schema.preferenceApplications.preferenceId, preferenceId));
      const approved = apps.filter((a) => a.outcome === "aprobado").length;
      const corrected = apps.filter((a) => a.outcome === "corregido").length;
      const a = 1 + p.supports;
      const weight = (a + approved) / (a + 1 + approved + corrected + p.contradicts);
      await tx.update(schema.learnedPreferences).set({ weight, updatedAt: new Date(), ...(approved + corrected >= 4 && weight < 0.35 && p.status === "activa" ? { status: "retirada", retiredBy: "peso" } : {}) }).where(eq(schema.learnedPreferences.id, preferenceId));
    });
  } catch (error) { learningError(error); }
}

/** Decide solo entre opciones disponibles; una preferencia retirada no entra en ids. */
export function choosePreferred(options: string[], choices: Array<{ value: string }>): string | null {
  return choices.find((c) => options.includes(c.value))?.value ?? null;
}

export async function preferredChoice(stage: "variante" | "cancion" | "avatar", ctx: PreferenceContext, options: string[]): Promise<string | null> {
  const { ids } = await preferencesFor(stage, { ...ctx, choiceOptions: options });
  if (!ids.length) return null;
  try {
    const rows = await getDb().select().from(schema.learnedPreferences).where(inArray(schema.learnedPreferences.id, ids)).orderBy(desc(schema.learnedPreferences.weight));
    return choosePreferred(options, rows.flatMap((r) => r.choice ? [r.choice] : []));
  } catch (error) { learningError(error); return null; }
}
