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
import { finalizeGeneration, requestGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import {
  advanceBatch,
  answerQuestion,
  autoView,
  batchQuestions,
  confirmBatch,
  KEEP,
  onBatchReady,
  quoteBatch,
  resumeBatch,
  sendBatch,
  SKIP,
  stageOf,
} from "@/server/videos/lote";
import { getVideoFor, type Video } from "@/server/videos/videos";
import { POST as enviarRoute } from "@/app/api/lotes/[id]/enviar/route";
import { fakeMessages, type FakeCall } from "./helpers/fake-llm";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * «Enviar lote» de principio a fin con Claude y Higgsfield simulados. Precios del simulado: cada
 * imagen inicial 4 créditos (2 candidatas × 2) y cada clip de 6 s a 480p, 18 créditos.
 */

const FRAME = 4;
const CLIP = 18;

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
async function batchWith(n: number, options: { avatar?: boolean } = {}): Promise<{ batchId: number; videos: Video[] }> {
  const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
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
      const url = g.kind === "clip" ? `https://d8j0ntlcm91z4.cloudfront.net/${jobId}.mp4` : `https://cdn.test/${jobId}.png`;
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
    expect((await active()).length).toBeLessThanOrEqual(2);
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
    expect(quote).toMatchObject({ frames: 3 * FRAME, clips: 3 * CLIP, total: 3 * (FRAME + CLIP), balance: 1000 });
    await confirmBatch(ana, batchId, { expectedCredits: quote.total }, deps);
    const confirmed = await getBatchFor(ana, batchId);
    expect(confirmed).toMatchObject({ status: "imagenes", budgetCredits: 66 });
    expect(confirmed.estimates![String(videos[0].id)]).toEqual({ frame: FRAME, clip: CLIP });

    // Imágenes: de 2 en 2.
    await advanceBatch(batchId, deps);
    expect((await active()).map((g) => g.kind)).toEqual(["frame", "frame"]);
    await sendAndFinish();
    await cycle(batchId);
    expect((await generations()).filter((g) => g.kind === "frame" && g.status === "done")).toHaveLength(3);
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("revision_imagenes");

    for (const video of videos) await approveFrame(ana, video.id, await firstCandidate(video.id));
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("clips");
    await sendAndFinish();
    await cycle(batchId);
    expect(ready).toEqual([]);
    await advanceBatch(batchId, deps);
    // `listo` y enseguida el montaje (`onBatchReady`): sin Mac del dueño, cada vídeo queda
    // «Montaje: necesita el Mac» y el lote, `montado`.
    expect(await statusOf(batchId)).toBe("montado");
    expect(ready).toEqual([batchId]);
    for (const video of videos) expect((await getVideoFor(ana, video.id)).editError).toBe("Montaje: necesita el Mac");
    expect((await generations()).filter((g) => g.kind === "clip" && g.status === "done")).toHaveLength(3);
    expect(await committed(batchId)).toBe(66);
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
    await confirmBatch(ana, batchId, { expectedCredits: 22 }, deps);
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
  it("reúne las preguntas de Claude y las de la aplicación, y no deja presupuestar hasta responderlas", async () => {
    const { batchId, videos } = await batchWith(2, { avatar: false });
    await sendBatch(ana, batchId);
    // El primero no tiene avatar: no se desglosa y se pregunta quién sale.
    let questions = await batchQuestions(ana, batchId);
    expect(questions).toEqual([
      expect.objectContaining({ videoId: videos[0].id, key: "sys:avatar", kind: "avatar", options: expect.arrayContaining([expect.objectContaining({ value: `foto:${avatar}`, photoId: avatar })]) }),
    ]);
    await runQueuedAnalyses(() => ({
      ...REPLY,
      questions: [{ id: "variante", text: "¿Qué variante sale, la roja o la azul?", options: ["Roja", "Azul"] }],
    }));
    questions = await batchQuestions(ana, batchId);
    expect(questions.map((q) => [q.videoId, q.kind])).toEqual([
      [videos[0].id, "avatar"],
      [videos[1].id, "claude"],
    ]);
    expect(questions[1]).toMatchObject({ text: "¿Qué variante sale, la roja o la azul?", options: [{ value: "Roja", label: "Roja" }, { value: "Azul", label: "Azul" }], freeText: true });
    await expect(quoteBatch(ana, batchId, deps)).rejects.toMatchObject({ status: 409 });
    await expect(answerQuestion(ana, batchId, { videoId: videos[1].id, key: "c999:variante", value: "Roja" })).rejects.toMatchObject({ status: 409 });

    // Quién sale: cambia el vídeo y el avance pide su desglose.
    await answerQuestion(ana, batchId, { videoId: videos[0].id, key: "sys:avatar", value: `foto:${avatar}` });
    expect((await getVideoFor(ana, videos[0].id)).avatarPhotoId).toBe(avatar);
    // La de Claude: se guarda y, sin más preguntas, el desglose se repite con la respuesta.
    await answerQuestion(ana, batchId, { videoId: videos[1].id, key: questions[1].key, value: "Roja" });
    expect((await getVideoFor(ana, videos[1].id)).ownerAnswers).toEqual([
      { key: questions[1].key, question: "¿Qué variante sale, la roja o la azul?", answer: "Roja", inBrief: true },
    ]);
    await advanceBatch(batchId, deps);
    const { rows } = await getPool().query("select video_id as \"videoId\", answers from video_analyses where status = 'queued' order by video_id");
    expect(rows).toEqual([
      { videoId: videos[0].id, answers: null },
      { videoId: videos[1].id, answers: "Pregunta: ¿Qué variante sale, la roja o la azul?\nRespuesta: Roja" },
    ]);
    // Claude recibe la respuesta en las indicaciones del encargo (y vuelve a preguntar lo mismo: no se repite).
    const calls = await runQueuedAnalyses(() => ({
      ...REPLY,
      questions: [{ id: "variante", text: "¿Qué variante sale, la roja o la azul?", options: ["Roja", "Azul"] }],
    }));
    const sent = (calls[1].messages[0].content as Array<{ type: string; text?: string }>).map((b) => b.text ?? "").join("\n");
    expect(sent).toContain("<respuestas_del_dueno>\nPregunta: ¿Qué variante sale, la roja o la azul?\nRespuesta: Roja\n</respuestas_del_dueno>");
    // El primero sí la tiene por primera vez.
    questions = await batchQuestions(ana, batchId);
    expect(questions.map((q) => [q.videoId, q.kind])).toEqual([[videos[0].id, "claude"]]);
    await answerQuestion(ana, batchId, { videoId: videos[0].id, key: questions[0].key, value: "Azul, la de la etiqueta nueva" });
    await advanceBatch(batchId, deps);
    await runQueuedAnalyses();
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    expect((await autoView(ana, await getBatchFor(ana, batchId))).readyToConfirm).toBe(true);
    expect((await quoteBatch(ana, batchId, deps)).total).toBe(2 * (FRAME + CLIP));
  });

  it("un riesgo que bloquea se pregunta; «Seguir así» no repite el desglose y «Saltar» deja el vídeo fuera", async () => {
    const { batchId, videos } = await batchWith(2);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses(() => ({ ...REPLY, risks: [{ kind: "funcion_inexistente", detail: "El producto no pulveriza." }, { kind: "escala", detail: "Sin mano." }] }));
    const questions = await batchQuestions(ana, batchId);
    expect(questions.map((q) => [q.videoId, q.kind, q.text])).toEqual([
      [videos[0].id, "riesgo", "Función que el producto no tiene: El producto no pulveriza."],
      [videos[1].id, "riesgo", "Función que el producto no tiene: El producto no pulveriza."],
    ]);
    await answerQuestion(ana, batchId, { videoId: videos[0].id, key: questions[0].key, value: KEEP });
    await answerQuestion(ana, batchId, { videoId: videos[1].id, key: questions[1].key, value: SKIP });
    await advanceBatch(batchId, deps);
    expect((await getPool().query("select count(*)::int as n from video_analyses where status = 'queued'")).rows[0].n).toBe(0);
    const auto = await autoView(ana, await getBatchFor(ana, batchId));
    expect(auto).toMatchObject({ readyToConfirm: true, total: 1, skipped: 1 });
    expect((await quoteBatch(ana, batchId, deps)).rows.map((r) => r.videoId)).toEqual([videos[0].id]);
  });

  it("un desglose que falla no se repite solo: se pregunta", async () => {
    const { batchId, videos } = await batchWith(1);
    await sendBatch(ana, batchId);
    const { rows } = await getPool().query("select id from video_analyses where status = 'queued'");
    const { client } = fakeMessages([{ text: "esto no es JSON", usage: { inputTokens: 10, outputTokens: 10 } }]);
    await runAnalysis(rows[0].id, { gateway: createGateway({ client }) }).catch(() => {});
    await advanceBatch(batchId, deps);
    expect((await getPool().query("select count(*)::int as n from video_analyses where status = 'queued'")).rows[0].n).toBe(0);
    const [question] = await batchQuestions(ana, batchId);
    expect(question).toMatchObject({ videoId: videos[0].id, kind: "desglose" });
    await answerQuestion(ana, batchId, { videoId: videos[0].id, key: "sys:desglose", value: "__repetir__" });
    expect((await getPool().query("select count(*)::int as n from video_analyses where status = 'queued'")).rows[0].n).toBe(1);
  });
});

// ───────────────────────── Dinero ─────────────────────────

describe("presupuesto y dinero", () => {
  it("si el precio subió entre ver el presupuesto y confirmar, no se confirma nada", async () => {
    const { batchId } = await batchWith(1);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await expect(confirmBatch(ana, batchId, { expectedCredits: FRAME + CLIP - 1 }, deps)).rejects.toMatchObject({
      status: 409,
      message: `El precio ha cambiado: ahora son ${FRAME + CLIP} créditos. Revísalo y confirma de nuevo.`,
    });
    expect(await statusOf(batchId)).toBe("preguntas");
  });

  it("un precio por encima de lo previsto pausa sin enviar; «Continuar» autoriza la diferencia", async () => {
    const { batchId, videos } = await sentAndConfirmed(2);
    const quoteImages = fake.port.quoteImages;
    fake.port.quoteImages = async (userId, request, count) => ({ ...(await quoteImages(userId, request, count)), credits: 6 });
    await advanceBatch(batchId, deps);
    expect(await generations()).toEqual([]);
    const paused = await getBatchFor(ana, batchId);
    expect(paused).toMatchObject({ status: "pausado" });
    expect(paused.pause).toMatchObject({ kind: "precio", extraCredits: 2, videoId: videos[0].id, kindOf: "frame", quoted: 6, from: "imagenes" });
    expect(paused.pause!.reason).toBe("Vídeo 1: la imagen cuesta 6 créditos (previsto 4).");
    // Mientras está en pausa no avanza.
    await advanceBatch(batchId, deps);
    expect(await generations()).toEqual([]);

    await expect(resumeBatch(ana, batchId, {})).rejects.toMatchObject({ status: 400 });
    await resumeBatch(ana, batchId, { extraCredits: 2 });
    expect(await getBatchFor(ana, batchId)).toMatchObject({ status: "imagenes", budgetCredits: 44 + 2 });
    await advanceBatch(batchId, deps);
    // El primero ya con su precio nuevo; el segundo sube igual y vuelve a pausar.
    expect((await generations()).map((g) => [g.videoId, g.quotedCredits])).toEqual([[videos[0].id, 6]]);
    expect((await getBatchFor(ana, batchId)).pause).toMatchObject({ kind: "precio", videoId: videos[1].id });
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
    expect(await statusOf(batchId)).toBe("montado");
    expect(await committed(batchId)).toBe(48);
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

  it("un vídeo que falla en Higgsfield pausa el lote; «Saltar» lo deja fuera y el resto sigue", async () => {
    const { batchId, videos } = await sentAndConfirmed(2);
    await advanceBatch(batchId, deps);
    for (const g of await generations()) await submitGeneration(g.id, deps);
    const [first] = await generations();
    const { rows } = await getPool().query("select job_ids as \"jobIds\" from generations where id = $1", [first.id]);
    for (const jobId of rows[0].jobIds) fake.state.jobs[jobId] = { jobId, status: "failed", failure: "nsfw", error: null, urls: [] };
    await finalizeGeneration(first.id, deps);
    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).pause).toMatchObject({ kind: "fallo", videoId: videos[0].id });
    await resumeBatch(ana, batchId, { skip: true });
    expect((await getVideoFor(ana, videos[0].id)).autoSkipped).toBe(true);
    await sendAndFinish();
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
  });
});

// ───────────────────────── Concurrencia e idempotencia ─────────────────────────

describe("como mucho 2 a la vez y sin envíos dobles", () => {
  it("con 5 vídeos nunca hay más de 2 generaciones en marcha", async () => {
    const { batchId } = await sentAndConfirmed(5);
    for (let i = 0; i < 4; i++) {
      await advanceBatch(batchId, deps);
      expect((await active()).length).toBeLessThanOrEqual(2);
      await advanceBatch(batchId, deps);
      expect((await active()).length).toBeLessThanOrEqual(2);
      await sendAndFinish();
    }
    expect((await generations()).filter((g) => g.kind === "frame")).toHaveLength(5);
  });

  it("repetir el avance (o dos a la vez) no pide ni envía dos veces", async () => {
    const { batchId, videos } = await sentAndConfirmed(3);
    await Promise.all([advanceBatch(batchId, deps), advanceBatch(batchId, deps), advanceBatch(batchId, deps)]);
    expect(await generations()).toHaveLength(2);
    // Aunque la reserva se pierda (proceso caído), repetirlo no apunta nada nuevo.
    await getPool().query("update batches set advancing_at = null");
    await advanceBatch(batchId, deps);
    expect(await generations()).toHaveLength(2);
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
  it("empiezan solos solo cuando TODAS las imágenes están aprobadas", async () => {
    const { batchId, videos } = await sentAndConfirmed(3);
    await cycle(batchId, 3);
    expect(await statusOf(batchId)).toBe("revision_imagenes");
    await approveFrame(ana, videos[0].id, await firstCandidate(videos[0].id));
    await approveFrame(ana, videos[1].id, await firstCandidate(videos[1].id));
    await cycle(batchId, 2);
    expect((await generations()).filter((g) => g.kind === "clip")).toEqual([]);
    expect(await statusOf(batchId)).toBe("revision_imagenes");

    await approveFrame(ana, videos[2].id, await firstCandidate(videos[2].id));
    await advanceBatch(batchId, deps);
    expect(await statusOf(batchId)).toBe("clips");
    // Cada clip con su propio precio, de 2 en 2.
    expect((await active()).map((g) => [g.kind, g.quotedCredits])).toEqual([
      ["clip", CLIP],
      ["clip", CLIP],
    ]);
  });
});
