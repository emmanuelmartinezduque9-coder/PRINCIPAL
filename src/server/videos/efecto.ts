import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HfMediaRef } from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { runStep, stepKey, type JobContext } from "@/jobs/steps";
import { imagePart, textPart } from "@/llm/content";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { makeThumbnail } from "@/server/media/ffmpeg";
import { readProductPhoto } from "@/server/photos";
import { FINALIZE_JOB, SYSTEM_REJECT_PREFIX, type GenDeps } from "@/server/videos/generations";

/**
 * Paso del efecto (orden del dueño, 23/11/2026). Con un solo paso, el efecto del producto del vídeo
 * original (p. ej. unas alas proyectadas de plumas) sobrevive aunque el prompt pida el del producto
 * (alas de mariposa): el fotograma original manda. Lo que funcionó, probado a mano en FalterPfote:
 * un segundo paso corto de edición sobre la imagen ya hecha, con la foto del producto funcionando,
 * que cambia solo el efecto.
 *
 * Cuando el producto tiene foto «funcionamiento» y el efecto se ve en la toma (lo decide Claude al
 * escribir el prompt con sala, `effectVisible`, y escribe también `effectPrompt`):
 *  1. Al terminar la imagen principal, la aplicación la rechaza con «Corrección automática: paso
 *     del efecto (1)» (no gasta regeneraciones) y el lote o el flujo del vídeo pide la ronda
 *     siguiente, que el constructor de la imagen convierte en el paso del efecto: image 1 = la
 *     imagen principal, image 2 = la foto de funcionamiento, el prompt corto. Cuesta lo que una
 *     ronda de imagen y cuenta en el presupuesto del lote.
 *  2. Al terminar el paso, una comprobación barata con visión: ¿el efecto tiene la forma del de la
 *     foto de funcionamiento? Si no, se repite una vez («… (2)») desde la misma imagen principal.
 *     La candidata que ve el dueño es la editada.
 */

export const EFFECT_PROMPT_START = "Edit image 1.";
const EFFECT_REASON = (attempt: number) => `${SYSTEM_REJECT_PREFIX}paso del efecto (${attempt})`;
const EFFECT_REASON_RE = /paso del efecto \((\d)\)$/;
const MAX_EFFECT_ATTEMPTS = 2;

interface EffectInfo {
  prompt: string;
  workingPhotoId: number;
}

/** Si la imagen de este vídeo necesita el paso del efecto, su prompt y la foto de funcionamiento. */
export async function effectPassInfo(videoId: number): Promise<EffectInfo | null> {
  const [video] = await getDb().select({ productId: schema.videos.productId }).from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!video) return null;
  const [analysis] = await getDb()
    .select({ id: schema.videoAnalyses.id })
    .from(schema.videoAnalyses)
    .where(and(eq(schema.videoAnalyses.videoId, videoId), eq(schema.videoAnalyses.status, "done")))
    .orderBy(desc(schema.videoAnalyses.version))
    .limit(1);
  if (!analysis) return null;
  const [run] = await getDb()
    .select({ status: schema.videoPinterestRefs.status, scene: schema.videoPinterestRefs.scene, framePrompt: schema.videoPinterestRefs.framePrompt })
    .from(schema.videoPinterestRefs)
    .where(and(eq(schema.videoPinterestRefs.videoId, videoId), eq(schema.videoPinterestRefs.analysisId, analysis.id), eq(schema.videoPinterestRefs.tramo, 0)));
  const scene = run?.scene as { effectVisible?: boolean; effectPrompt?: string; productHidden?: boolean } | null;
  if (run?.status !== "ready" || !run.framePrompt || !scene?.effectVisible || scene.productHidden || !scene.effectPrompt) return null;
  const [photo] = await getDb()
    .select({ id: schema.productPhotos.id })
    .from(schema.productPhotos)
    .where(and(eq(schema.productPhotos.productId, video.productId), eq(schema.productPhotos.role, "funcionamiento")))
    .orderBy(asc(schema.productPhotos.id))
    .limit(1);
  if (!photo) return null;
  const prompt = scene.effectPrompt.trim().startsWith(EFFECT_PROMPT_START) ? scene.effectPrompt.trim() : `${EFFECT_PROMPT_START} ${scene.effectPrompt.trim()}`;
  return { prompt, workingPhotoId: photo.id };
}

/** ¿Se espera un paso del efecto para la imagen de este vídeo? (Para presupuestar el lote.) */
export async function expectsEffectPass(videoId: number): Promise<boolean> {
  return (await effectPassInfo(videoId)) !== null;
}

type Generation = typeof schema.generations.$inferSelect;

async function frameRounds(videoId: number): Promise<Generation[]> {
  return getDb()
    .select()
    .from(schema.generations)
    .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, "frame")))
    .orderBy(asc(schema.generations.round));
}

/** El primer resultado bueno de una ronda: su trabajo de Higgsfield (vale como referencia) y su dirección. */
async function firstResult(generationId: number): Promise<{ jobId: string; url: string | null } | null> {
  const [row] = await getDb()
    .select({ jobId: schema.generationResults.jobId, url: schema.generationResults.url })
    .from(schema.generationResults)
    .where(and(eq(schema.generationResults.generationId, generationId), eq(schema.generationResults.ok, true)))
    .orderBy(asc(schema.generationResults.index))
    .limit(1);
  return row ?? null;
}

/**
 * Si la siguiente ronda de imagen del vídeo es un paso del efecto: el intento y la imagen principal
 * de la que parte (la ronda rechazada con «… (1)»). `null` si toca una ronda normal.
 */
export async function pendingEffectPass(videoId: number): Promise<{ attempt: number; baseJobId: string } | null> {
  const rounds = await frameRounds(videoId);
  const last = rounds.at(-1);
  const match = last?.rejectReason ? EFFECT_REASON_RE.exec(last.rejectReason) : null;
  if (!last || !match) return null;
  const base = [...rounds].reverse().find((round) => round.rejectReason === EFFECT_REASON(1));
  const result = base ? await firstResult(base.id) : null;
  return result ? { attempt: Number(match[1]), baseJobId: result.jobId } : null;
}

/** La petición del paso del efecto: la imagen principal y la foto de funcionamiento, con el prompt corto. */
export async function buildEffectRequest(
  user: AuthUser,
  videoId: number,
  pending: { attempt: number; baseJobId: string },
  deps: GenDeps,
): Promise<{ prompt: string; medias: HfMediaRef[] } | null> {
  const info = await effectPassInfo(videoId);
  if (!info) return null;
  const photo = await readProductPhoto(user, info.workingPhotoId);
  const working = await ensureMedia(user.id, { bytes: photo.data, filename: `funcionamiento-${info.workingPhotoId}.jpg`, contentType: photo.mime, type: "image" }, deps);
  const retry =
    pending.attempt > 1
      ? " The previous attempt kept the old shape: the projected effect must now match image 2 unmistakably, in outline, structure and colour."
      : "";
  return {
    prompt: `${info.prompt}${retry}`,
    medias: [
      { role: "image_references", value: pending.baseJobId },
      { role: "image_references", value: working },
    ],
  };
}

const checkSchema = z.object({
  matches: z.boolean().describe("true si el efecto de la imagen generada tiene la forma, la estructura y los colores del de la foto de funcionamiento."),
  reason: z.string().describe("En una frase, en español."),
});

async function jpegOf(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`No se pudo bajar la imagen (${response.status}).`);
  return makeThumbnail(Buffer.from(await response.arrayBuffer()), "image", 768);
}

/**
 * Tras guardar los resultados de una ronda de imagen (trabajo de finalizar): si era la imagen
 * principal y hace falta el paso del efecto, la pasa a «paso del efecto (1)»; si era el paso del
 * efecto, lo comprueba con visión y, si el efecto no tiene la forma del producto, lo repite una vez.
 * Nunca lanza: si algo falla, la candidata se queda como está.
 */
export async function afterFrameDone(generationId: number, deps: { gateway?: LlmGateway } = {}): Promise<void> {
  try {
    const [generation] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, generationId));
    if (!generation || generation.kind !== "frame" || generation.status !== "done" || generation.rejectReason) return;
    const [video] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, generation.videoId));
    if (!video || video.approvedFrameResultId !== null) return;
    const info = await effectPassInfo(video.id);
    if (!info) return;
    const owner = await getActiveUser(video.createdBy);
    if (!owner) return;
    const { rejectFrame } = await import("@/server/videos/frame");
    const prompt = String((generation.request as { prompt?: unknown }).prompt ?? "");
    if (!prompt.startsWith(EFFECT_PROMPT_START)) {
      // La imagen principal: ahora el paso del efecto.
      await rejectFrame(owner, video.id, EFFECT_REASON(1));
      console.log(`[imagen] Vídeo ${video.id}: imagen principal hecha; se pide el paso del efecto.`);
      return;
    }
    const rounds = await frameRounds(video.id);
    const previous = rounds.filter((round) => round.round < generation.round).at(-1);
    const attempt = previous?.rejectReason ? Number(EFFECT_REASON_RE.exec(previous.rejectReason)?.[1] ?? 1) : 1;
    if (attempt >= MAX_EFFECT_ATTEMPTS) return;
    const result = await firstResult(generation.id);
    if (!result?.url) return;
    const working = await readProductPhoto(owner, info.workingPhotoId);
    const ctx: JobContext = { jobName: FINALIZE_JOB, userId: video.createdBy, productId: video.productId };
    const key = stepKey(ctx, "comprobar-efecto", { generationId });
    const verdict = await runStep(ctx, key, async () => {
      const answer = await (deps.gateway ?? getGateway()).call({
        tier: "small",
        stepKey: key,
        userId: ctx.userId,
        productId: ctx.productId,
        rules: [],
        instructions:
          "Comparas el efecto visible del producto (una proyección, una luz, un resultado) en una imagen generada con el de la foto del producto funcionando. ¿Tiene la misma forma y estructura (p. ej. alas de mariposa redondeadas con nervaduras, no plumas puntiagudas) y colores parecidos? Ignora el fondo, el sujeto y la luz.",
        content: [
          textPart("Imagen generada:"),
          imagePart(await jpegOf(result.url!), "image/jpeg"),
          textPart("Foto del producto funcionando (el efecto correcto):"),
          imagePart(await makeThumbnail(working.data, "image", 768), "image/jpeg"),
        ],
        maxTokens: 800,
        schema: checkSchema,
      });
      return answer.data!;
    });
    if (verdict.matches) return;
    await rejectFrame(owner, video.id, EFFECT_REASON(attempt + 1));
    console.log(`[imagen] Vídeo ${video.id}: el efecto no coincide (${verdict.reason}); se repite el paso del efecto.`);
  } catch (error) {
    console.error(`[imagen] Paso del efecto tras la generación ${generationId}:`, error);
  }
}
