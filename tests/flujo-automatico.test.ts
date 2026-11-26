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
import { approveFrame, rejectFrame } from "@/server/videos/frame";
import { finalizeGeneration, rejectRound, quoteGeneration, requestGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import { advanceBatch, advanceRunningBatches, autoView, batchQuestions, sendBatch } from "@/server/videos/lote";
import { advanceOwnerRedo, redoFromCard } from "@/server/videos/owner-redo";
import { claimRun } from "@/server/videos/montaje-nube";
import { createVideo, getVideoFor, updateVideoChoices, videoView } from "@/server/videos/videos";
import { getObjectStore } from "@/lib/object-store";
import { StepBreakdown } from "@/components/videos/step-breakdown";
import { StepFrame } from "@/components/videos/step-frame";
import { StepVideo } from "@/components/videos/step-video";
import type { VideoViewJson } from "@/components/videos/labels";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { instantPinterest } from "./helpers/pinterest";

/**
 * Regla fija del dueño (23/11/2026): el vídeo va solo de principio a fin. Sin avisos de riesgos, sin
 * «Generar 2 imágenes · Esto cuesta 4 créditos»: una imagen por vídeo que se pide sola al terminar
 * el desglose; luego clip y montaje. Solo se para con una pregunta obligatoria.
 *
 * Orden expresa de Emmanuel, 25/11/2026: un frame, un clip y un Topaz por vídeo, incluidos los antiguos.
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
  frameUse: "contextual_reference",
  imagePrompt: "Image 1 sets the composition and the framing. The woman is the person from image 2. She holds the machine from image 3 at chest height.",
  // Sin elegir modelo, el clip sale con Genjutsu Motion Transfer (lo que hacía Codex): prompt con `image [N]`.
  videoPrompt:
    "Use the source video as the authority for every action, camera movement, cut and timing. Use image [1] as the human-approved clean opening frame. The woman is the person in image [2]. The machine is the exact product in image [3]. No text overlays, no captions.",
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
      const url = g.kind.startsWith("frame") ? `https://cdn.test/${jobId}.png` : `https://d8j0ntlcm91z4.cloudfront.net/${jobId}.mp4`;
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
    // «Vídeo listo»: mientras se hace, «Preparando tu vídeo…» con el avance, sin botones; el clip, plegado.
    const preparing = render(createElement(StepVideo, { view: await viewJson(id), onGoToFrame: () => {} }));
    expect(preparing).toContain("Preparando tu vídeo");
    expect(preparing).toContain("Detalles");
    expect(visible(preparing)).not.toMatch(/Generar|Montar|Esto cuesta/);
    expect((await generations()).map((g) => [g.kind, g.status])).toEqual([
      ["frame", "done"],
      ["clip", "intent"],
    ]);
    await sendAndFinish();
    // Con el clip hecho, la subida a 1080p con Topaz; después, el montaje.
    await advanceVideo(id, deps);
    expect((await generations()).map((g) => g.kind)).toEqual(["frame", "clip", "upscale"]);
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
    // 2 imágenes (1 por vídeo, 2 créditos) + 2 clips de Genjutsu Motion Transfer (el simulado cuenta 10 s: 30).
    // Con el margen de las 2 regeneraciones permitidas (rechazar no para el lote).
    // Imagen, clip y su subida a 1080p con Topaz (2 de previsión), con el margen del lote.
    expect(batch.budgetCredits).toBe(2 * (2 + 30 + 2) * 3);
    expect((await autoView(ana, batch)).readyToConfirm).toBe(false);
    await advanceBatch(batchId, deps);
    expect((await generations()).map((g) => [g.videoId, g.kind, g.count])).toEqual([
      [ids[0], "frame", 1],
      [ids[1], "frame", 1],
    ]);
  });

  it("quién sale sin elegir → «Automático» solo, sin preguntar; el lote sigue a las imágenes", async () => {
    const { batchId, ids } = await automaticBatch(2, { avatar: false });
    await sendBatch(ana, batchId);
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect(await batchQuestions(ana, batchId)).toEqual([]);
    const video = await getVideoFor(ana, ids[0]);
    expect(["automatico", "sin_sustitucion"]).toContain(video.avatarMode);
    // El desglose se rehace con el avatar elegido solo, y el lote llega a las imágenes.
    await runQueuedAnalyses();
    await advanceBatch(batchId, deps);
    expect((await getBatchFor(ana, batchId)).status).toBe("imagenes");
  });

  it("un desglose que falla nunca es una pregunta: se repite solo y, agotados los intentos, espera y vuelve a intentarlo", async () => {
    const { batchId, ids } = await automaticBatch(1);
    await sendBatch(ana, batchId);
    const failQueued = async () => {
      const { rows } = await getPool().query("select id from video_analyses where status = 'queued' order by id");
      for (const row of rows as Array<{ id: number }>) {
        const { client } = fakeMessages([{ text: "esto no es JSON", usage: { inputTokens: 10, outputTokens: 10 } }]);
        await runAnalysis(row.id, { gateway: createGateway({ client }) }).catch(() => {});
      }
    };
    for (let i = 0; i < 4; i++) {
      await failQueued();
      await advanceBatch(batchId, deps);
      // Ni pregunta, ni «Repetir desglose», ni «Saltar este vídeo».
      expect(await batchQuestions(ana, batchId)).toEqual([]);
      expect((await autoView(ana, await getBatchFor(ana, batchId))).questions).toBe(0);
    }
    const queued = async () => (await getPool().query("select count(*)::int as n from video_analyses where status = 'queued'")).rows[0].n as number;
    // Agotados los intentos: espera (no sale del lote) y no pide otro enseguida.
    expect((await getVideoFor(ana, ids[0])).autoSkipped).toBe(false);
    expect(await queued()).toBe(0);
    // Pasado el rato de espera, se vuelve a intentar solo.
    await getPool().query("update video_analyses set updated_at = now() - interval '31 minutes' where video_id = $1", [ids[0]]);
    await advanceBatch(batchId, deps);
    expect(await queued()).toBe(1);
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

// ───────────────────────── Sitios de la referencia (24/11/2026) ─────────────────────────

/**
 * Regla de Emmanuel (24/11/2026), el defecto que más le molestaba en Codex: cada toma conserva su
 * sitio. Caso real del lote 6 (FalterPfote): las primeras tomas en el supermercado y el resto en la
 * calle, y todo salió en el supermercado.
 */
const STREET_PROMPT =
  "Image 1 sets the composition and the framing of this street shot. The woman is the person from image 2. She holds the machine from image 3 at chest height on a Berlin pavement.";
const STREET_VIDEO =
  "Use the source video as the authority for every action, camera movement, cut and timing. Use image [1] as the human-approved clean opening frame of this street part. The woman is the person in image [2]. The machine is the exact product in image [3]. No text overlays, no captions.";
const WITH_PLACES: Analysis = {
  ...WITH_RISKS,
  shots: [0, 1, 2, 4].map((startS) => ({ startS, endS: startS + 1, seen: "", action: "", onScreenText: "" })),
  places: [
    { startS: 0, endS: 2, place: "supermarket aisle", action: "Coge la máquina de la estantería", keepObjects: ["shelf"], ownerEnvironment: false, imagePrompt: "", videoPrompt: "" },
    { startS: 2, endS: 6, place: "city street", action: "Camina por la calle con la máquina", keepObjects: [], ownerEnvironment: false, imagePrompt: STREET_PROMPT, videoPrompt: STREET_VIDEO },
  ],
};

describe("sitios de la referencia: un frame, un clip y un Topaz por vídeo", () => {
  /** La referencia entera guardada (hace falta para partirla): 2 s rojos (súper) y 4 s verdes (calle). */
  async function storedReference(videoId: number): Promise<void> {
    const file = path.join(dir, `referencia-${videoId}.mp4`);
    ffmpeg([
      "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=2",
      "-f", "lavfi", "-i", "color=c=green:s=360x640:r=30:d=4",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
    ]);
    const key = `referencias/prueba-${videoId}.mp4`;
    await getObjectStore()!.putFile(key, file, { contentType: "video/mp4" });
    await getPool().query("update videos set reference_storage_key = $2 where id = $1", [videoId, key]);
  }

  const kinds = async () => (await generations()).map((g) => [g.kind, g.status]);

  it("vídeo suelto: un frame aprobado compartido, fotos del entorno al final y montaje sin empalme", async () => {
    const id = await soloVideo();
    await storedReference(id);
    await advanceVideo(id, deps);
    await runQueuedAnalyses(WITH_PLACES);

    await advanceVideo(id, deps);
    expect(await kinds()).toEqual([["frame", "intent"]]);
    await sendAndFinish();
    await advanceVideo(id, deps);
    expect(await kinds()).toEqual([["frame", "done"]]);
    const view = await viewJson(id);
    expect(view.auto).toEqual({ state: "review" });
    expect(view.places).toEqual([]);
    expect(visible(render(createElement(StepFrame, { view, onGoToClip: () => {} })))).not.toContain("Sitio 2");
    await expect(approveFrame(ana, id, await firstCandidate(id), "frame:1")).rejects.toMatchObject({ status: 409, message: "Este vídeo lleva una sola imagen" });
    await expect(rejectFrame(ana, id, "Otro entorno", "frame:1")).rejects.toMatchObject({ status: 409, message: "Este vídeo lleva una sola imagen" });
    await expect(quoteGeneration(ana, id, "frame:1", deps)).rejects.toMatchObject({ status: 409, message: "Este vídeo lleva una sola imagen" });
    await approveFrame(ana, id, await firstCandidate(id));

    await advanceVideo(id, deps);
    const { rows: clips } = await getPool().query("select kind, request from generations where kind like 'clip%' order by id");
    expect(clips.map((c) => c.kind)).toEqual(["clip"]);
    const images = clips[0].request.medias.filter((m: {role: string}) => m.role === "image_references");
    expect(images).toHaveLength(4);
    expect(clips[0].request.prompt).toContain("From 2s to 6s the scene takes place in city street: rebuild that setting from images [4]..[4]");
    expect(clips[0].request.prompt).toContain("do not carry its background there");
    expect(clips[0].request.medias.find((m: {role: string}) => m.role === "video_references").value).toBe(`ref-${id}`);
    expect(clips[0].request.model).toBe("hf_mult_motion_control");
    await sendAndFinish();
    for (let i = 0; i < 3; i++) {
      await advanceVideo(id, deps);
      await sendAndFinish();
    }
    expect(await kinds()).toEqual([["frame", "done"], ["clip", "done"], ["upscale", "done"]]);
    const { rows: runs } = await getPool().query("select spec from edit_runs where video_id = $1", [id]);
    expect(runs).toHaveLength(1);
    expect(runs[0].spec.clips).toHaveLength(1);
    expect(runs[0].spec.clips[0].parts).toBeUndefined();
  });

  it("con un solo sitio, sigue siendo una imagen (y sin la referencia guardada, también)", async () => {
    const id = await soloVideo();
    await advanceVideo(id, deps);
    await runQueuedAnalyses(WITH_PLACES);
    await advanceVideo(id, deps);
    await sendAndFinish();
    await advanceVideo(id, deps);
    expect(await kinds()).toEqual([["frame", "done"]]);
    expect((await viewJson(id)).places).toEqual([]);
  });

  it("la imagen del dueño manda en su sitio y no se busca Pinterest para ese entorno", async () => {
    const id = await soloVideo();
    const room = await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("owner-room")]), "entorno");
    await updateVideoChoices(ana, id, { environmentPhotoId: room.id });
    await advanceVideo(id, deps);
    await runQueuedAnalyses({ ...WITH_PLACES, places: [WITH_PLACES.places![0], { ...WITH_PLACES.places![1], ownerEnvironment: true }] });
    await advanceVideo(id, deps);
    await sendAndFinish();
    await approveFrame(ana, id, await firstCandidate(id));
    await advanceVideo(id, deps);
    const { rows } = await getPool().query("select request from generations where video_id = $1 and kind = 'clip'", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].request.prompt).toContain("From 2s to 6s the scene takes place in city street");
    expect(rows[0].request.prompt).toContain("preserve the same room, its furniture, decoration and ALL objects");
    expect(rows[0].request.medias.filter((m: {role: string}) => m.role === "image_references")).toHaveLength(4);
    expect((await getPool().query("select tramo from video_pinterest_refs where video_id = $1", [id])).rows).toEqual([{ tramo: 0 }]);
  });

  it("rehacer la imagen con un clip anterior vuelve a revisión y no permite clip sin aprobar", async () => {
    const id = await soloVideo();
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    await advanceVideo(id, deps);
    await sendAndFinish();
    await approveFrame(ana, id, await firstCandidate(id));
    for (let i = 0; i < 4; i++) { await advanceVideo(id, deps); await sendAndFinish(); }
    const owner: AuthUser = { ...ana, role: "dueno" };
    await getPool().query("update users set role = 'dueno' where id = $1", [ana.id]);
    const batch = await createBatch(owner, "Nueva apertura");
    await getPool().query("update videos set batch_id = $2, auto_skipped = true where id = $1", [id, batch.id]);
    await getPool().query("update batches set status = 'imagenes', budget_credits = 0 where id = $1", [batch.id]);
    await redoFromCard(owner, batch.id, id, "frame", "Use a bright kitchen", deps);
    await sendAndFinish();
    await advanceOwnerRedo(id, deps);
    const view = await videoView(owner, id);
    expect(view.frame.approvedResultId).toBeNull();
    expect(view.frame.current?.status).toBe("done");
    await expect(requestGeneration(owner, id, "clip", { expectedCredits: 1000, ownerOverride: true }, deps)).rejects.toMatchObject({ status: 409 });
    // El clip rechazado ya no ata la apertura nueva.
    const result = view.frame.current!.results.find((r) => r.ok)!;
    await expect(approveFrame(owner, id, result.id)).resolves.toBeUndefined();
    expect((await getVideoFor(owner, id)).autoSkipped).toBe(false);
  });

  it("el clip pedido a mano continúa con Topaz y montaje durante una pausa manual", async () => {
    const id = await soloVideo();
    await advanceVideo(id, deps);
    await runQueuedAnalyses();
    await advanceVideo(id, deps);
    await sendAndFinish();
    await approveFrame(ana, id, await firstCandidate(id));
    for (let i = 0; i < 4; i++) { await advanceVideo(id, deps); await sendAndFinish(); }
    // El vídeo ya tiene su clip, su Topaz y el montaje anterior en cola.
    const owner: AuthUser = { ...ana, role: "dueno" };
    await getPool().query("update users set role = 'dueno' where id = $1", [ana.id]);
    const batch = await createBatch(owner, "Rehacer a mano");
    await getPool().query("update videos set batch_id = $2, auto_skipped = true where id = $1", [id, batch.id]);
    await getPool().query("update batches set status = 'pausado', budget_credits = 0, pause = $2::jsonb where id = $1", [batch.id,
      JSON.stringify({ kind: "fallo", reason: "Pausa manual", from: "clips", videoId: null, kindOf: null })]);
    await redoFromCard(owner, batch.id, id, "clip", "Keep the camera static", deps);
    const { rows: manual } = await getPool().query("select request, owner_override from generations where video_id = $1 and kind = 'clip' order by id desc limit 1", [id]);
    expect(manual[0].owner_override).toBe(true);
    expect(manual[0].request.prompt).toContain("Owner correction for this new clip: Keep the camera static");
    await sendAndFinish();
    await advanceOwnerRedo(id, deps); // Topaz
    await sendAndFinish();
    await advanceOwnerRedo(id, deps); // Montaje
    const { rows: runs } = await getPool().query("select id, status, spec from edit_runs where video_id = $1 order by id", [id]);
    expect(runs.at(-2).status).toBe("failed");
    expect(runs.at(-1).status).toBe("queued");
    const { rows: topaz } = await getPool().query(`select r.job_id from generation_results r join generations g on g.id = r.generation_id
      where g.video_id = $1 and g.kind = 'upscale' order by g.id desc limit 1`, [id]);
    expect(runs.at(-1).spec.clips[0].jobId).toBe(topaz[0].job_id);
    expect((await getBatchFor(owner, batch.id)).status).toBe("pausado");
    expect((await getVideoFor(owner, id)).autoSkipped).toBe(false);
    expect((await claimRun(new Date()))?.id).toBe(Number(runs.at(-1).id));
  });

  it.each(["frame", "clip", "upscale", "montaje"])("un lote pausado no lanza %s desde barrido, autopilot ni colas", async (step) => {
    const batch = await createBatch(ana, "Pausado", { autoAnalyze: false });
    const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: avatar, avatarMode: "elegido" });
    await readyReference(video.id);
    await sendBatch(ana, batch.id);
    await runQueuedAnalyses();
    for (let i = 0; i < 12; i++) {
      await advanceBatch(batch.id, deps);
      const all = await generations();
      if (step !== "montaje" && all.some((g) => g.kind === step && g.status === "intent")) break;
      if ((await getPool().query("select id from edit_runs where video_id = $1", [video.id])).rows.length) break;
      await sendAndFinish();
      const current = await getVideoFor(ana, video.id);
      if (current.approvedFrameResultId === null && all.some((g) => g.kind === "frame")) await approveFrame(ana, video.id, await firstCandidate(video.id));
    }
    const before = await generations();
    if (step !== "montaje") expect(before.some((g) => g.kind === step && g.status === "intent")).toBe(true);
    else expect((await getPool().query("select status from edit_runs where video_id = $1", [video.id])).rows).toEqual([{ status: "queued" }]);
    await getPool().query("update batches set status = 'pausado', pause = $2::jsonb where id = $1", [batch.id,
      JSON.stringify({ kind: "fallo", reason: "Higgsfield bloqueó el clip", from: "clips", videoId: video.id, kindOf: "clip" })]);
    await advanceRunningBatches(deps);
    await advanceBatch(batch.id, deps);
    await advanceVideo(video.id, deps);
    await resumeVideo(ana, video.id, deps);
    for (const g of before) if (g.status === "intent") await submitGeneration(g.id, deps);
    expect(await generations()).toEqual(before);
    expect(await claimRun(new Date())).toBeNull();
    expect((await getBatchFor(ana, batch.id)).status).toBe("pausado");
  });

  it("lote: una imagen por vídeo en la revisión y el presupuesto", async () => {
    const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
    const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: avatar, avatarMode: "elegido" });
    await readyReference(video.id);
    await storedReference(video.id);
    await sendBatch(ana, batch.id);
    await runQueuedAnalyses(WITH_PLACES);
    for (let i = 0; i < 3; i++) {
      await advanceBatch(batch.id, deps);
      await sendAndFinish();
    }
    expect(await kinds()).toEqual([["frame", "done"]]);
    const estimates = (await getBatchFor(ana, batch.id)).estimates as Record<string, { frame: number }> | null;
    expect(estimates?.[String(video.id)]?.frame).toBe(2);
    await approveFrame(ana, video.id, await firstCandidate(video.id));
    for (let i = 0; i < 5; i++) { await advanceBatch(batch.id, deps); await sendAndFinish(); }
    expect(await kinds()).toEqual([["frame", "done"], ["clip", "done"], ["upscale", "done"]]);
    const { rows: edits } = await getPool().query("select spec from edit_runs where video_id = $1", [video.id]);
    expect(edits).toHaveLength(1);
    expect(edits[0].spec.clips[0].parts).toBeUndefined();
  });
  it("reutiliza frame:1 aprobado sin nuevas imágenes e ignora clip:1 y upscale:1", async () => {
    const id = await soloVideo();
    await storedReference(id);
    await advanceVideo(id, deps);
    await runQueuedAnalyses(WITH_PLACES);
    await advanceVideo(id, deps);
    await sendAndFinish();
    await approveFrame(ana, id, await firstCandidate(id));
    // Copia un resultado real como frame antiguo aprobado; no genera nada adicional.
    const { rows: legacy } = await getPool().query(`insert into generations (video_id, user_id, kind, round, status, count, quoted_credits, request)
      select video_id, user_id, 'frame:1', round, status, count, quoted_credits, request from generations where video_id = $1 returning id`, [id]);
    const { rows: result } = await getPool().query(`insert into generation_results (generation_id, index, job_id, ok, url)
      select $2, index, job_id || '-legacy', ok, url from generation_results where generation_id = (select id from generations where video_id = $1 and kind = 'frame') returning id, job_id`, [id, legacy[0].id]);
    await getPool().query("update videos set tramo_approvals = $2::jsonb where id = $1", [id, JSON.stringify({ "frame:1": result[0].id })]);
    await getPool().query("update video_pinterest_refs set status = 'failed' where video_id = $1 and tramo = 1", [id]);
    await expect(requestGeneration(ana, id, "frame", { expectedCredits: 2 }, deps)).rejects.toMatchObject({ status: 409 });
    for (const kind of ["clip:1", "upscale:1"]) await getPool().query(`insert into generations (video_id, user_id, kind, round, status, count, quoted_credits, request)
      select video_id, user_id, $2, round, 'failed', count, quoted_credits, request from generations where video_id = $1 and kind = 'frame'`, [id, kind]);
    for (let i = 0; i < 5; i++) { await advanceVideo(id, deps); await sendAndFinish(); }
    const { rows: clips } = await getPool().query("select request from generations where video_id = $1 and kind = 'clip'", [id]);
    expect(clips).toHaveLength(1);
    expect(clips[0].request.medias.at(-1).value).toBe(result[0].job_id);
    expect(clips[0].request.prompt).toContain("From 2s to 6s the scene takes place in city street");
    expect((await kinds()).filter(([kind]) => String(kind).startsWith("frame"))).toEqual([["frame", "done"], ["frame:1", "done"]]);
    expect((await getPool().query("select spec from edit_runs where video_id = $1", [id])).rows[0].spec.clips[0].parts).toBeUndefined();
  });

  it("la toma corta se queda en el clip vecino, sin referencias propias", async () => {
    const id = await soloVideo();
    await storedReference(id);
    await advanceVideo(id, deps);
    await runQueuedAnalyses({ ...WITH_PLACES, places: [
      { ...WITH_PLACES.places![0], endS: 4 },
      { ...WITH_PLACES.places![1], startS: 4, endS: 5, place: "open fridge", action: "take food out", keepObjects: ["fridge door"] },
      { ...WITH_PLACES.places![1], startS: 5, endS: 6 },
    ], shots: [0, 1, 4, 5].map((startS) => ({ startS, endS: startS + 1, seen: "", action: "", onScreenText: "" })) });
    await advanceVideo(id, deps);
    await sendAndFinish();
    await approveFrame(ana, id, await firstCandidate(id));
    // Un frame:N histórico aprobado no convierte la nevera corta en entorno largo.
    const { rows: legacy } = await getPool().query(`insert into generations (video_id, user_id, kind, round, status, count, quoted_credits, request)
      select video_id, user_id, 'frame:1', round, status, count, quoted_credits, request from generations where video_id = $1 and kind = 'frame' returning id`, [id]);
    const { rows: approved } = await getPool().query(`insert into generation_results (generation_id, index, job_id, ok, url)
      select $2, index, job_id || '-short', ok, url from generation_results where generation_id = (select id from generations where video_id = $1 and kind = 'frame') returning id`, [id, legacy[0].id]);
    await getPool().query("update videos set tramo_approvals = $2::jsonb where id = $1", [id, JSON.stringify({ "frame:1": approved[0].id })]);
    await getPool().query(`insert into generations (video_id, user_id, kind, round, status, count, quoted_credits, request)
      values ($1, $2, 'clip', 1, 'failed', 1, 0, '{}')`, [id, ana.id]);
    await rejectRound(ana, id, "clip", "Keep the fridge door blue");
    await advanceVideo(id, deps);
    const { rows } = await getPool().query("select request from generations where video_id = $1 and kind = 'clip' and status = 'intent'", [id]);
    expect(rows[0].request.prompt).toContain("Owner correction for this new clip: Keep the fridge door blue");
    expect(rows[0].request.prompt).toContain("From 4s to 5s the shot cuts to open fridge: keep fridge door and the action (take food out) exactly there");
    expect((await getPool().query("select tramo from video_pinterest_refs where video_id = $1", [id])).rows).toEqual([{ tramo: 0 }]);
    expect(rows[0].request.medias.filter((m: {role: string}) => m.role === "image_references")).toHaveLength(3);
  });

});
