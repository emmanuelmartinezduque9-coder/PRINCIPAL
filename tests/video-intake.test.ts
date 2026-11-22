import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HiggsfieldAuthError, HiggsfieldUnavailableError } from "@/connectors/higgsfield/port";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { StepFailedError } from "@/jobs/steps";
import "@/jobs/video-jobs";
import { probeVideo } from "@/server/media/ffmpeg";
import type { AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import { ensureMedia } from "@/server/higgsfield";
import { processReference } from "@/server/videos/intake";
import { videoSweep } from "@/server/videos/sweep";
import { appendChunk, CHUNK_BYTES, finishUpload, startUpload, uploadPath } from "@/server/videos/upload";
import { createVideo, getVideoFor, readVideoFrame, videoView, type Video } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleVideo } from "./helpers/sample-video";

/** ffmpeg real con vídeos de muestra; Higgsfield simulado. */

let dir: string;
const samples: Record<"seis" | "largo" | "corto", string> = { seis: "", largo: "", corto: "" };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-referencia-"));
  for (const [name, seconds] of [["seis", 6], ["largo", 34], ["corto", 1.5]] as const) {
    const sub = path.join(dir, name);
    fs.mkdirSync(sub);
    samples[name] = await makeSampleVideo(sub, { seconds });
  }
}, 120_000);

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

let fake: FakeHiggsfield;
let ana: AuthUser;
let luis: AuthUser;
let v: Video;
const noWait = { sleep: async () => {} };

beforeEach(async () => {
  await truncateAll();
  fake = createFakeHiggsfield();
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  v = await createVideo(ana, (await makeProduct(ana)).id);
  await saveCredential(ana.id, "higgsfield", { accessToken: "a", refreshToken: "r", clientId: "c" }, { needsReconnect: false });
});

/** Sube un archivo por el camino real (trozos y terminar) y devuelve el identificador de la subida. */
async function upload(file: string): Promise<string> {
  const bytes = fs.readFileSync(file);
  const { uploadId } = await startUpload(ana, v.id, { filename: "ref.mp4", totalBytes: bytes.length }, { higgsfield: fake.port });
  for (let i = 0; i * CHUNK_BYTES < bytes.length; i++) {
    await appendChunk(uploadId, i, bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES), { userId: ana.id });
  }
  await finishUpload(uploadId, { userId: ana.id });
  return uploadId;
}

const uploads = () => fake.calls.filter((c) => c.method === "uploadMedia");

describe("preparar la referencia", () => {
  it("procesa la referencia y no se queda con el vídeo", async () => {
    const uploadId = await upload(samples.seis);
    await processReference(v.id, uploadId, { higgsfield: fake.port });
    const video = await getVideoFor(ana, v.id);
    expect(video).toMatchObject({
      referenceStatus: "ready",
      referenceError: null,
      referenceSource: "file",
      referenceMediaId: "media-1",
      referenceWidth: 360,
      referenceHeight: 640,
      segmentDurationMs: video.referenceDurationMs,
    });
    expect(Math.abs(video.referenceDurationMs! - 6000)).toBeLessThan(150);
    const view = await videoView(ana, v.id);
    expect(view.frames).toHaveLength(12); // muestra de 6 s
    expect(view.frames.slice(0, 2)).toEqual([
      { index: 0, timeMs: 0 },
      { index: 1, timeMs: 500 },
    ]);
    expect(video.cutsMs).toHaveLength(2);
    expect(uploads()).toMatchObject([{ userId: ana.id, args: { type: "video", contentType: "video/mp4" } }]);
    expect(fs.existsSync(uploadPath(uploadId))).toBe(false);
    expect(await getDb().select().from(schema.uploadSessions)).toEqual([]);
    const frame = await readVideoFrame(ana, v.id, 3);
    expect(frame.mime).toBe("image/jpeg");
    expect(frame.data.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("de una referencia de más de 30 s solo se usan los primeros 30", async () => {
    const uploadId = await upload(samples.largo);
    await processReference(v.id, uploadId, { higgsfield: fake.port });
    const video = await getVideoFor(ana, v.id);
    expect(video.referenceStatus).toBe("ready");
    expect(video.segmentDurationMs).toBe(30_000);
    expect(video.referenceDurationMs!).toBeGreaterThan(33_000);
    expect((await videoView(ana, v.id)).frames).toHaveLength(24);
    expect(video.cutsMs!.every((ms) => ms > 0 && ms < 30_000)).toBe(true);
    const sent = uploads()[0].args as { bytes: Buffer };
    const clip = path.join(dir, "subido.mp4");
    fs.writeFileSync(clip, sent.bytes);
    expect((await probeVideo(clip)).durationMs).toBeLessThanOrEqual(30_100);
  }, 60_000);

  it("menos de 2 s no sirve", async () => {
    const uploadId = await upload(samples.corto);
    await expect(processReference(v.id, uploadId, { higgsfield: fake.port })).rejects.toBeInstanceOf(StepFailedError);
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "El vídeo de referencia es demasiado corto (mínimo 2 segundos).",
    });
    expect(uploads()).toEqual([]);
    expect(fs.existsSync(uploadPath(uploadId))).toBe(false);
  });

  it("si el permiso de Higgsfield ha caducado, queda en error con el aviso y sin archivo temporal", async () => {
    const uploadId = await upload(samples.seis);
    fake.failNext("uploadMedia", new HiggsfieldAuthError());
    await expect(processReference(v.id, uploadId, { higgsfield: fake.port, ...noWait })).rejects.toBeInstanceOf(StepFailedError);
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    expect(uploads()).toHaveLength(1); // un permiso caducado no se reintenta
    expect(fs.existsSync(uploadPath(uploadId))).toBe(false);
    expect(fs.readdirSync(path.dirname(uploadPath(uploadId))).filter((f) => f.startsWith(uploadId))).toEqual([]);
    expect((await videoView(ana, v.id)).frames).toEqual([]);
  });

  it("si Higgsfield no responde, lo intenta hasta tres veces separadas 5 s", async () => {
    const uploadId = await upload(samples.seis);
    fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    const waits: number[] = [];
    await processReference(v.id, uploadId, { higgsfield: fake.port, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([5000, 5000]);
    expect(uploads()).toHaveLength(3);
    expect(await getVideoFor(ana, v.id)).toMatchObject({ referenceStatus: "ready", referenceMediaId: "media-1" });
  });

  it("tras tres fallos de Higgsfield queda en error", async () => {
    const uploadId = await upload(samples.seis);
    for (let i = 0; i < 3; i++) fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    await expect(processReference(v.id, uploadId, { higgsfield: fake.port, ...noWait })).rejects.toBeInstanceOf(StepFailedError);
    expect(uploads()).toHaveLength(3);
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "Higgsfield no responde. Inténtalo dentro de unos minutos.",
    });
  });

  it("si el archivo temporal ya no está (el servidor se reinició), queda en error y pide subirlo otra vez", async () => {
    const uploadId = await upload(samples.seis);
    fs.rmSync(uploadPath(uploadId));
    await expect(processReference(v.id, uploadId, { higgsfield: fake.port })).rejects.toBeInstanceOf(StepFailedError);
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "La subida se ha interrumpido. Vuelve a elegir el vídeo.",
    });
    expect(uploads()).toEqual([]);
  });

  it("un vídeo nuevo sustituye a los fotogramas del anterior", async () => {
    await processReference(v.id, await upload(samples.largo), { higgsfield: fake.port });
    expect((await videoView(ana, v.id)).frames).toHaveLength(24);
    await processReference(v.id, await upload(samples.seis), { higgsfield: fake.port });
    expect((await videoView(ana, v.id)).frames).toHaveLength(12);
    expect((await getVideoFor(ana, v.id)).referenceMediaId).toBe("media-2");
  }, 60_000);
});

describe("seguimiento", () => {
  it("una referencia que lleva más de una hora «preparándose» queda en error", async () => {
    const reciente = await createVideo(ana, v.productId);
    await getDb().update(schema.videos).set({ referenceStatus: "processing", updatedAt: new Date(Date.now() - 61 * 60_000) }).where(eq(schema.videos.id, v.id));
    await getDb().update(schema.videos).set({ referenceStatus: "processing", updatedAt: new Date(Date.now() - 30 * 60_000) }).where(eq(schema.videos.id, reciente.id));
    await videoSweep();
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "No se pudo preparar el vídeo. Vuelve a subirlo.",
    });
    expect((await getVideoFor(ana, reciente.id)).referenceStatus).toBe("processing");
  });
});

describe("ensureMedia", () => {
  it("ensureMedia sube una vez por persona y archivo", async () => {
    const file = { bytes: Buffer.from("una imagen"), filename: "a.jpg", contentType: "image/jpeg", type: "image" as const };
    expect(await ensureMedia(ana.id, file, { higgsfield: fake.port })).toBe("media-1");
    expect(await ensureMedia(ana.id, { ...file, filename: "otra.jpg" }, { higgsfield: fake.port })).toBe("media-1");
    expect(await ensureMedia(luis.id, file, { higgsfield: fake.port })).toBe("media-2");
    expect(await ensureMedia(ana.id, { ...file, bytes: Buffer.from("otra imagen") }, { higgsfield: fake.port })).toBe("media-3");
    expect(uploads().map((c) => c.userId)).toEqual([ana.id, luis.id, ana.id]);
  });

  it("si la subida falla no apunta nada y la siguiente vez lo vuelve a intentar", async () => {
    const file = { bytes: Buffer.from("una imagen"), filename: "a.jpg", contentType: "image/jpeg", type: "image" as const };
    fake.failNext("uploadMedia", new HiggsfieldUnavailableError());
    await expect(ensureMedia(ana.id, file, { higgsfield: fake.port })).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
    expect(await ensureMedia(ana.id, file, { higgsfield: fake.port })).toBe("media-1");
  });
});
