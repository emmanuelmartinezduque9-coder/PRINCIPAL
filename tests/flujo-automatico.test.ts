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
 * Regla 4 cambiada (Emmanuel, 24/11/2026): una imagen por cada SITIO distinto de la referencia
 * (`tramos.ts`). Con un solo sitio, sigue siendo una. Cada sitio lleva su apertura y su tramo de
 * Motion Transfer, que el montaje empalma; las imágenes del mismo vídeo se revisan juntas.
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
  places: [
    { startS: 0, endS: 2.5, place: "supermarket aisle", action: "Coge la máquina de la estantería", keepObjects: ["shelf"], ownerEnvironment: false, imagePrompt: "", videoPrompt: "" },
    { startS: 2.5, endS: 6, place: "city street", action: "Camina por la calle con la máquina", keepObjects: [], ownerEnvironment: false, imagePrompt: STREET_PROMPT, videoPrompt: STREET_VIDEO },
  ],
};

describe("sitios de la referencia: una apertura y un tramo por sitio", () => {
  /** La referencia entera guardada (hace falta para partirla): 2,5 s rojos (súper) y 3,5 s verdes (calle). */
  async function storedReference(videoId: number): Promise<void> {
    const file = path.join(dir, `referencia-${videoId}.mp4`);
    ffmpeg([
      "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=2.5",
      "-f", "lavfi", "-i", "color=c=green:s=360x640:r=30:d=3.5",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
    ]);
    const key = `referencias/prueba-${videoId}.mp4`;
    await getObjectStore()!.putFile(key, file, { contentType: "video/mp4" });
    await getPool().query("update videos set reference_storage_key = $2 where id = $1", [videoId, key]);
  }

  const kinds = async () => (await generations()).map((g) => [g.kind, g.status]);

  it("vídeo suelto: una imagen por sitio revisadas juntas, un tramo por sitio y el montaje los empalma", async () => {
    const id = await soloVideo();
    await storedReference(id);
    await advanceVideo(id, deps);
    await runQueuedAnalyses(WITH_PLACES);

    // La apertura del primer sitio y, después, la del segundo (de una en una).
    await advanceVideo(id, deps);
    expect(await kinds()).toEqual([["frame", "intent"]]);
    await sendAndFinish();
    await advanceVideo(id, deps);
    expect(await kinds()).toEqual([["frame", "done"], ["frame:1", "intent"]]);
    const { rows } = await getPool().query("select request from generations where kind = 'frame:1'");
    const request = rows[0].request as { prompt: string; medias: Array<{ role: string; value: string }> };
    // Su propio prompt (la calle), su propio fotograma de apertura y sus propias fotos de Pinterest.
    expect(request.prompt).toContain("Berlin pavement");
    expect(request.prompt).not.toContain("chest height. ");
    const { rows: mainRows } = await getPool().query("select request from generations where kind = 'frame'");
    expect(request.medias[0].value).not.toBe((mainRows[0].request as typeof request).medias[0].value);
    expect((await getPool().query("select tramo from video_pinterest_refs where video_id = $1 order by tramo", [id])).rows).toEqual([{ tramo: 0 }, { tramo: 1 }]);

    // Las dos imágenes del vídeo se revisan juntas: nada de pasos ni botones nuevos.
    await sendAndFinish();
    let view = await viewJson(id);
    expect(view.auto).toEqual({ state: "review" });
    expect(view.places).toHaveLength(1);
    expect(view.places![0]).toMatchObject({ tramo: 1, place: "city street", startMs: 2500 });
    expect(view.places![0].frame.current?.results.length).toBe(1);
    const html = visible(render(createElement(StepFrame, { view, onGoToClip: () => {} })));
    expect(html).toContain("Sitio 2");
    expect(html).toContain("city street");

    await approveFrame(ana, id, await firstCandidate(id));
    await advanceVideo(id, deps);
    // Sin la apertura de la calle aprobada, no sale ningún clip.
    expect((await kinds()).some(([kind]) => String(kind).startsWith("clip"))).toBe(false);
    const { rows: street } = await getPool().query(
      "select r.id from generation_results r join generations g on g.id = r.generation_id where g.video_id = $1 and g.kind = 'frame:1'",
      [id],
    );
    await approveFrame(ana, id, street[0].id, "frame:1");
    view = await viewJson(id);
    expect(view.places![0].frame.approvedResultId).toBe(street[0].id);

    // Un tramo de Motion Transfer por sitio, cada uno con el vídeo fuente recortado a su sitio.
    await advanceVideo(id, deps);
    await sendAndFinish();
    await advanceVideo(id, deps);
    const clips = (await getPool().query("select kind, request from generations where kind like 'clip%' order by id")).rows as Array<{
      kind: string;
      request: { model: string; medias: Array<{ role: string; value: string }> };
    }>;
    expect(clips.map((c) => c.kind)).toEqual(["clip", "clip:1"]);
    const sources = clips.map((c) => c.request.medias.find((m) => m.role === "video_references")!.value);
    expect(sources[0]).not.toBe(`ref-${id}`);
    expect(sources[1]).not.toBe(sources[0]);
    expect(clips.every((c) => c.request.model === "hf_mult_motion_control")).toBe(true);
    await sendAndFinish();

    // Topaz por sitio y, con todo hecho, el montaje con los dos tramos para empalmar.
    for (let i = 0; i < 4; i++) {
      await advanceVideo(id, deps);
      await sendAndFinish();
    }
    expect((await kinds()).filter(([kind]) => String(kind).startsWith("upscale"))).toEqual([["upscale", "done"], ["upscale:1", "done"]]);
    await advanceVideo(id, deps);
    const { rows: runs } = await getPool().query("select spec from edit_runs where video_id = $1", [id]);
    expect(runs).toHaveLength(1);
    const parts = (runs[0].spec as { clips: Array<{ parts?: Array<{ durationMs: number }> }> }).clips[0].parts;
    expect(parts?.map((p) => p.durationMs)).toEqual([2500, 3500]);
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

  it("lote: una imagen por sitio en la revisión y el presupuesto cuenta las dos", async () => {
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
    expect(await kinds()).toEqual([["frame", "done"], ["frame:1", "done"]]);
    const estimates = (await getBatchFor(ana, batch.id)).estimates as Record<string, { frame: number }> | null;
    expect(estimates?.[String(video.id)]?.frame).toBe(4);
  });
});
