import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BLOCKED } from "@/server/videos/generations";

/**
 * Regla del dueño (Emmanuel, «sí, para todos», 26/11/2026): en toda escena de salón navideño (imagen
 * inicial y clip), si hay una televisión, va ENCENDIDA con una película de Navidad reconocible (El
 * Grinch o Solo en casa, «Kevin – Allein zu Haus» en Alemania), con su luz fría en la habitación.
 * Nunca apagada. Si Higgsfield bloquea al personaje, el reintento lleva una escena navideña genérica
 * en la pantalla, sin pararse. La imagen que sube el dueño manda: si trae algo en la pantalla, se queda.
 */
const CHRISTMAS = /\b(christmas|xmas|navidad|navideñ[oa]s?|weihnacht\w*|advent)\b/i;
const TV = /\b(tv|tvs|television|televisions|telly|fernseher|televisi[oó]n|tele)\b/i;
const LIVING_ROOM = /\b(living[ -]room|lounge|sofa|couch|settee|fireplace|wohnzimmer|sal[oó]n|sof[aá])\b/i;

/** ¿Es un salón navideño con televisión? Mira el texto del prompt (o de la escena). */
export function isChristmasLivingRoomWithTv(text: string): boolean {
  return CHRISTMAS.test(text) && TV.test(text) && LIVING_ROOM.test(text);
}

export const CHRISTMAS_TV_ON =
  "The television in this Christmas living room is switched ON, never off or black: its screen plays a recognizable scene from a classic Christmas film (Home Alone, known in Germany as «Kevin – Allein zu Haus», or How the Grinch Stole Christmas), and its cool bluish screen light falls softly on the nearby room, furniture and people.";

export const CHRISTMAS_TV_ON_GENERIC =
  "The television in this Christmas living room is switched ON, never off or black: its screen shows a generic festive Christmas film scene (a snowy village with lit houses and a decorated tree, no recognizable characters or people), and its cool bluish screen light falls softly on the nearby room, furniture and people.";

/**
 * La frase que se añade al prompt (imagen o clip), o "" si no toca: no es un salón navideño con
 * tele, o la imagen del dueño manda (lo que traiga su pantalla se queda).
 */
export function christmasTvLine(prompt: string, options: { ownerRoom: boolean; blockedBefore: boolean }): string {
  if (options.ownerRoom || !isChristmasLivingRoomWithTv(prompt)) return "";
  return options.blockedBefore ? CHRISTMAS_TV_ON_GENERIC : CHRISTMAS_TV_ON;
}

/** ¿El último intento de esa generación del vídeo lo bloqueó el filtro de Higgsfield? */
export async function lastWasBlocked(videoId: number, kind: string): Promise<boolean> {
  const [last] = await getDb()
    .select({ status: schema.generations.status, error: schema.generations.error })
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, kind as typeof schema.generations.$inferSelect.kind)))
    .orderBy(desc(schema.generations.id))
    .limit(1);
  return last?.status === "failed" && last.error === BLOCKED;
}
