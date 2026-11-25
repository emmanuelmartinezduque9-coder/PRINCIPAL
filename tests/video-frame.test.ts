import { spawnSync } from "node:child_process";
import { ownerEnvironmentParagraph } from "@/server/videos/pinterest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getHiggsfield, HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "@/connectors/higgsfield";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool, setSetting } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import {
  approveFrame,
  buildFrameRequest,
  DEFAULT_FRAME_COUNT,
  DEFAULT_IMAGE_MODEL,
  getImageModel,
  IMAGE_MODEL_SETTING,
  rejectFrame,
  setImageModel, NO_PEOPLE_PICTURES } from "@/server/videos/frame";
import { finalizeGeneration, quoteGeneration, requestGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import { createVideo, getVideoFor, updateVideoChoices, type Video } from "@/server/videos/videos";
import { POST as aprobarRoute } from "@/app/api/videos/[videoId]/imagen/aprobar/route";
import { POST as generarRoute } from "@/app/api/videos/[videoId]/imagen/generar/route";
import { POST as presupuestoRoute } from "@/app/api/videos/[videoId]/imagen/presupuesto/route";
import { POST as rechazarRoute } from "@/app/api/videos/[videoId]/imagen/rechazar/route";
import { GET as getModelRoute, PUT as putModelRoute } from "@/app/api/ajustes/modelo-imagen/route";
import { makeProduct, makeUser, TEST_PASSWORD, seedanceByDefault } from "./helpers/fixtures";
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


// Pruebas del flujo de Seedance (antes de poder elegir el modelo del clip).
seedanceByDefault();
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
  await finalizeGeneration(generationId, deps);
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
    // Regla fija del dueño: una imagen por vídeo salvo que pida más.
    expect(count).toBe(DEFAULT_FRAME_COUNT);
    expect(count).toBe(1);
    // Composición, avatar, artículo y entorno, en ese orden.
    const manifestMediaIds = ["media-1", "media-2", "media-3", "media-4"];
    expect(request).toEqual({
      model: "nano_banana_2_1",
      // La foto de entorno que elige el dueño manda (conserva todos sus objetos) y, siempre, la regla fija
      // de fondos sin personas al final.
      prompt: `${v.imagePrompt!.trim()}\n\n${ownerEnvironmentParagraph("image 4")} ${NO_PEOPLE_PICTURES}`,
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

  it("una preferencia aprendida de su producto va al final del prompt que se envía, y aprobar la imagen sube su peso", async () => {
    const { rows } = await getPool().query(
      "insert into learned_preferences (key, scope, scope_value, stages, directive, directive_en, polarity, topic, supports, weight) values ('fondo-real:producto', 'producto', $1, '{imagen}', 'Calle real, sin estudio.', 'Use a real street, never a studio background.', 1, 'fondo-real', 2, 0.75) returning id",
      [String(producto.id)],
    );
    const { request } = await buildFrameRequest(ana, v, deps);
    expect((request as { prompt: string }).prompt).toMatch(/Use a real street, never a studio background\.$/);
    const applied = await getPool().query("select video_id, stage, outcome from preference_applications where preference_id = $1", [rows[0].id]);
    expect(applied.rows).toEqual([{ video_id: v.id, stage: "imagen", outcome: null }]);
    await approveFrame(ana, v.id, await frameDone());
    const after = await getPool().query("select weight from learned_preferences where id = $1", [rows[0].id]);
    expect(after.rows[0].weight).toBeGreaterThan(0.75);
    const settled = await getPool().query("select outcome from preference_applications where preference_id = $1", [rows[0].id]);
    expect(settled.rows[0].outcome).toBe("aprobado");
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

  it("si las indicaciones cambian después del desglose (tipo, cambios, adaptación o quién sale), no hay imagen hasta repetirlo", async () => {
    const message = "Las indicaciones del vídeo cambiaron; repite el desglose.";
    const changes: Array<Record<string, unknown>> = [
      { note: "Más luz" },
      { kind: "adaptacion_concepto", adaptation: "Otra idea" },
      { avatarMode: "nadie" },
    ];
    for (const change of changes) {
      await updateVideoChoices(ana, v.id, change);
      await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 400, message });
      await getPool().query("update videos set note = null, kind = 'replicar', adaptation = null, avatar_mode = 'elegido', avatar_photo_id = $2 where id = $1", [
        v.id,
        ids.avatar,
      ]);
    }
    expect(fake.calls).toHaveLength(0);
    // Una adaptación guardada con «Replicar» no cuenta: no se usa.
    await getPool().query("update videos set adaptation = 'guardada' where id = $1", [v.id]);
    await expect(quoteGeneration(ana, v.id, "frame", deps)).resolves.toBeDefined();
  });

  it("con «sin sustitución» no va ninguna foto de avatar: solo composición, artículo y entorno", async () => {
    await updateVideoChoices(ana, v.id, { avatarMode: "sin_sustitucion" });
    await getPool().query("update video_analyses set avatar_mode = 'sin_sustitucion' where video_id = $1", [v.id]);
    v = await getVideoFor(ana, v.id);
    await getPool().query("update videos set image_prompt = $2 where id = $1", [v.id, PROMPT.replace(/image 2/gi, "the scene")]);
    v = await getVideoFor(ana, v.id);
    const { request } = await buildFrameRequest(ana, v, deps);
    expect(request.medias).toHaveLength(3);
    expect(uploads().map((u) => u.filename)).toEqual([`fotograma-${v.id}.jpg`, `foto-${ids.articulo}.jpg`, `foto-${ids.entorno}.png`]);
  });

  it("si las indicaciones del lote cambian mientras se presupuesta, 409 y no se apunta nada", async () => {
    const pool = getPool();
    const { rows } = await pool.query("insert into batches (name, created_by) values ('Lote', $1) returning id", [ana.id]);
    await pool.query("update videos set batch_id = $2 where id = $1", [v.id, rows[0].id]);
    const racing: GenDeps = {
      ...deps,
      higgsfield: {
        ...fake.port,
        async quoteImages(userId, request, count) {
          // No es una columna del vídeo: la instantánea no lo ve, pero el desglose deja de valer.
          await pool.query("insert into batch_products (batch_id, product_id, notes) values ($1, $2, 'De noche')", [rows[0].id, producto.id]);
          return fake.port.quoteImages(userId, request, count);
        },
      },
    };
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, racing)).rejects.toMatchObject({
      status: 409,
      message: "El vídeo ha cambiado mientras se preparaba el envío. Vuelve a intentarlo.",
    });
    expect((await pool.query("select count(*)::int as n from generations")).rows[0].n).toBe(0);
  });

  it("si el prompt o el avatar cambian mientras se presupuesta (otra pestaña), 409 y no se apunta nada", async () => {
    const changes = [
      "update videos set image_prompt = image_prompt || ' More light.' where id = $1",
      "update videos set avatar_photo_id = null where id = $1",
    ];
    for (const change of changes) {
      let done = false;
      const racing: GenDeps = {
        ...deps,
        higgsfield: {
          ...fake.port,
          async quoteImages(userId, request, count) {
            if (!done) {
              done = true;
              await getPool().query(change, [v.id]);
            }
            return fake.port.quoteImages(userId, request, count);
          },
        },
      };
      await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, racing)).rejects.toMatchObject({
        status: 409,
        message: "El vídeo ha cambiado mientras se preparaba el envío. Vuelve a intentarlo.",
      });
      await getPool().query("update videos set image_prompt = $2, avatar_photo_id = $3 where id = $1", [v.id, PROMPT, ids.avatar]);
    }
    const { rows } = await getPool().query("select count(*)::int as n from generations");
    expect(rows[0].n).toBe(0);
  });
});

describe("Higgsfield falla al subir las referencias de la imagen", () => {
  const CONNECT = "higgsfield_connect";
  const noGenerations = async () => (await getPool().query("select count(*)::int as n from generations")).rows[0].n;

  it("con la conexión caducada o sin conectar, 409 con el código para ir a Ajustes; nada presupuestado ni apuntado", async () => {
    fake.failNext("uploadMedia", new HiggsfieldAuthError());
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({
      status: 409,
      code: CONNECT,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    fake.failNext("uploadMedia", new HiggsfieldNotConnectedError());
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      code: CONNECT,
      message: "Conecta tu Higgsfield en Ajustes.",
    });
    expect(fake.calls.map((c) => c.method)).toEqual(["uploadMedia", "uploadMedia"]);
    expect(await noGenerations()).toBe(0);
  });

  it("con Higgsfield caído al subir, 503 con su mensaje", async () => {
    fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({
      status: 503,
      message: "Higgsfield no responde. Inténtalo dentro de unos minutos.",
    });
    expect(fake.calls.some((c) => c.method === "quoteImages")).toBe(false);
  });

  it("por la API, sin Higgsfield conectado la primera subida da 409 con el código, nunca 500", async () => {
    // Sin `deps` ni modo simulado: el conector real ve que no hay conexión antes de salir a la red.
    await as(ana);
    for (const route of [presupuestoRoute, generarRoute]) {
      const response = await route(post({ expectedCredits: 4 }), params(v.id));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Conecta tu Higgsfield en Ajustes.", code: CONNECT });
    }
    expect(await noGenerations()).toBe(0);
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

  it("un clip apuntado mientras se rechaza o aprueba la imagen se ve: la comprobación va con el cerrojo del vídeo", async () => {
    const resultId = await frameDone();
    await approveFrame(ana, v.id, resultId);
    const sent = { status: 409, message: "Ya se ha generado un clip con esta imagen." };
    const waitingForLock = async () => {
      for (let i = 0; i < 200; i++) {
        const { rows } = await getPool().query("select count(*)::int as n from pg_locks where locktype = 'advisory' and classid = $1 and objid = $2 and not granted",
          [0x5647454e, v.id],
        );
        if (rows[0].n > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("No llegó a esperar al cerrojo.");
    };

    for (const change of [() => rejectFrame(ana, v.id, "Otra luz"), () => approveFrame(ana, v.id, resultId)]) {
      await getPool().query("delete from generations where kind = 'clip'");
      // Otra petición tiene el cerrojo del vídeo (como al apuntar un clip) y apunta su clip mientras tanto.
      const other = await getPool().connect();
      try {
        await other.query("begin");
        await other.query("select pg_advisory_xact_lock($1::int, $2::int)", [0x5647454e, v.id]);
        const pending = change();
        pending.catch(() => {});
        await waitingForLock();
        await other.query(
          "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'clip', 1, 'intent', $2, '{}', 1, 18)",
          [v.id, ana.id],
        );
        await other.query("commit");
        await expect(pending).rejects.toMatchObject(sent);
      } finally {
        other.release();
      }
    }
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
    // Dos imágenes porque así lo pide la tarjeta (por defecto es una).
    await getPool().query("update videos set frame_count = 2 where id = $1", [v.id]);
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
    // Dos imágenes porque así lo pide la tarjeta (por defecto es una).
    await getPool().query("update videos set frame_count = 2 where id = $1", [v.id]);

    const quote = await presupuestoRoute(post({}), params(v.id));
    expect(quote.status).toBe(200);
    const priced = await quote.json();
    expect(priced).toMatchObject({ credits: 4, enough: true, round: 1 });

    expect((await generarRoute(post({ expectedCredits: "4" }), params(v.id))).status).toBe(400);
    const sent = await generarRoute(post({ expectedCredits: priced.credits }), params(v.id));
    expect(sent.status).toBe(202);
    const { generationId } = await sent.json();
    const localDeps = { higgsfield: local, fetch: deps.fetch };
    await submitGeneration(generationId, localDeps);
    // El simulado del modo local termina cada trabajo a la segunda consulta: se finaliza hasta que acaba.
    for (let i = 0; i < 3; i++) await finalizeGeneration(generationId, localDeps);
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
