import { preferencesFor } from "@/server/videos/aprendizaje/preferencias";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { MAX_EDIT_TEXT, type EditOverride } from "@/db/schema";
import { textPart } from "@/llm/content";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor } from "@/server/products";
import { listSongs } from "@/server/songs";
import type { ReferenceCue } from "@/server/videos/edicion-referencia";
import { queueEdit } from "@/server/videos/edits";
import { createReport } from "@/server/videos/mejoras/reports";
import { audioColumns, getVideoFor } from "@/server/videos/videos";

/**
 * «¿Qué quieres cambiar?» en el diálogo del montaje (encargo del dueño, 24/11/2026): quien ve el vídeo escribe o
 * dicta un cambio pequeño («el primer rótulo que diga Berlin», «quita el emoji», «sin doblaje»…) y el vídeo se
 * vuelve a montar con él, sin preguntas ni confirmaciones (el montaje es barato).
 *
 * - Al pedirlo: el cambio queda en el vídeo (`edit_override.pendiente`), como reporte en «Mejoras» ligado a la
 *   versión que se vio (si es una corrección general, Mejoras la aprende para los demás) y el montaje a la cola.
 * - En el montaje, después de leer los rótulos de la referencia: Claude (la pasarela: el Mac del dueño si está
 *   listo) aplica el cambio a la ficha (rótulos, orden y tiempos, emojis, CTA, música, doblaje) y solo a lo que
 *   pide. Los rótulos cambiados se guardan (`edit_override.rotulos`) para los montajes siguientes.
 */

export const MAX_CHANGE_CHARS = 2_000;

/** Pide el cambio y vuelve a montar ese vídeo. Cualquiera que vea el vídeo. 409 si ya se está montando o no hay clip. */
export async function requestEditChange(user: AuthUser, videoId: number, instruction: unknown, now: Date = new Date()): Promise<{ runId: number; reportId: number }> {
  const text = typeof instruction === "string" ? instruction.trim() : "";
  if (!text) throw new HttpError(400, "Escribe qué quieres cambiar.");
  if (text.length > MAX_CHANGE_CHARS) throw new HttpError(400, `Como mucho ${MAX_CHANGE_CHARS} caracteres.`);
  const video = await getVideoFor(user, videoId);
  if (video.editStatus === "en_marcha") throw new HttpError(409, "Ya se está montando este vídeo: espera a que termine.");
  const product = await getProductFor(user, video.productId);
  // El reporte primero: queda ligado a la versión que se vio (la última montada).
  const report = await createReport(user, { stage: "montaje", body: `Cambio pedido en el montaje: ${text}`, videoId, page: `/videos/${videoId}` });
  const previous = video.editOverride ?? null;
  const override: EditOverride = {
    rotulos: previous?.rotulos ?? null,
    cambios: previous?.cambios ?? [],
    pendiente: { texto: text, por: user.id, reportId: report.id, at: now.toISOString() },
  };
  await getDb().update(schema.videos).set({ editOverride: override }).where(eq(schema.videos.id, videoId));
  try {
    const { runId } = await queueEdit({ ...video, editOverride: override }, product, user.id, now);
    return { runId, reportId: report.id };
  } catch (error) {
    await getDb().update(schema.videos).set({ editOverride: previous }).where(eq(schema.videos.id, videoId));
    throw error;
  }
}

const answerSchema = z.object({
  rotulos: z
    .array(z.object({ desde_s: z.number().min(0), texto: z.string().min(1).max(300), cta: z.boolean() }))
    .max(12),
  texto_principal: z.string().min(1).max(MAX_EDIT_TEXT),
  cta: z.string().min(1).max(MAX_EDIT_TEXT),
  /** `true` solo si el cambio pide otra música. */
  cambia_cancion: z.boolean(),
  /** Con `cambia_cancion`: el id de la canción de la lista, o `null` para el audio original de la referencia. */
  cancion_id: z.number().int().positive().nullable(),
  doblar: z.enum(["igual", "si", "no"]),
  resumen: z.string().min(1).max(400),
});
type Answer = z.infer<typeof answerSchema>;

export const EDIT_CHANGE_INSTRUCTIONS = `Eres el editor del montaje de un anuncio en vídeo (TikTok/Reels). Te paso la ficha del montaje actual y UN cambio que pide quien lo revisa. Aplica SOLO ese cambio y deja todo lo demás EXACTAMENTE igual: mismos textos carácter a carácter, mismos emojis, mismos saltos de línea (|), mismos tiempos y orden.

- rotulos: los rótulos de la referencia, en orden, con desde_s (segundo desde el que se ven) y si son la llamada a la acción (cta). Cambia el texto, el orden, los tiempos, los emojis o quita/añade uno solo si el cambio lo pide. Si la ficha no trae rótulos de la referencia, devuelve la lista vacía y el cambio va en texto_principal o cta.
- texto_principal y cta: los rótulos de siempre del montaje (se usan si no hay rótulos de la referencia). Cámbialos solo si el cambio los pide o si no hay rótulos de la referencia.
- Los rótulos van en el idioma del anuncio, natural, aunque el cambio venga en español: «que diga que es en Berlín» → «…in Berlin…». El producto se nombra como en la ficha. Las marcas, tiendas y personajes de terceros se pueden nombrar (marketing orgánico): si el cambio pide una tienda o una marca, escríbela tal cual («que diga Lidl» → «…LIDL…», con las mayúsculas del rótulo), y una tienda nunca se cambia por el nombre del producto.
- Música: cambia_cancion true solo si el cambio pide otra música; entonces cancion_id es el id de la canción de la lista que mejor encaje, o null para el audio original de la referencia. Si no, cambia_cancion false y cancion_id null.
- doblar: «si» o «no» solo si el cambio pide doblar o no doblar el diálogo (o poner o quitar la voz original); si no, «igual».
- resumen: una frase en español con lo que has cambiado.
Responde solo con el JSON pedido.`;

export interface EditChangeInput {
  videoId: number;
  runId: number;
  /** Quien pidió el cambio (su tope de gasto; el dueño va al Mac). */
  userId: number;
  productId: number;
  product: { name: string; language: string };
  instruction: string;
  cues: ReferenceCue[];
  texts: { main: string; cta: string };
  song: { id: number; title: string } | null;
  dub: boolean;
  gateway?: LlmGateway;
}

export interface EditChangeResult {
  cues: ReferenceCue[];
  texts: { main: string; cta: string };
  /** `undefined`: la música no cambia; `null`: audio original; un id: esa canción. */
  songId: number | null | undefined;
  /** `undefined`: el doblaje no cambia. */
  dub: boolean | undefined;
  summary: string;
}

/** Claude aplica el cambio a la ficha. Lanza si no puede (sin Claude: `LlmCapReachedError`). */
export async function applyEditChange(input: EditChangeInput): Promise<EditChangeResult> {
  const songs = (await listSongs()).slice(0, 80);
  const ficha = {
    producto: input.product.name,
    idioma: input.product.language,
    rotulos: input.cues.map((c) => ({ desde_s: c.startS, texto: c.text, cta: c.cta })),
    texto_principal: input.texts.main,
    cta: input.texts.cta,
    musica: input.song ? `canción «${input.song.title}» (id ${input.song.id})` : "audio original de la referencia",
    doblaje: input.dub ? "el diálogo se dobla al idioma del anuncio" : "sin doblar",
  };
  const answer = await (input.gateway ?? getGateway()).call<Answer>({
    tier: "medium",
    stepKey: `montaje:${input.videoId}:cambio:${input.runId}`,
    userId: input.userId,
    productId: input.productId,
    rules: [],
    instructions: EDIT_CHANGE_INSTRUCTIONS + (await preferencesFor("montaje", { videoId: input.videoId, productId: input.productId })).text,
    content: [
      textPart(`Ficha del montaje actual:\n${JSON.stringify(ficha, null, 2)}`),
      textPart(`Canciones de la biblioteca (id: título):\n${songs.map((s) => `${s.id}: ${s.title}`).join("\n") || "(ninguna)"}`),
      textPart(`El cambio que se pide:\n${input.instruction}`),
    ],
    maxTokens: 3_000,
    schema: answerSchema,
  });
  const data = answer.data;
  if (!data) throw new Error("Claude no devolvió la ficha cambiada.");
  const known = new Set(songs.map((s) => s.id));
  const songId = !data.cambia_cancion ? undefined : data.cancion_id !== null && known.has(data.cancion_id) ? data.cancion_id : data.cancion_id === null ? null : undefined;
  return {
    cues: [...data.rotulos]
      .sort((a, b) => a.desde_s - b.desde_s)
      .map((row) => ({ startS: row.desde_s, source: "", text: row.texto.trim(), es: "", cta: row.cta })),
    texts: { main: data.texto_principal.trim(), cta: data.cta.trim() },
    songId: songId === (input.song?.id ?? null) ? undefined : songId,
    dub: data.doblar === "igual" || (data.doblar === "si") === input.dub ? undefined : data.doblar === "si",
    summary: data.resumen.trim(),
  };
}

/** Guarda en el vídeo lo que dejó el cambio: rótulos, textos, música, doblaje y el cambio ya hecho en el historial. */
export async function saveEditChange(videoId: number, override: EditOverride, result: EditChangeResult, keepCues: boolean, now: Date): Promise<void> {
  const done = override.pendiente;
  const next: EditOverride = {
    rotulos: keepCues ? result.cues.map((c) => ({ desde_s: c.startS, texto: c.text, cta: c.cta })) : override.rotulos,
    cambios: done ? [...override.cambios, { ...done, resumen: result.summary }].slice(-30) : override.cambios,
    pendiente: null,
  };
  await getDb()
    .update(schema.videos)
    .set({
      editOverride: next,
      editMainText: result.texts.main,
      editCtaText: result.texts.cta,
      ...(result.songId !== undefined ? audioColumns(result.songId) : {}),
      ...(result.dub !== undefined ? { dubDialogue: result.dub } : {}),
      updatedAt: now,
    })
    .where(eq(schema.videos.id, videoId));
}

/**
 * Una vez por `key` (al arrancar el worker): deshace los cambios pedidos de un vídeo y lo vuelve a montar como en el
 * montaje `runId` (sus mismos rótulos de la tarjeta; los de la referencia, de la lectura guardada).
 */
export async function undoEditChangesOnce(key: string, videoId: number, runId: number, now: Date = new Date()): Promise<void> {
  const { getSetting, setSetting } = await import("@/db/client");
  const { getActiveUser } = await import("@/server/auth");
  if (await getSetting<string>(key)) return;
  await setSetting(key, now.toISOString());
  const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId));
  const [run] = await getDb().select({ spec: schema.editRuns.spec, videoId: schema.editRuns.videoId }).from(schema.editRuns).where(eq(schema.editRuns.id, runId));
  const user = video ? await getActiveUser(video.createdBy) : null;
  if (!video || !user || run?.videoId !== videoId) return;
  const texts = (run.spec as { texts?: { main: string; cta: string } }).texts;
  await getDb()
    .update(schema.videos)
    .set({ editOverride: null, ...(texts ? { editMainText: texts.main, editCtaText: texts.cta } : {}) })
    .where(eq(schema.videos.id, videoId));
  try {
    const { runId: next } = await queueEdit({ ...video, editOverride: null, ...(texts ? { editMainText: texts.main, editCtaText: texts.cta } : {}) }, await getProductFor(user, video.productId), user.id, now);
    console.log(`[montaje] Vídeo ${videoId}: cambios pedidos deshechos (${key}), se monta otra vez como el montaje ${runId}: montaje ${next}.`);
  } catch (error) {
    console.warn(`[montaje] No se pudo volver a montar el vídeo ${videoId} (${key}): ${error instanceof Error ? error.message : error}`);
  }
}
