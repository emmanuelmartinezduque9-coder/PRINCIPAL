import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getHiggsfield } from "@/connectors/higgsfield";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool, setSetting } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import {
  approveFrame,
  buildFrameRequest,
  DEFAULT_IMAGE_MODEL,
  FRAME_CANDIDATES,
  getImageModel,
  IMAGE_MODEL_SETTING,
  rejectFrame,
  setImageModel,
} from "@/server/videos/frame";
import { pollGeneration, quoteGeneration, requestGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import { createVideo, getVideoFor, updateVideoChoices, type Video } from "@/server/videos/videos";
import { POST as aprobarRoute } from "@/app/api/videos/[videoId]/imagen/aprobar/route";
import { POST as generarRoute } from "@/app/api/videos/[videoId]/imagen/generar/route";
import { POST as presupuestoRoute } from "@/app/api/videos/[videoId]/imagen/presupuesto/route";
import { POST as rechazarRoute } from "@/app/api/videos/[videoId]/imagen/rechazar/route";
import { GET as getModelRoute, PUT as putModelRoute } from "@/app/api/ajustes/modelo-imagen/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * Imagen inicial con Higgsfield simulado. Fotos y fotograma son imágenes de verdad (hechas con
 * ffmpeg) porque se guardan comprobando su formato; las descargas de resultados van por un
 * `fetch` falso que devuelve un JPEG.
 */

const PROMPT =
  "Image 1 sets the composition and the framing. The woman is the person from image 2. " +
  "She holds the bottle from image 3 at chest height. The kitchen is the one from image 4.";

let dir: string;
let jpeg: Buffer;
let png: Buffer;
let frameJpeg: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;

let dueno: AuthUser;
let ana: AuthUser;
let producto: Product;
let v: Video;
const ids = { avatar: 0, articulo: 0, entorno: 0 };

function makeImage(name: string, color: string): Buffer {
  const file = path.join(dir, name);
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=360x640`, "-frames:v", "1", file]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
  return fs.readFileSync(file);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-imagen-inicial-"));
  jpeg = makeImage("foto.jpg", "red");
  png = makeImage("entorno.png", "green");
  frameJpeg = makeImage("fotograma.jpg", "blue");
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
  const fakeFetch = (async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { "Content-Type": "image/jpeg" } })) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };

  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "BrilloMax" });
  // El avatar se sube después del artículo: el orden lo pone el manifiesto, no la subida.
  ids.articulo = (await addProductPhoto(ana, producto.id, jpeg, "articulo")).id;
  ids.avatar = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("avatar")]), "avatar")).id;
  ids.entorno = (await addProductPhoto(ana, producto.id, png, "entorno")).id;
  v = await createVideo(ana, producto.id);
  await updateVideoChoices(ana, v.id, { avatarPhotoId: ids.avatar, environmentPhotoId: ids.entorno });
  await analysed(v.id, PROMPT);
  v = await getVideoFor(ana, v.id);
});

// ───────────────────────── Ayudas ─────────────────────────

/** Deja el vídeo con la referencia lista (fotograma 0 y recorte `ref-1`), un desglose hecho y el prompt de imagen. */
async function analysed(videoId: number, prompt: string | null, analysisReference = "ref-1"): Promise<void> {
  const pool = getPool();
  await pool.query("update videos set reference_status = 'ready', reference_media_id = 'ref-1', image_prompt = $2 where id = $1", [videoId, prompt]);
  await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [
    videoId,
    frameJpeg.length,
    frameJpeg,
  ]);
  await pool.query(
    "insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, 'done', $2, $3)",
    [videoId, analysisReference, ana.id],
  );
}

const uploads = () => fake.calls.filter((c) => c.method === "uploadMedia").map((c) => c.args as { filename: string; contentType: string; type: string; bytes: Buffer });

async function as(user: AuthUser): Promise<void> {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
}

const params = (videoId: number) => ({ params: Promise.resolve({ videoId: String(videoId) }) });
const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Pide, envía y termina una ronda de imagen; devuelve el id de su primer resultado. */
async function frameDone(): Promise<number> {
  const { generationId } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
  await submitGeneration(generationId, deps);
  for (const jobId of Object.keys(fake.state.jobs)) {
    fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: [`https://cdn.test/${jobId}.png`] };
  }
  await getPool().query("update generations set last_polled_at = null where id = $1", [generationId]);
  await pollGeneration(generationId, deps);
  const { rows } = await getPool().query("select id from generation_results where generation_id = $1 order by index", [generationId]);
  return rows[0].id;
}

async function insertClip(status: string): Promise<void> {
  await getPool().query(
    "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'clip', 1, $2, $3, '{}', 1, 30)",
    [v.id, status, ana.id],
  );
}

const approvedOf = async () => (await getVideoFor(ana, v.id)).approvedFrameResultId;

// ───────────────────────── La petición ─────────────────────────

describe("petición de la imagen inicial", () => {
  it("la petición lleva el modelo por defecto, 2K vertical y las referencias en el orden del manifiesto", async () => {
    const { request, count } = await buildFrameRequest(ana, v, deps);
    expect(count).toBe(FRAME_CANDIDATES);
    expect(count).toBe(2);
    // Composición, avatar, artículo y entorno, en ese orden.
    const manifestMediaIds = ["media-1", "media-2", "media-3", "media-4"];
    expect(request).toEqual({
      model: "nano_banana_2_1",
      prompt: v.imagePrompt,
      aspectRatio: "9:16",
      resolution: "2k",
      medias: manifestMediaIds.map((value) => ({ role: "image_references", value })),
    });
    expect(DEFAULT_IMAGE_MODEL).toBe("nano_banana_2_1");
    expect(uploads().map(({ filename, contentType, type }) => ({ filename, contentType, type }))).toEqual([
      { filename: `fotograma-${v.id}.jpg`, contentType: "image/jpeg", type: "image" },
      { filename: `foto-${ids.avatar}.jpg`, contentType: "image/jpeg", type: "image" },
      { filename: `foto-${ids.articulo}.jpg`, contentType: "image/jpeg", type: "image" },
      { filename: `foto-${ids.entorno}.png`, contentType: "image/png", type: "image" },
    ]);
    // Tal como están guardados.
    expect(uploads()[0].bytes.equals(frameJpeg)).toBe(true);
    expect(uploads()[3].bytes.equals(png)).toBe(true);
    // Se suben al Higgsfield de quien creó el vídeo.
    expect(fake.calls.every((c) => c.userId === ana.id)).toBe(true);
  });

  it("con el ajuste en Nano Banana Pro cambia el modelo y sigue pidiendo 2K", async () => {
    await setImageModel(dueno, "nano_banana_pro");
    const { request } = await buildFrameRequest(ana, v, deps);
    expect(request).toMatchObject({ model: "nano_banana_pro", resolution: "2k", aspectRatio: "9:16" });
  });

  it("las fotos se suben una vez aunque se regenere", async () => {
    await buildFrameRequest(ana, v, deps);
    const { request } = await buildFrameRequest(ana, v, deps);
    expect(uploads()).toHaveLength(4);
    expect(request.medias.map((m) => m.value)).toEqual(["media-1", "media-2", "media-3", "media-4"]);
  });

  it("un prompt con errores no deja pedir precio ni sube nada", async () => {
    await getPool().query("update videos set image_prompt = $2 where id = $1", [v.id, `${PROMPT} Soft bokeh behind her.`]);
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({
      status: 400,
      message: "Quita «bokeh»: es una palabra vetada.",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("sin desglose hecho no hay imagen", async () => {
    const otro = await createVideo(ana, producto.id);
    await expect(quoteGeneration(ana, otro.id, "frame", deps)).rejects.toMatchObject({ status: 400, message: "Haz primero el desglose." });

    // Un prompt escrito a mano sin desglose tampoco vale.
    const aMano = await createVideo(ana, producto.id);
    await getPool().query("update videos set reference_status = 'ready', reference_media_id = 'ref-1', image_prompt = $2 where id = $1", [aMano.id, PROMPT]);
    await expect(quoteGeneration(ana, aMano.id, "frame", deps)).rejects.toMatchObject({ status: 400, message: "Haz primero el desglose." });

    // Ni un desglose de una referencia anterior.
    const viejo = await createVideo(ana, producto.id);
    await analysed(viejo.id, PROMPT, "ref-anterior");
    await expect(quoteGeneration(ana, viejo.id, "frame", deps)).rejects.toMatchObject({ status: 400, message: "Haz primero el desglose." });

    expect(fake.calls).toHaveLength(0);
  });
});

// ───────────────────────── Aprobar y rechazar ─────────────────────────

describe("aprobar y rechazar la imagen", () => {
  it("aprobar marca la imagen del vídeo; rechazar la quita", async () => {
    const resultId = await frameDone();
    await approveFrame(ana, v.id, resultId);
    expect(await approvedOf()).toBe(resultId);

    await rejectFrame(ana, v.id, "La botella sale torcida");
    expect(await approvedOf()).toBeNull();
    const { rows } = await getPool().query("select reject_reason from generations where kind = 'frame'");
    expect(rows[0].reject_reason).toBe("La botella sale torcida");
  });

  it("con un clip ya enviado no se puede cambiar la imagen aprobada", async () => {
    const resultId = await frameDone();
    await approveFrame(ana, v.id, resultId);
    await insertClip("not_sent"); // no llegó: no cuenta
    await approveFrame(ana, v.id, resultId);

    await insertClip("submitted");
    const sent = { status: 409, message: "Ya se ha generado un clip con esta imagen." };
    await expect(approveFrame(ana, v.id, resultId)).rejects.toMatchObject(sent);
    await expect(rejectFrame(ana, v.id, "Otra luz")).rejects.toMatchObject(sent);
    expect(await approvedOf()).toBe(resultId);
  });

  it("también cuenta un clip apuntado, enviándose, en duda o ya generado", async () => {
    const resultId = await frameDone();
    await approveFrame(ana, v.id, resultId);
    for (const status of ["intent", "submitting", "unknown", "done"]) {
      await getPool().query("delete from generations where kind = 'clip'");
      await insertClip(status);
      await expect(rejectFrame(ana, v.id, "Otra luz"), status).rejects.toMatchObject({ status: 409 });
      await expect(approveFrame(ana, v.id, resultId), status).rejects.toMatchObject({ status: 409 });
    }
  });

  it("un clip fallido no ata la imagen: se puede aprobar otra o rechazarla", async () => {
    const resultId = await frameDone();
    await approveFrame(ana, v.id, resultId);
    await insertClip("failed");
    const { rows } = await getPool().query("select id from generation_results where ok order by id");
    await approveFrame(ana, v.id, rows[1].id);
    expect(await approvedOf()).toBe(rows[1].id);
    await rejectFrame(ana, v.id, "Con esta luz el clip no sale");
    expect(await approvedOf()).toBeNull();
  });

  it("solo quien creó el vídeo aprueba o rechaza: el dueño recibe 403 y quien no tiene el producto, 404", async () => {
    const resultId = await frameDone();
    const luis = await makeUser("colaborador");
    for (const call of [(u: AuthUser) => approveFrame(u, v.id, resultId), (u: AuthUser) => rejectFrame(u, v.id, "No me gusta")]) {
      await expect(call(dueno)).rejects.toMatchObject({ status: 403 });
      await expect(call(luis)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    }
    expect(await approvedOf()).toBeNull();
    const { rows } = await getPool().query("select reject_reason from generations where kind = 'frame'");
    expect(rows[0].reject_reason).toBeNull();
  });
});

// ───────────────────────── Modelo de imagen ─────────────────────────

describe("modelo de imagen", () => {
  it("solo el dueño cambia el modelo de imagen, y solo a uno de la lista", async () => {
    expect(await getImageModel()).toBe("nano_banana_2_1");
    await expect(setImageModel(ana, "nano_banana_pro")).rejects.toMatchObject({ status: 403 });
    await expect(setImageModel(dueno, "otro")).rejects.toMatchObject({ status: 400, message: "Modelo de imagen no disponible." });
    expect(await getImageModel()).toBe("nano_banana_2_1");
    await setImageModel(dueno, "nano_banana_pro");
    expect(await getImageModel()).toBe("nano_banana_pro");
  });

  it("un valor guardado que ya no está en la lista vuelve al modelo por defecto", async () => {
    await setSetting(IMAGE_MODEL_SETTING, "nano_banana_viejo");
    expect(await getImageModel()).toBe("nano_banana_2_1");
  });

  it("GET lo ve cualquiera con sesión; PUT solo el dueño", async () => {
    await as(ana);
    const seen = await (await getModelRoute()).json();
    expect(seen).toEqual({
      model: "nano_banana_2_1",
      models: [
        { id: "nano_banana_pro", name: "Nano Banana Pro" },
        { id: "nano_banana_2_1", name: "Nano Banana 2.1" },
      ],
    });
    const put = (model: unknown) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ model }) });
    expect((await putModelRoute(put("nano_banana_pro"))).status).toBe(403);
    await as(dueno);
    expect(await (await putModelRoute(put(7))).json()).toEqual({ error: "Modelo de imagen no disponible." });
    const changed = await putModelRoute(put("nano_banana_pro"));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ model: "nano_banana_pro" });
    expect(await getImageModel()).toBe("nano_banana_pro");
  });
});

// ───────────────────────── Rutas ─────────────────────────

describe("rutas de la imagen", () => {
  it("presupuesto, generar, aprobar y rechazar por la API (modo local simulado)", async () => {
    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    const local = getHiggsfield();
    await as(ana);

    const quote = await presupuestoRoute(post({}), params(v.id));
    expect(quote.status).toBe(200);
    const priced = await quote.json();
    expect(priced).toMatchObject({ credits: 4, enough: true, round: 1 });

    expect((await generarRoute(post({ expectedCredits: "4" }), params(v.id))).status).toBe(400);
    const sent = await generarRoute(post({ expectedCredits: priced.credits }), params(v.id));
    expect(sent.status).toBe(202);
    const { generationId } = await sent.json();
    await submitGeneration(generationId, { higgsfield: local, fetch: deps.fetch }); // primera consulta: pendientes
    await getPool().query("update generations set last_polled_at = null where id = $1", [generationId]);
    await pollGeneration(generationId, { higgsfield: local, fetch: deps.fetch }); // segunda: terminadas
    const { rows } = await getPool().query("select id from generation_results where generation_id = $1 order by index", [generationId]);

    expect((await aprobarRoute(post({ resultId: "x" }), params(v.id))).status).toBe(404);
    const approved = await aprobarRoute(post({ resultId: rows[1].id }), params(v.id));
    expect(approved.status).toBe(200);
    expect(await approvedOf()).toBe(rows[1].id);

    expect((await rechazarRoute(post({ reason: "" }), params(v.id))).status).toBe(400);
    expect((await rechazarRoute(post({ reason: "Sale borrosa" }), params(v.id))).status).toBe(200);
    expect(await approvedOf()).toBeNull();

    await as(dueno); // ve el vídeo pero no lo creó: no genera con el Higgsfield de otra persona
    expect((await presupuestoRoute(post({}), params(v.id))).status).toBe(403);
    expect((await presupuestoRoute(post({}), { params: Promise.resolve({ videoId: "abc" }) })).status).toBe(404);
  });
});
