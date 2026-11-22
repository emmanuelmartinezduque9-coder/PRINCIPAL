import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { JobPausedError, runStep, stepKey, StepFailedError, type JobContext } from "@/jobs/steps";
import { imagePart, textPart, type LlmContent } from "@/llm/content";
import {
  getGateway,
  LlmCallError,
  LlmInvalidOutputError,
  LlmNotConfiguredError,
  LlmRefusalError,
  LlmTruncatedError,
  type LlmGateway,
} from "@/llm/gateway";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { makeThumbnail, MAX_FRAMES, MediaError } from "@/server/media/ffmpeg";
import { listProductPhotos, readProductPhoto, type PhotoInfo } from "@/server/photos";
import { getProductFor, type Product } from "@/server/products";
import { loadRules, VIDEO_RULE_SLUGS } from "@/server/rules";
import { clipManifest, FRAME_USES, imageManifest, type FrameUse, type ManifestItem } from "@/server/videos/manifest";
import { PROMPT_BLACKLIST, type PromptIssue } from "@/server/videos/prompt-check";
import { getVideoFor, promptIssues, requireVideoOwner, type Video } from "@/server/videos/videos";

/**
 * Desglose del vídeo de referencia con Claude (trabajo `video.desglose`): la lógica del concepto,
 * los planos, el mapa de adaptación al producto, los riesgos y los dos prompts (imagen inicial y
 * clip), que se copian al vídeo para que la persona los revise. Claude ve los fotogramas de la
 * referencia y las fotos del producto con su papel y su número en cada manifiesto.
 *
 * Cada intento cuesta: si Claude falla o responde sin el formato pedido, el desglose queda en
 * error y no se repite solo; la persona lo repite con «Repetir desglose», que crea otro. Si el
 * proceso se cae a mitad, la cola vuelve a lanzar el trabajo; si a la hora sigue sin terminar, el
 * seguimiento lo deja en error.
 */

export const ANALYSIS_JOB = "video.desglose";
/** Un desglose en cola o en marcha desde hace más que esto se da por interrumpido. */
export const ANALYSIS_STALE_MS = 60 * 60 * 1000;
export const ANALYSIS_INTERRUPTED = "El desglose se interrumpió. Repítelo.";

const MAX_TOKENS = 16_000;
/** Lado largo de las fotos del producto que se mandan a Claude. */
const PHOTO_MAX_SIDE = 1024;
const MAX_PROMPT_CHARS = 20_000;

const ACTIVE = ["queued", "running", "paused"];

const NO_REFERENCE = "Sube primero el vídeo de referencia.";
const NO_AVATAR = "Elige un avatar o marca que en el vídeo no aparece nadie.";
const NO_ARTICLE = "Añade al menos una foto del artículo.";
const BUSY = "Ya hay un desglose en marcha.";
const PAUSED = "En pausa: se ha alcanzado el tope de gasto.";
const NOT_QUEUED = "No se pudo poner en marcha el desglose. Inténtalo de nuevo.";
const BAD_PHOTO = "No se pudo preparar una de las fotos del producto. Cámbiala y repite el desglose.";
const PROMPT_TOO_LONG = "El prompt no puede tener más de 20.000 caracteres.";
const BAD_FRAME_USE = "Uso de la imagen no válido.";

// ───────────────────────── Forma del desglose ─────────────────────────

export interface Analysis {
  conceptLogic: string;
  shots: Array<{ startS: number; endS: number; seen: string; action: string; onScreenText: string }>;
  adaptation: Array<{ original: string; equivalent: string; physicalAction: string; visibleResult: string; kept: string; changed: string; why: string }>;
  risks: Array<{
    kind: "funcion_inexistente" | "reveal_adelantado" | "escala" | "identidad" | "texto_en_pantalla" | "marca_ajena" | "otro";
    detail: string;
  }>;
  frameUse: FrameUse;
  imagePrompt: string;
  videoPrompt: string;
}

const seconds = z.number().min(0);
const filled = z.string().min(1);

export const analysisSchema: z.ZodType<Analysis> = z.object({
  conceptLogic: filled.describe("La lógica del concepto en una frase, en español."),
  shots: z
    .array(
      z.object({
        startS: seconds,
        endS: seconds,
        seen: z.string().describe("Qué se ve."),
        action: z.string().describe("Qué pasa."),
        onScreenText: z.string().describe("Texto en pantalla, literal; vacío si no hay."),
      }),
    )
    .min(1),
  adaptation: z.array(
    z.object({
      original: z.string(),
      equivalent: z.string(),
      physicalAction: z.string(),
      visibleResult: z.string(),
      kept: z.string(),
      changed: z.string(),
      why: z.string(),
    }),
  ),
  risks: z.array(
    z.object({
      kind: z.enum(["funcion_inexistente", "reveal_adelantado", "escala", "identidad", "texto_en_pantalla", "marca_ajena", "otro"]),
      detail: z.string(),
    }),
  ),
  frameUse: z.enum(["start_image", "contextual_reference"]),
  imagePrompt: filled.describe("Prompt de la imagen inicial, en inglés."),
  videoPrompt: filled.describe("Prompt del clip, en inglés, con @Video1 y @ImageN."),
});

// ───────────────────────── Instrucciones del paso ─────────────────────────

const INSTRUCTIONS = `Desglosa el vídeo de referencia y prepara su adaptación al producto del encargo, aplicando las tres reglas que se entregan arriba («Adaptación de conceptos», «Imágenes con Nano Banana Pro» y «Vídeo con Seedance 2.5»).

Recibes la ficha del producto, la duración del tramo de la referencia y sus cortes de plano detectados, los manifiestos de referencias de la imagen inicial y del clip (con su número y su papel: el orden lo fija la aplicación y no se cambia), los fotogramas de la referencia con su segundo y las fotos del producto, cada una con su número en los dos manifiestos y su papel.

Devuelve, con la forma pedida:
1. conceptLogic: la lógica del concepto en una sola frase (por qué funciona el vídeo, no qué se ve).
2. shots: la tabla de planos de la referencia, con su inicio y fin en segundos, qué se ve, qué pasa y el texto en pantalla literal (vacío si no hay).
3. adaptation: el mapa de adaptación: por cada pieza del original, su equivalente con este producto, la acción física, el resultado visible, qué se conserva, qué cambia y por qué.
4. risks: los riesgos de la adaptación. Revisa siempre: una función que el producto no tiene (funcion_inexistente), un reveal adelantado (reveal_adelantado), la falta de una foto con mano para la escala (escala), una identidad que no sea la del avatar elegido (identidad), texto en pantalla de la referencia (texto_en_pantalla) y marcas ajenas (marca_ajena); cualquier otro, otro.
5. frameUse: según la regla de vídeo: si el clip es de un solo plano, start_image (la imagen aprobada es el primer fotograma); si tiene varios planos, contextual_reference.
6. imagePrompt: el prompt de la imagen inicial según la regla de imagen, en prosa y en párrafos corridos, sin títulos en mayúsculas, de unos 4.900 caracteres. Cita cada referencia del manifiesto de imagen como «image N» y di para qué sirve según su papel (image 1 aporta solo la composición y la distancia de cámara, nunca la identidad). La imagen muestra la escena inicial del clip.
7. videoPrompt: el prompt del clip según la plantilla de la regla de vídeo, con menos de 4.000 caracteres. Cita cada referencia del manifiesto del clip exactamente como @Video1 y @ImageN (mayúscula inicial, sin espacio) y ninguna otra. @Video1 aporta solo la cámara, el ritmo y el tipo de acción, nunca la persona, el producto, el espacio ni el texto. @Image1 es la imagen inicial aprobada (la que saldrá del prompt de imagen), descrita según frameUse. La geometría del producto es fija: forma, proporciones y etiqueta no cambian. No pidas texto en pantalla, subtítulos ni rótulos.

Ninguno de los dos prompts lleva direcciones, identificadores de archivos ni estas palabras vetadas: ${PROMPT_BLACKLIST.join(", ")}.

Las explicaciones (conceptLogic, shots, adaptation, risks) van en español; los dos prompts, en inglés.`;

// ───────────────────────── Contenido de la petición ─────────────────────────

/** Segundos con una cifra decimal y coma: 1500 → «1,5 s». */
const secondsText = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

const ROLE_LABEL: Record<ManifestItem["role"], string> = {
  composicion: "composición (primer fotograma de la referencia: solo encuadre y distancia de cámara)",
  video_referencia: "vídeo de referencia (el tramo)",
  imagen_aprobada: "imagen inicial aprobada",
  avatar: "avatar",
  articulo: "artículo",
  embalaje: "embalaje",
  entorno: "entorno",
  otro: "otro",
};

/** Como mucho `MAX_FRAMES`, repartidos por todo el tramo. */
function spread<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, i) => items[Math.round((i * (items.length - 1)) / (limit - 1))]);
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const asImageMime = (mime: string) => (IMAGE_MIMES.has(mime) ? mime : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

async function buildContent(user: AuthUser, video: Video, product: Product, photos: PhotoInfo[]): Promise<LlmContent> {
  const images = imageManifest(video, photos);
  const clip = clipManifest(video, photos);
  const cuts = video.cutsMs ?? [];

  const content: LlmContent = [
    textPart(
      [
        `Producto: ${product.name}`,
        `Qué hace: ${product.summary}`,
        `Idioma del anuncio: ${product.language}`,
        `Países: ${product.countries.join(", ")}`,
      ].join("\n"),
    ),
    textPart(
      [
        `Duración del tramo de la referencia: ${secondsText(video.segmentDurationMs ?? 0)}.`,
        `Cortes de plano detectados: ${cuts.length > 0 ? cuts.map(secondsText).join(", ") : "ninguno"}.`,
      ].join("\n"),
    ),
    textPart(
      [
        "Manifiesto de la imagen inicial (en este orden):",
        ...images.map((item) => `${item.tag} — ${ROLE_LABEL[item.role]}`),
        "",
        "Manifiesto del clip (en este orden):",
        ...clip.map((item) => `${item.tag} — ${ROLE_LABEL[item.role]}`),
      ].join("\n"),
    ),
  ];

  const frames = await getDb()
    .select({ timeMs: schema.videoFrames.timeMs, mime: schema.videoFrames.mime, data: schema.videoFrames.data })
    .from(schema.videoFrames)
    .where(eq(schema.videoFrames.videoId, video.id))
    .orderBy(asc(schema.videoFrames.index));
  spread(frames, MAX_FRAMES).forEach((frame, i) => {
    content.push(textPart(`Fotograma ${i + 1} — ${secondsText(frame.timeMs)}`), imagePart(Buffer.from(frame.data), asImageMime(frame.mime)));
  });

  const clipTags = new Map(clip.flatMap((item) => (item.source.kind === "photo" ? [[item.source.photoId, item.tag] as const] : [])));
  for (const item of images) {
    if (item.source.kind !== "photo") continue;
    const clipTag = clipTags.get(item.source.photoId);
    const { data } = await readProductPhoto(user, item.source.photoId);
    let reduced: Buffer;
    try {
      reduced = await makeThumbnail(data, "image", PHOTO_MAX_SIDE);
    } catch (error) {
      if (error instanceof MediaError) throw new StepFailedError(BAD_PHOTO);
      throw error;
    }
    content.push(
      textPart(`${item.tag}${clipTag ? ` · ${clipTag}` : ""} — papel: ${ROLE_LABEL[item.role]}`),
      imagePart(reduced, "image/jpeg"),
    );
  }
  return content;
}

// ───────────────────────── Estado del desglose ─────────────────────────

const analyses = schema.videoAnalyses;

/** Cerrojo por vídeo: dos peticiones a la vez no crean dos desgloses ni repiten versión. */
const analysisLock = (videoId: number) => sql`select pg_advisory_xact_lock(hashtextextended(${`principal.videos.desglose:${videoId}`}, 0))`;

/** Pasa a `status` un desglose que sigue sin terminar; uno hecho o fallido no se toca. */
async function setStatus(analysisId: number, status: "running" | "paused" | "failed", error: string | null, spendEntryId?: number): Promise<boolean> {
  const updated = await getDb()
    .update(analyses)
    .set({ status, error, updatedAt: new Date(), ...(spendEntryId !== undefined ? { spendEntryId } : {}) })
    .where(and(eq(analyses.id, analysisId), inArray(analyses.status, ACTIVE)))
    .returning({ id: analyses.id });
  return updated.length > 0;
}

/** Errores de la pasarela que no se arreglan repitiendo sin más (y repetir costaría otra vez). */
const isGatewayFailure = (error: unknown): error is Error =>
  error instanceof LlmCallError ||
  error instanceof LlmRefusalError ||
  error instanceof LlmTruncatedError ||
  error instanceof LlmInvalidOutputError ||
  error instanceof LlmNotConfiguredError;

// ───────────────────────── Funciones públicas ─────────────────────────

/**
 * Pide un desglose nuevo (versión siguiente) y encola `video.desglose`. Solo quien creó el vídeo,
 * con la referencia lista, un avatar o «sin persona» y al menos una foto de artículo; si ya hay
 * uno en marcha (o en pausa), 409.
 */
export async function requestAnalysis(user: AuthUser, videoId: number): Promise<{ analysisId: number }> {
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  if (video.referenceStatus !== "ready") throw new HttpError(400, NO_REFERENCE);
  const manifest = imageManifest(video, await listProductPhotos(user, video.productId));
  if (!video.noPerson && !manifest.some((item) => item.role === "avatar")) throw new HttpError(400, NO_AVATAR);
  if (!manifest.some((item) => item.role === "articulo")) throw new HttpError(400, NO_ARTICLE);

  const analysisId = await getDb().transaction(async (tx) => {
    await tx.execute(analysisLock(video.id));
    const [active] = await tx
      .select({ id: analyses.id })
      .from(analyses)
      .where(and(eq(analyses.videoId, video.id), inArray(analyses.status, ACTIVE)));
    if (active) throw new HttpError(409, BUSY);
    const [{ last }] = await tx.select({ last: max(analyses.version) }).from(analyses).where(eq(analyses.videoId, video.id));
    const [row] = await tx
      .insert(analyses)
      .values({ videoId: video.id, version: (last ?? 0) + 1, status: "queued", createdBy: user.id })
      .returning({ id: analyses.id });
    return row.id;
  });

  try {
    await enqueueJob(ANALYSIS_JOB, { userId: video.createdBy, productId: video.productId }, { analysisId });
  } catch (error) {
    await setStatus(analysisId, "failed", NOT_QUEUED);
    throw error;
  }
  return { analysisId };
}

interface StepResult {
  result: Analysis;
  ruleVersions: Record<string, number>;
  spendEntryId: number;
}

/**
 * Ejecuta el desglose: llama a Claude dentro de un paso (una sola vez por desglose) y guarda el
 * resultado, copiando los dos prompts y el uso de la imagen al vídeo. No hace nada si el desglose
 * ya está hecho o fallido. `deps.gateway` es para las pruebas.
 */
export async function runAnalysis(analysisId: number, deps: { gateway?: LlmGateway } = {}): Promise<void> {
  const [row] = await getDb()
    .select({ videoId: analyses.videoId, status: analyses.status, createdBy: schema.videos.createdBy, productId: schema.videos.productId })
    .from(analyses)
    .innerJoin(schema.videos, eq(schema.videos.id, analyses.videoId))
    .where(eq(analyses.id, analysisId));
  if (!row || !ACTIVE.includes(row.status)) return;
  // Al empezar (o al volver a lanzarlo la cola) queda en marcha y renueva su hora.
  if (!(await setStatus(analysisId, "running", null))) return;

  const ctx: JobContext = { jobName: ANALYSIS_JOB, userId: row.createdBy, productId: row.productId };
  const key = stepKey(ctx, "desglose", { analysisId });
  let step: StepResult;
  try {
    step = await runStep(ctx, key, async (): Promise<StepResult> => {
      const user = await getActiveUser(ctx.userId);
      if (!user) throw new StepFailedError("Esta cuenta está desactivada.");
      const video = await getVideoFor(user, row.videoId);
      const product = await getProductFor(user, video.productId);
      const content = await buildContent(user, video, product, await listProductPhotos(user, video.productId));
      try {
        const answer = await (deps.gateway ?? getGateway()).call({
          tier: "medium",
          stepKey: key,
          userId: ctx.userId,
          productId: ctx.productId,
          rules: await loadRules([...VIDEO_RULE_SLUGS]),
          instructions: INSTRUCTIONS,
          content,
          maxTokens: MAX_TOKENS,
          schema: analysisSchema,
        });
        return { result: answer.data!, ruleVersions: answer.ruleVersions, spendEntryId: answer.spendEntryId };
      } catch (error) {
        if (!isGatewayFailure(error)) throw error;
        const spent = error instanceof LlmTruncatedError ? error.partial?.spendEntryId : undefined;
        await setStatus(analysisId, "failed", error.message, spent);
        throw new StepFailedError(error.message);
      }
    });
  } catch (error) {
    if (error instanceof JobPausedError) await setStatus(analysisId, "paused", PAUSED);
    else if (error instanceof StepFailedError) await setStatus(analysisId, "failed", error.message);
    throw error;
  }

  await getDb().transaction(async (tx) => {
    const [saved] = await tx
      .update(analyses)
      .set({ status: "done", error: null, result: step.result, ruleVersions: step.ruleVersions, spendEntryId: step.spendEntryId, updatedAt: new Date() })
      .where(and(eq(analyses.id, analysisId), inArray(analyses.status, ACTIVE)))
      .returning({ videoId: analyses.videoId });
    if (!saved) return;
    await tx
      .update(schema.videos)
      .set({ imagePrompt: step.result.imagePrompt, videoPrompt: step.result.videoPrompt, frameUse: step.result.frameUse, updatedAt: new Date() })
      .where(eq(schema.videos.id, saved.videoId));
  });
}

/**
 * Cambia los prompts o el uso de la imagen (lo que no se envía se queda igual). Solo quien creó
 * el vídeo. Devuelve los avisos de los prompts tal como quedan.
 */
export async function updatePrompts(
  user: AuthUser,
  videoId: number,
  input: { imagePrompt?: string; videoPrompt?: string; frameUse?: FrameUse },
): Promise<{ imageIssues: PromptIssue[]; videoIssues: PromptIssue[] }> {
  let video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const changes: Partial<typeof schema.videos.$inferInsert> = {};
  for (const field of ["imagePrompt", "videoPrompt"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new HttpError(400, "Escribe el prompt.");
    if (value.length > MAX_PROMPT_CHARS) throw new HttpError(400, PROMPT_TOO_LONG);
    changes[field] = value;
  }
  if (input.frameUse !== undefined) {
    if (!FRAME_USES.includes(input.frameUse)) throw new HttpError(400, BAD_FRAME_USE);
    changes.frameUse = input.frameUse;
  }
  if (Object.keys(changes).length > 0) {
    const [updated] = await getDb()
      .update(schema.videos)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(schema.videos.id, video.id), eq(schema.videos.createdBy, user.id)))
      .returning();
    if (!updated) throw new HttpError(404, "Vídeo no encontrado.");
    video = updated;
  }
  return promptIssues(video, await listProductPhotos(user, video.productId));
}
