import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { createGateway } from "@/llm/gateway";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { runAnalysis, type Analysis } from "@/server/videos/analysis";
import { addVideoToBatch, createBatch, getBatchFor } from "@/server/videos/batches";
import { approveFrame, rejectFrame } from "@/server/videos/frame";
import { finalizeGeneration, requestGeneration, submitGeneration, TIMED_OUT, type GenDeps } from "@/server/videos/generations";
import {
  advanceBatch,
  advanceRunningBatches,
  includeBatchVideo,
  approveAllFrames,
  AUTO_PARALLEL,
  autoView,
  batchQuestions,
  confirmBatch,
  onBatchReady,
  quoteBatch,
  resumeBatch,
  sendBatch,
  stageOf,
} from "@/server/videos/lote";
import { getVideoFor, type Video } from "@/server/videos/videos";
import { downloadableClip } from "@/server/videos/clip";
import { POST as enviarRoute } from "@/app/api/lotes/[id]/enviar/route";
import { fakeMessages, type FakeCall } from "./helpers/fake-llm";
import { makeProduct, makeUser, TEST_PASSWORD, seedanceByDefault } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { instantPinterest } from "./helpers/pinterest";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * «Enviar lote» de principio a fin con Claude y Higgsfield simulados. Precios del simulado: cada
 * imagen 2 créditos y cada clip de 6 s a 480p, 18 créditos. Estas pruebas usan un lote de los de
 * «Confirmar» que pide 2 imágenes por vídeo (4 créditos); el lote nuevo (1 imagen, sin confirmar)
 * va en «Flujo automático del lote», al final.
 */

const FRAME = 4;
const CLIP = 18;
/** La previsión de Topaz a 1080p de un clip de 6 s (`upscaleEstimate`): va en la previsión del clip. */
const UPSCALE = 2;
const CLIP_EST = CLIP + UPSCALE;

const REPLY: Analysis = {
  conceptLogic: "El producto resuelve en un gesto lo que antes costaba un rato.",
  shots: [{ startS: 0, endS: 6, seen: "Mujer con una botella", action: "La levanta", onScreenText: "" }],
  adaptation: [],
  risks: [],
  frameUse: "start_image",
  imagePrompt: "Image 1 sets the composition and the framing. The woman is the person from image 2. She holds the bottle from image 3 at chest height.",
  videoPrompt:
    "@Video1 gives only the camera movement, the rhythm and the action. @Image1 is the first frame. The woman is @Image2. The bottle is @Image3.",
};

let dir: string;
let jpeg: Buffer;
let mp4: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;
let avatar: number;

function ffmpeg(args: string[]): void {
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
}


// Pruebas del flujo de Seedance (antes de poder elegir el modelo del clip).
seedanceByDefault();
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-lote-auto-"));
  ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=360x640", "-frames:v", "1", path.join(dir, "foto.jpg")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "clip.mp4")]);
  jpeg = fs.readFileSync(path.join(dir, "foto.jpg"));
  mp4 = fs.readFileSync(path.join(dir, "clip.mp4"));
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  // Regla fija: la imagen lleva siempre Pinterest; aquí se resuelve al momento con una foto.
  instantPinterest(() => jpeg);
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  await seedRules();
  fake = createFakeHiggsfield();
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    return new Response(new Uint8Array(url.endsWith(".mp4") ? mp4 : jpeg), { status: 200 });
  }) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };
  await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "BrilloMax" });
  await addProductPhoto(ana, producto.id, jpeg, "articulo");
  avatar = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("avatar")]), "avatar")).id;
});

// ───────────────────────── Ayudas ─────────────────────────

/** Referencia lista (6 s) como la dejaría la preparación. */
async function readyReference(videoId: number): Promise<void> {
  await getPool().query(
    "update videos set reference_status = 'ready', reference_media_id = $2, reference_duration_ms = 6000, segment_duration_ms = 6000, cuts_ms = '[]'::jsonb where id = $1",
    [videoId, `ref-${videoId}`],
  );
  await getPool().query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [
    videoId,
    jpeg.length,
    jpeg,
  ]);
}

/** Un lote de Ana con `n` vídeos con su referencia lista y el avatar elegido. */
async function batchWith(n: number, options: { avatar?: boolean; automatic?: boolean } = {}): Promise<{ batchId: number; videos: Video[] }> {
  const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
  // Por defecto, un lote de los de «Confirmar» con 2 imágenes por vídeo (las cifras de estas pruebas).
  if (!options.automatic) await getPool().query("update batches set auto_confirm = false, frame_count = 2 where id = $1", [batch.id]);
  const videos: Video[] = [];
  for (let i = 0; i < n; i++) {
    const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: avatar, avatarMode: "elegido" });
    // Sin elegir todavía (como un vídeo suelto de un producto sin avatar habitual).
    if (options.avatar === false && i === 0) await getPool().query("update videos set avatar_photo_id = null where id = $1", [video.id]);
    await readyReference(video.id);
    videos.push(video);
  }
  return { batchId: batch.id, videos };
}

/** Ejecuta con Claude simulado los desgloses en cola (lo que haría `video.desglose`), con estas respuestas por vídeo. */
async function runQueuedAnalyses(replyFor: (videoId: number) => Analysis = () => REPLY): Promise<FakeCall[]> {
  const { rows } = await getPool().query("select id, video_id as \"videoId\" from video_analyses where status = 'queued' order by id");
  const all: FakeCall[] = [];
  for (const row of rows as Array<{ id: number; videoId: number }>) {
    const { client, calls } = fakeMessages([{ text: JSON.stringify(replyFor(row.videoId)), usage: { inputTokens: 1000, outputTokens: 500 } }]);
    await runAnalysis(row.id, { gateway: createGateway({ client }) });
    all.push(...calls);
  }
  return all;
}

const generations = async () =>
  (
    await getPool().query(
      "select id, video_id as \"videoId\", kind, status, quoted_credits as \"quotedCredits\", round from generations order by id",
    )
  ).rows as Array<{ id: number; videoId: number; kind: string; status: string; quotedCredits: number; round: number }>;

const active = async () => (await generations()).filter((g) => ["intent", "submitting", "submitted", "unknown"].includes(g.status));

/** Envía las apuntadas (`video.enviar`) y termina en el simulado las enviadas (`video.finalizar`). */
async function sendAndFinish(): Promise<void> {
  for (const g of await generations()) if (g.status === "intent") await submitGeneration(g.id, deps);
  for (const g of await generations()) {
    if (g.status !== "submitted") continue;
    const { rows } = await getPool().query("select job_ids as \"jobIds\" from generations where id = $1", [g.id]);
    for (const jobId of rows[0].jobIds as string[]) {
      const url = g.kind === "frame" ? `https://cdn.test/${jobId}.png` : `https://d8j0ntlcm91z4.cloudfront.net/${jobId}.mp4`;
      fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: [url] };
    }
    await finalizeGeneration(g.id, deps);
  }
}

const statusOf = async (batchId: number) => (await getBatchFor(ana, batchId)).status;

/** Primera candidata de la última imagen del vídeo. */
async function firstCandidate(videoId: number): Promise<number> {
  const { rows } = await getPool().query(
    "select r.id from generation_results r join generations g on g.id = r.generation_id where g.video_id = $1 and g.kind = 'frame' order by g.id desc, r.index limit 1",
    [videoId],
  );
  return rows[0].id;
}

/** Envía el lote, desglosa (sin preguntas) y confirma el presupuesto que da. */
async function sentAndConfirmed(n: number): Promise<{ batchId: number; videos: Video[] }> {
  const made = await batchWith(n);
  await sendBatch(ana, made.batchId);
  await runQueuedAnalyses();
  const quote = await quoteBatch(ana, made.batchId, deps);
  await confirmBatch(ana, made.batchId, { expectedCredits: quote.total }, deps);
  return made;
}

/** Avanza (con el Higgsfield simulado) y envía/termina, hasta `times` vueltas. */
async function cycle(batchId: number, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await advanceBatch(batchId, deps);
    expect((await active()).length).toBeLessThanOrEqual(AUTO_PARALLEL);
    await sendAndFinish();
  }
}

async function committed(batchId: number): Promise<number> {
  const { rows } = await getPool().query(
    "select coalesce(sum(g.quoted_credits), 0)::int as total from generations g join videos v on v.id = g.video_id where v.batch_id = $1 and g.status <> 'not_sent'",
    [batchId],
  );
  return rows[0].total;
}

// ───────────────────────── Estados ─────────────────────────

describe("pausas por algo interno", () => {
  it("una pausa antigua por un prompt interno se quita sola y el lote vuelve a donde estaba; una de saldo no", async () => {
    const prompt = await createBatch(ana, "Prompt");
    const saldo = await createBatch(ana, "Saldo");
    const pause = (reason: string, kind: string) => JSON.stringify({ kind, reason, from: "clips", extraCredits: 0, videoId: null, kindOf: "clip", quoted: null });
    await getPool().query("update batches set status = 'pausado', pause = $2::jsonb where id = $1", [prompt.id, pause("Video 2: Falta decir para qué sirve image [4].", "fallo")]);
    await getPool().query("update batches set status = 'pausado', pause = $2::jsonb where id = $1", [saldo.id, pause("No tienes créditos suficientes en Higgsfield.", "saldo")]);
    await advanceRunningBatches(deps);
    // Sin vídeos, al reanudarse sigue avanzando (aquí hasta «listo»): lo que cuenta es que ya no está en pausa.
    expect((await getBatchFor(ana, prompt.id)).status).not.toBe("pausado");
    expect((await getBatchFor(ana, prompt.id)).pause).toBeNull();
    expect((await getBatchFor(ana, saldo.id)).status).toBe("pausado");
  });

  it("una pausa del dueño (sin tipo, como la del lote 10) nunca se reanuda sola", async () => {
    const owner = await createBatch(ana, "Parado");
    const pause = { from: "revision_imagenes", kindOf: null, quoted: null, reason: "Parado por Emmanuel: no hacer un clip por sitio.", videoId: null, extraCredits: 0 };
    await getPool().query("update batches set status = 'pausado', pause = $2::jsonb where id = $1", [owner.id, JSON.stringify(pause)]);
    await advanceRunningBatches(deps);
    await advanceRunningBatches(deps);
    expect((await getBatchFor(ana, owner.id)).status).toBe("pausado");
    expect((await getBatchFor(ana, owner.id)).pause).toMatchObject({ reason: pause.reason });
  });

  it("«Saltar» en una pausa por un prompt interno no saca el vídeo; «Volver a incluir» devuelve uno saltado", async () => {
    const { batchId, videos } = await batchWith(1);
    const pause = { kind: "fallo", reason: "Video 1: Falta decir para qué sirve image [4].", from: "clips", extraCredits: 0, videoId: videos[0].id, kindOf: "clip", quoted: null };
    await getPool().query("update batches set status = 'pausado', pause = $2::jsonb where id = $1", [batchId, JSON.stringify(pause)]);
    await resumeBatch(ana, batchId, { skip: true });
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(false);
    await getPool().query("update videos set auto_skipped = true where id = $1", [videos[0].id]);
    await includeBatchVideo(ana, batchId, videos[0].id);
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(false);
  });
});

describe("estados del envío", () => {
  it("borrador → preguntas → imágenes → revisión → clips → listo, sin molestar entre medias", async () => {
    const ready: number[] = [];
    onBatchReady(async (id) => void ready.push(id));
    const { batchId, videos } = await batchWith(3);
    expect(await statusOf(batchId)).toBe("borrador");

    await sendBatch(ana, batchId);
    expect(await statusOf(batchId)).toBe("preguntas");
    // Un desglose por vídeo, pedido al enviar.
    expect((await getPool().query("select count(*)::int as n from video_analyses where status = 'queued'")).rows[0].n).toBe(3);
    let auto = await autoView(ana, await getBatchFor(ana, batchId));
    expect(auto.readyToConfirm).toBe(false);

    await runQueuedAnalyses();
    // Sin preguntas: directo al presupuesto.
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    auto = await autoView(ana, await getBatchFor(ana, batchId));
    expect(auto).toMatchObject({ readyToConfirm: true, questions: 0, total: 3 });

    const quote = await quoteBatch(ana, batchId, deps);
    expect(quote).toMatchObject({ frames: 3 * FRAME, clips: 3 * CLIP_EST, total: 3 * (FRAME + CLIP_EST), balance: 1000 });
    await confirmBatch(ana, batchId, { expectedCredits: quote.total }, deps);
    const confirmed = await getBatchFor(ana, batchId);
    expect(confirmed).toMatchObject({ status: "imagenes", budgetCredits: 3 * (FRAME + CLIP_EST) });
    expect(confirmed.estimates![String(videos[0].id)]).toEqual({ frame: FRAME, clip: CLIP_EST });

    // Imágenes: todas a la vez.
    await advanceBatch(batchId, deps);
    expect((await active()).map((g) => g.kind)).toEqual(["frame", "frame", "frame"]);
    await sendAndFinish();
    await cycle(batchId);
    expect((await generations()).filter((g) => g.kind === "frame" && g.status === "done")).toHaveLength(3);
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("revision_imagenes");

    for (const video of videos) await approveFrame(ana, video.id, await firstCandidate(video.id));
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("clips");
    // Los 3 clips a la vez: con ellos hechos, el siguiente avance deja el lote `listo`.
    expect((await active()).map((g) => g.kind)).toEqual(["clip", "clip", "clip"]);
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    // Con los clips hechos, la subida a 1080p de los 3 (Topaz) antes de dar el lote por listo.
    expect(await statusOf(batchId)).toBe("clips");
    expect((await active()).map((g) => g.kind)).toEqual(["upscale", "upscale", "upscale"]);
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    // `listo` y enseguida el montaje (`onBatchReady`): cada vídeo entra en la cola de la nube (sin Mac).
    expect(await statusOf(batchId)).toBe("listo");
    expect(ready).toEqual([batchId]);
    for (const video of videos) expect((await getVideoFor(ana, video.id)).editStatus).toBe("en_marcha");
    expect((await generations()).filter((g) => g.kind === "clip" && g.status === "done")).toHaveLength(3);
    // 3 imágenes, 3 clips y 3 subidas a 1080p: justo lo autorizado.
    expect(await committed(batchId)).toBe(3 * (FRAME + CLIP_EST));
  });

  it("enviar: solo quien creó el lote, una vez y con vídeos", async () => {
    const { batchId } = await batchWith(1);
    await expect(sendBatch(luis, batchId)).rejects.toMatchObject({ status: 404 });
    cookie.value = (await login(luis.email, TEST_PASSWORD))!.token;
    expect((await enviarRoute(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: String(batchId) }) })).status).toBe(404);
    await sendBatch(ana, batchId);
    await expect(sendBatch(ana, batchId)).rejects.toMatchObject({ status: 409 });
    const empty = await createBatch(ana, "Vacío");
    await expect(sendBatch(ana, empty.id)).rejects.toMatchObject({ status: 400 });
    // Ya presupuestado no admite vídeos nuevos.
    await runQueuedAnalyses();
    await confirmBatch(ana, batchId, { expectedCredits: FRAME + CLIP_EST }, deps);
    await expect(addVideoToBatch(ana, batchId, { productId: producto.id, avatarPhotoId: avatar, avatarMode: "elegido" })).rejects.toMatchObject({ status: 409 });
  });

  it("el estado de cada generación: pedir, en marcha, fallida (pausa) o pedir de nuevo tras «Continuar»", () => {
    const at = new Date("2026-11-22T10:00:00Z");
    const before = new Date("2026-11-22T09:00:00Z");
    const after = new Date("2026-11-22T11:00:00Z");
    const g = (status: string, extra: { rejectReason?: string; finishedAt?: Date } = {}) => ({
      status,
      rejectReason: extra.rejectReason ?? null,
      finishedAt: extra.finishedAt ?? null,
      intentAt: before,
    });
    expect(stageOf([], false, at)).toBe("need");
    expect(stageOf([g("submitted")], false, at)).toBe("busy");
    expect(stageOf([g("unknown")], false, at)).toBe("busy");
    expect(stageOf([g("done")], false, at)).toBe("done");
    expect(stageOf([g("done")], true, at)).toBe("approved");
    expect(stageOf([g("done", { rejectReason: "No" })], false, at)).toBe("need");
    expect(stageOf([g("done", { rejectReason: "No" }), g("done", { rejectReason: "No" }), g("done", { rejectReason: "No" })], false, at)).toBe("maxed");
    expect(stageOf([g("failed", { finishedAt: after })], false, at)).toBe("failed");
    expect(stageOf([g("not_sent", { finishedAt: after })], false, at)).toBe("failed");
    expect(stageOf([g("not_sent", { finishedAt: before })], false, at)).toBe("need");
  });
});

// ───────────────────────── Preguntas ─────────────────────────

describe("preguntas del lote", () => {
  it("nunca enseña preguntas que el lote resuelve solo (quién sale, las de Claude, riesgos): solo las obligatorias", async () => {
    const { batchId, videos } = await batchWith(2, { avatar: false });
    await sendBatch(ana, batchId);
    // Aunque Claude devuelva preguntas o riesgos, y aunque falte elegir quién sale, no se pregunta nada.
    await runQueuedAnalyses(() => ({
      ...REPLY,
      questions: [{ id: "luz", text: "¿Cocina de día o de noche?", options: ["día", "noche"] }],
      risks: [{ kind: "funcion_inexistente", detail: "El producto no pulveriza." }],
    }));
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    await advanceBatch(batchId, deps);
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    // Quién sale se resolvió solo.
    expect(["automatico", "sin_sustitucion"]).toContain((await getVideoFor(ana, videos[0].id)).avatarMode);
  });

  it("un clip vencido por tiempo que Higgsfield aún puede entregar se espera: ni se regenera (pagar dos veces) ni saca el vídeo", async () => {
    const { batchId, videos } = await batchWith(1, { automatic: true });
    await getPool().query("update batches set budget_credits = 1000 where id = $1", [batchId]);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    await cycle(batchId, 2);
    await approveFrame(ana, videos[0].id, await firstCandidate(videos[0].id));
    await advanceBatch(batchId, deps);
    const clip = (await generations()).find((g) => g.kind.startsWith("clip"))!;
    await getPool().query(
      "update generations set status = 'failed', error = $2, finished_at = now(), recheck_until = now() + interval '6 hours' where id = $1",
      [clip.id, TIMED_OUT],
    );
    await advanceBatch(batchId, deps);
    expect((await generations()).filter((g) => g.kind.startsWith("clip"))).toHaveLength(1);
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(false);
    expect((await getBatchFor(ana, batchId)).pause).toBeNull();
  });

  it("un vídeo cuya referencia aún no ha llegado espera (no sale del lote); al llegar, sigue", async () => {
    const { batchId, videos } = await batchWith(2, { automatic: true });
    await getPool().query("update videos set reference_status = 'none', reference_media_id = null where id = $1", [videos[1].id]);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect((await getVideoFor(ana, videos[1].id)).autoSkipped).toBe(false);
    expect(await statusOf(batchId)).toBe("preguntas");
    // Uno que salió así antes de este arreglo vuelve solo en cuanto su referencia está lista.
    await getPool().query("update videos set auto_skipped = true, auto_stop = 'Falta el vídeo de referencia.' where id = $1", [videos[1].id]);
    await getPool().query("update videos set reference_status = 'ready', reference_media_id = $2 where id = $1", [videos[1].id, `ref-${videos[1].id}`]);
    await advanceRunningBatches(deps);
    expect((await getVideoFor(ana, videos[1].id)).autoSkipped).toBe(false);
  });

  it("los vídeos que salieron por un fallo de la API de Claude vuelven solos y su imagen se suma a la revisión; un «Saltar» a mano no", async () => {
    const { batchId, videos } = await batchWith(4, { automatic: true });
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    // El vídeo 3 salió por la API de Claude (lote 6, 24/11/2026); el 4 lo saltó él a mano.
    await getPool().query(
      "update videos set auto_skipped = true, auto_stop = 'El desglose falló 3 veces: La petición a Claude no es válida; avisa al dueño.' where id = $1",
      [videos[2].id],
    );
    await getPool().query("update video_analyses set status = 'failed', result = null, error = 'La petición a Claude no es válida; avisa al dueño.' where video_id = $1", [videos[2].id]);
    await getPool().query("update videos set auto_skipped = true, auto_stop = null where id = $1", [videos[3].id]);
    await advanceBatch(batchId, deps);
    await cycle(batchId, 2);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
    const budget = (await getBatchFor(ana, batchId)).budgetCredits!;

    await advanceRunningBatches(deps);
    const back = await getVideoFor(ana, videos[2].id);
    expect(back).toMatchObject({ autoSkipped: false, autoStop: null });
    expect((await getVideoFor(ana, videos[3].id)).autoSkipped).toBe(true);
    expect((await getBatchFor(ana, batchId)).budgetCredits).toBeGreaterThan(budget);
    // Rehace su desglose y, con él, pide su imagen; el lote sigue en la revisión.
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect((await active()).map((g) => [g.videoId, g.kind])).toEqual([[videos[2].id, "frame"]]);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
    expect((await getBatchFor(ana, batchId)).pause).toBeNull();
  });

  it("un desglose que falla se repite solo (sin preguntar) y, agotados los intentos, espera sin sacar el vídeo", async () => {
    const { batchId, videos } = await batchWith(2, { automatic: true });
    await sendBatch(ana, batchId);
    const fail = async () => {
      const { rows } = await getPool().query("select id, video_id from video_analyses where status = 'queued' order by id");
      for (const row of rows as Array<{ id: number; video_id: number }>) {
        const reply = row.video_id === videos[0].id ? "esto no es JSON" : JSON.stringify(REPLY);
        const { client } = fakeMessages([{ text: reply, usage: { inputTokens: 10, outputTokens: 10 } }]);
        await runAnalysis(row.id, { gateway: createGateway({ client }) }).catch(() => {});
      }
    };
    await fail();
    await advanceBatch(batchId, deps);
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    // Se ha vuelto a pedir solo.
    expect((await getPool().query("select count(*)::int as n from video_analyses where status = 'queued' and video_id = $1", [videos[0].id])).rows[0].n).toBe(1);
    for (let i = 0; i < 3; i++) {
      await fail();
      await advanceBatch(batchId, deps);
    }
    // Agotados: sigue en el lote, esperando; nada de preguntas.
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(false);
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    expect(await statusOf(batchId)).toBe("preguntas");
  });
});

// ───────────────────────── Dinero ─────────────────────────

describe("presupuesto y dinero", () => {
  it("si el precio subió entre ver el presupuesto y confirmar, no se confirma nada", async () => {
    const { batchId } = await batchWith(1);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await expect(confirmBatch(ana, batchId, { expectedCredits: FRAME + CLIP_EST - 1 }, deps)).rejects.toMatchObject({
      status: 409,
      message: `El precio ha cambiado: ahora son ${FRAME + CLIP_EST} créditos. Revísalo y confirma de nuevo.`,
    });
    expect(await statusOf(batchId)).toBe("preguntas");
  });

  it("un precio por encima de lo previsto no para el lote si cabe en lo autorizado", async () => {
    const { batchId, videos } = await sentAndConfirmed(2);
    await getPool().query("update batches set budget_credits = 1000 where id = $1", [batchId]);
    const quoteImages = fake.port.quoteImages;
    fake.port.quoteImages = async (userId, request, count) => ({ ...(await quoteImages(userId, request, count)), credits: 6 });
    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).pause).toBeNull();
    expect((await generations()).map((g) => [g.videoId, g.quotedCredits])).toEqual([
      [videos[0].id, 6],
      [videos[1].id, 6],
    ]);
  });

  it("el total comprometido nunca pasa de lo autorizado: una regeneración sin margen pausa", async () => {
    const { batchId, videos } = await sentAndConfirmed(2);
    await cycle(batchId, 2);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
    await approveFrame(ana, videos[1].id, await firstCandidate(videos[1].id));
    await rejectFrame(ana, videos[0].id, "La botella sale torcida");
    await advanceBatch(batchId, deps);
    // 8 comprometidos + 4 de la nueva + 36 de los clips > 44.
    const paused = await getBatchFor(ana, batchId);
    expect(paused.pause).toMatchObject({ kind: "presupuesto", extraCredits: 4, from: "revision_imagenes" });
    expect(await committed(batchId)).toBe(8);

    await resumeBatch(ana, batchId, { extraCredits: 4 });
    await cycle(batchId);
    expect((await generations()).filter((g) => g.videoId === videos[0].id && g.kind === "frame").map((g) => g.round)).toEqual([1, 2]);
    await approveFrame(ana, videos[0].id, await firstCandidate(videos[0].id));
    await cycle(batchId, 3);
    // Clips hechos: los montajes esperan en la cola de la nube.
    expect(await statusOf(batchId)).toBe("listo");
    // Más la subida a 1080p de cada clip.
    expect(await committed(batchId)).toBe(48 + 2 * UPSCALE);
    expect(await committed(batchId)).toBeLessThanOrEqual((await getBatchFor(ana, batchId)).budgetCredits!);
  });

  it("sin saldo pausa con las cifras; tras recargar, «Continuar» sigue", async () => {
    const { batchId } = await sentAndConfirmed(1);
    fake.state.credits = 3;
    await advanceBatch(batchId, deps);
    expect(await generations()).toEqual([]);
    expect((await getBatchFor(ana, batchId)).pause).toMatchObject({
      kind: "saldo",
      reason: "No tienes créditos suficientes en Higgsfield: hacen falta 4 y tienes 3.",
      extraCredits: 0,
    });
    fake.state.credits = 1000;
    await resumeBatch(ana, batchId, {});
    await advanceBatch(batchId, deps);
    expect((await generations()).map((g) => g.status)).toEqual(["intent"]);
  });

  it("un vídeo que falla en Higgsfield se repite solo; sin rondas, queda fuera y el resto sigue (sin pausa)", async () => {
    const { batchId, videos } = await sentAndConfirmed(2);
    await getPool().query("update batches set budget_credits = 1000 where id = $1", [batchId]);
    const failFirst = async () => {
      for (const g of await generations()) if (g.status === "intent") await submitGeneration(g.id, deps);
      for (const g of await generations()) {
        if (g.status !== "submitted" || g.videoId !== videos[0].id) continue;
        const { rows } = await getPool().query("select job_ids as \"jobIds\" from generations where id = $1", [g.id]);
        for (const jobId of rows[0].jobIds) fake.state.jobs[jobId] = { jobId, status: "failed", failure: null, error: "Error interno", urls: [] };
        await finalizeGeneration(g.id, deps);
      }
    };
    await advanceBatch(batchId, deps);
    await failFirst();
    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).pause).toBeNull();
    // Repetida sola: otra imagen del primero en marcha.
    expect((await active()).some((g) => g.videoId === videos[0].id && g.kind === "frame")).toBe(true);
    for (let i = 0; i < 3; i++) {
      await failFirst();
      await advanceBatch(batchId, deps);
    }
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(true);
    expect((await getBatchFor(ana, batchId)).pause).toBeNull();
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
  });
});

describe("clip bloqueado por el filtro de Higgsfield", () => {
  it("no pausa: rehace la imagen inicial sin cuadros ni pósteres con personas (rechaza la aprobada, rehace el desglose) y el bloqueo no cuenta como gastado", async () => {
    const { batchId, videos } = await sentAndConfirmed(1);
    await getPool().query("update batches set budget_credits = 1000 where id = $1", [batchId]);
    await cycle(batchId, 1);
    await approveFrame(ana, videos[0].id, await firstCandidate(videos[0].id));
    await advanceBatch(batchId, deps);
    const clip = (await generations()).find((g) => g.kind === "clip")!;
    await submitGeneration(clip.id, deps);
    const { rows } = await getPool().query("select job_ids as \"jobIds\" from generations where id = $1", [clip.id]);
    for (const jobId of rows[0].jobIds) fake.state.jobs[jobId] = { jobId, status: "failed", failure: "ip_detected", error: null, urls: [] };
    await finalizeGeneration(clip.id, deps);
    expect((await getPool().query("select credits_spent as c from generations where id = $1", [clip.id])).rows[0].c).toBe(0);

    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).status).not.toBe("pausado");
    const video = await getVideoFor(ana, videos[0].id);
    // La imagen deja de estar aprobada (el motivo queda en su ronda) y el desglose se rehace con la indicación.
    expect(video.approvedFrameResultId).toBeNull();
    expect(video.ownerAnswers.find((a) => a.key.startsWith("sys:imagen-bloqueada-"))?.inBrief).toBe(true);
    expect((await getPool().query("select status from video_analyses where video_id = $1 order by id desc limit 1", [videos[0].id])).rows[0].status).toBe("queued");
    // El modelo no se cambia.
    expect(video.clipModel).toBe("seedance_2_5");
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    // Sale una imagen nueva (para la revisión del dueño); el clip espera a que la apruebe.
    expect((await generations()).filter((g) => g.kind === "frame").map((g) => g.status)).toEqual(["done", "intent"]);
  });
});

// ───────────────────────── Concurrencia e idempotencia ─────────────────────────

describe("como mucho 2 a la vez y sin envíos dobles", () => {
  it("con 5 vídeos nunca hay más de 2 generaciones en marcha", async () => {
    const { batchId } = await sentAndConfirmed(5);
    for (let i = 0; i < 4; i++) {
      await advanceBatch(batchId, deps);
      expect((await active()).length).toBeLessThanOrEqual(AUTO_PARALLEL);
      await advanceBatch(batchId, deps);
      expect((await active()).length).toBeLessThanOrEqual(AUTO_PARALLEL);
      await sendAndFinish();
    }
    expect((await generations()).filter((g) => g.kind === "frame")).toHaveLength(5);
  });

  it("repetir el avance (o dos a la vez) no pide ni envía dos veces", async () => {
    const { batchId, videos } = await sentAndConfirmed(3);
    await Promise.all([advanceBatch(batchId, deps), advanceBatch(batchId, deps), advanceBatch(batchId, deps)]);
    expect(await generations()).toHaveLength(3);
    // Aunque la reserva se pierda (proceso caído), repetirlo no apunta nada nuevo.
    await getPool().query("update batches set advancing_at = null");
    await advanceBatch(batchId, deps);
    expect(await generations()).toHaveLength(3);
    // Y el núcleo no deja apuntar otra mientras hay una en marcha.
    await expect(requestGeneration(ana, videos[0].id, "frame", { expectedCredits: FRAME }, deps)).rejects.toMatchObject({ status: 409 });
    // El envío del trabajo repetido tampoco envía dos veces.
    const [g] = await generations();
    await Promise.all([submitGeneration(g.id, deps), submitGeneration(g.id, deps)]);
    expect(fake.calls.filter((c) => c.method === "submitImages")).toHaveLength(1);
  });
});

// ───────────────────────── Clips ─────────────────────────

describe("clips", () => {
  it("cada vídeo sigue solo: su clip en cuanto se aprueba su imagen y su montaje en cuanto acaba su clip", async () => {
    const { batchId, videos } = await sentAndConfirmed(3);
    await cycle(batchId, 3);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
    // Solo la primera aprobada: su clip sale ya, sin esperar a las otras dos.
    await approveFrame(ana, videos[0].id, await firstCandidate(videos[0].id));
    await advanceBatch(batchId, deps);
    expect((await active()).map((g) => [g.videoId, g.kind, g.quotedCredits])).toEqual([[videos[0].id, "clip", CLIP]]);
    expect(await statusOf(batchId)).toBe("revision_imagenes");

    // Terminado su clip, se sube a 1080p con Topaz (configuración de Codex) y no se monta todavía.
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    expect((await getVideoFor(ana, videos[0].id)).editStatus).toBeNull();
    const [upscale] = (await getPool().query("select kind, request from generations where kind = 'upscale'")).rows;
    expect(upscale.request).toMatchObject({
      model: "topaz_video",
      resolution: "1080p",
      aspectRatio: "auto",
      enhancement: { model: "thd-3", astra_params: null, params: null },
      frameInterpolation: null,
      medias: [{ role: "video_references" }],
    });
    // Subido, se monta en la nube sin esperar a que el lote esté «listo», con el clip a 1080p.
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    expect((await getVideoFor(ana, videos[0].id)).editStatus).toBe("en_marcha");
    const clip = await downloadableClip(await getVideoFor(ana, videos[0].id));
    const { rows: upscaled } = await getPool().query("select r.job_id as \"jobId\" from generation_results r join generations g on g.id = r.generation_id where g.kind = 'upscale'");
    expect(clip?.jobId).toBe(upscaled[0].jobId);
    expect((await getPool().query("select video_id as \"videoId\" from edit_runs")).rows).toEqual([{ videoId: videos[0].id }]);
    expect((await getVideoFor(ana, videos[1].id)).editStatus).toBeNull();

    await approveFrame(ana, videos[1].id, await firstCandidate(videos[1].id));
    await approveFrame(ana, videos[2].id, await firstCandidate(videos[2].id));
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("clips");
    // Los dos clips que faltan, a la vez, cada uno con su propio precio.
    expect((await active()).map((g) => [g.kind, g.quotedCredits])).toEqual([
      ["clip", CLIP],
      ["clip", CLIP],
    ]);
  });

  it("«Aprobar todas» aprueba de un clic y todos los clips salen a la vez; rechazar una regenera solo esa", async () => {
    // Un lote nuevo: se autoriza solo al enviarlo, con margen para regenerar.
    const { batchId, videos } = await batchWith(3, { automatic: true });
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("imagenes");
    await advanceBatch(batchId, deps);
    // Las 3 imágenes a la vez.
    expect((await active()).map((g) => g.kind)).toEqual(["frame", "frame", "frame"]);
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("revision_imagenes");

    await rejectFrame(ana, videos[2].id, "La mano sale rara");
    expect(await approveAllFrames(ana, batchId)).toEqual({ approved: 2 });
    await advanceBatch(batchId, deps);
    // Los clips de las 2 aprobadas y la imagen nueva solo del rechazado, todo a la vez.
    expect((await active()).map((g) => [g.videoId, g.kind]).sort()).toEqual(
      [
        [videos[0].id, "clip"],
        [videos[1].id, "clip"],
        [videos[2].id, "frame"],
      ].sort(),
    );
  });
});
