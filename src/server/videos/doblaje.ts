import { preferencesFor } from "@/server/videos/aprendizaje/preferencias";
import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getHiggsfield, HiggsfieldRejectedError, HiggsfieldUnknownOutcomeError, isHiggsfieldError, type HiggsfieldPort } from "@/connectors/higgsfield";
import { z } from "zod";
import { textPart } from "@/llm/content";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import { learnedFor } from "@/server/videos/mejoras/corrections";
import type { ObjectStore } from "@/lib/object-store";

/**
 * «Traducir el diálogo al alemán» en el montaje. Copia del método que funcionó en Codex el 19/11/2026
 * (`EDITOR/dialogue_stems.py` + `EDITOR/reference_dubbing.py`; prueba real
 * `AUTOMATIZACION SEGA/Audio/Pruebas/Df5AlGsNWCn/DE`), en la nube:
 *
 * 1. `montador/doblar.py separar`: BandIt v2 separa el «Audio original» (el de la referencia) en voz,
 *    música y efectos, y hace `dialogue-only.mp4` (SOLO la voz).
 * 2. Ese vídeo se sube a Higgsfield y se dobla con el modelo `dubbing` (`target_language: deu`). GASTA
 *    créditos (66 por 12 s en la prueba de Codex): se presupuesta, se mira el saldo y se envía UNA vez.
 * 3. `montador/doblar.py mezclar`: la voz alemana sobre la música y los efectos ORIGINALES (la canción
 *    no se toca), con la duración del original. Ese audio pasa a ser el «Audio original» del montaje.
 *
 * Una fila de `dubs` por vídeo y audio de partida: volver a montar el mismo vídeo reutiliza el doblaje
 * (del almacén) y no paga otra vez. Un envío del que no se sabe si llegó no se repite solo: el montaje
 * se para con el motivo y, si la persona vuelve a montar, se intenta de nuevo.
 */

/**
 * Idioma del anuncio (`products.language`, ISO 639-1) → el código de Higgsfield `dubbing` (ISO 639-3) y su nombre.
 * Regla fija del dueño (24/11/2026): el diálogo se dobla POR DEFECTO al idioma del país del producto.
 */
export const DUB_LANGUAGES: Record<string, { code: string; name: string }> = {
  de: { code: "deu", name: "alemán" },
  it: { code: "ita", name: "italiano" },
  fr: { code: "fra", name: "francés" },
  es: { code: "spa", name: "español" },
  en: { code: "eng", name: "inglés" },
  pt: { code: "por", name: "portugués" },
  pl: { code: "pol", name: "polaco" },
  sv: { code: "swe", name: "sueco" },
  fi: { code: "fin", name: "finés" },
  tr: { code: "tur", name: "turco" },
};
export const dubLanguageOf = (language: string) => DUB_LANGUAGES[language] ?? DUB_LANGUAGES.de;
/** Lo que se espera a Higgsfield dentro de un mismo montaje antes de devolverlo a la cola (Codex: 20 min). */
export const DUB_WAIT_IN_RUN_MS = 10 * 60_000;
/** Desde el envío, lo más que se espera un doblaje antes de darlo por fallido. */
export const DUB_MAX_MS = 60 * 60_000;
/** Cada cuánto se vuelve a mirar un doblaje que sigue en marcha cuando el montaje vuelve a la cola. */
export const DUB_RECHECK_MS = 2 * 60_000;

export const DUB_UNKNOWN =
  "No sabemos si el doblaje llegó a Higgsfield. Vuelve a montar el vídeo para intentarlo otra vez (puede cobrarse de nuevo).";
export const dubFailure = (detail: string) => `No se pudo doblar el diálogo: ${detail}`;

const dubs = schema.dubs;
type Dub = typeof dubs.$inferSelect;
/** 1 si la fila está viva (la que cuenta: `dubs_one_live`). */
const LIVE = sql<number>`(case when ${schema.dubs.status} in ('submitting', 'submitted', 'done', 'skipped') then 1 else 0 end)`;

/**
 * Si el montaje dobla el diálogo: SIEMPRE, salvo que el dueño lo apague en la tarjeta (regla fija del 24/11/2026).
 * Doblar no gasta si no hace falta: sin diálogo o con el diálogo ya en el idioma del anuncio, no se envía nada.
 */
export async function dubDialogueOf(video: { dubDialogue: boolean | null }): Promise<boolean> {
  return video.dubDialogue ?? true;
}

export interface DubContext {
  videoId: number;
  /** Cuándo se pidió el montaje: una duda anterior a él se puede volver a intentar (lo pidió la persona). */
  requestedAt: Date;
  /** El «Audio original» ya en el disco. */
  audio: string;
  /** Idioma del anuncio (`products.language`, ISO 639-1): al que se dobla. */
  language: string;
  /** El vídeo de la referencia, si está (el `dialogue-only.mp4` lleva su imagen, como en Codex); si no, negro. */
  referenceVideo: string | null;
  dir: string;
  store: ObjectStore;
  notes: string[];
  /** Corre `doblar.py` con sus argumentos; `{ ok, error?, … }` de su última línea. */
  doblar: (args: string[]) => Promise<DoblarResult>;
  higgsfield?: HiggsfieldPort;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Lo que `jobs_wait` espera en cada pregunta a Higgsfield (0–15 s; por defecto 15). */
  pollSeconds?: number;
  /** El dueño encendió «Doblar el diálogo» a propósito en la tarjeta: es diálogo, se dobla todo sin clasificar. */
  forced?: boolean;
  /**
   * Tramos [desde, hasta] (s del «Audio original») en los que la comprobación final del montaje oyó diálogo en el idioma
   * original: son habla sí o sí y se doblan (con lo que haya en la voz o en la música). Los pone `dubbedAudio`.
   */
  forceWindows?: Array<[number, number]>;
  /**
   * Tramos en los que la comprobación final oyó una letra de canción traducida (alemán cantado o un trozo de verso
   * doblado): ahí todo es canto y no se dobla. Los pone `dubbedAudio` (de `raw.cantar`).
   */
  singWindows?: Array<[number, number]>;
  /** Claude (pruebas: uno simulado) para decidir si la voz es habla o una canción. */
  gateway?: LlmGateway;
  /** Aquí se apuntan las correcciones aprendidas («Mejoras», paso `doblaje`) que se usaron. */
  learned?: number[];
}

/** Lo que responde `doblar.py`; `voz` (al separar): si hay diálogo y en qué idioma (Whisper), `null` si no se sabe. */
export interface DoblarResult {
  ok: boolean;
  error?: string;
  voz?: { hay: boolean; idioma: string | null; probabilidad: number | null; texto: string; motivo: string | null; frases?: Phrase[] } | null;
  /** Frases en el idioma del diálogo que BandIt dejó en la música (sin mover): Claude decide si son habla. */
  candidatas?: Array<Phrase & { pista: string }>;
  /** `comprobar`: si se pudo comprobar y las frases que siguen en el idioma original. */
  comprobado?: boolean;
  quedan?: Array<{ desde: number; hasta: number; texto: string; idioma: string }>;
  /** `tramo`: el trozo que se vuelve a doblar (s). */
  desde?: number;
  hasta?: number;
}

/** El margen que `doblar.py rescatar` pone a cada lado de una ventana de habla (`RELLENO_S`). */
const RESCUE_MARGIN_S = 0.25;

/** Cuántas veces se vuelve a doblar un trozo que quedó en el idioma original. */
export const MAX_REPAIRS = 2;

/** Una frase que oyó Whisper, con lo seguro que está de que es habla (`no_habla` = `no_speech_prob`). */
export interface Phrase {
  desde: number;
  hasta: number;
  texto: string;
  idioma: string | null;
  prob: number;
  no_habla: number;
  confianza: number;
}

export const SPEECH_INSTRUCTIONS = [
  "Decides si cada frase que oyó Whisper en el audio de un vídeo corto de redes es HABLA (una persona hablando: diálogo, exclamación, narración a cámara) o CANTO (un verso de la letra de una canción).",
  "Reglas fijas del dueño: se dobla el diálogo y una canción no se traduce nunca. Ante la duda gana HABLA. Con una canción de fondo, el diálogo se dobla igual.",
  "Por frase te doy la pista de la que sale («voz»: la pista de diálogo del separador; «music»/«sfx»: voz que quedó dentro de la música), el texto (Whisper large-v3-turbo) y cuánto dura.",
  "CANTO si la frase es un verso de una canción: de una que puedes nombrar (da su título en «cancion» y en «verso» la línea de la letra; Whisper puede transcribirla mal: «Sad is frightful» es «Oh, the weather outside is frightful» de «Let It Snow») o letra claramente cantada aunque no conozcas la canción: versos que riman o tienen métrica de canción, un estribillo que se repite («Come on, come on, rock your body», «Baby, baby, baby…», «Hooray to downtown!» varias veces), frases poéticas en primera persona que no se dirigen a nadie de la escena («The angels up in the clouds are jealous knowing we found…», «I'm a shot alone in my tower»). Entonces «cancion» puede ser null.",
  "Whisper transcribe a medias los versos que suenan pegados a otros versos: una frase sin sentido como conversación justo antes, durante o después de un verso («Made in the step.» detrás de «A place on a lover with a fire in its heart») es un trozo de la canción.",
  "Una frase conversacional es HABLA aunque a la vez suene una canción: alguien que habla con otra persona de la escena o a cámara, con preguntas, respuestas, promesas, exclamaciones o comentarios sobre lo que pasa («Ten seconds, I promise.», «Oh no, I'm good.», «Wait, what?», «Oh, you're buying it.», «I got one last week. Best thing ever. Enjoy!», «How many are you getting?», «Excuse me, ma'am. Where'd you get those?», «I got it online.», «This one's just for me.», «You deserve it, mama.», «Three, two, one, let's go!», «Oh my God! Look at her wings!»). Solo es CANTO si es literalmente un verso de una canción (por ejemplo «Who let the dogs out?» es el estribillo de «Who Let the Dogs Out»).",
  "Cada frase se juzga sola: que otras frases sean una canción no convierte en canto a las demás. Que la frase salga de la pista «music» no la hace canto (el separador mete a veces el diálogo en la música), ni salir de «voz» la hace habla (a veces se cuela un verso).",
  "Ejemplos de CANTO: «Last Christmas, I gave you my heart» (Last Christmas), «Rockin' around the Christmas tree» (Rockin' Around the Christmas Tree), «Jingle bell, jingle bell, jingle bell rock» (Jingle Bell Rock), «All I want for Christmas is you» (All I Want for Christmas Is You), «Oh, the weather outside is frightful» (Let It Snow).",
  "Si de verdad no puedes decidir, es HABLA. Responde por cada frase (n desde 1) tipo «habla» o «canto»; «conversacional»: true si tiene sentido como algo que una persona de la escena dice a otra o a cámara (pregunta, respuesta, reacción, comentario sobre lo que pasa), false si no lo tiene (poético, sin interlocutor, palabras sueltas o sin sentido); si es canto, «cancion» y «verso» si los sabes (si no, null), y un motivo corto.",
].join("\n");

const speechSchema = z.object({
  frases: z
    .array(
      z.object({
        n: z.number().int().min(1),
        tipo: z.enum(["habla", "canto", "duda"]),
        conversacional: z.boolean().optional(),
        cancion: z.string().max(120).nullable().optional(),
        verso: z.string().max(200).nullable().optional(),
        motivo: z.string().max(200),
      }),
    )
    .max(40),
});

/**
 * Habla o canto, frase a frase (Claude con el texto de Whisper). Regla del dueño (25/11/2026): ante la duda HABLA; la
 * frase conversacional es habla aunque suene una canción; canto es el verso de una canción (conocida o claramente letra
 * cantada). «duda» o una frase sin contestar: habla.
 * `null` si Claude no puede contestar: entonces no se sabe y el montaje no se entrega sin comprobar.
 */
export async function classifySpeech(
  ctx: Pick<DubContext, "videoId" | "gateway" | "learned">,
  userId: number,
  productId: number | null,
  phrases: Array<Phrase & { pista: string }>,
): Promise<Array<"habla" | "canto"> | null> {
  const detailed = await classifySpeechDetailed(ctx, userId, productId, phrases);
  return detailed ? detailed.map((d) => d.kind) : null;
}

/** Como `classifySpeech`, con si cada frase es conversacional (Claude). */
export async function classifySpeechDetailed(
  ctx: Pick<DubContext, "videoId" | "gateway" | "learned">,
  userId: number,
  productId: number | null,
  phrases: Array<Phrase & { pista: string }>,
): Promise<Array<{ kind: "habla" | "canto"; conversational: boolean }> | null> {
  if (phrases.length === 0) return [];
  const listing = phrases
    .map((f, i) => `${i + 1}. [${f.pista}] ${f.desde.toFixed(1)}–${f.hasta.toFixed(1)} s (${(f.hasta - f.desde).toFixed(1)} s): «${f.texto}»`)
    .join("\n");
  // Correcciones aprendidas de los reportes sobre el doblaje («Mejoras»): van al final de las instrucciones.
  const learned = await learnedFor("doblaje", productId);
  learned.text += (await preferencesFor("doblaje", { videoId: ctx.videoId, productId })).text;
  ctx.learned?.push(...learned.ids);
  try {
    const answer = await (ctx.gateway ?? getGateway()).call({
      tier: "medium",
      stepKey: `montaje:${ctx.videoId}:habla-o-canto:${crypto.createHash("sha256").update(listing + learned.text).digest("hex").slice(0, 16)}`,
      userId,
      productId,
      rules: [],
      instructions: SPEECH_INSTRUCTIONS + learned.text,
      content: [textPart(listing)],
      maxTokens: 2_000,
      schema: speechSchema,
    });
    const byN = new Map((answer.data?.frases ?? []).map((f) => [f.n, f]));
    const kinds = phrases.map((_, i) => (byN.get(i + 1)?.tipo === "canto" ? ("canto" as const) : ("habla" as const)));
    const conversational = phrases.map((_, i) => byN.get(i + 1)?.conversacional !== false);
    return lyricFragments(phrases, kinds, conversational).map((kind, i) => ({ kind, conversational: conversational[i] }));
  } catch (error) {
    console.warn(`[doblaje] Claude no pudo decir si el vídeo ${ctx.videoId} tiene habla o canto: ${messageOf(error)}`);
    return null;
  }
}

/** Lo que se considera «pegado» a un verso (s): Whisper corta los versos y deja trozos sueltos a su lado. */
export const LYRIC_GAP_S = 1;

/**
 * Trozos de canción que Claude dio por habla (lote 11, 26/11/2026: «Made in the step.» detrás de un verso en el vídeo 64):
 * una frase que NO es conversacional (Claude) y que está en la pista de música, o solapa o va pegada (≤ LYRIC_GAP_S) a
 * una frase de canto, o se repite como un estribillo, es canto. Una frase conversacional sigue siendo habla aunque suene una canción a la vez
 * («Ten seconds, I promise.» con «Jingle Bell Rock», lote 10): eso no se toca.
 */
export function lyricFragments(
  phrases: Array<{ desde: number; hasta: number; texto: string; pista?: string }>,
  kinds: Array<"habla" | "canto">,
  conversational: boolean[],
): Array<"habla" | "canto"> {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const near = (a: { desde: number; hasta: number }, b: { desde: number; hasta: number }) => a.desde < b.hasta + LYRIC_GAP_S && b.desde < a.hasta + LYRIC_GAP_S;
  const overlaps = (a: { desde: number; hasta: number }, b: { desde: number; hasta: number }) => a.desde < b.hasta && b.desde < a.hasta;
  return kinds.map((kind, i) => {
    if (kind === "canto" || conversational[i]) return kind;
    const f = phrases[i];
    // El separador la dejó en la música y no tiene sentido como conversación: es la canción (lote 11, vídeo 65: «I'm a
    // shot alone in my tower», sola, Claude la daba unas veces habla y otras canto). La cuenta atrás del vídeo 22, en la
    // música pero conversacional, sigue siendo habla.
    if (f.pista && f.pista !== "voz") return "canto";
    const nextToSong = phrases.some((g, j) => j !== i && kinds[j] === "canto" && near(f, g));
    const text = norm(f.texto);
    const repeated = text.length > 0 && phrases.some((g, j) => j !== i && norm(g.texto) === text && !overlaps(f, g));
    return nextToSong || repeated ? "canto" : "habla";
  });
}

/** Versión de la decisión habla/canto (5: 26/11/2026, trozos de canción y lo no conversacional de la música): las marcas sin ella se vuelven a mirar. */
export const DECISION_VERSION = 5;

type Analysis =
  | { kind: "skip"; record: boolean; why: string; note: string | null; raw: unknown }
  | { kind: "speech"; origin: string | null; raw: Record<string, unknown> };

/**
 * Separa la voz y decide si hay que doblar: hay palabras, no están ya en el idioma del anuncio y Claude dice que son
 * HABLA (no la letra de una canción). Las frases de habla que BandIt dejó en la música pasan a la voz (`rescatar`).
 */
async function analyse(ctx: DubContext, stems: string, userId: number, target: { code: string; name: string }): Promise<Analysis> {
  const separated = await ctx.doblar(["separar", ctx.audio, stems, "--destino", ctx.language, ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
  if (!separated.ok) {
    // Aún no se ha gastado nada: se monta con el audio original y se avisa (el doblaje va por defecto).
    return { kind: "skip", record: false, why: "separar", note: `No se pudo separar la voz de la referencia (${(separated.error ?? "sin detalle").slice(0, 120)}): el diálogo va sin doblar`, raw: null };
  }
  const voz = separated.voz;
  if (voz === undefined || voz === null) return { kind: "skip", record: false, why: "sin Whisper", note: "No se pudo saber si la referencia tiene diálogo: no se dobla", raw: null };
  // Las frases con palabras: las de la pista de voz y las que BandIt dejó en la música (a veces TODO el diálogo, como
  // en el vídeo 22). La pista no decide nada: decide qué es cada frase.
  const phrases = [...(voz.hay ? (voz.frases ?? []).map((f) => ({ ...f, pista: "voz" })) : []), ...(separated.candidatas ?? [])];
  const forcedWindows = ctx.forceWindows ?? [];
  if (phrases.length === 0 && forcedWindows.length === 0) return { kind: "skip", record: true, why: `sin diálogo (${voz.motivo ?? "sin palabras"})`, note: null, raw: voz };
  const foreign = phrases.filter((f) => f.idioma !== ctx.language);
  if (foreign.length === 0 && forcedWindows.length === 0) {
    return { kind: "skip", record: true, why: `el diálogo ya está en ${target.name}`, note: `El diálogo de la referencia ya está en ${target.name}: no se dobla`, raw: voz };
  }
  const [owner] = await getDb().select({ productId: schema.videos.productId }).from(schema.videos).where(eq(schema.videos.id, ctx.videoId));
  // Con «Doblar el diálogo» encendido a propósito en la tarjeta, el dueño ya ha dicho que es diálogo: se dobla todo.
  const detailed = ctx.forced ? foreign.map(() => ({ kind: "habla" as const, conversational: true })) : await classifySpeechDetailed(ctx, userId, owner?.productId ?? null, foreign);
  const kinds = detailed?.map((d) => d.kind) ?? null;
  if (kinds === null) return { kind: "skip", record: false, why: "sin Claude", note: "No se pudo decidir si la voz es habla o una canción: no se dobla", raw: null };
  // Cada frase vale por sí sola: una canción que suena a la vez NO convierte el diálogo en canto (lote 10: «Ten seconds,
  // I promise» con «Jingle Bell Rock» debajo). Lo que la comprobación final oyó en el idioma original es habla.
  const overlaps = (f: { desde: number; hasta: number }, [a, b]: [number, number]) => f.desde < b && a < f.hasta;
  const singWindows = ctx.singWindows ?? [];
  // Donde la comprobación final oyó una letra traducida, canto; salvo una frase conversacional (el diálogo que suena
  // junto a la canción se sigue doblando: «That's it?» en el vídeo 64).
  const classified: Array<Phrase & { pista: string; tipo: "habla" | "canto"; conversacional?: boolean }> = foreign.map((f, i) => ({
    ...f,
    conversacional: detailed?.[i]?.conversational,
    tipo: forcedWindows.some((w) => overlaps(f, w))
      ? ("habla" as const)
      : singWindows.some((w) => overlaps(f, w)) && !detailed?.[i]?.conversational
        ? ("canto" as const)
        : kinds[i],
  }));
  // Un tramo de la comprobación final sin ninguna frase de habla aquí (Whisper no la oyó en la referencia): se dobla igual,
  // con la voz que haya en la música en ese tramo.
  for (const w of forcedWindows) {
    if (!classified.some((f) => f.tipo === "habla" && overlaps(f, w))) {
      classified.push({ desde: w[0], hasta: w[1], texto: "(diálogo oído en la comprobación final)", idioma: null, prob: 0, no_habla: 0, confianza: 0, pista: "music", tipo: "habla" });
    }
  }
  const speech = classified.filter((f) => f.tipo === "habla");
  if (speech.length === 0) {
    return {
      kind: "skip",
      record: true,
      why: "solo canto",
      note: "La voz de la referencia es una canción (o no está claro que alguien hable): no se dobla; la canción no se traduce",
      raw: { voz, frases: classified },
    };
  }
  // En la voz, solo la habla: la de la música pasa a la voz y lo que la voz tenga fuera de la habla (canto) vuelve a la
  // música, que suena igual que en la referencia.
  const rescue = speech.filter((f) => f.pista !== "voz");
  // Las ventanas del diálogo: las frases de habla y los tramos de la comprobación final (enteros, aunque la frase oída
  // aquí sea más corta).
  // Una frase de diálogo en un tramo donde se oyó letra traducida: la canción se coló en su ventana (vídeo 64). Se dobla
  // solo la frase, sin el margen que `rescatar` pone a cada lado.
  const tight = (f: Phrase): [number, number] => {
    const [a, b] = [f.desde + RESCUE_MARGIN_S, f.hasta - RESCUE_MARGIN_S];
    return b - a >= 0.3 ? [a, b] : [f.desde, f.hasta];
  };
  // También el diálogo que suena a la vez que un verso: sin margen, entra menos canción en lo que se dobla (vídeo 64).
  const song = classified.filter((f) => f.tipo === "canto").map((f): [number, number] => [f.desde, f.hasta]);
  const windows = speech.map((f): [number, number] =>
    singWindows.some((w) => overlaps(f, w)) || song.some((w) => overlaps(f, w)) ? tight(f) : [f.desde, f.hasta],
  );
  for (const w of forcedWindows) if (!windows.some(([a, b]) => a <= w[0] && w[1] <= b)) windows.push(w);
  const moved = await ctx.doblar([
    "rescatar",
    stems,
    ...rescue.map((f) => `${f.desde}:${f.hasta}`),
    "--habla",
    ...windows.map(([a, b]) => `${a}:${b}`),
    ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : []),
  ]);
  if (!moved.ok) return { kind: "skip", record: false, why: "rescatar", note: `No se pudo preparar la voz (${(moved.error ?? "sin detalle").slice(0, 120)}): el diálogo va sin doblar`, raw: null };
  if (rescue.length) ctx.notes.push(`Habla que estaba en la música, también doblada: ${rescue.map((f) => `«${f.texto}» (${f.desde}–${f.hasta} s)`).join(", ")}`);
  const canto = classified.filter((f) => f.tipo !== "habla");
  if (canto.length) ctx.notes.push(`No se dobla (letra de una canción): ${canto.map((f) => `«${f.texto}»`).join(", ")}`);
  const counts = new Map<string, number>();
  for (const f of speech) if (f.idioma) counts.set(f.idioma, (counts.get(f.idioma) ?? 0) + 1);
  const origin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? voz.idioma;
  return {
    kind: "speech",
    origin,
    raw: {
      origen: origin,
      ventanas: windows,
      frases: classified,
      clasificado: true,
      decision: DECISION_VERSION,
      ...(forcedWindows.length ? { forzar: forcedWindows } : {}),
      ...(singWindows.length ? { cantar: singWindows } : {}),
      // Lo que ya estaba en el idioma del anuncio (una canción alemana, un diálogo alemán): la comprobación final no lo
      // toma por letra traducida.
      nativas: phrases.filter((f) => f.idioma === ctx.language).map((f): [number, number] => [f.desde, f.hasta]),
    },
  };
}

export type DubOutcome =
  | { kind: "ready"; path: string; /** Idioma original del diálogo (para la comprobación final). */ origin: string | null }
  /** No hace falta doblar (sin diálogo, ya en el idioma del anuncio o no se sabe): el «Audio original» tal cual. */
  | { kind: "skip" }
  | { kind: "defer"; delayMs: number }
  | { kind: "failed"; shown: string; detail: string };

const nowOf = (ctx: DubContext) => ctx.now?.() ?? new Date();
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function update(id: number, values: Partial<Dub>): Promise<void> {
  await getDb().update(dubs).set({ ...values, updatedAt: new Date() }).where(eq(dubs.id, id));
}

/**
 * Vuelve a doblar un trozo (`file`, solo esa voz) y lo deja en `out`: subir, presupuestar, mirar el saldo, enviar y
 * esperar como mucho `DUB_WAIT_IN_RUN_MS`. `null` si no se pudo (no hay saldo, Higgsfield no lo hizo…): el montaje sigue
 * con lo que hay y lo dice. Los créditos se suman al doblaje del vídeo.
 */
async function redubPiece(ctx: DubContext, higgsfield: HiggsfieldPort, userId: number, language: string, file: string, out: string): Promise<{ file: string; credits: number } | null> {
  try {
    const { mediaId } = await higgsfield.uploadMedia(userId, { bytes: await fs.readFile(file), filename: "dialogue-piece.mp4", contentType: "video/mp4", type: "video" });
    const request = { mediaId, targetLanguage: language };
    const quote = await higgsfield.quoteDubbing(userId, request);
    if ((await higgsfield.balance(userId)).credits < quote.credits) return null;
    const sent = await higgsfield.submitDubbing(userId, request);
    const jobId = sent.jobIds[0];
    const started = nowOf(ctx).getTime();
    for (;;) {
      const [job] = await higgsfield.jobs(userId, [jobId], ctx.pollSeconds ?? 15);
      if (job?.status === "done" && job.urls[0]) {
        const response = await (ctx.fetch ?? fetch)(job.urls[0]);
        if (!response.ok || !response.body) return null;
        await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(out));
        return { file: out, credits: quote.credits };
      }
      if (job?.status === "failed" || nowOf(ctx).getTime() - started > DUB_WAIT_IN_RUN_MS) return null;
    }
  } catch (error) {
    console.warn(`[doblaje] No se pudo volver a doblar un trozo del vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return null;
  }
}

/** El «Audio original» con el diálogo doblado al idioma del anuncio (ver arriba). Nunca lanza: dice si está, si hay que esperar o por qué no. */
export async function dubbedAudio(ctx: DubContext): Promise<DubOutcome> {
  const higgsfield = ctx.higgsfield ?? getHiggsfield();
  const [video] = await getDb().select({ createdBy: schema.videos.createdBy }).from(schema.videos).where(eq(schema.videos.id, ctx.videoId));
  if (!video) return { kind: "failed", shown: dubFailure("el vídeo ya no existe"), detail: "sin vídeo" };
  const userId = video.createdBy;
  const sha = await sha256File(ctx.audio);
  const stems = path.join(ctx.dir, "doblaje");
  const output = path.join(ctx.dir, "audio-doblado.m4a");
  const target = dubLanguageOf(ctx.language);

  try {
    // La fila viva (hecha, saltada o en marcha; solo puede haber una) manda sobre la última: así se puede devolver a mano
    // un doblaje bueno sin que una fila fallida posterior lo tape (vídeo 46, 25/11/2026).
    let [row]: Array<Dub | undefined> = await getDb()
      .select()
      .from(dubs)
      .where(and(eq(dubs.videoId, ctx.videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, target.code)))
      .orderBy(desc(LIVE), desc(dubs.id))
      .limit(1);
    // Tramos que la comprobación final del montaje oyó en el idioma original: se doblan sí o sí.
    const forzar = (row?.raw as { forzar?: Array<[number, number]> } | null)?.forzar ?? [];
    if (forzar.length) ctx = { ...ctx, forceWindows: forzar };
    const cantar = (row?.raw as { cantar?: Array<[number, number]> } | null)?.cantar ?? [];
    if (cantar.length) ctx = { ...ctx, singWindows: cantar };

    // Ya se vio que no hace falta doblar este audio: nada. Las marcas de antes de decidir frase a frase habla o canto
    // (sin `decision: 2`; p. ej. «voz casi muda» con el diálogo en la música) se vuelven a mirar.
    if (row?.status === "skipped") {
      if ((row.raw as { decision?: number } | null)?.decision === DECISION_VERSION) return { kind: "skip" };
      await update(row.id, { status: "failed", error: `${row.error ?? "sin doblar"} (se vuelve a decidir habla o canto)` });
      row = undefined;
    }
    // Doblajes de antes de decidir habla o canto (24/11/2026): se vuelve a mirar. Si era una canción, fuera el doblaje
    // y el audio original (una canción no se traduce); si era habla, se reutiliza sin pagar otra vez.
    if (row?.status === "done" && row.storageKey && (row.raw as { decision?: number } | null)?.decision !== DECISION_VERSION) {
      const again = await analyse(ctx, stems, userId, target);
      if (again.kind === "skip") {
        if (again.record) {
          await update(row.id, { status: "skipped", error: `Doblaje retirado: ${again.why}`, raw: { ...((row.raw as object | null) ?? {}), retirado: again.raw, decision: DECISION_VERSION } });
          ctx.notes.push("El doblaje anterior era de una canción: se quita y vuelve el audio original");
        } else if (again.note) ctx.notes.push(again.note);
        return { kind: "skip" };
      }
      // Era habla: antes de reutilizar el doblaje viejo, se comprueba con las ventanas nuevas que no quede nada en el
      // idioma original (el del vídeo 22 salió en inglés: se hizo con la versión anterior).
      await ctx.store.download(row.storageKey, output);
      const windows = (again.raw.ventanas as Array<[number, number]> | undefined) ?? [];
      const check = await ctx.doblar([
        "comprobar",
        output,
        ...(again.origin ? ["--origen", again.origin] : []),
        "--destino",
        ctx.language,
        ...(windows.length ? ["--ventanas", ...windows.map(([a, b]) => `${a}:${b}`)] : []),
      ]);
      if (!check.ok || check.comprobado !== true || (check.quedan ?? []).length > 0) {
        const why = (check.quedan ?? []).map((f) => f.texto).join(" · ") || "no se pudo comprobar";
        await update(row.id, { status: "failed", error: `Doblaje viejo con restos del idioma original (${why.slice(0, 200)}): se rehace` });
        ctx.notes.push(`El doblaje anterior seguía en el idioma original («${why.slice(0, 120)}»): se vuelve a doblar`);
        row = undefined;
      } else {
        const raw = { ...((row.raw as object | null) ?? {}), ...again.raw };
        await update(row.id, { raw });
        row = { ...row, raw };
      }
    }
    // Ya doblado: del almacén, sin pagar otra vez.
    // Los de antes de la comprobación con Whisper (24/11/2026) se rehacen: uno dejó una frase en inglés.
    if (row?.status === "done" && row.storageKey && !(row.raw as { comprobado?: boolean } | null)?.comprobado) {
      await update(row.id, { status: "failed", error: "Doblaje sin comprobar (antes del 24/11/2026): se rehace" });
      row = undefined;
    }
    if (row?.status === "done" && row.storageKey) {
      await ctx.store.download(row.storageKey, output);
      ctx.notes.push(`Diálogo en ${target.name}: el doblaje ya hecho de este vídeo (sin gastar otra vez)`);
      return { kind: "ready", path: output, origin: (row.raw as { origen?: string | null } | null)?.origen ?? null };
    }
    // Una duda (o un envío cortado a medias): solo se vuelve a intentar si la persona pidió el montaje después.
    if (row && (row.status === "unknown" || row.status === "submitting")) {
      if (row.updatedAt.getTime() >= ctx.requestedAt.getTime()) return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} en duda` };
      await update(row.id, { status: "failed", error: row.error ?? "En duda; se volvió a pedir el montaje" });
      row = undefined;
    }

    if (!row || row.status === "failed") {
      // ¿Hace falta? Sin habla (o solo una canción), o ya en el idioma del anuncio, no se envía nada (no se gasta).
      const decided = await analyse(ctx, stems, userId, target);
      if (decided.kind === "skip") {
        if (decided.record) {
          await getDb()
            .insert(dubs)
            .values({ videoId: ctx.videoId, userId, sourceSha256: sha, language: target.code, status: "skipped", quotedCredits: 0, error: decided.why, raw: { decision: DECISION_VERSION, detalle: decided.raw } })
            .onConflictDoNothing();
        }
        if (decided.note) ctx.notes.push(decided.note);
        return { kind: "skip" };
      }
      ctx.notes.push(`Diálogo de la referencia en «${decided.origin}»: se dobla al ${target.name}`);
      const bytes = await fs.readFile(path.join(stems, "dialogue-only.mp4"));
      const { mediaId } = await higgsfield.uploadMedia(userId, { bytes, filename: "dialogue-only.mp4", contentType: "video/mp4", type: "video" });
      const request = { mediaId, targetLanguage: target.code };
      const quote = await higgsfield.quoteDubbing(userId, request);
      const { credits } = await higgsfield.balance(userId);
      if (credits < quote.credits) {
        return {
          kind: "failed",
          shown: dubFailure(`no hay saldo en Higgsfield (hacen falta ${quote.credits} créditos y quedan ${credits})`),
          detail: "sin saldo",
        };
      }
      const [created] = await getDb()
        .insert(dubs)
        .values({ videoId: ctx.videoId, userId, sourceSha256: sha, language: target.code, status: "submitting", mediaId, quotedCredits: quote.credits })
        .returning();
      row = created;
      try {
        const sent = await higgsfield.submitDubbing(userId, request);
        await update(row.id, { status: "submitted", jobId: sent.jobIds[0], raw: { envio: sent.raw ?? null, ...decided.raw } });
        row = { ...row, status: "submitted", jobId: sent.jobIds[0], raw: { envio: sent.raw ?? null, ...decided.raw } };
        ctx.notes.push(`Diálogo en ${target.name}: doblaje enviado a Higgsfield (${quote.credits} créditos)`);
      } catch (error) {
        if (error instanceof HiggsfieldUnknownOutcomeError) {
          await update(row.id, { status: "unknown", error: "No se sabe si el envío llegó" });
          return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} en duda` };
        }
        await update(row.id, { status: "failed", error: messageOf(error) });
        const reason = error instanceof HiggsfieldRejectedError ? `Higgsfield no lo aceptó (${error.reason})` : messageOf(error);
        return { kind: "failed", shown: dubFailure(reason.slice(0, 250)), detail: messageOf(error) };
      }
    }

    // Enviado: se espera el resultado.
    const jobId = row.jobId;
    if (!jobId) return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} sin trabajo` };
    const started = nowOf(ctx).getTime();
    let url: string | null = null;
    for (;;) {
      const [job] = await higgsfield.jobs(userId, [jobId], ctx.pollSeconds ?? 15);
      if (job?.status === "done") {
        url = job.urls[0] ?? null;
        break;
      }
      if (job?.status === "failed") {
        await update(row.id, { status: "failed", error: job.error ?? job.failure ?? "failed" });
        return { kind: "failed", shown: dubFailure(`Higgsfield no pudo doblarlo${job.error ? ` (${job.error})` : ""}. Vuelve a montar para intentarlo`), detail: job.error ?? "failed" };
      }
      const now = nowOf(ctx).getTime();
      if (now - row.createdAt.getTime() > DUB_MAX_MS) {
        await update(row.id, { status: "failed", error: "Higgsfield tardó más de una hora" });
        return { kind: "failed", shown: dubFailure("Higgsfield tardó más de una hora. Vuelve a montar para intentarlo"), detail: "más de una hora" };
      }
      if (now - started > DUB_WAIT_IN_RUN_MS) return { kind: "defer", delayMs: DUB_RECHECK_MS };
    }
    if (!url) return { kind: "failed", shown: dubFailure("Higgsfield no dio el resultado"), detail: "sin dirección" };

    // El resultado, mezclado sobre la música y los efectos originales.
    const dub = path.join(ctx.dir, "dub.mp4");
    const response = await (ctx.fetch ?? fetch)(url);
    if (!response.ok || !response.body) return { kind: "failed", shown: dubFailure("no se pudo descargar el doblaje"), detail: `HTTP ${response.status}` };
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(dub));
    const haveStems = await fs.stat(path.join(stems, "music.wav")).then(() => true, () => false);
    if (!haveStems) {
      // Enviado en un montaje anterior: se vuelve a separar (da lo mismo: mismo audio, mismo modelo).
      const separated = await ctx.doblar(["separar", ctx.audio, stems, "--destino", ctx.language, ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!separated.ok) return { kind: "failed", shown: dubFailure(separated.error ?? "no se pudo separar la voz"), detail: separated.error ?? "separar" };
    }
    const mixed = await ctx.doblar(["mezclar", stems, dub, output]);
    if (!mixed.ok) {
      await update(row.id, { status: "failed", error: mixed.error ?? "mezclar" });
      return { kind: "failed", shown: dubFailure(mixed.error ?? "no se pudo mezclar"), detail: mixed.error ?? "mezclar" };
    }

    // Comprobación con Whisper: que no quede nada en el idioma original; si queda, se vuelve a doblar ese trozo.
    const origen = (row.raw as { origen?: string | null } | null)?.origen ?? null;
    const windows = (row.raw as { ventanas?: Array<[number, number]> } | null)?.ventanas ?? null;
    let voice = dub;
    let extra = 0;
    const repairs: Array<{ desde: number; hasta: number; texto: string; creditos: number }> = [];
    let left: NonNullable<DoblarResult["quedan"]> = [];
    let checked = false;
    for (let attempt = 0; ; attempt++) {
      const check = await ctx.doblar([
        "comprobar",
        output,
        ...(origen ? ["--origen", origen] : []),
        "--destino",
        ctx.language,
        // Solo dentro del diálogo: fuera suena la canción, que no se traduce nunca.
        ...(windows ? ["--ventanas", ...windows.map(([a, b]) => `${a}:${b}`)] : []),
      ]);
      checked = check.ok && check.comprobado === true;
      left = check.quedan ?? [];
      if (!checked || left.length === 0 || attempt >= MAX_REPAIRS) break;
      const leak = left[0];
      const piece = await ctx.doblar(["tramo", stems, String(leak.desde), String(leak.hasta), path.join(ctx.dir, `tramo-${attempt}.mp4`), ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!piece.ok || piece.desde === undefined) break;
      const redone = await redubPiece(ctx, higgsfield, userId, target.code, path.join(ctx.dir, `tramo-${attempt}.mp4`), path.join(ctx.dir, `tramo-${attempt}-doblado.mp4`));
      if (!redone) break;
      extra += redone.credits;
      const grafted = path.join(ctx.dir, `voz-${attempt}.wav`);
      const graft = await ctx.doblar(["injertar", voice, redone.file, String(piece.desde), grafted]);
      if (!graft.ok) break;
      voice = grafted;
      repairs.push({ desde: leak.desde, hasta: leak.hasta, texto: leak.texto, creditos: redone.credits });
      const remixed = await ctx.doblar(["mezclar", stems, voice, output]);
      if (!remixed.ok) break;
    }
    if (!checked) ctx.notes.push("No se pudo comprobar con Whisper que no quede diálogo en el idioma original");
    if (repairs.length) ctx.notes.push(`Vuelto a doblar porque seguía en el idioma original: ${repairs.map((r) => `«${r.texto}» (${r.desde}–${r.hasta} s)`).join(", ")}`);
    if (left.length) ctx.notes.push(`Sigue en el idioma original: ${left.map((r) => `«${r.texto}» (${r.desde}–${r.hasta} s)`).join(", ")}`);
    const key = `doblajes/${ctx.videoId}/${row.id}.m4a`;
    await ctx.store.putFile(key, output, { contentType: "audio/mp4" });
    await update(row.id, {
      status: "done",
      storageKey: key,
      creditsSpent: row.quotedCredits + extra,
      error: left.length ? `Sigue en el idioma original: ${left.map((r) => r.texto).join(" · ")}`.slice(0, 500) : null,
      raw: { ...((row.raw as object | null) ?? {}), comprobado: checked, reparaciones: repairs, quedan: left },
    });
    ctx.notes.push(`Diálogo traducido al ${target.name}; la música es la original`);
    return { kind: "ready", path: output, origin: origen };
  } catch (error) {
    const shown = isHiggsfieldError(error) ? dubFailure(error.message) : dubFailure("error interno del doblaje");
    return { kind: "failed", shown, detail: messageOf(error) };
  }
}

/** Cuántas veces, como mucho, la comprobación final manda volver a doblar un mismo audio antes de parar el montaje. */
export const MAX_FINAL_REDUBS = 2;
const FINAL_CHECK = "Comprobación final";

export interface FinalCheckContext {
  videoId: number;
  /** El vídeo montado (`salida.mp4`). */
  file: string;
  /** El «Audio original» de la referencia (sin doblar): su fila de `dubs` dice qué frases ya estaban en el idioma del anuncio. */
  audio: string;
  /** Idioma del anuncio (ISO 639-1). */
  language: string;
  /** El idioma original del diálogo si se sabe (el del doblaje); si no, cualquier otro idioma cuenta. */
  origin: string | null;
  /** «Doblar el diálogo» encendido a propósito en la tarjeta: todo es diálogo, no se buscan letras traducidas. */
  forced?: boolean;
  dir: string;
  doblar: (args: string[]) => Promise<DoblarResult & { frases?: Array<Phrase & { pista: string }> }>;
  gateway?: LlmGateway;
  learned?: number[];
}

export type FinalCheck =
  | { kind: "ok"; heard: string }
  | {
      kind: "leak";
      /** Diálogo que sigue en el idioma original: se dobla sí o sí. */
      leaks: Array<{ desde: number; hasta: number; texto: string; idioma: string | null }>;
      /** Letra de una canción traducida (en el idioma del anuncio y canto): ahí no se dobla. */
      lyrics: Array<{ desde: number; hasta: number; texto: string; idioma: string | null }>;
    }
  | { kind: "error"; detail: string };

/**
 * Comprobación final obligatoria (orden del dueño, 25/11/2026): tras montar, se escucha el vídeo montado (`doblar.py
 * verificar`: su voz y la voz que quede en la música, Whisper large-v3-turbo). Si queda HABLA en un idioma que no es el
 * del país, el montaje no vale (`leak`): se vuelve a doblar y a montar. Lo que siga en el idioma original y sea la letra
 * de una canción (Claude nombra la canción y el verso) se queda: una canción no se traduce nunca.
 */
export async function checkFinalDialogue(ctx: FinalCheckContext, userId: number, productId: number | null): Promise<FinalCheck> {
  const result = await ctx.doblar(["verificar", ctx.file, path.join(ctx.dir, "verificar"), "--destino", ctx.language, ...(ctx.origin ? ["--origen", ctx.origin] : [])]);
  if (!result.ok || result.comprobado !== true) return { kind: "error", detail: result.error ?? "no se pudo escuchar el vídeo montado" };
  const heard = (result.frases ?? [])
    .filter((f) => f.pista === "voz")
    .map((f) => `«${f.texto}» (${f.idioma ?? "?"})`)
    .join(" · ")
    .slice(0, 300);
  // Lo que en la referencia ya se decía en el idioma del anuncio no cuenta (vídeo 20: «Guck mal, die hat Engelsflügel»
  // salió «en» al 0,62 en la voz sacada de la música): sería volver a doblar alemán al alemán.
  const native = await nativeWindows(ctx.videoId, ctx.audio, ctx.language);
  const inNative = (f: Phrase) => native.some(([a, b]) => f.desde < b && a < f.hasta);
  const left = ((result.quedan ?? []) as Array<Phrase & { pista?: string }>).filter((f) => !inNative(f));
  // También lo que suena en el idioma del anuncio: una letra traducida (lote 11, vídeo 64: «Made in the step», trozo de
  // la canción, se dobló) es canto en alemán y no puede quedarse.
  const dubbed = ctx.forced ? [] : ((result.frases ?? []) as Array<Phrase & { pista?: string }>).filter((f) => f.idioma === ctx.language && !inNative(f));
  if (left.length === 0 && dubbed.length === 0) return { kind: "ok", heard };
  // Claude decide con TODO lo que se oyó (el contexto: los versos de alrededor), no con la frase suelta (vídeo 46: «I.»
  // sola no se reconocía como parte de «Let It Snow»).
  const same = (a: Phrase, b: Phrase) => a.desde === b.desde && a.hasta === b.hasta && a.texto === b.texto;
  const context = (result.frases ?? []) as Array<Phrase & { pista?: string }>;
  const all = [...context, ...left.filter((f) => !context.some((g) => same(f, g)))];
  const phrases = all.map((f) => ({ ...f, pista: f.pista ?? "voz", prob: f.prob ?? 0, no_habla: f.no_habla ?? 0, confianza: f.confianza ?? 0 }));
  const kinds = await classifySpeech({ videoId: ctx.videoId, gateway: ctx.gateway, learned: ctx.learned }, userId, productId, phrases);
  if (kinds === null) return { kind: "error", detail: "Claude no pudo decir si lo que se oye es diálogo o una canción" };
  const pick = (f: Phrase) => ({ desde: f.desde, hasta: f.hasta, texto: f.texto, idioma: f.idioma });
  const leaks = phrases.filter((f, i) => kinds[i] === "habla" && left.some((g) => same(f, g))).map(pick);
  const lyrics = phrases.filter((f, i) => kinds[i] === "canto" && dubbed.some((g) => same(f, g))).map(pick);
  // Y una frase doblada que traduce una frase de CANTO de la referencia (lote 11: «Die ganze Zeit, die Falle in meinem
  // Turm…» del vídeo 65 es «I'm a shot alone in my tower»): Claude compara lo doblado con lo que se decidió al doblar.
  const translated = await translatedLyrics(ctx, userId, productId, dubbed.filter((f) => !lyrics.some((g) => g.desde === f.desde && g.hasta === f.hasta && g.texto === f.texto)));
  if (translated === null) return { kind: "error", detail: "Claude no pudo comparar lo doblado con la referencia" };
  lyrics.push(...translated.map(pick));
  return leaks.length || lyrics.length ? { kind: "leak", leaks, lyrics } : { kind: "ok", heard };
}

const translationSchema = z.object({ frases: z.array(z.object({ n: z.number().int().min(1), traduce: z.number().int().min(1).nullable(), motivo: z.string().max(200) })).max(40) });

/**
 * Las frases dobladas (`dubbed`, en el idioma del anuncio) que traducen una frase de CANTO de la referencia (la decisión
 * guardada al doblar, `raw.frases` con su `tipo`). `[]` si no hay canto en la referencia o nada doblado; `null` si Claude
 * no contesta.
 */
async function translatedLyrics(ctx: FinalCheckContext, userId: number, productId: number | null, dubbed: Phrase[]): Promise<Phrase[] | null> {
  if (dubbed.length === 0) return [];
  const reference = await referencePhrases(ctx.videoId, ctx.audio, ctx.language);
  if (!reference.some((f) => f.tipo === "canto") || !reference.some((f) => f.tipo === "habla")) return [];
  const listing = [
    "Frases de la referencia (original):",
    ...reference.map((f, i) => `${i + 1}. [${f.tipo}] ${f.desde.toFixed(1)}–${f.hasta.toFixed(1)} s: «${f.texto}»`),
    "",
    "Frases que se oyen dobladas en el vídeo montado:",
    ...dubbed.map((f, i) => `${i + 1}. ${f.desde.toFixed(1)}–${f.hasta.toFixed(1)} s: «${f.texto}»`),
  ].join("\n");
  try {
    const answer = await (ctx.gateway ?? getGateway()).call({
      tier: "medium",
      stepKey: `montaje:${ctx.videoId}:letra-traducida:${crypto.createHash("sha256").update(listing).digest("hex").slice(0, 16)}`,
      userId,
      productId,
      rules: [],
      instructions: [
        "Comparas un doblaje con su original. El original tiene frases de HABLA (diálogo, se dobla) y de CANTO (la letra de una canción, que no se traduce nunca).",
        "Para cada frase doblada (n desde 1) di en «traduce» el número de la frase ORIGINAL que traduce (por el sentido y el momento; Whisper transcribe con errores), o null si no traduce ninguna. Si una frase doblada mezcla un trozo de diálogo y un trozo de la canción, di la de canto.",
      ].join("\n"),
      content: [textPart(listing)],
      maxTokens: 1_000,
      schema: translationSchema,
    });
    const byN = new Map((answer.data?.frases ?? []).map((f) => [f.n, f.traduce]));
    return dubbed.filter((_, i) => {
      const k = byN.get(i + 1);
      return k != null && reference[k - 1]?.tipo === "canto";
    });
  } catch (error) {
    console.warn(`[doblaje] Claude no pudo comparar el doblaje del vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return null;
  }
}

/** Las frases de la referencia con su decisión habla/canto (las de la fila viva o la última de `dubs`). */
async function referencePhrases(videoId: number, audio: string, language: string): Promise<Array<Phrase & { tipo?: string }>> {
  const sha = await sha256File(audio);
  const [row] = await getDb()
    .select({ raw: dubs.raw })
    .from(dubs)
    .where(and(eq(dubs.videoId, videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, dubLanguageOf(language).code)))
    .orderBy(desc(LIVE), desc(dubs.id))
    .limit(1);
  const raw = (row?.raw ?? null) as { frases?: Array<Phrase & { tipo?: string }>; detalle?: { frases?: Array<Phrase & { tipo?: string }> } } | null;
  return [...(raw?.frases ?? raw?.detalle?.frases ?? [])].filter((f) => f.tipo === "habla" || f.tipo === "canto").sort((a, b) => a.desde - b.desde);
}

/** Tramos [desde, hasta] de la referencia que ya estaban en el idioma del anuncio (de su última fila en `dubs`). */
async function nativeWindows(videoId: number, audio: string, language: string): Promise<Array<[number, number]>> {
  const sha = await sha256File(audio);
  const [row] = await getDb()
    .select({ raw: dubs.raw })
    .from(dubs)
    .where(and(eq(dubs.videoId, videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, dubLanguageOf(language).code)))
    .orderBy(desc(LIVE), desc(dubs.id))
    .limit(1);
  type Raw = { frases?: Phrase[]; detalle?: { frases?: Phrase[]; voz?: { frases?: Phrase[] } } } | null;
  const raw = (row?.raw ?? null) as Raw;
  const all = [...(raw?.frases ?? []), ...(raw?.detalle?.frases ?? []), ...(raw?.detalle?.voz?.frases ?? [])];
  const nativas = (raw as { nativas?: Array<[number, number]> } | null)?.nativas ?? [];
  return [...all.filter((f) => f.idioma === language).map((f): [number, number] => [f.desde, f.hasta]), ...nativas];
}

/**
 * La comprobación final oyó diálogo sin traducir: el doblaje de ese audio deja de valer y la próxima vez se dobla con esos
 * tramos como habla sí o sí (`forzar`). Devuelve `false` (y no toca nada) si ya se rehízo MAX_FINAL_REDUBS veces: entonces
 * el montaje se para con el motivo, no se entrega.
 */
export async function requireRedub(
  videoId: number,
  audio: string,
  language: string,
  leaks: Array<{ desde: number; hasta: number; texto: string }>,
  lyrics: Array<{ desde: number; hasta: number; texto: string }> = [],
): Promise<boolean> {
  const sha = await sha256File(audio);
  const code = dubLanguageOf(language).code;
  const rows = await getDb()
    .select()
    .from(dubs)
    .where(and(eq(dubs.videoId, videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, code)))
    .orderBy(desc(LIVE), desc(dubs.id));
  const before = rows.filter((r) => (r.error ?? "").startsWith(FINAL_CHECK)).length;
  if (before >= MAX_FINAL_REDUBS) return false;
  const latest = rows[0];
  const previous = (latest?.raw as { forzar?: Array<[number, number]> } | null)?.forzar ?? [];
  const sung = (latest?.raw as { cantar?: Array<[number, number]> } | null)?.cantar ?? [];
  const newSung = lyrics.map((l): [number, number] => [Math.max(0, l.desde - 0.1), l.hasta + 0.1]);
  const cantar = [...sung, ...newSung];
  // La letra traducida es lo último que se oyó: un `forzar` anterior en ese tramo (un verso que se tomó por diálogo sin
  // traducir) deja de valer; si de verdad hay diálogo ahí, la próxima comprobación lo vuelve a pedir.
  const kept = previous.filter(([a, b]) => !newSung.some(([c, d]) => a < d && c < b));
  const forzar = [...kept, ...leaks.map((l): [number, number] => [Math.max(0, l.desde - 0.1), l.hasta + 0.1])];
  const what = [
    ...(leaks.length ? [`diálogo sin traducir (${leaks.map((l) => `«${l.texto}»`).join(" · ")})`] : []),
    ...(lyrics.length ? [`letra de la canción traducida (${lyrics.map((l) => `«${l.texto}»`).join(" · ")})`] : []),
  ].join(" y ");
  const error = `${FINAL_CHECK}: el vídeo montado tenía ${what}`.slice(0, 500);
  const extra = { forzar, ...(cantar.length ? { cantar } : {}) };
  if (latest && latest.status !== "submitting" && latest.status !== "submitted") {
    await update(latest.id, { status: "failed", error, raw: { ...((latest.raw as object | null) ?? {}), ...extra } });
  } else {
    const [video] = await getDb().select({ createdBy: schema.videos.createdBy }).from(schema.videos).where(eq(schema.videos.id, videoId));
    await getDb()
      .insert(dubs)
      .values({ videoId, userId: video?.createdBy ?? 0, sourceSha256: sha, language: code, status: "failed", quotedCredits: 0, error, raw: extra });
  }
  return true;
}
