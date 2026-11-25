import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

/** Tipos de toma ya descritos por el motor, sin inventar una taxonomía ni otra llamada de IA. */
export async function shotTypesFor(videoId: number, tramo?: number): Promise<string[]> {
  const [analysis] = await getDb().select({ result: schema.videoAnalyses.result }).from(schema.videoAnalyses).where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done"))).orderBy(desc(schema.videoAnalyses.version)).limit(1);
  const result = analysis?.result as { places?: Array<{ place?: string }> } | null;
  const scenes = await getDb().select({ scene: schema.videoPinterestRefs.scene }).from(schema.videoPinterestRefs).where(and(eq(schema.videoPinterestRefs.videoId, videoId), tramo === undefined ? undefined : eq(schema.videoPinterestRefs.tramo, tramo))).orderBy(desc(schema.videoPinterestRefs.id));
  const places = tramo === undefined ? result?.places ?? [] : [result?.places?.[tramo]];
  return [...new Set([...scenes.map((s) => (s.scene as { place?: string } | null)?.place), ...places.map((p) => p?.place)].filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => p.trim()))];
}
