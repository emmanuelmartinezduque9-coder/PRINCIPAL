import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { costOfSteps } from "@/server/spend";
import { analysisStepKey } from "@/server/videos/analysis";
import { getVideoFor, type Video } from "@/server/videos/videos";

/**
 * Lo que ha costado un vídeo, en cada moneda por separado (los créditos de Higgsfield no se pasan a
 * dólares):
 * - `higgsfieldCredits`: los créditos de todo lo que se envió (imagen inicial y clip, todas las
 *   rondas, también las que luego fallaron: no se sabe si Higgsfield los devuelve).
 * - `claudeMicros`: el coste de Claude de todos sus desgloses, buscado en el libro por la clave del
 *   paso de cada desglose. Así cuentan todos los intentos (fallidos, interrumpidos y repetidos),
 *   no solo el último cargo que guarda el desglose.
 */

export interface VideoCosts {
  higgsfieldCredits: number;
  claudeMicros: number;
}

/** Coste de un vídeo cuyo producto ve `user`. */
export async function videoCosts(user: AuthUser, videoId: number): Promise<VideoCosts> {
  return costsOfVideo(await getVideoFor(user, videoId));
}

/** Coste de un vídeo ya comprobado con `getVideoFor`. */
export async function costsOfVideo(video: Video): Promise<VideoCosts> {
  const db = getDb();
  const [credits] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.generations.creditsSpent}), 0)::bigint`.mapWith(Number) })
    .from(schema.generations)
    .where(eq(schema.generations.videoId, video.id));
  const analyses = await db
    .select({ id: schema.videoAnalyses.id })
    .from(schema.videoAnalyses)
    .where(eq(schema.videoAnalyses.videoId, video.id));
  const byStep = await costOfSteps(analyses.map(({ id }) => analysisStepKey(video.productId, id)));
  let claudeMicros = 0;
  for (const micros of byStep.values()) claudeMicros += micros;
  return { higgsfieldCredits: credits?.total ?? 0, claudeMicros };
}

/**
 * Coste en Claude de un desglose (todos sus intentos), o `null` si no consta ningún cargo suyo.
 * `video` ya viene comprobado con `getVideoFor`.
 */
export async function analysisCostMicros(video: Video, analysis: { id: number; spendEntryId: number | null }): Promise<number | null> {
  const key = analysisStepKey(video.productId, analysis.id);
  const micros = (await costOfSteps([key])).get(key);
  if (micros !== undefined) return micros;
  return analysis.spendEntryId === null ? null : 0;
}
