import { preferencesFor } from "@/server/videos/aprendizaje/preferencias";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getElevenLabs, ElevenLabsUnknownOutcomeError, type ElevenLabsPort } from "@/connectors/elevenlabs";
import { z } from "zod";
import { textPart } from "@/llm/content";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import { learnedFor } from "@/server/videos/mejoras/corrections";
import type { ObjectStore } from "@/lib/object-store";

/**
 * Diálogo con ElevenLabs (orden del dueño, 27/11/2026): nunca gastar Higgsfield en doblajes.
 * Separar con montador/doblar.py separar, enviar SOLO la voz, mezclar sobre música y efectos
 * originales con doblar.py mezclar y comprobar el resultado. dubs conserva el trabajo y el audio
 * para reutilizarlos. Un envío dudoso detiene el montaje; la comprobación final permite como
 * máximo un segundo doblaje completo.
 */
/** ISO 639-3 para las filas existentes e ISO 639-1 para ElevenLabs. */
export const DUB_LANGUAGES: Record<string, { code: string; iso6391: string; name: string }> = {
  de: { code: "deu", iso6391: "de", name: "alemán" },
  it: { code: "ita", iso6391: "it", name: "italiano" },
  fr: { code: "fra", iso6391: "fr", name: "francés" },
  es: { code: "spa", iso6391: "es", name: "español" },
  en: { code: "eng", iso6391: "en", name: "inglés" },
  pt: { code: "por", iso6391: "pt", name: "portugués" },
  pl: { code: "pol", iso6391: "pl", name: "polaco" },
  sv: { code: "swe", iso6391: "sv", name: "sueco" },
  fi: { code: "fin", iso6391: "fi", name: "finés" },
  tr: { code: "tur", iso6391: "tr", name: "turco" },
};
export const dubLanguageOf = (language: string) => DUB_LANGUAGES[language] ?? DUB_LANGUAGES.de;
/** Lo que se espera a ElevenLabs dentro de un mismo montaje antes de devolverlo a la cola (Codex: 20 min). */
export const DUB_WAIT_IN_RUN_MS = 10 * 60_000;
/** Desde el envío, lo más que se espera un doblaje antes de detener el montaje. */
export const DUB_MAX_MS = 60 * 60_000;
/** Cada cuánto se vuelve a mirar un doblaje que sigue en marcha cuando el montaje vuelve a la cola. */
export const DUB_RECHECK_MS = 2 * 60_000;

export const DUB_UNKNOWN =
  "No sabemos si el doblaje llegó a ElevenLabs. Vuelve a montar el vídeo para intentarlo otra vez (puede cobrarse de nuevo).";
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
  elevenlabs?: ElevenLabsPort;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Lo que `jobs_wait` espera en cada pregunta a ElevenLabs (0–15 s; por defecto 15). */
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
  /** Lo que Whisper oye en el audio entero (contexto para decidir habla o canto). */
  mezcla?: Array<Phrase & { pista: string }>;
  /** `comprobar`: si se pudo comprobar y las frases que siguen en el idioma original. */
  comprobado?: boolean;
  quedan?: Array<{ desde: number; hasta: number; texto: string; idioma: string }>;
  /** `tramo`: el trozo que se vuelve a doblar (s). */
  desde?: number;
  hasta?: number;
}

/** Umbrales para aceptar como diálogo una frase que el separador dejó en la música o en los efectos. */
export const MUSIC_SPEECH_MIN_WORDS = 4;
export const MUSIC_SPEECH_MIN_WORDS_PER_S = 1.2;
export const MUSIC_SPEECH_CLEAR_CONFIDENCE = -0.35;

/**
 * Una frase de la pista de voz vale como diálogo según su clasificación. Una de la música o de los efectos solo si
 * Claude la da por conversacional y suena a habla de verdad: al menos 4 palabras a ritmo de habla (≥ 1,2 palabras/s,
 * como «Three, two, one, let's go!» del vídeo 22), o 3 palabras oídas con claridad. Lo que Whisper «oye» sobre un canto
 * sale con pocas palabras repartidas en mucho tiempo («Yes! Last one!» en 4 s, «It's like some foodie» en 12 s, lote 14).
 * Mejor dejar sin doblar una frase dudosa que traducir un trozo de canción.
 */
export function musicPhraseIsSpeech(f: { pista?: string; confianza?: number | null; texto: string; conversacional?: boolean; desde?: number; hasta?: number }): boolean {
  if (!f.pista || f.pista === "voz") return true;
  if (f.conversacional === false) return false;
  const words = f.texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const seconds = Math.max(0.5, (f.hasta ?? 0) - (f.desde ?? 0));
  const rate = words / seconds;
  return (words >= MUSIC_SPEECH_MIN_WORDS && rate >= MUSIC_SPEECH_MIN_WORDS_PER_S) || (words >= 3 && (f.confianza ?? -1) >= MUSIC_SPEECH_CLEAR_CONFIDENCE && rate >= 0.8);
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
  "Te puede llegar también lo que se oye en el AUDIO ENTERO (solo contexto, no se clasifica): úsalo para ver si una frase forma parte de una canción que sigue sonando (un verso suelto rodeado de más versos es canto).",
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
        conversacional: z.boolean(),
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
  context: Phrase[] = [],
): Promise<Array<"habla" | "canto"> | null> {
  const detailed = await classifySpeechDetailed(ctx, userId, productId, phrases, context);
  return detailed ? detailed.map((d) => d.kind) : null;
}

/** Como `classifySpeech`, con si cada frase es conversacional (Claude). */
export async function classifySpeechDetailed(
  ctx: Pick<DubContext, "videoId" | "gateway" | "learned">,
  userId: number,
  productId: number | null,
  phrases: Array<Phrase & { pista: string }>,
  context: Phrase[] = [],
): Promise<Array<{ kind: "habla" | "canto"; conversational: boolean }> | null> {
  if (phrases.length === 0) return [];
  const listing = [
    ...phrases.map((f, i) => `${i + 1}. [${f.pista}] ${f.desde.toFixed(1)}–${f.hasta.toFixed(1)} s (${(f.hasta - f.desde).toFixed(1)} s): «${f.texto}»`),
    ...(context.length
      ? ["", "AUDIO ENTERO (solo contexto, no se clasifica):", ...context.map((f) => `- ${f.desde.toFixed(1)}–${f.hasta.toFixed(1)} s: «${f.texto}»`)]
      : []),
  ].join("\n");
  // Correcciones aprendidas de los reportes sobre el doblaje («Mejoras»): van al final de las instrucciones.
  const learned = await learnedFor("doblaje", productId);
  learned.text += (await preferencesFor("doblaje", { videoId: ctx.videoId, productId })).text;
  ctx.learned?.push(...learned.ids);
  const hash = crypto.createHash("sha256").update(listing + learned.text).digest("hex").slice(0, 16);
  // Tres votos y gana la mayoría, frase a frase (lote 11, vídeo 65: con la misma entrada Claude dijo canto tres veces en
  // la prueba y habla en el montaje). Un voto que falla no cuenta; sin ninguno, no se sabe.
  const vote = async (k: number) => {
    try {
      const answer = await (ctx.gateway ?? getGateway()).call({
        tier: "medium",
        stepKey: `montaje:${ctx.videoId}:habla-o-canto:${hash}:${k}`,
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
  };
  try {
    const votes = (await Promise.all([1, 2, 3].map(vote))).filter((v): v is NonNullable<typeof v> => v !== null);
    if (votes.length === 0) return null;
    return phrases.map((_, i) => {
      const sung = votes.filter((v) => v[i].kind === "canto").length;
      const talk = votes.filter((v) => v[i].conversational).length;
      // Empate (con dos votos): ante la duda, habla.
      return { kind: sung * 2 > votes.length ? ("canto" as const) : ("habla" as const), conversational: talk * 2 >= votes.length };
    });
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

/** Versión de la decisión habla/canto (6: 26/11/2026, con el audio entero como contexto): las marcas sin ella se vuelven a mirar. */
export const DECISION_VERSION = 6;

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
  const detailed = ctx.forced
    ? foreign.map(() => ({ kind: "habla" as const, conversational: true }))
    : await classifySpeechDetailed(ctx, userId, owner?.productId ?? null, foreign, separated.mezcla ?? []);
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
    // Un tramo que la comprobación final oyó sin traducir hace habla una frase de la voz, nunca una que la decisión da por
    // canto (lote 12: así se tradujeron «Rockin' around the Christmas tree» del 72 y «I never lose a car on you» del 86).
    tipo:
      forcedWindows.some((w) => overlaps(f, w)) && kinds[i] !== "canto"
        ? ("habla" as const)
        : singWindows.some((w) => overlaps(f, w)) && !detailed?.[i]?.conversational
          ? ("canto" as const)
          : kinds[i],
  }));
  // Lo que sale de la pista de MÚSICA solo es diálogo si se entiende claro, tiene varias palabras y es conversacional
  // (lote 14: «Yes! Last one!», «PLEASE», «Yeah.» y «It's like some foodie» eran la canción y se doblaron).
  // Con «Doblar el diálogo» encendido a propósito, manda el dueño: no se filtra.
  if (!ctx.forced) for (const f of classified) if (f.tipo === "habla" && !musicPhraseIsSpeech(f)) f.tipo = "canto";
  // Un tramo de diálogo que oyó la comprobación final (siempre de la VOZ) sin frase aquí: se dobla lo que tenga la voz en
  // ese tramo; nunca la voz de la música (así entraban canciones).
  for (const w of forcedWindows) {
    if (!classified.some((f) => overlaps(f, w))) {
      classified.push({ desde: w[0], hasta: w[1], texto: "(diálogo oído en la comprobación final)", idioma: null, prob: 0, no_habla: 0, confianza: 0, pista: "voz", tipo: "habla" });
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

/** Reparación de una frase: solo su voz, sin créditos de Higgsfield. */
async function redubPiece(ctx: DubContext, elevenlabs: ElevenLabsPort, userId: number, language: string, file: string, out: string): Promise<{ file: string; credits: number } | null> {
  try {
    const { dubbingId } = await elevenlabs.submitDubbing(userId, { bytes: await fs.readFile(file), filename: "dialogue-piece.mp4", contentType: "video/mp4", targetLanguage: language });
    const started = nowOf(ctx).getTime();
    for (;;) {
      const status = await elevenlabs.status(userId, dubbingId, ctx.pollSeconds ?? 15);
      if (status === "dubbed") {
        await fs.writeFile(out, await elevenlabs.audio(userId, dubbingId, language));
        return { file: out, credits: 0 };
      }
      if (status === "failed" || nowOf(ctx).getTime() - started > DUB_WAIT_IN_RUN_MS) return null;
    }
  } catch {
    ctx.notes.push("No se pudo reparar la frase con ElevenLabs");
    return null;
  }
}

/** El «Audio original» con el diálogo doblado al idioma del anuncio (ver arriba). Nunca lanza: dice si está, si hay que esperar o por qué no. */
export async function dubbedAudio(ctx: DubContext): Promise<DubOutcome> {
  const elevenlabs = ctx.elevenlabs ?? getElevenLabs();
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
      const history = await getDb().select().from(dubs)
        .where(and(eq(dubs.videoId, ctx.videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, target.code)));
      const attempts = history.filter((r) => (r.raw as { provider?: string } | null)?.provider === "elevenlabs");
      if (attempts.length >= 2) {
        return { kind: "failed", shown: dubFailure("agotados los dos intentos con ElevenLabs para este audio"), detail: "límite de intentos" };
      }
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
      const request = { bytes, filename: "dialogue-only.mp4", contentType: "video/mp4", targetLanguage: target.iso6391 };
      const [created] = await getDb()
        .insert(dubs)
        .values({ videoId: ctx.videoId, userId, sourceSha256: sha, language: target.code, status: "submitting", quotedCredits: 0, creditsSpent: 0, raw: { ...decided.raw, provider: "elevenlabs" } })
        .returning();
      row = created;
      try {
        const sent = await elevenlabs.submitDubbing(userId, request);
        await update(row.id, { status: "submitted", jobId: sent.dubbingId, raw: { ...decided.raw, provider: "elevenlabs" } });
        row = { ...row, status: "submitted", jobId: sent.dubbingId, raw: { ...decided.raw, provider: "elevenlabs" } };
        ctx.notes.push(`Diálogo en ${target.name}: doblaje enviado a ElevenLabs (autorizado por el dueño)`);
      } catch (error) {
        if (error instanceof ElevenLabsUnknownOutcomeError) {
          await update(row.id, { status: "unknown", error: "No se sabe si el envío llegó" });
          return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} en duda` };
        }
        await update(row.id, { status: "failed", error: messageOf(error) });
        const reason = messageOf(error);
        return { kind: "failed", shown: dubFailure(reason.slice(0, 250)), detail: messageOf(error) };
      }
    }

    // Los trabajos antiguos de Higgsfield no son identificadores de ElevenLabs.
    if ((row.raw as { provider?: string } | null)?.provider !== "elevenlabs") {
      return { kind: "failed", shown: dubFailure("trabajo pendiente del proveedor anterior; requiere revisión"), detail: "proveedor anterior" };
    }
    // Enviado: se espera el resultado.
    const jobId = row.jobId;
    if (!jobId) return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} sin trabajo` };
    const started = nowOf(ctx).getTime();
    for (;;) {
      const status = await elevenlabs.status(userId, jobId, ctx.pollSeconds ?? 15);
      if (status === "dubbed") break;
      if (status === "failed") {
        await update(row.id, { status: "failed", error: "ElevenLabs no pudo doblarlo" });
        return { kind: "failed", shown: dubFailure("ElevenLabs no pudo doblarlo"), detail: "failed" };
      }
      const now = nowOf(ctx).getTime();
      if (now - row.createdAt.getTime() > DUB_MAX_MS) {
        return { kind: "failed", shown: dubFailure("ElevenLabs tardó más de una hora"), detail: "más de una hora" };
      }
      if (now - started > DUB_WAIT_IN_RUN_MS) return { kind: "defer", delayMs: DUB_RECHECK_MS };
    }
    const dub = path.join(ctx.dir, "dub.mp4");
    await fs.writeFile(dub, await elevenlabs.audio(userId, jobId, target.iso6391));
    const haveStems = await fs.stat(path.join(stems, "music.wav")).then(() => true, () => false);
    if (!haveStems) {
      // Enviado en un montaje anterior: se vuelve a separar (da lo mismo: mismo audio, mismo modelo).
      const separated = await ctx.doblar(["separar", ctx.audio, stems, "--destino", ctx.language, ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!separated.ok) return { kind: "failed", shown: dubFailure(separated.error ?? "no se pudo separar la voz"), detail: separated.error ?? "separar" };
    }
    // La voz doblada solo dentro de las ventanas de diálogo: lo que ElevenLabs genere fuera no entra (vídeo 83).
    const dialogue = (row.raw as { ventanas?: Array<[number, number]> } | null)?.ventanas ?? [];
    const onlyDialogue = dialogue.length ? ["--ventanas", ...dialogue.map(([a, b]) => `${a}:${b}`)] : [];
    const mixed = await ctx.doblar(["mezclar", stems, dub, output, ...onlyDialogue]);
    if (!mixed.ok) {
      await update(row.id, { error: mixed.error ?? "mezclar" });
      return { kind: "failed", shown: dubFailure(mixed.error ?? "no se pudo mezclar"), detail: mixed.error ?? "mezclar" };
    }

    // Comprobación con Whisper: que no quede nada en el idioma original; si queda, se vuelve a doblar ese trozo.
    const origen = (row.raw as { origen?: string | null } | null)?.origen ?? null;
    const windows = (row.raw as { ventanas?: Array<[number, number]> } | null)?.ventanas ?? null;
    let voice = dub;
    let extra = 0;
    const repairs: Array<{ desde: number; hasta: number; texto: string; creditos: number; motivo: string }> = [];
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
      if (!checked || attempt >= MAX_REPAIRS) break;
      let reason = "seguía en el idioma original";
      if (left.length === 0) {
        // Y que la traducción tenga sentido (lote 11, vídeo 64: «Okay. Best gift ever.» salió «Ähm, okay, ich werde das
        // Geschenk aller Zeiten»): Claude compara cada frase de diálogo con lo que se oye doblado en su sitio.
        const original = (row.raw as { frases?: Array<Phrase & { tipo?: string }> } | null)?.frases ?? [];
        const wrong = await badTranslations(ctx, userId, target, original, (check as { frases?: Phrase[] }).frases ?? []);
        if (!wrong.length) break;
        left = wrong;
        reason = "la traducción no tenía sentido";
      }
      const leak = left[0];
      const piece = await ctx.doblar(["tramo", stems, String(leak.desde), String(leak.hasta), path.join(ctx.dir, `tramo-${attempt}.mp4`), ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!piece.ok || piece.desde === undefined) break;
      const redone = await redubPiece(ctx, elevenlabs, userId, target.iso6391, path.join(ctx.dir, `tramo-${attempt}.mp4`), path.join(ctx.dir, `tramo-${attempt}-doblado.mp4`));
      if (!redone) break;
      extra += redone.credits;
      const grafted = path.join(ctx.dir, `voz-${attempt}.wav`);
      const graft = await ctx.doblar(["injertar", voice, redone.file, String(piece.desde), grafted]);
      if (!graft.ok) break;
      voice = grafted;
      repairs.push({ desde: leak.desde, hasta: leak.hasta, texto: leak.texto, creditos: redone.credits, motivo: reason });
      const remixed = await ctx.doblar(["mezclar", stems, voice, output, ...onlyDialogue]);
      if (!remixed.ok) break;
    }
    if (!checked) ctx.notes.push("No se pudo comprobar con Whisper que no quede diálogo en el idioma original");
    if (repairs.length) ctx.notes.push(`Vuelto a doblar: ${repairs.map((r) => `«${r.texto}» (${r.desde}–${r.hasta} s, ${r.motivo})`).join(", ")}`);
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
    const shown = dubFailure("no se pudo completar el doblaje con ElevenLabs");
    return { kind: "failed", shown, detail: messageOf(error) };
  }
}

const translationCheckSchema = z.object({ frases: z.array(z.object({ n: z.number().int().min(1), bien: z.boolean(), motivo: z.string().max(200) })).max(40) });

/**
 * Frases de diálogo cuya traducción no vale: Claude compara cada frase de HABLA del original con lo que Whisper oye
 * doblado en su sitio y dice si dice lo mismo y suena natural en el idioma del anuncio. Devuelve las ventanas que hay que
 * volver a doblar (como frases), `[]` si todo está bien o no se puede juzgar.
 */
async function badTranslations(
  ctx: DubContext,
  userId: number,
  target: { code: string; name: string },
  original: Array<Phrase & { tipo?: string }>,
  heard: Phrase[],
): Promise<Array<{ desde: number; hasta: number; texto: string; idioma: string }>> {
  const speech = original.filter((f) => f.tipo === "habla" && !f.texto.startsWith("("));
  const pairs = speech
    .map((f) => ({ f, dubbed: heard.filter((h) => h.idioma === ctx.language && h.desde < f.hasta + 0.5 && f.desde - 0.5 < h.hasta).map((h) => h.texto).join(" ") }))
    .filter((p) => p.dubbed.trim());
  if (pairs.length === 0) return [];
  const listing = pairs.map((p, i) => `${i + 1}. Original: «${p.f.texto}» → doblado: «${p.dubbed}»`).join("\n");
  try {
    const answer = await (ctx.gateway ?? getGateway()).call({
      tier: "medium",
      stepKey: `montaje:${ctx.videoId}:traduccion:${crypto.createHash("sha256").update(listing).digest("hex").slice(0, 16)}`,
      userId,
      productId: null,
      rules: [],
      instructions: [
        `Revisas un doblaje al ${target.name} de un anuncio corto. Por cada frase te doy el original y lo que Whisper oye doblado (puede tener pequeños errores de transcripción).`,
        `«bien»: true si lo doblado dice lo mismo que el original y es una frase natural en ${target.name}; false si cambia el sentido, mete palabras que no están, queda sin sentido o en otro idioma. Sé tolerante con sinónimos y con errores leves de Whisper.`,
      ].join("\n"),
      content: [textPart(listing)],
      maxTokens: 1_000,
      schema: translationCheckSchema,
    });
    const byN = new Map((answer.data?.frases ?? []).map((f) => [f.n, f.bien]));
    return pairs.filter((_, i) => byN.get(i + 1) === false).map((p) => ({ desde: p.f.desde, hasta: p.f.hasta, texto: p.f.texto, idioma: ctx.language }));
  } catch (error) {
    console.warn(`[doblaje] Claude no pudo revisar la traducción del vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return [];
  }
}

/** Cuántas veces, como mucho, se devuelve el original a tramos con letra traducida antes de parar el montaje. */
export const MAX_RESTORES = 3;

/**
 * Letra de una canción traducida en el vídeo montado (orden del dueño, 27/11/2026): se arregla SOLO ese tramo, poniendo el
 * audio original en el doblaje guardado (`doblar.py restaurar`), sin otro doblaje. El tramo queda además en `cantar` para
 * que una decisión nueva lo dé por canto. `false` si no hay doblaje que arreglar o ya se restauró MAX_RESTORES veces.
 */
export async function restoreOriginal(
  ctx: { videoId: number; audio: string; language: string; dir: string; store: ObjectStore; doblar: (args: string[]) => Promise<DoblarResult> },
  lyrics: Array<{ desde: number; hasta: number; texto: string }>,
): Promise<boolean> {
  const sha = await sha256File(ctx.audio);
  const [row] = await getDb()
    .select()
    .from(dubs)
    .where(and(eq(dubs.videoId, ctx.videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, dubLanguageOf(ctx.language).code), eq(dubs.status, "done")))
    .orderBy(desc(dubs.id))
    .limit(1);
  if (!row?.storageKey) return false;
  const raw = (row.raw as { restaurados?: Array<[number, number]>; cantar?: Array<[number, number]> } | null) ?? {};
  const done = raw.restaurados ?? [];
  if (done.length >= MAX_RESTORES * 4) return false;
  const windows = lyrics.map((l): [number, number] => [Math.max(0, l.desde - 0.15), l.hasta + 0.15]);
  const dubbed = path.join(ctx.dir, "doblaje-a-restaurar.m4a");
  const fixed = path.join(ctx.dir, "doblaje-restaurado.m4a");
  await ctx.store.download(row.storageKey, dubbed);
  const out = await ctx.doblar(["restaurar", dubbed, ctx.audio, fixed, "--ventanas", ...windows.map(([a, b]) => `${a}:${b}`)]);
  if (!out.ok) return false;
  const key = `doblajes/${ctx.videoId}/${row.id}-r${done.length / Math.max(1, windows.length) + 1}-${Date.now()}.m4a`;
  await ctx.store.putFile(key, fixed, { contentType: "audio/mp4" });
  await update(row.id, {
    storageKey: key,
    raw: { ...raw, restaurados: [...done, ...windows], cantar: [...(raw.cantar ?? []), ...windows] },
  });
  return true;
}

/** Cuántas veces, como mucho, la comprobación final manda volver a doblar un mismo audio antes de parar el montaje. */
export const MAX_FINAL_REDUBS = 1;
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
  // Lo doblado se reconoce por el idioma del TEXTO (Claude), no por el que adivina Whisper: «Mein Gott, was du mir
  // zuhörst?» del vídeo 64 (un verso traducido) salió «en».
  const heardForeign = ((result.frases ?? []) as Array<Phrase & { pista?: string }>).filter((f) => !inNative(f));
  const textLanguages = ctx.forced ? [] : await languagesOf(ctx, userId, productId, heardForeign);
  const dubbed = ctx.forced ? [] : heardForeign.filter((f, i) => (textLanguages[i] ?? f.idioma) === ctx.language);
  if (left.length === 0 && dubbed.length === 0) return { kind: "ok", heard };
  // Claude decide con TODO lo que se oyó (el contexto: los versos de alrededor), no con la frase suelta (vídeo 46: «I.»
  // sola no se reconocía como parte de «Let It Snow»).
  const same = (a: Phrase, b: Phrase) => a.desde === b.desde && a.hasta === b.hasta && a.texto === b.texto;
  const heardAll = (result.frases ?? []) as Array<Phrase & { pista?: string }>;
  // Las del audio entero son contexto, salvo las que hay que juzgar (quedan o dobladas).
  const mix = heardAll.filter((f) => f.pista === "mezcla" && !left.some((g) => same(f, g)) && !dubbed.some((g) => same(f, g)));
  const context = heardAll.filter((f) => !mix.includes(f));
  const all = [...context, ...left.filter((f) => !context.some((g) => same(f, g)))];
  const phrases = all.map((f) => ({ ...f, pista: f.pista ?? "voz", prob: f.prob ?? 0, no_habla: f.no_habla ?? 0, confianza: f.confianza ?? 0 }));
  const detailed = await classifySpeechDetailed({ videoId: ctx.videoId, gateway: ctx.gateway, learned: ctx.learned }, userId, productId, phrases, mix);
  if (detailed === null) return { kind: "error", detail: "Claude no pudo decir si lo que se oye es diálogo o una canción" };
  const kinds = detailed.map((d) => d.kind);
  const pick = (f: Phrase) => ({ desde: f.desde, hasta: f.hasta, texto: f.texto, idioma: f.idioma });
  // Diálogo sin traducir: solo una frase conversacional de la VOZ. Lo que suena en inglés en la música o en la mezcla es,
  // salvo prueba en contra, la canción, y forzarlo a habla tradujo canciones (lote 12: vídeos 72, 83 y 86).
  const candidates = phrases.filter((f, i) => kinds[i] === "habla" && detailed[i].conversational && f.pista === "voz" && left.some((g) => same(f, g)));
  // Whisper confunde el idioma de frases cortas dobladas («Gott segne.» salió «en» en el vídeo 83): solo cuenta si el
  // TEXTO está en otro idioma que el del anuncio.
  // Donde ya se devolvió el original por una letra traducida manda la canción: el diálogo que caiga ahí no fuerza otro
  // doblaje entero (si no, volvería a traducirse el verso).
  const restored = await restoredWindows(ctx.videoId, ctx.audio, ctx.language);
  const leaks = (await notInLanguage(ctx, userId, productId, candidates.filter((f) => !restored.some(([a, b]) => f.desde < b && a < f.hasta)))).map(pick);
  const lyrics = phrases.filter((f, i) => kinds[i] === "canto" && dubbed.some((g) => same(f, g))).map(pick);
  // Y una frase doblada que traduce una frase de CANTO de la referencia (lote 11: «Die ganze Zeit, die Falle in meinem
  // Turm…» del vídeo 65 es «I'm a shot alone in my tower»): Claude compara lo doblado con lo que se decidió al doblar.
  const translated = await translatedLyrics(ctx, userId, productId, dubbed.filter((f) => !lyrics.some((g) => g.desde === f.desde && g.hasta === f.hasta && g.texto === f.texto)));
  if (translated === null) return { kind: "error", detail: "Claude no pudo comparar lo doblado con la referencia" };
  lyrics.push(...translated.map(pick));
  return leaks.length || lyrics.length ? { kind: "leak", leaks, lyrics } : { kind: "ok", heard };
}

const textLanguageSchema = z.object({ frases: z.array(z.object({ n: z.number().int().min(1), idioma: z.string().min(2).max(3) })).max(40) });

/** El idioma del TEXTO de cada frase (Claude); `null` donde no contesta. */
async function languagesOf(ctx: FinalCheckContext, userId: number, productId: number | null, phrases: Phrase[]): Promise<Array<string | null>> {
  if (phrases.length === 0) return [];
  const listing = phrases.map((f, i) => `${i + 1}. «${f.texto}»`).join("\n");
  try {
    const answer = await (ctx.gateway ?? getGateway()).call({
      tier: "medium",
      stepKey: `montaje:${ctx.videoId}:idioma-texto:${crypto.createHash("sha256").update(listing).digest("hex").slice(0, 16)}`,
      userId,
      productId,
      rules: [],
      instructions: "Di en qué idioma está escrito cada texto (código ISO 639-1: de, en, es…). Es una transcripción automática: si mezcla idiomas, el de la mayoría de las palabras.",
      content: [textPart(listing)],
      maxTokens: 500,
      schema: textLanguageSchema,
    });
    const byN = new Map((answer.data?.frases ?? []).map((f) => [f.n, f.idioma.toLowerCase()]));
    return phrases.map((_, i) => byN.get(i + 1) ?? null);
  } catch (error) {
    console.warn(`[doblaje] Claude no pudo decir el idioma del texto en el vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return phrases.map(() => null);
  }
}

/** Las frases cuyo TEXTO no está en el idioma del anuncio (Claude). Si Claude no contesta, todas (no se deja pasar nada). */
async function notInLanguage(ctx: FinalCheckContext, userId: number, productId: number | null, phrases: Phrase[]): Promise<Phrase[]> {
  if (phrases.length === 0) return [];
  const listing = phrases.map((f, i) => `${i + 1}. «${f.texto}»`).join("\n");
  try {
    const answer = await (ctx.gateway ?? getGateway()).call({
      tier: "medium",
      stepKey: `montaje:${ctx.videoId}:idioma-texto:${crypto.createHash("sha256").update(listing).digest("hex").slice(0, 16)}`,
      userId,
      productId,
      rules: [],
      instructions: "Di en qué idioma está escrito cada texto (código ISO 639-1: de, en, es…). Es una transcripción automática: si mezcla idiomas, el de la mayoría de las palabras.",
      content: [textPart(listing)],
      maxTokens: 500,
      schema: textLanguageSchema,
    });
    const byN = new Map((answer.data?.frases ?? []).map((f) => [f.n, f.idioma.toLowerCase()]));
    return phrases.filter((_, i) => byN.get(i + 1) !== ctx.language);
  } catch (error) {
    console.warn(`[doblaje] Claude no pudo decir el idioma del texto en el vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return phrases;
  }
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

/** Tramos en los que ya se devolvió el original por letra traducida (`raw.restaurados` del doblaje hecho). */
async function restoredWindows(videoId: number, audio: string, language: string): Promise<Array<[number, number]>> {
  const sha = await sha256File(audio);
  const [row] = await getDb()
    .select({ raw: dubs.raw })
    .from(dubs)
    .where(and(eq(dubs.videoId, videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, dubLanguageOf(language).code), eq(dubs.status, "done")))
    .orderBy(desc(dubs.id))
    .limit(1);
  return ((row?.raw ?? null) as { restaurados?: Array<[number, number]> } | null)?.restaurados ?? [];
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
