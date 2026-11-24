import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "@/connectors/higgsfield";
import { createFakeHiggsfield, SAMPLE_VIDEO_URL, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { createGateway } from "@/llm/gateway";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { releaseSpend, reserveSpend, settleInterruptedSpend, settleSpend, spendSummary } from "@/server/spend";
import { analysisStepKey, requestAnalysis, runAnalysis, type Analysis } from "@/server/videos/analysis";
import {
  buildClipRequest,
  CLIP_MODEL,
  CLIP_TOO_BIG,
  CLIP_TOO_SLOW,
  guardedClipStreamForTests,
  openClipStream,
  CLIP_RESOLUTIONS,
  clipDownload,
  clipDurationSeconds,
  DEFAULT_CLIP_RESOLUTION,
} from "@/server/videos/clip";
import { videoCosts } from "@/server/videos/costs";
import {
  approveResult,
  finalizeGeneration,
  quoteGeneration,
  registerRequestBuilder,
  rejectRound,
  requestGeneration,
  submitGeneration,
  type GenDeps,
} from "@/server/videos/generations";
import { createVideo, getVideoFor, latestDoneAnalysis, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { CLIP_MODEL_CHOICES, CLIP_MODEL_OPTIONS, DEFAULT_CLIP_MODEL_CHOICE, resolveClipModel, sourceProblem, wanDurationSeconds } from "@/lib/clip-models";
import { videoParams } from "@/connectors/higgsfield/adapter";
import type { HfVideoRequest } from "@/connectors/higgsfield";
import { POST as presupuestoRoute } from "@/app/api/videos/[videoId]/clip/presupuesto/route";
import { POST as generarRoute } from "@/app/api/videos/[videoId]/clip/generar/route";
import { POST as aprobarRoute } from "@/app/api/videos/[videoId]/clip/aprobar/route";
import { POST as rechazarRoute } from "@/app/api/videos/[videoId]/clip/rechazar/route";
import { GET as descargarRoute } from "@/app/api/videos/[videoId]/clip/descargar/route";
import { PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * Clip con Higgsfield simulado. La imagen inicial se genera con un constructor de prueba (la de
 * verdad es de la Tarea 9) para tener una imagen aprobada de verdad. Las descargas de resultados
 * van por un `fetch` falso que devuelve un JPEG o un MP4 hechos con ffmpeg.
 */

/** Como en las capturas reales: los resultados se sirven desde CloudFront. */
const CDN = "https://d8j0ntlcm91z4.cloudfront.net";

const PROMPT =
  "@Video1 gives only the camera movement, the rhythm and the action. @Image1 is the first frame. " +
  "The woman is @Image2. The bottle is @Image3.";

let dir: string;
let red: Buffer;
let green: Buffer;
let mp4: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;
let v: Video;

function ffmpeg(args: string[]): void {
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-clip-"));
  const file = (name: string) => path.join(dir, name);
  ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=720x1280", "-frames:v", "1", file("rojo.jpg")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=green:s=720x1280", "-frames:v", "1", file("verde.jpg")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", file("clip.mp4")]);
  red = fs.readFileSync(file("rojo.jpg"));
  green = fs.readFileSync(file("verde.jpg"));
  mp4 = fs.readFileSync(file("clip.mp4"));

  registerRequestBuilder("frame", async () => ({
    request: { model: "nano_banana_pro", prompt: "Image 1 is the composition.", aspectRatio: "9:16", resolution: "2k", medias: [] },
    count: 2,
  }));
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.PRINCIPAL_HIGGSFIELD_FAKE;
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  delete process.env.PRINCIPAL_HIGGSFIELD_FAKE;
  cookie.value = undefined;
  fake = createFakeHiggsfield();
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const bytes = url.endsWith(".mp4") || url.startsWith("data:video/") ? mp4 : red;
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "BrilloMax Ñandú" });
  // Estas pruebas son de Seedance; las de Genjutsu y Wan van en «modelo del clip».
  v = await createVideo(ana, producto.id, { clipModel: "seedance_2_5" });
});

// ───────────────────────── Ayudas ─────────────────────────

const uploads = () => fake.calls.filter((c) => c.method === "uploadMedia");
const fresh = () => getVideoFor(ana, v.id);

/** Avatar (rojo) y artículo (verde), referencia lista de `seconds` s subida como `ref-media`. */
async function readyReference(seconds = 6): Promise<void> {
  await addProductPhoto(ana, producto.id, green, "articulo");
  const avatar = await addProductPhoto(ana, producto.id, red, "avatar");
  await updateVideoChoices(ana, v.id, { avatarPhotoId: avatar.id });
  await getPool().query(
    "update videos set reference_status = 'ready', reference_media_id = 'ref-media', reference_duration_ms = $2, segment_duration_ms = $2 where id = $1",
    [v.id, seconds * 1000],
  );
  for (let index = 0; index < 4; index++) {
    await getPool().query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, $2, $3, 'image/jpeg', $4, $5)", [
      v.id,
      index,
      index * 1500,
      red.length,
      red,
    ]);
  }
}

/** Lo que dejaría un desglose hecho: su fila y el prompt del clip en el vídeo. */
async function analysed(prompt = PROMPT, frameUse = "start_image"): Promise<void> {
  await getPool().query(
    "insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, 'done', 'ref-media', $2)",
    [v.id, ana.id],
  );
  await getPool().query("update videos set video_prompt = $2, frame_use = $3 where id = $1", [v.id, prompt, frameUse]);
}

/** Termina en el simulado los trabajos de una generación con esas direcciones y la finaliza (lo que haría `video.finalizar`). */
async function finish(generationId: number, urls: (i: number) => string): Promise<void> {
  const { rows } = await getPool().query("select job_ids as \"jobIds\" from generations where id = $1", [generationId]);
  (rows[0].jobIds as string[]).forEach((jobId, i) => {
    fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: [urls(i)] };
  });
  await finalizeGeneration(generationId, deps);
}

/** Imagen inicial de 4 créditos, terminada y con la primera candidata aprobada; devuelve su `jobId`. */
async function approvedFrame(): Promise<string> {
  const { generationId } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
  await submitGeneration(generationId, deps);
  await finish(generationId, (i) => `https://cdn.test/imagen-${i}.png`);
  const result = (await videoView(ana, v.id)).frame.current!.results[0];
  await approveResult(ana, v.id, "frame", result.id);
  const { rows } = await getPool().query("select job_id as \"jobId\" from generation_results where id = $1", [result.id]);
  return rows[0].jobId;
}

/** Todo listo para pedir el clip: referencia, desglose y la imagen aprobada. */
async function readyForClip(): Promise<string> {
  await readyReference();
  await analysed();
  return approvedFrame();
}

/** Pide y envía un clip con el precio que diga el presupuesto; devuelve la generación. */
async function sendClip(): Promise<number> {
  const { credits } = await quoteGeneration(ana, v.id, "clip", deps);
  const { generationId } = await requestGeneration(ana, v.id, "clip", { expectedCredits: credits }, deps);
  await submitGeneration(generationId, deps);
  return generationId;
}

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const params = (id: number | string) => ({ params: Promise.resolve({ videoId: String(id) }) });
const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ───────────────────────── Modelo del clip (Codex) ─────────────────────────

/** El vídeo con ese modelo y un desglose escrito para él (como lo dejaría el desglose). */
async function withModel(choice: string, resolved: string, prompt: string): Promise<void> {
  await getPool().query("update videos set clip_model = $2 where id = $1", [v.id, choice]);
  await getPool().query("update video_analyses set clip_model = $2 where video_id = $1", [v.id, resolved]);
  await getPool().query("update videos set video_prompt = $2, frame_use = 'contextual_reference' where id = $1", [v.id, prompt]);
}

const GENJUTSU_PROMPT =
  "Use the source video as the authority for every action, cut and timing. Use image [1] as the human-approved clean opening frame. " +
  "Replace the woman with the person in image [2]. The bottle is the exact product in image [3]. No text overlays, no captions.";

describe("modelo del clip: las opciones de Codex", () => {
  it("por defecto Genjutsu Motion Transfer (regla fija); con un tramo de menos de 3 s, Seedance; sin elección (antes), Seedance", () => {
    expect(DEFAULT_CLIP_MODEL_CHOICE).toBe("hf_mult_motion_control");
    expect(resolveClipModel("hf_mult_motion_control", 2_500)).toBe("seedance_2_5");
    expect([...CLIP_MODEL_OPTIONS]).toEqual(["hf_mult_motion_control", "hf_mult_replace_object", "wan3_0_prime", "seedance_2_5"]);
    expect(resolveClipModel("auto", 6_000)).toBe("hf_mult_motion_control");
    expect(resolveClipModel("auto", 2_500)).toBe("seedance_2_5");
    expect(resolveClipModel("auto", null)).toBe("hf_mult_motion_control");
    expect(resolveClipModel(null, 6_000)).toBe("seedance_2_5");
    expect(resolveClipModel("hf_mult_replace_object", 2_000)).toBe("hf_mult_replace_object");
    // Solo las que usó Emmanuel en sus últimos lotes de Codex.
    expect([...CLIP_MODEL_CHOICES]).toEqual(["auto", "hf_mult_motion_control", "hf_mult_replace_object", "wan3_0_prime", "seedance_2_5"]);
    expect(wanDurationSeconds(12_397)).toBe(13);
    expect(wanDurationSeconds(13_000)).toBe(13);
    expect(sourceProblem("hf_mult_replace_object", 3_500)).toMatch(/Object Swap necesita una referencia de 4 a 30 s/);
    expect(sourceProblem("hf_mult_motion_control", 3_000)).toBeNull();
  });

  it("Motion Transfer: el vídeo fuente entero y las imágenes (la aprobada la primera), sin duración ni audio que fijar", async () => {
    const approvedJobId = await readyForClip();
    await withModel("auto", "hf_mult_motion_control", GENJUTSU_PROMPT);
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request).toEqual({
      model: "hf_mult_motion_control",
      prompt: GENJUTSU_PROMPT,
      resolution: "480p",
      medias: [
        { role: "video_references", value: "ref-media" },
        { role: "image_references", value: approvedJobId },
        { role: "image_references", value: "media-1" },
        { role: "image_references", value: "media-2" },
      ],
    });
    // Lo que llega a Higgsfield: los mismos parámetros que enviaba Codex (sin `mode`, `duration` ni audio).
    expect(videoParams(request as HfVideoRequest)).toEqual({
      model: "hf_mult_motion_control",
      prompt: GENJUTSU_PROMPT,
      resolution: "480p",
      use_unlim: false,
      medias: request.medias,
    });
  });

  it("Object Swap: además, la sala del banco como entorno nuevo, con la frase de Codex al final del prompt", async () => {
    const approvedJobId = await readyForClip();
    await withModel("hf_mult_replace_object", "hf_mult_replace_object", GENJUTSU_PROMPT);
    const room = await addProductPhoto(ana, producto.id, red, "entorno");
    await updateVideoChoices(ana, v.id, { environmentPhotoId: room.id, clipModel: "hf_mult_replace_object" });
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request.model).toBe("hf_mult_replace_object");
    expect(request.medias[1]).toEqual({ role: "image_references", value: approvedJobId });
    expect(request.medias).toHaveLength(5);
    expect(request.prompt).toBe(
      GENJUTSU_PROMPT.replace(
        " No text overlays, no captions.",
        " Replace every original location with the real environment in image [4]. Preserve the SOURCE camera angle, subject scale and action, adapting this environment rather than copying its photographic framing. No text overlays, no captions.",
      ),
    );
  });

  it("Wan 3.0 Prime: duración entera del tramo hacia arriba, aspect_ratio auto, con audio y sin thinking", async () => {
    await readyForClip();
    await getPool().query("update videos set segment_duration_ms = 12397, reference_duration_ms = 12397 where id = $1", [v.id]);
    await withModel("wan3_0_prime", "wan3_0_prime", GENJUTSU_PROMPT);
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request).toMatchObject({ model: "wan3_0_prime", resolution: "480p", duration: 13, aspectRatio: "auto", generateAudio: true, enableThinking: false });
    expect(videoParams(request as HfVideoRequest)).toMatchObject({ model: "wan3_0_prime", duration: 13, aspect_ratio: "auto", generate_audio: true, enable_thinking: false, use_unlim: false });
  });

  it("un modelo elegido que no admite el tramo no se cambia solo: se pregunta antes de gastar", async () => {
    await readyForClip();
    await getPool().query("update videos set segment_duration_ms = 3000, reference_duration_ms = 3000 where id = $1", [v.id]);
    await withModel("hf_mult_replace_object", "hf_mult_replace_object", GENJUTSU_PROMPT);
    await expect(buildClipRequest(ana, await fresh(), deps)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Object Swap necesita/) });
  });

  it("con Genjutsu, un prompt que cita al estilo de Seedance (@Image2) se pasa a image [N] y vale", async () => {
    await readyForClip();
    await withModel("auto", "hf_mult_motion_control", PROMPT);
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request.prompt).toContain("the source video gives only the camera movement");
    expect(request.prompt).toContain("The woman is image [2]. The bottle is image [3].");
    expect(request.prompt).not.toContain("@");
  });

  it("cada imagen adjunta va citada y explicada: si el desglose se deja una (la caja), la aplicación añade su frase de Codex y no para nada", async () => {
    await readyForClip();
    await addProductPhoto(ana, producto.id, red, "embalaje");
    const sinCaja =
      "Use the source video as the authority for every action, cut and timing. Use image [1] as the human-approved clean opening frame. " +
      "Replace the woman with the person in image [2]. The bottle is the exact product in image [3]. No text overlays, no captions.";
    await withModel("auto", "hf_mult_motion_control", sinCaja);
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request.medias).toHaveLength(5);
    expect(request.prompt).toBe(
      sinCaja.replace(
        " No text overlays, no captions.",
        " Replace every visible instance of the closed retail packaging with image [4], preserving realistic size relative to the hands and surroundings. Every box that appears, including while it is being opened, is the exact printed retail box of image [4]: its printed design is visible on all outer walls and flaps; never a plain unprinted carton. No text overlays, no captions.",
      ),
    );
    // La vista del vídeo tampoco lo enseña como error.
    expect((await videoView(ana, v.id)).videoIssues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("cambiar el modelo deja el desglose por repetir (el prompt del clip se escribe para el modelo)", async () => {
    await readyForClip();
    await withModel("auto", "hf_mult_motion_control", GENJUTSU_PROMPT);
    expect((await latestDoneAnalysis(await fresh()))?.staleReason).toBeNull();
    await updateVideoChoices(ana, v.id, { clipModel: "wan3_0_prime" });
    expect((await latestDoneAnalysis(await fresh()))?.staleReason).toBe("brief");
    await expect(updateVideoChoices(ana, v.id, { clipModel: "hf_mult_motion_control_flash" })).rejects.toMatchObject({ status: 400 });
  });
});

// ───────────────────────── Petición ─────────────────────────

describe("petición del clip", () => {
  it("la duración es la del tramo redondeada a segundos, entre 4 y 30", () => {
    expect([2_400, 9_600, 14_400, 30_000, 45_000].map(clipDurationSeconds)).toEqual([4, 10, 14, 30, 30]);
    expect(CLIP_MODEL).toBe("seedance_2_5");
    expect(CLIP_RESOLUTIONS).toEqual(["480p", "720p", "1080p"]);
    expect(DEFAULT_CLIP_RESOLUTION).toBe("480p");
  });

  it("la petición es Seedance 2.5 omni_reference a 480p, sin audio, con la referencia, la imagen aprobada y las fotos", async () => {
    const approvedJobId = await readyForClip();
    const video = await fresh();
    const { request, count } = await buildClipRequest(ana, video, deps);
    expect(count).toBe(1);
    // Las fotos se suben en el orden del manifiesto: avatar (media-1) y artículo (media-2).
    expect(request).toEqual({
      model: "seedance_2_5",
      mode: "omni_reference",
      prompt: video.videoPrompt,
      aspectRatio: "9:16",
      duration: 6,
      resolution: "480p",
      generateAudio: false,
      bitrateMode: "high",
      medias: [
        { role: "video_references", value: "ref-media" },
        { role: "start_image", value: approvedJobId },
        { role: "image_references", value: "media-1" },
        { role: "image_references", value: "media-2" },
      ],
    });
    expect(uploads().map((c) => (c.args as { filename: string }).filename)).toEqual([
      expect.stringMatching(/^foto-\d+\.jpg$/),
      expect.stringMatching(/^foto-\d+\.jpg$/),
    ]);
    // Se sube con el Higgsfield de quien creó el vídeo y solo una vez aunque se vuelva a construir.
    await buildClipRequest(ana, video, deps);
    expect(uploads()).toHaveLength(2);
    expect(uploads().every((c) => c.userId === ana.id)).toBe(true);
  });

  it("con «Solo gancho» el clip dura lo que el gancho; uno de 2 o 3 s se pide de 4 (el mínimo de Seedance)", async () => {
    await readyForClip();
    // Como lo dejan la preparación y el desglose de un «Solo gancho»: tramo y desglose del gancho.
    const asHook = async (seconds: number) => {
      await getPool().query("update videos set kind = 'solo_gancho', hook_seconds = $2, segment_duration_ms = $2 * 1000 where id = $1", [v.id, seconds]);
      await getPool().query("update video_analyses set kind = 'solo_gancho', hook_seconds = $2 where video_id = $1", [v.id, seconds]);
      return (await buildClipRequest(ana, await fresh(), deps)).request as { duration: number };
    };
    expect((await asHook(5)).duration).toBe(5);
    expect((await asHook(2)).duration).toBe(4);
    expect((await asHook(3)).duration).toBe(4);
    // Y el presupuesto es el de esos segundos (el simulado cobra 3 créditos por segundo a 480p).
    expect(await quoteGeneration(ana, v.id, "clip", deps)).toMatchObject({ credits: 12 });
    // Con la referencia preparada para otro gancho no se pide nada.
    await getPool().query("update videos set hook_seconds = 5 where id = $1", [v.id]);
    await expect(buildClipRequest(ana, await fresh(), deps)).rejects.toMatchObject({ status: 409, message: "El gancho ha cambiado: vuelve a subir el vídeo de referencia." });
  });

  it("como referencia de la escena, la imagen aprobada va la primera de image_references y no hay start_image", async () => {
    await readyReference();
    await analysed(PROMPT.replace("is the first frame", "is the scene"), "contextual_reference");
    const approvedJobId = await approvedFrame();
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    const medias = (request as { medias: Array<{ role: string; value: string }> }).medias;
    expect(medias[1]).toEqual({ role: "image_references", value: approvedJobId });
    expect(medias.some((m) => m.role === "start_image")).toBe(false);
    expect(medias.map((m) => m.role)).toEqual(["video_references", "image_references", "image_references", "image_references"]);
  });

  it("sin imagen aprobada no hay clip", async () => {
    await readyReference();
    await analysed();
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({ status: 409, message: "Aprueba primero la imagen inicial." });
    // Rechazar la imagen aprobada la quita: tampoco hay clip.
    await approvedFrame();
    await rejectRound(ana, v.id, "frame", "La luz no se parece");
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({ status: 409, message: "Aprueba primero la imagen inicial." });
    expect(fake.calls.some((c) => c.method === "quoteVideo")).toBe(false);
  });

  it("si la referencia cambió desde el desglose, no se pide precio", async () => {
    await readyForClip();
    await getPool().query("update videos set reference_media_id = 'otra-ref' where id = $1", [v.id]);
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({
      status: 409,
      message: "La referencia cambió; vuelve a pedir el desglose.",
    });
    expect(uploads()).toHaveLength(0);
  });

  it("si los cambios específicos o el tipo cambiaron desde el desglose, tampoco", async () => {
    await readyForClip();
    for (const change of ["update videos set note = 'Más luz' where id = $1", "update videos set kind = 'adaptacion_concepto' where id = $1"]) {
      await getPool().query(change, [v.id]);
      await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({
        status: 409,
        message: "Las indicaciones del vídeo cambiaron; repite el desglose.",
      });
      await getPool().query("update videos set note = null, kind = 'replicar' where id = $1", [v.id]);
    }
    expect(fake.calls.some((c) => c.method === "quoteVideo")).toBe(false);
  });

  it("un prompt de clip con errores no deja pedir precio ni sube nada", async () => {
    await readyForClip();
    await getPool().query("update videos set video_prompt = $2 where id = $1", [v.id, PROMPT.replace(" The bottle is @Image3.", "")]);
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({ status: 400, message: "Falta decir para qué sirve @Image3." });
    expect(uploads()).toHaveLength(0);
    expect(fake.calls.some((c) => c.method === "quoteVideo")).toBe(false);
  });

  it("la resolución elegida va en la petición; una que no existe se rechaza", async () => {
    await readyForClip();
    expect((await fresh()).clipResolution).toBe("480p");
    await updateVideoChoices(ana, v.id, { clipResolution: "720p" });
    const { request } = await buildClipRequest(ana, await fresh(), deps);
    expect(request).toMatchObject({ resolution: "720p", duration: 6 });
    expect(await quoteGeneration(ana, v.id, "clip", deps)).toMatchObject({ credits: 6 * 5 });

    await expect(updateVideoChoices(ana, v.id, { clipResolution: "8k" })).rejects.toMatchObject({ status: 400, message: "Resolución no disponible." });
    await expect(updateVideoChoices(luis, v.id, { clipResolution: "1080p" })).rejects.toMatchObject({ status: 404 });

    await as(ana);
    const bad = await putVideo(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ clipResolution: "8k" }) }), params(v.id));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Resolución no disponible." });
    const ok = await putVideo(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ clipResolution: "1080p" }) }), params(v.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).video.clipResolution).toBe("1080p");
  });

  it("créditos justos para la imagen pero no para el clip: lo dice y la imagen aprobada sigue ahí", async () => {
    fake.state.credits = 14;
    await readyForClip(); // la imagen gasta 4: quedan 10
    const approved = (await fresh()).approvedFrameResultId;
    expect(approved).not.toBeNull();
    expect(await quoteGeneration(ana, v.id, "clip", deps)).toMatchObject({ credits: 18, balance: 10, enough: false });
    await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 18 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "No tienes créditos suficientes en Higgsfield: hacen falta 18 y tienes 10.",
    });
    expect((await fresh()).approvedFrameResultId).toBe(approved);
    const { rows } = await getPool().query("select count(*)::int as n from generations where kind = 'clip'");
    expect(rows[0].n).toBe(0);
    expect(fake.calls.some((c) => c.method === "submitVideo")).toBe(false);
  });
});

describe("Higgsfield falla al subir las fotos del clip", () => {
  const CONNECT = "higgsfield_connect";
  const clips = async () => (await getPool().query("select count(*)::int as n from generations where kind = 'clip'")).rows[0].n;

  it("con la conexión caducada o sin conectar, 409 con el código para ir a Ajustes; nada presupuestado ni apuntado", async () => {
    await readyForClip();
    fake.failNext("uploadMedia", new HiggsfieldAuthError());
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({
      status: 409,
      code: CONNECT,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    fake.failNext("uploadMedia", new HiggsfieldNotConnectedError());
    await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 18 }, deps)).rejects.toMatchObject({
      status: 409,
      code: CONNECT,
      message: "Conecta tu Higgsfield en Ajustes.",
    });
    expect(uploads()).toHaveLength(2);
    expect(fake.calls.some((c) => c.method === "quoteVideo")).toBe(false);
    expect(await clips()).toBe(0);
  });

  it("con Higgsfield caído al subir, 503 con su mensaje", async () => {
    await readyForClip();
    fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    await expect(quoteGeneration(ana, v.id, "clip", deps)).rejects.toMatchObject({
      status: 503,
      message: "Higgsfield no responde. Inténtalo dentro de unos minutos.",
    });
    expect(fake.calls.some((c) => c.method === "quoteVideo")).toBe(false);
  });

  it("por la API, sin Higgsfield conectado la primera subida da 409 con el código, nunca 500", async () => {
    await readyForClip();
    // Sin `deps` ni modo simulado: el conector real ve que no hay conexión antes de salir a la red.
    await as(ana);
    for (const route of [presupuestoRoute, generarRoute]) {
      const response = await route(post({ expectedCredits: 18 }), params(v.id));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Conecta tu Higgsfield en Ajustes.", code: CONNECT });
    }
    expect(await clips()).toBe(0);
  });
});

describe("cambios en otra pestaña mientras se presupuesta", () => {
  /** El simulado, pero antes de presupuestar el clip ejecuta `meanwhile` (lo que haría otra pestaña). */
  function quotingWith(meanwhile: () => Promise<void>): GenDeps {
    let done = false;
    return {
      ...deps,
      higgsfield: {
        ...fake.port,
        async quoteVideo(userId, request) {
          if (!done) {
            done = true;
            await meanwhile();
          }
          return fake.port.quoteVideo(userId, request);
        },
      },
    };
  }
  const clipRows = async () => (await getPool().query("select count(*)::int as n from generations where kind = 'clip'")).rows[0].n;

  it("si la imagen se rechaza entre construir la petición y apuntarla, 409 y no se apunta nada", async () => {
    await readyForClip();
    const racing = quotingWith(() => rejectRound(ana, v.id, "frame", "Mejor otra luz"));
    await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 18 }, racing)).rejects.toMatchObject({
      status: 409,
      message: "El vídeo ha cambiado mientras se preparaba el envío. Vuelve a intentarlo.",
    });
    expect(await clipRows()).toBe(0);
    expect((await fresh()).approvedFrameResultId).toBeNull();
    expect(fake.calls.some((c) => c.method === "submitVideo")).toBe(false);
  });

  it("lo mismo si cambian la referencia, el prompt, la resolución o los cambios específicos; sin cambios se apunta", async () => {
    await readyForClip();
    const changes = [
      "update videos set reference_media_id = 'otra-ref' where id = $1",
      "update videos set video_prompt = video_prompt || ' Slow.' where id = $1",
      "update videos set clip_resolution = '720p' where id = $1",
      "update videos set note = 'Más luz' where id = $1",
    ];
    const original = await fresh();
    for (const change of changes) {
      const racing = quotingWith(async () => void (await getPool().query(change, [v.id])));
      await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 30 }, racing)).rejects.toMatchObject({ status: 409 });
      await getPool().query("update videos set reference_media_id = $2, video_prompt = $3, clip_resolution = '480p', note = null where id = $1", [
        v.id,
        original.referenceMediaId,
        original.videoPrompt,
      ]);
    }
    expect(await clipRows()).toBe(0);
    await requestGeneration(ana, v.id, "clip", { expectedCredits: 18 }, quotingWith(async () => {}));
    expect(await clipRows()).toBe(1);
  });
});

// ───────────────────────── Coste ─────────────────────────

const REPLY: Analysis = {
  conceptLogic: "Alguien descubre que el producto resuelve en un gesto lo que antes costaba un rato.",
  shots: [{ startS: 0, endS: 6, seen: "Mujer con una botella", action: "Levanta la botella", onScreenText: "" }],
  adaptation: [
    {
      original: "Spray",
      equivalent: "Botella del producto",
      physicalAction: "Pulverizar",
      visibleResult: "La mancha desaparece",
      kept: "El gesto",
      changed: "El producto",
      why: "La demostración es la misma",
    },
  ],
  risks: [],
  frameUse: "start_image",
  imagePrompt: "Image 1 supplies the composition.",
  videoPrompt: PROMPT,
};
const reply = () => ({ text: JSON.stringify(REPLY), usage: { inputTokens: 40_000, outputTokens: 3_000 } });

describe("coste por vídeo", () => {
  beforeEach(async () => {
    await seedRules();
  });

  it("el coste del vídeo suma los créditos de lo enviado y el coste de Claude de sus desgloses", async () => {
    await readyReference();
    const { analysisId } = await requestAnalysis(ana, v.id);
    await runAnalysis(analysisId, { gateway: createGateway({ client: fakeMessages([reply()]).client }) });
    const analysisCost = (await videoView(ana, v.id)).analysis!.costMicros!;
    expect(analysisCost).toBeGreaterThan(0);

    await approvedFrame();
    const clipId = await sendClip();
    await finish(clipId, () => `${CDN}/clip.mp4`);

    expect(await videoCosts(ana, v.id)).toEqual({ higgsfieldCredits: 4 + 18, claudeMicros: analysisCost });
    expect((await videoView(ana, v.id)).costs).toEqual({ higgsfieldCredits: 22, claudeMicros: analysisCost });
    // Lo ve también quien ve el producto; quien no, 404.
    expect(await videoCosts(dueno, v.id)).toEqual({ higgsfieldCredits: 22, claudeMicros: analysisCost });
    await expect(videoCosts(luis, v.id)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
  });

  it("un desglose fallido y su repetición cuentan los dos cargos", async () => {
    await readyReference();
    const first = await requestAnalysis(ana, v.id);
    // Claude responde sin el formato pedido: el desglose falla, pero se cobró.
    await expect(
      runAnalysis(first.analysisId, { gateway: createGateway({ client: fakeMessages([{ text: "no es json", usage: { inputTokens: 40_000, outputTokens: 500 } }]).client }) }),
    ).rejects.toThrow();
    const failedCost = (await spendSummary(ana)).spentMicros;
    expect(failedCost).toBeGreaterThan(0);

    const second = await requestAnalysis(ana, v.id);
    await runAnalysis(second.analysisId, { gateway: createGateway({ client: fakeMessages([reply()]).client }) });
    const total = (await spendSummary(ana)).spentMicros;
    expect(total).toBeGreaterThan(failedCost);
    expect((await videoCosts(ana, v.id)).claudeMicros).toBe(total);
  });

  it("un desglose cortado a mitad y reintentado cuenta los dos intentos, aunque el desglose solo guarde el último cargo", async () => {
    await readyReference();
    const { analysisId } = await requestAnalysis(ana, v.id);
    // El primer intento reservó y el proceso se cayó: la reserva queda como gastada, con la misma clave.
    const key = analysisStepKey(producto.id, analysisId);
    const { entryId } = await reserveSpend({ userId: ana.id, productId: producto.id, provider: "claude", stepKey: key, estimateMicros: 70_000 });
    expect(await settleInterruptedSpend([key])).toBe(1);
    await runAnalysis(analysisId, { gateway: createGateway({ client: fakeMessages([reply()]).client }) });

    const { rows } = await getPool().query("select spend_entry_id as \"spendEntryId\" from video_analyses where id = $1", [analysisId]);
    expect(rows[0].spendEntryId).not.toBe(entryId);
    const total = (await spendSummary(ana)).spentMicros;
    expect(total).toBeGreaterThan(70_000);
    expect((await videoCosts(ana, v.id)).claudeMicros).toBe(total);
    expect((await videoView(ana, v.id)).analysis!.costMicros).toBe(total);
  });

  it("lo liberado no cuenta y los cargos de otro vídeo tampoco", async () => {
    await readyReference();
    const { analysisId } = await requestAnalysis(ana, v.id);
    await runAnalysis(analysisId, { gateway: createGateway({ client: fakeMessages([reply()]).client }) });
    const own = (await videoCosts(ana, v.id)).claudeMicros;
    const key = analysisStepKey(producto.id, analysisId);
    const released = await reserveSpend({ userId: ana.id, productId: producto.id, provider: "claude", stepKey: key, estimateMicros: 5_000 });
    await releaseSpend(released.entryId);
    const other = await reserveSpend({ userId: ana.id, productId: producto.id, provider: "claude", stepKey: analysisStepKey(producto.id, analysisId + 1000), estimateMicros: 9_000 });
    await settleSpend(other.entryId, { costMicros: 9_000 });
    expect((await videoCosts(ana, v.id)).claudeMicros).toBe(own);
  });
});

// ───────────────────────── Descarga ─────────────────────────

describe("descarga del clip", () => {
  it("la descarga solo sirve la dirección guardada del clip, a quien ve el vídeo", async () => {
    await readyForClip();
    await expect(clipDownload(ana, v.id)).rejects.toMatchObject({ status: 404, message: "Todavía no hay clip." });

    const clipId = await sendClip();
    await finish(clipId, () => `${CDN}/clip-1.mp4`);
    const expected = { url: `${CDN}/clip-1.mp4`, jobId: expect.any(String), filename: `brillomax-nandu-video-${v.id}.mp4` };
    expect(await clipDownload(ana, v.id)).toEqual(expected);
    expect(await clipDownload(dueno, v.id)).toEqual(expected);
    await expect(clipDownload(luis, v.id)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    await expect(clipDownload(ana, 999_999)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
  });

  it("sirve el clip aprobado antes que el último terminado; nunca una dirección que no sea https", async () => {
    await readyForClip();
    const first = await sendClip();
    await finish(first, () => `${CDN}/primero.mp4`);
    const firstResult = (await videoView(ana, v.id)).clip.current!.results[0].id;
    await rejectRound(ana, v.id, "clip", "Se mueve demasiado");
    const second = await sendClip();
    await finish(second, () => `${CDN}/segundo.mp4`);
    expect((await clipDownload(ana, v.id)).url).toBe(`${CDN}/segundo.mp4`);
    // Un clip aprobado que no es el último (por la API no se puede aprobar uno rechazado; aquí se fuerza).
    await getPool().query("update videos set approved_clip_result_id = $2 where id = $1", [v.id, firstResult]);
    expect((await clipDownload(ana, v.id)).url).toBe(`${CDN}/primero.mp4`);

    await getPool().query("update generation_results set url = 'http://d8j0ntlcm91z4.cloudfront.net/inseguro.mp4' where id = $1", [firstResult]);
    expect((await clipDownload(ana, v.id)).url).toBe(`${CDN}/segundo.mp4`);
    await getPool().query("update generation_results set url = 'data:video/mp4;base64,AAAA'");
    await expect(clipDownload(ana, v.id)).rejects.toMatchObject({ status: 404, message: "Todavía no hay clip." });
    // Solo la red de distribución de Higgsfield: ni otro https ni un disfraz del nombre.
    for (const url of [
      "https://cdn.test/clip.mp4",
      "https://cloudfront.net.evil.test/clip.mp4",
      "https://evilcloudfront.net/clip.mp4",
      "https://user:pw@d8j0ntlcm91z4.cloudfront.net/clip.mp4",
      "https://d8j0ntlcm91z4.cloudfront.net:8443/clip.mp4",
    ]) {
      await getPool().query("update generation_results set url = $1", [url]);
      await expect(clipDownload(ana, v.id)).rejects.toMatchObject({ status: 404, message: "Todavía no hay clip." });
    }
    await getPool().query("update generation_results set url = 'https://d2ol7oe51mr4n9.cloudfront.net/x.mp4'");
    expect((await clipDownload(ana, v.id)).url).toBe("https://d2ol7oe51mr4n9.cloudfront.net/x.mp4");
  });

  it("GET …/clip/descargar pide a CloudFront sin seguir redirecciones, con nosniff y sin pasar de 500 MB", async () => {
    await readyForClip();
    const clipId = await sendClip();
    await finish(clipId, () => `${CDN}/clip.mp4`);
    await as(ana);
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    let next: () => Response = () => new Response(new Uint8Array(mp4), { headers: { "Content-Length": String(mp4.length) } });
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      seen.push({ url: String(input), init });
      return next();
    });
    try {
      const ok = await descargarRoute(new Request("http://localhost/x"), params(v.id));
      expect(ok.status).toBe(200);
      expect(seen[0].url).toBe(`${CDN}/clip.mp4`);
      expect(seen[0].init?.redirect).toBe("error");
      expect(seen[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
      expect(ok.headers.get("content-length")).toBe(String(mp4.length));
      expect(Buffer.from(await ok.arrayBuffer())).toEqual(mp4);

      next = () => new Response("x", { headers: { "Content-Length": String(500 * 1024 * 1024 + 1) } });
      const big = await descargarRoute(new Request("http://localhost/x"), params(v.id));
      expect(big.status).toBe(502);
      expect(await big.json()).toEqual({ error: "El clip es demasiado grande para descargarlo." });

      next = () => {
        throw new TypeError("fetch failed: redirect mode is set to error");
      };
      const redirected = await descargarRoute(new Request("http://localhost/x"), params(v.id));
      expect(redirected.status).toBe(502);
      next = () => new Response("no", { status: 403 });
      expect((await descargarRoute(new Request("http://localhost/x"), params(v.id))).status).toBe(502);
    } finally {
      spy.mockRestore();
    }
  });

  /** Un cuerpo que se va dando a trozos de `size` bytes; anota si Higgsfield vio cancelada la descarga. */
  function slowBody(chunks: number, size: number, gapMs: number) {
    const state = { cancelled: false, sent: 0 };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (state.sent === chunks) return controller.close();
        if (state.sent > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
        state.sent += 1;
        controller.enqueue(new Uint8Array(size));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { body, state };
  }
  const read = (stream: ReadableStream<Uint8Array>) => new Response(stream).arrayBuffer();

  it("sin Content-Length, la descarga se corta al pasar del tope y se cancela la de Higgsfield", async () => {
    const { body, state } = slowBody(10, 1_000, 0);
    const opened = await openClipStream(`${CDN}/sin-largo.mp4`, { fetch: async () => new Response(body), maxBytes: 4_500 });
    expect(opened.length).toBeNull();
    await expect(read(opened.body)).rejects.toThrow(CLIP_TOO_BIG);
    expect(state.sent).toBeLessThan(10);
    expect(state.cancelled).toBe(true);
    // Dentro del tope pasa entero.
    const small = slowBody(4, 1_000, 0);
    const whole = await openClipStream(`${CDN}/corto.mp4`, { fetch: async () => new Response(small.body), maxBytes: 4_500 });
    expect((await read(whole.body)).byteLength).toBe(4_000);
  });

  it("el tope de la descarga entera corta el flujo a mitad aunque Higgsfield siga mandando", async () => {
    // Un trozo cada 100 ms, 50 trozos: 5 s; el tope es de 300 ms.
    const { body, state } = slowBody(50, 10, 100);
    const opened = await openClipStream(`${CDN}/lento.mp4`, { fetch: async () => new Response(body), deadlineMs: 300 });
    const started = Date.now();
    await expect(read(opened.body)).rejects.toThrow(CLIP_TOO_SLOW);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(state.cancelled).toBe(true);
  });

  it("si quien descarga corta, se quita el aviso del tope y se cancela la descarga de Higgsfield", async () => {
    const deadline = new AbortController();
    const removed = vi.spyOn(deadline.signal, "removeEventListener");
    const { body, state } = slowBody(50, 10, 20);
    const reader = body.pipeThrough(guardedClipStreamForTests(1_000_000, deadline.signal)).getReader();
    await reader.read();
    await reader.cancel();
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    // La cancelación llega a la fuente por la tubería, un poco después.
    for (let i = 0; i < 50 && !state.cancelled; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.cancelled).toBe(true);
  });

  it("con Content-Encoding no se reenvía el tamaño (no es el del archivo)", async () => {
    const opened = await openClipStream(`${CDN}/gz.mp4`, {
      fetch: async () => new Response(new Uint8Array(mp4), { headers: { "Content-Length": "10", "Content-Encoding": "gzip" } }),
    });
    expect(opened.length).toBeNull();
    const plain = await openClipStream(`${CDN}/plano.mp4`, {
      fetch: async () => new Response(new Uint8Array(mp4), { headers: { "Content-Length": String(mp4.length) } }),
    });
    expect(plain.length).toBe(String(mp4.length));
    await Promise.all([opened.body.cancel(), plain.body.cancel()]);
    await expect(openClipStream("https://cdn.test/otro.mp4")).rejects.toMatchObject({ status: 404 });
  });

  it("GET …/clip/descargar reenvía el archivo como adjunto (modo local simulado, dirección data:)", async () => {
    await readyForClip();
    const clipId = await sendClip();
    await finish(clipId, () => SAMPLE_VIDEO_URL);
    await as(ana);
    // Fuera del modo simulado, una dirección `data:` no se sirve.
    expect((await descargarRoute(new Request("http://localhost/x"), params(v.id))).status).toBe(404);

    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    const response = await descargarRoute(new Request("http://localhost/x"), params(v.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="brillomax-nandu-video-${v.id}.mp4"; filename*=UTF-8''brillomax-nandu-video-${v.id}.mp4`,
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body).toEqual(Buffer.from(SAMPLE_VIDEO_URL.split(",")[1], "base64"));

    await as(luis);
    expect((await descargarRoute(new Request("http://localhost/x"), params(v.id))).status).toBe(404);
  });
});

// ───────────────────────── Rutas ─────────────────────────

describe("rutas del clip", () => {
  it("presupuesto, generar, aprobar y rechazar con el constructor del clip", async () => {
    await readyForClip();
    await as(luis);
    expect((await presupuestoRoute(new Request("http://localhost/x", { method: "POST" }), params(v.id))).status).toBe(404);

    await as(ana);
    // Sin `deps`: el simulado del modo local.
    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    const quote = await presupuestoRoute(new Request("http://localhost/x", { method: "POST" }), params(v.id));
    expect(quote.status).toBe(200);
    expect(await quote.json()).toMatchObject({ credits: 18, enough: true, round: 1 });

    expect((await generarRoute(post({}), params(v.id))).status).toBe(400);
    const generated = await generarRoute(post({ expectedCredits: 18 }), params(v.id));
    expect(generated.status).toBe(202);
    const { generationId } = await generated.json();
    const { rows } = await getPool().query("select kind, status, request from generations where id = $1", [generationId]);
    expect(rows[0]).toMatchObject({ kind: "clip", status: "intent", request: { model: "seedance_2_5", mode: "omni_reference", generateAudio: false } });

    expect((await aprobarRoute(post({ resultId: 123456 }), params(v.id))).status).toBe(404);
    expect((await rechazarRoute(post({ reason: "Se mueve demasiado" }), params(v.id))).status).toBe(409);
  });
});
