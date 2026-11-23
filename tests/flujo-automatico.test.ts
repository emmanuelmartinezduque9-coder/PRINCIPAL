import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { createGateway } from "@/llm/gateway";
import { resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { runAnalysis, type Analysis } from "@/server/videos/analysis";
import { advanceVideo, armOnOpen, autoStatusOf, resumeVideo } from "@/server/videos/autopilot";
import { addVideoToBatch, createBatch, getBatchFor } from "@/server/videos/batches";
import { approveFrame } from "@/server/videos/frame";
import { finalizeGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import { advanceBatch, answerQuestion, autoView, batchQuestions, sendBatch } from "@/server/videos/lote";
import { createVideo, getVideoFor, updateVideoChoices, videoView } from "@/server/videos/videos";
import { StepBreakdown } from "@/components/videos/step-breakdown";
import { StepFrame } from "@/components/videos/step-frame";
import type { VideoViewJson } from "@/components/videos/labels";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { instantPinterest } from "./helpers/pinterest";

/**
 * Regla fija del dueño (23/11/2026): el vídeo va solo de principio a fin. Sin avisos de riesgos, sin
 * «Generar 2 imágenes · Esto cuesta 4 créditos»: una imagen por vídeo que se pide sola al terminar
 * el desglose; luego clip y montaje. Solo se para con una pregunta obligatoria.
 */

/** Un desglose con riesgos (instrucciones internas) y ninguna decisión pendiente: como el del vídeo 2 de EisWerk. */
const WITH_RISKS: Analysis = {
  conceptLogic: "La máquina hace helado en casa en minutos.",
  shots: [{ startS: 0, endS: 6, seen: "Mujer con la máquina", action: "Sirve el helado", onScreenText: "" }],
  adaptation: [],
  risks: [
    { kind: "funcion_inexistente", detail: "No mostrar que congela sola." },
    { kind: "reveal_adelantado", detail: "No enseñar el helado antes de abrir la tapa." },
    { kind: "escala", detail: "La máquina cabe en una mano." },
    { kind: "identidad", detail: "Misma mujer en todas las tomas." },
    { kind: "texto_en_pantalla", detail: "Quitar los textos del original." },
    { kind: "marca_ajena", detail: "Sin logos de otras marcas." },
  ],
  frameUse: "start_image",
  imagePrompt: "Image 1 sets the composition and the framing. The woman is the person from image 2. She holds the machine from image 3 at chest height.",
  videoPrompt: "@Video1 gives only the camera movement, the rhythm and the action. @Image1 is the first frame. The woman is @Image2. The machine is @Image3.",
};

let dir: string;
let jpeg: Buffer;
let mp4: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;
let ana: AuthUser;
let producto: Product;
let avatar: number;

function ffmpeg(args: string[]): void {
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-flujo-automatico-"));
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
  await seedRules();
  fake = createFakeHiggsfield();
  const fakeFetch = (async (input: RequestInfo | URL) =>
    new Response(new Uint8Array(String(input).endsWith(".mp4") ? mp4 : jpeg), { status: 200 })) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };
  await makeUser("dueno");
  ana = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "EisWerk" });
  await addProductPhoto(ana, producto.id, jpeg, "articulo");
  avatar = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("avatar")]), "avatar")).id;
});

// ───────────────────────── Ayudas ─────────────────────────

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

/** Un vídeo suelto de Ana con la referencia lista; con `avatar: false`, sin elegir quién sale. */
async function soloVideo(options: { avatar?: boolean } = {}): Promise<number> {
  const video = await createVideo(ana, producto.id, { avatarMode: "elegido", avatarPhotoId: options.avatar === false ? null : avatar });
  await readyReference(video.id);
  return video.id;
}

/** Lo que haría `video.desglose` con Claude simulado. */
async function runQueuedAnalyses(reply: Analysis = WITH_RISKS): Promise<void> {
  const { rows } = await getPool().query("select id from video_analyses where status = 'queued' order by id");
  for (const row of rows as Array<{ id: number }>) {
    const { client } = fakeMessages([{ text: JSON.stringify(reply), usage: { inputTokens: 1000, outputTokens: 500 } }]);
    await runAnalysis(row.id, { gateway: createGateway({ client }) });
  }
}

const generations = async () =>
  (await getPool().query("select id, video_id as \"videoId\", kind, status, count, quoted_credits as \"quotedCredits\" from generations order by id")).rows as Array<{
    id: number;
    videoId: number;
    kind: string;
    status: string;
    count: number;
    quotedCredits: number;
  }>;

/** Envía las apuntadas y las termina en el simulado. */
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

async function firstCandidate(videoId: number): Promise<number> {
  const { rows } = await getPool().query(
    "select r.id from generation_results r join generations g on g.id = r.generation_id where g.video_id = $1 and g.kind = 'frame' order by g.id desc, r.index limit 1",
    [videoId],
  );
  return rows[0].id;
}

/** La vista tal como llega a la pantalla (JSON). */
const viewJson = async (videoId: number) => JSON.parse(JSON.stringify(await videoView(ana, videoId))) as VideoViewJson;

function render(element: ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));
}

/** El HTML sin lo que va plegado en `<details>`. */
const visible = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, "");

// ───────────────────────── Vídeo suelto ─────────────────────────

describe("vídeo suelto: va solo", () => {
  it("desglose con riesgos y sin decisiones pendientes → pide 1 imagen sola y no pinta los riesgos", async () => {
    const id = await soloVideo();
    // Referencia lista: el desglose se pide solo (sin «Hacer el desglose»).
    await advanceVideo(id, deps);
    expect((await getPool().query("select status from video_analyses where video_id = $1", [id])).rows).toEqual([{ status: "queued" }]);
    await runQueuedAnalyses();

    // Terminado el desglose: una imagen, pedida sola, sin botón ni confirmación.
    await advanceVideo(id, deps);
    const [frame] = await generations();
    expect(await generations()).toHaveLength(1);
    expect(frame).toMatchObject({ videoId: id, kind: "frame", status: "intent", count: 1, quotedCredits: 2 });
    // Repetirlo no pide otra.
    await advanceVideo(id, deps);
    expect(await generations()).toHaveLength(1);

    const view = await viewJson(id);
    expect(view.auto).toEqual({ state: "working", step: "imagen" });
    expect(view.frameCount).toBe(1);

    // El desglose no enseña los riesgos: como mucho, plegados en «Detalles técnicos».
    const breakdown = render(createElement(StepBreakdown, { view, draft: {}, setDraft: () => {}, onGoToReference: () => {} }));
    expect(breakdown).toContain("Detalles técnicos");
    for (const label of ["Función que no tiene", "Reveal adelantado", "Escala", "Identidad", "Texto en pantalla", "Marca ajena"]) {
      expect(visible(breakdown)).not.toContain(label);
    }
    expect(visible(breakdown)).not.toContain("No enseñar el helado antes de abrir la tapa.");
    expect(breakdown).not.toContain("bg-warning");

    // La imagen no tiene precio ni botón de generar.
    const step = render(createElement(StepFrame, { view, onGoToClip: () => {} }));
    expect(step).not.toMatch(/Generar|Esto cuesta|créditos/);
    expect(step).toContain("Generando");
  });

  it("avatar obligatorio sin elegir → solo esa pregunta, y no gasta nada", async () => {
    const id = await soloVideo({ avatar: false });
    await advanceVideo(id, deps);
    expect((await getPool().query("select count(*)::int as n from video_analyses")).rows[0].n).toBe(0);
    expect(await generations()).toEqual([]);
    const status = await autoStatusOf(ana, await getVideoFor(ana, id));
    expect(status).toEqual({ state: "question", text: "Elige un avatar, «Sin sustitución» o «No aparece nadie».", retry: false });

    // En cuanto lo elige, sigue sola.
    await updateVideoChoices(ana, id, { avatarPhotoId: avatar });
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    await advanceVideo(id, deps);
    expect((await generations()).map((g) => [g.kind, g.count])).toEqual([["frame", 1]]);
  });

  it("aprobada la imagen, el clip y el montaje se piden solos", async () => {
    const id = await soloVideo();
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    await advanceVideo(id, deps);
    await sendAndFinish();
    // La imagen espera la aprobación visual (la única parada rutinaria).
    await advanceVideo(id, deps);
    expect(await generations()).toHaveLength(1);
    expect((await viewJson(id)).auto).toEqual({ state: "review" });

    await approveFrame(ana, id, await firstCandidate(id));
    await advanceVideo(id, deps);
    expect((await generations()).map((g) => [g.kind, g.status])).toEqual([
      ["frame", "done"],
      ["clip", "intent"],
    ]);
    await sendAndFinish();
    await advanceVideo(id, deps);
    expect((await getPool().query("select status from edit_runs where video_id = $1", [id])).rows).toEqual([{ status: "queued" }]);
    expect((await getVideoFor(ana, id)).editStatus).toBe("en_marcha");
  });

  it("sin saldo se para con una sola pregunta y sigue al recargar", async () => {
    const id = await soloVideo();
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    fake.state.credits = 1;
    await advanceVideo(id, deps);
    expect(await generations()).toEqual([]);
    const stopped = await autoStatusOf(ana, await getVideoFor(ana, id));
    expect(stopped).toMatchObject({ state: "question", retry: true });
    expect(stopped.state === "question" && stopped.text).toContain("hacen falta 2 y tienes 1");
    // Parado: el seguimiento no insiste.
    await advanceVideo(id, deps);
    expect(await generations()).toEqual([]);

    fake.state.credits = 1000;
    await resumeVideo(ana, id, deps);
    expect((await generations()).map((g) => [g.kind, g.status])).toEqual([["frame", "intent"]]);
  });

  it("más de una imagen solo si la tarjeta lo pide", async () => {
    const id = await soloVideo();
    await updateVideoChoices(ana, id, { frameCount: 2 });
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    await advanceVideo(id, deps);
    expect((await generations()).map((g) => [g.count, g.quotedCredits])).toEqual([[2, 4]]);
    await expect(updateVideoChoices(ana, id, { frameCount: 9 })).rejects.toMatchObject({ status: 400 });
  });

  it("un vídeo de antes del flujo automático no gasta hasta que quien lo creó lo abre", async () => {
    const id = await soloVideo();
    await getPool().query("update videos set auto_since = null where id = $1", [id]);
    await advanceVideo(id, deps);
    expect((await getPool().query("select count(*)::int as n from video_analyses")).rows[0].n).toBe(0);
    await armOnOpen(ana, id);
    await advanceVideo(id, deps);
    expect((await getPool().query("select count(*)::int as n from video_analyses")).rows[0].n).toBe(1);
  });
});

// ───────────────────────── Lote ─────────────────────────

describe("flujo automático del lote", () => {
  async function automaticBatch(n: number, options: { avatar?: boolean } = {}) {
    const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: avatar, avatarMode: "elegido" });
      if (options.avatar === false && i === 0) await getPool().query("update videos set avatar_photo_id = null where id = $1", [video.id]);
      await readyReference(video.id);
      ids.push(video.id);
    }
    return { batchId: batch.id, ids };
  }

  it("con todo respondido se autoriza solo (sin «Confirmar») y pide 1 imagen por vídeo", async () => {
    const { batchId, ids } = await automaticBatch(2);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    const batch = await getBatchFor(ana, batchId);
    expect(batch.status).toBe("imagenes");
    // 2 imágenes (1 por vídeo, 2 créditos) + 2 clips de 6 s (18).
    expect(batch.budgetCredits).toBe(2 * (2 + 18));
    expect((await autoView(ana, batch)).readyToConfirm).toBe(false);
    await advanceBatch(batchId, deps);
    expect((await generations()).map((g) => [g.videoId, g.kind, g.count])).toEqual([
      [ids[0], "frame", 1],
      [ids[1], "frame", 1],
    ]);
  });

  it("avatar obligatorio sin elegir → solo esa pregunta; al responder sigue solo", async () => {
    const { batchId, ids } = await automaticBatch(2, { avatar: false });
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    const questions = await batchQuestions(ana, batchId);
    expect(questions.map((q) => [q.videoId, q.kind])).toEqual([[ids[0], "avatar"]]);
    expect((await getBatchFor(ana, batchId)).status).toBe("preguntas");
    expect(await generations()).toEqual([]);

    await answerQuestion(ana, batchId, { videoId: ids[0], key: "sys:avatar", value: `foto:${avatar}` });
    await advanceBatch(batchId, deps);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).status).toBe("imagenes");
  });

  it("sin saldo para todo el lote se para con ese único motivo", async () => {
    const { batchId } = await automaticBatch(1);
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    fake.state.credits = 5;
    await advanceBatch(batchId, deps);
    const batch = await getBatchFor(ana, batchId);
    expect(batch).toMatchObject({ status: "pausado", pause: { kind: "saldo", from: "preguntas" } });
    expect(await generations()).toEqual([]);
  });
});
