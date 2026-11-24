import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { imagePart, textPart } from "@/llm/content";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import { learnedFor } from "@/server/videos/mejoras/corrections";
import type { ObjectStore } from "@/lib/object-store";
import { probeVideo } from "@/server/media/ffmpeg";
import { localizeText, marketOf } from "@/server/videos/localization";
import { ffmpegLog, ffmpegOutput } from "@/server/media/ffmpeg-crudo";

/**
 * La edición que se copia del vídeo de referencia (copia de lo que hacía Codex, `REGLAS_EDICION/
 * CRITERIOS_OBLIGATORIOS.md` punto 3: «enlace de edición vacío → el vídeo de referencia original; vacío
 * NO significa sin edición»; `Motor/order-preparation/app-116085…-36/post-edit/editorial.py` y
 * `render-local.py`):
 *
 * - **Qué rótulos tiene y cuándo cambian.** Codex: OCR de Apple Vision a 2 fps, búsqueda del fotograma exacto
 *   del cambio y comprobación visual de los dos fotogramas (`ref-switches.json`). Aquí: Claude mira la
 *   referencia a 2 fps (fotogramas con su tiempo) y dice cada rótulo, desde cuándo y en qué franja de alto
 *   está; el cambio se afina después al fotograma exacto, buscando dentro del medio segundo entre las dos
 *   muestras el fotograma donde más cambia esa franja.
 * - **Cómo se adapta cada rótulo** (`editorial.py`): mismo sentido, intención y tono, alemán natural, la marca
 *   ajena cambiada por la del producto, los emojis emocionales conservados y los del producto cambiados por
 *   los de su nicho, `|` para el salto de línea y la traducción española aparte (no se imprime). El CTA es el
 *   de la referencia con la palabra clave del producto («Kommentiere „EisWerk“, wenn du auch eine willst!»).
 *
 * El montaje (`montar_auto.py`) los pone siempre en la caja fija 06B (x112/y287), nunca en la posición de la
 * referencia (`TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md`), y en una réplica los cambia en el mismo punto
 * proporcional del clip (`render-local.py`: `round(t * frames / duración_referencia)`).
 *
 * El resultado se guarda en el almacén por referencia y producto: volver a montar no vuelve a gastar.
 */

/** Muestras por segundo que mira Claude (las de Codex). */
export const SAMPLES_PER_SECOND = 2;
/** Lo más que se mira de la referencia (como el tramo de la réplica). */
export const MAX_REFERENCE_S = 30;
const SAMPLE_WIDTH = 540;
const REFINE_FPS = 24;
const REFINE_WIDTH = 108;

export interface ReferenceCue {
  /** Desde cuándo se ve (segundos de la referencia), afinado al fotograma. */
  startS: number;
  /** El texto tal cual en la referencia. */
  source: string;
  /** El rótulo adaptado, con `|` para cada salto de línea. */
  text: string;
  /** Traducción española de revisión (no se imprime). */
  es: string;
  cta: boolean;
}

export interface ReferenceEdit {
  version: 1;
  durationS: number;
  /** Rótulos en orden; vacío si la referencia no tiene rótulos editoriales. */
  cues: ReferenceCue[];
  /** Cambios de plano de la referencia (segundos). */
  cutsS: number[];
}

const answerSchema = z.object({
  rotulos: z
    .array(
      z.object({
        desde_s: z.number().min(0),
        texto_original: z.string().min(1).max(300),
        texto_adaptado: z.string().min(1).max(300),
        traduccion_es: z.string().max(400),
        es_cta: z.boolean(),
        franja_superior: z.number().min(0).max(1),
        franja_inferior: z.number().min(0).max(1),
      }),
    )
    .max(12),
  /** Marcas, personajes, películas, licencias y colaboraciones de terceros que se leen en los rótulos originales. */
  ajenos: z.array(z.string().min(1).max(80)).max(30).default([]),
  /** Lugares y países que nombran los rótulos originales (se cambian por el de nuestro anuncio, regla 6c). */
  lugares: z.array(z.string().min(1).max(80)).max(30).default([]),
});
type Answer = z.infer<typeof answerSchema>;

export const REFERENCE_EDIT_INSTRUCTIONS = `Eres el editor de anuncios en vídeo del dueño (TikTok/Reels para Alemania). Te paso el vídeo de REFERENCIA en fotogramas a ${SAMPLES_PER_SECOND} por segundo, cada uno con su tiempo. El anuncio nuevo copia su edición: los mismos rótulos editoriales, en el mismo momento, adaptados a NUESTRO producto.

1. Lee TODOS los rótulos editoriales superpuestos (textos puestos en edición encima del vídeo, normalmente blancos con contorno). NO cuentes subtítulos automáticos del habla, textos que forman parte de la escena (envases, carteles, pantallas), marcas de agua ni la interfaz de TikTok/Instagram. Si no hay ninguno, devuelve la lista vacía.
2. texto_original: cópialo EXACTO, carácter a carácter, con sus emojis tal cual (mira bien cada emoji: 🤭 no es 🤗, 😍 no es 🥰) y con | donde la referencia salta de línea, también cuando los emojis van solos en su propia línea.
3. Un rótulo nuevo empieza cuando cambia el texto. desde_s es el tiempo de la PRIMERA muestra en la que se lee el texto nuevo (el primero suele empezar en 0). Si un texto aparece palabra a palabra, cuenta como un solo rótulo desde que empieza.
4. franja_superior / franja_inferior: entre qué alturas del fotograma (0 arriba, 1 abajo) está ese rótulo.
5. texto_adaptado: la versión para nuestro anuncio en alemán natural de Alemania, fiel al original: mismo sentido, intención, tono, estructura, mayúsculas y LOS MISMOS SALTOS DE LÍNEA (| en el mismo sitio; si los emojis van en su propia línea, también aquí). Si el original ya está en alemán, déjalo igual salvo la marca o la palabra clave. Cambia SOLO la marca, el producto o la palabra clave ajenos por los nuestros (nombre del producto que te doy). Conserva la tienda que nombre la referencia si existe en Alemania; no inventes tiendas, ofertas, precios ni beneficios que no estén. Emojis: los MISMOS de la referencia, en el mismo orden; cambia solo uno que no encaje con nuestro producto por uno de su nicho (un emoji de uñas no vale para un producto de pelo).
6. es_cta: true en el rótulo de llamada a la acción («Comment X…», «Kommentiere…», «Link in bio»…). Su texto_adaptado es la misma llamada con la palabra clave de nuestro producto entre comillas alemanas (p. ej. «Kommentiere, wenn du auch eins willst!» → «Kommentiere „{PRODUCTO}“, wenn du auch eins willst!»), con los emojis y saltos de línea del original tal cual. Si el original no nombra nada, añade solo la palabra clave.
6b. NUNCA nombres marcas, personajes, películas, series, licencias, famosos ni colaboraciones de terceros que vengan de la referencia (Harry Potter, Disney, Marvel, Pokémon, Barbie, Stanley, Dyson…), aunque el original los nombre: el anuncio es solo de {PRODUCTO}. Una colaboración («X × Harry Potter», «X meets Disney») queda solo con {PRODUCTO}; un personaje o licencia se cambia por una descripción genérica del estilo o el tema (p. ej. «Zauberer-Edition», «magisch»), nunca por el nombre. La tienda que nombre la referencia sí se conserva (regla 5).
7. traduccion_es: el texto_adaptado en español, para que el dueño lo revise (no se imprime).
6c. Lugares: el anuncio pasa en {LUGAR}. Cualquier lugar o país que nombre la referencia (USA, Amerika, die Staaten, New York, Texas, London…) se cambia por {LUGAR} con la gramática correcta («in den USA» → «in {LUGAR}»), nunca se deja ni se traduce tal cual. Si la referencia no nombra ningún lugar, no añadas ninguno.
8. ajenos: la lista de esas marcas, personajes, licencias y colaboraciones de terceros que aparecen en los rótulos originales (vacía si no hay). No incluyas {PRODUCTO} ni la tienda.
9. lugares: la lista de lugares y países que nombran los rótulos originales, tal cual (vacía si no hay). No incluyas la tienda.
Responde solo con el JSON pedido.`;

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Red de seguridad de la regla 6b: si un nombre ajeno (`ajenos`) se colara en el rótulo adaptado, se cambia por el
 * producto, y una colaboración que queda «P × P» se deja en «P». Sin distinguir mayúsculas.
 */
export function withoutThirdParties(text: string, ajenos: string[], product: string): string {
  let out = text;
  for (const name of [...new Set(ajenos.map((a) => a.trim()).filter((a) => a.length >= 2 && a.toLowerCase() !== product.toLowerCase()))].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRe(name), "gi"), product);
  }
  const p = escapeRe(product);
  // «P X P», «P × P», «P x P», «P meets P», también con salto de línea (|) entre medias.
  out = out.replace(new RegExp(`${p}(\\s*\\|?\\s*(?:[xX×+&]|meets|feat\\.?)\\s*\\|?\\s*${p})+`, "g"), product);
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Lugares de otros mercados que se cuelan al adaptar rótulos de referencias de EE. UU. o del Reino Unido
 * (vídeo 24, 24/11/2026: «…an Fremde in den USA…» en un anuncio grabado en Berlín). Siglas con mayúsculas
 * exactas; nombres sin distinguir mayúsculas.
 */
const FOREIGN_ACRONYMS = ["USA", "US", "U.S.A.", "U.S.", "NYC", "UK", "EE. UU.", "EE.UU.", "EEUU"];
const FOREIGN_NAMES = [
  "Vereinigten Staaten", "Vereinigte Staaten", "United States", "Estados Unidos", "Stati Uniti", "Amerika", "America", "the States",
  "New York", "Los Angeles", "Hollywood", "Las Vegas", "Miami", "Chicago", "San Francisco", "Texas", "Florida", "Kalifornien",
  "California", "Kanada", "Canada", "England", "London", "Australien", "Australia",
];

/** Ciudades de los mercados del dueño, como se escriben en las indicaciones (es/de/en) → en el idioma del anuncio. */
type AdLanguage = "de" | "it" | "en";
const CITIES: Array<{ match: RegExp; de: string; it: string; en?: string }> = [
  { match: /\bberl[ií]n\b/i, de: "Berlin", it: "Berlino" },
  { match: /\b(m[uú]nich|m[üu]nchen)\b/i, de: "München", it: "Monaco di Baviera" },
  { match: /\b(hamburgo|hamburg)\b/i, de: "Hamburg", it: "Amburgo" },
  { match: /\b(colonia|k[öo]ln|cologne)\b/i, de: "Köln", it: "Colonia" },
  { match: /\b(fr[aá]ncfort|frankfurt)\b/i, de: "Frankfurt", it: "Francoforte" },
  { match: /\bstuttgart\b/i, de: "Stuttgart", it: "Stoccarda" },
  { match: /\bd[üu]sseldorf\b/i, de: "Düsseldorf", it: "Düsseldorf" },
  { match: /\b(dresde|dresden)\b/i, de: "Dresden", it: "Dresda" },
  { match: /\b(leipzig|lipsia)\b/i, de: "Leipzig", it: "Lipsia" },
  { match: /\b(n[uú]remberg|n[üu]rnberg)\b/i, de: "Nürnberg", it: "Norimberga" },
  { match: /\b(hannover|han[oó]ver)\b/i, de: "Hannover", it: "Hannover" },
  { match: /\bbremen\b/i, de: "Bremen", it: "Brema" },
  { match: /\b(viena|wien|vienna)\b/i, de: "Wien", it: "Vienna" },
  { match: /\b(salzburgo|salzburg)\b/i, de: "Salzburg", it: "Salisburgo" },
  { match: /\b(z[uú]rich|z[üu]rich)\b/i, de: "Zürich", it: "Zurigo" },
  { match: /\b(basilea|basel)\b/i, de: "Basel", it: "Basilea" },
  { match: /\b(roma|rome|rom)\b/i, de: "Rom", it: "Roma" },
  { match: /\b(mil[aá]n|milano|mailand)\b/i, de: "Mailand", it: "Milano" },
  { match: /\b(n[aá]poles|napoli|neapel)\b/i, de: "Neapel", it: "Napoli" },
  { match: /\b(tur[ií]n|torino|turin)\b/i, de: "Turin", it: "Torino" },
  { match: /\b(florencia|firenze|florenz)\b/i, de: "Florenz", it: "Firenze" },
];
const COUNTRIES: Record<string, Record<AdLanguage, string>> = {
  DE: { de: "Deutschland", it: "Germania", en: "Germany" },
  AT: { de: "Österreich", it: "Austria", en: "Austria" },
  CH: { de: "der Schweiz", it: "Svizzera", en: "Switzerland" },
  IT: { de: "Italien", it: "Italia", en: "Italy" },
  US: { de: "den USA", it: "Stati Uniti", en: "the US" },
};
const DEFAULT_COUNTRY: Record<AdLanguage, string> = { de: "DE", it: "IT", en: "US" };
/** Nombres de Estados Unidos: para un anuncio que pasa allí no son de otro mercado. */
const US_NAMES = new Set(FOREIGN_NAMES.slice(0, FOREIGN_NAMES.indexOf("Kanada")));

/**
 * Dónde pasa nuestro anuncio (regla 6c): la ciudad que nombren las indicaciones del dueño (tarjeta, adaptación o
 * lote: «las calles de Berlín, Alemania» → «Berlin»); si no nombran ninguna, el primer país del producto.
 */
export function targetPlace(indications: string, countries: string[], language: string): string {
  const lang: AdLanguage = language === "it" || language === "en" ? language : "de";
  for (const city of CITIES) if (city.match.test(indications)) return city[lang] ?? city.de;
  // Sin ciudad en las indicaciones: la ciudad más reconocible del país del producto (regla de localización
  // del dueño, 24/11/2026: «in den USA» → «in Berlin»), como en `localization.ts`.
  const market = marketOf({ countries, language });
  for (const city of CITIES) if (city.match.test(market.city)) return city[lang] ?? city.de;
  const country = COUNTRIES[market.code] ?? COUNTRIES[DEFAULT_COUNTRY[lang]];
  return country[lang];
}

/**
 * Red de seguridad de la regla 6c: un lugar o país de otro mercado que se colara en el rótulo adaptado (los de
 * siempre y los que Claude vio, `lugares`) se cambia por el de nuestro anuncio, con el artículo que llevaba fuera
 * («in den USA» → «in Berlin»). No toca el propio lugar de destino.
 */
export function withLocalPlaces(text: string, lugares: string[], target: string): string {
  const art = "(?:(?:den|die|der|dem|the)\\s+)?";
  const t = target.toLowerCase();
  const local = target === COUNTRIES.US.en || target === COUNTRIES.US.de || target === COUNTRIES.US.it ? US_NAMES : new Set<string>();
  const names = [...new Set([...FOREIGN_NAMES.filter((n) => !local.has(n)), ...lugares.map((l) => l.trim())])].filter((n) => n.length >= 3 && !t.includes(n.toLowerCase()) && !n.toLowerCase().includes(t));
  let out = text;
  for (const name of names.sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${art}${escapeRe(name)}(?![\\p{L}])`, "giu"), target);
  }
  const localAcronyms = local.size > 0 ? new Set(["USA", "US", "U.S.A.", "U.S.", "NYC", "EE. UU.", "EE.UU.", "EEUU"]) : new Set<string>();
  for (const acronym of [...FOREIGN_ACRONYMS.filter((a) => !localAcronyms.has(a)), ...lugares.filter((l) => l.trim().length < 3)].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${art}${escapeRe(acronym)}(?![\\p{L}])`, "gu"), target);
  }
  return out;
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/** Los fotogramas de muestra (JPEG) a `SAMPLES_PER_SECOND`, con su tiempo. */
async function samples(file: string, durationS: number, dir: string): Promise<Array<{ t: number; jpeg: Buffer }>> {
  const out = path.join(dir, "muestras");
  await fs.mkdir(out, { recursive: true });
  const limit = Math.min(durationS, MAX_REFERENCE_S);
  await ffmpegOutput([
    "-nostdin", "-v", "error", "-y", "-t", limit.toFixed(3), "-i", file,
    "-vf", `fps=${SAMPLES_PER_SECOND}:start_time=0,scale=${SAMPLE_WIDTH}:-2`, "-q:v", "4", path.join(out, "m-%04d.jpg"),
  ]);
  const files = (await fs.readdir(out)).filter((f) => f.endsWith(".jpg")).sort();
  return Promise.all(files.map(async (f, i) => ({ t: i / SAMPLES_PER_SECOND, jpeg: await fs.readFile(path.join(out, f)) })));
}

/**
 * El fotograma exacto (segundos) en que cambia la franja `[top, bottom]` entre `from` y `to`: el de mayor
 * diferencia con el anterior dentro de esa franja (la búsqueda del fotograma de Codex). Sin datos, `to`.
 */
export async function refineSwitch(file: string, from: number, to: number, top: number, bottom: number): Promise<number> {
  const start = Math.max(0, from - 1 / REFINE_FPS);
  const length = Math.max(0.1, to - start + 1 / REFINE_FPS);
  const width = REFINE_WIDTH;
  const raw = await ffmpegOutput([
    "-nostdin", "-v", "error", "-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", file,
    "-vf", `fps=${REFINE_FPS},scale=${width}:192,format=gray`, "-f", "rawvideo", "-",
  ]).catch(() => Buffer.alloc(0));
  const frame = width * 192;
  const count = Math.floor(raw.length / frame);
  if (count < 2) return to;
  const y0 = Math.max(0, Math.floor(Math.min(top, bottom) * 192) - 4);
  const y1 = Math.min(192, Math.ceil(Math.max(top, bottom) * 192) + 4);
  let best = -1;
  let bestAt = to;
  for (let i = 1; i < count; i++) {
    let diff = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) diff += Math.abs(raw[i * frame + y * width + x] - raw[(i - 1) * frame + y * width + x]);
    }
    if (diff > best) {
      best = diff;
      bestAt = start + i / REFINE_FPS;
    }
  }
  return Math.round(Math.min(Math.max(bestAt, from), to) * 1000) / 1000;
}

/** Cambios de plano de la referencia (filtro de escena de ffmpeg, como el motor de Codex: umbral 0,3, ≥ 0,28 s). */
async function sceneCuts(file: string, durationS: number): Promise<number[]> {
  const log = await ffmpegLog(["-nostdin", "-t", Math.min(durationS, MAX_REFERENCE_S).toFixed(3), "-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"]);
  const cuts: number[] = [];
  for (const m of log.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Number(m[1]);
    if (t > 0.1 && (cuts.length === 0 || t - cuts[cuts.length - 1] >= 0.28)) cuts.push(Math.round(t * 1000) / 1000);
  }
  return cuts;
}

export interface ReferenceEditContext {
  file: string;
  product: { id: number; name: string; language: string };
  userId: number;
  dir: string;
  store: ObjectStore | null;
  /** Para la caché del almacén: de qué vídeo es. */
  videoId: number;
  gateway?: LlmGateway;
  /** Dónde pasa nuestro anuncio (`targetPlace`): los lugares de la referencia se cambian por este (regla 6c). */
  place?: string;
  /** Aquí se apuntan las correcciones aprendidas («Mejoras», paso `montaje`) que se usaron. */
  learned?: number[];
}

/** Con las correcciones aprendidas en la clave: si cambian, la edición se vuelve a leer. */
const cacheKey = (videoId: number, sha: string, productName: string, learned = "") =>
  `ediciones/${videoId}/${crypto.createHash("sha256").update(`${sha}\n${productName}\nv3${learned ? `\n${learned}` : ""}`).digest("hex").slice(0, 32)}.json`;

/** La edición de la referencia (rótulos adaptados con sus tiempos y cortes). Lanza si Claude no puede. */
export async function referenceEdit(ctx: ReferenceEditContext): Promise<ReferenceEdit> {
  const sha = await sha256File(ctx.file);
  const place = ctx.place ?? targetPlace("", [], ctx.product.language);
  // Correcciones aprendidas de los reportes sobre rótulos («Mejoras»): van al final de las instrucciones. Sin ninguna, la
  // clave es la de siempre. Una lectura ya guardada sin ellas (p. ej. la del vídeo 24) se reutiliza tal cual al volver a
  // montar, para que sus rótulos no cambien: las correcciones valen para las lecturas nuevas y solo entonces se apuntan.
  const learned = await learnedFor("montaje", ctx.product.id || null);
  const plainKey = cacheKey(ctx.videoId, sha, ctx.product.name);
  const plainSaved = learned.text !== "" && ctx.store !== null && (await ctx.store.head(plainKey).catch(() => null)) !== null;
  const key = plainSaved ? plainKey : cacheKey(ctx.videoId, sha, ctx.product.name, learned.text);
  if (!plainSaved) ctx.learned?.push(...learned.ids);
  if (ctx.store && (await ctx.store.head(key).catch(() => null)) !== null) {
    const cached = path.join(ctx.dir, "edicion-referencia.json");
    await ctx.store.download(key, cached);
    const saved = JSON.parse(await fs.readFile(cached, "utf8")) as ReferenceEdit;
    // Leídas antes de la regla 6c: el lugar se arregla aquí sin volver a leer (los demás rótulos quedan igual).
    return ctx.place ? { ...saved, cues: saved.cues.map((cue) => ({ ...cue, text: withLocalPlaces(cue.text, [], ctx.place!) })) } : saved;
  }
  const { durationMs } = await probeVideo(ctx.file);
  const durationS = durationMs / 1000;
  const shots = await samples(ctx.file, durationS, ctx.dir);
  const answer = await (ctx.gateway ?? getGateway()).call<Answer>({
    tier: "medium",
    stepKey: `montaje:${ctx.videoId}:edicion-referencia:${sha.slice(0, 16)}`,
    userId: ctx.userId,
    productId: ctx.product.id,
    rules: [],
    instructions: REFERENCE_EDIT_INSTRUCTIONS.replaceAll("{PRODUCTO}", ctx.product.name).replaceAll("{LUGAR}", place) + learned.text,
    content: [
      textPart(`Nuestro producto: ${ctx.product.name}. Idioma del anuncio: ${ctx.product.language === "it" ? "italiano" : ctx.product.language === "en" ? "inglés americano" : "alemán"}. Nuestro anuncio pasa en: ${place}. La referencia dura ${durationS.toFixed(2)} s.`),
      ...shots.flatMap((s) => [textPart(`t = ${s.t.toFixed(2)} s`), imagePart(s.jpeg, "image/jpeg")]),
    ],
    maxTokens: 4_000,
    schema: answerSchema,
  });
  const rows = [...(answer.data?.rotulos ?? [])].sort((a, b) => a.desde_s - b.desde_s);
  const cues: ReferenceCue[] = [];
  for (const [i, row] of rows.entries()) {
    let startS = i === 0 && row.desde_s <= 1 / SAMPLES_PER_SECOND ? 0 : Math.min(row.desde_s, durationS);
    if (i > 0 && startS > 0) startS = await refineSwitch(ctx.file, startS - 1 / SAMPLES_PER_SECOND, startS, row.franja_superior, row.franja_inferior);
    if (cues.length > 0 && startS <= cues[cues.length - 1].startS) continue;
    cues.push({ startS, source: row.texto_original.trim(), text: localizeText(withLocalPlaces(withoutThirdParties(row.texto_adaptado.trim(), answer.data?.ajenos ?? [], ctx.product.name), answer.data?.lugares ?? [], place), marketOf(ctx.product)), es: row.traduccion_es.trim(), cta: row.es_cta });
  }
  const result: ReferenceEdit = { version: 1, durationS, cues, cutsS: await sceneCuts(ctx.file, durationS) };
  if (ctx.store) {
    const out = path.join(ctx.dir, "edicion-referencia.json");
    await fs.writeFile(out, JSON.stringify(result));
    await ctx.store.putFile(key, out, { contentType: "application/json" }).catch(() => {});
  }
  return result;
}
