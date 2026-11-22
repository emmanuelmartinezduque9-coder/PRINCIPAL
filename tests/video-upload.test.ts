import fs from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { jobKey } from "@/jobs/steps";
import "@/jobs/video-jobs";
import type { AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import {
  appendChunk,
  CHUNK_BYTES,
  cleanStaleUploads,
  finishUpload,
  startUpload,
  uploadPath,
  uploadProgress,
} from "@/server/videos/upload";
import { createVideo, getVideoFor, type Video } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/** Cabecera MP4 (caja `ftyp` con marca `isom`) seguida de relleno. */
const mp4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 7)]);
const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100)]);

const fake = createFakeHiggsfield();
const deps = { higgsfield: fake.port };

let ana: AuthUser;
let luis: AuthUser;
let dueno: AuthUser;
let v: Video;

async function connect(user: AuthUser, meta: Record<string, unknown> = {}) {
  await saveCredential(user.id, "higgsfield", { accessToken: "a", refreshToken: "r", clientId: "c" }, { needsReconnect: false, ...meta });
}

const sessionRows = () => getDb().select().from(schema.uploadSessions);

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  const producto = await makeProduct(ana);
  v = await createVideo(ana, producto.id);
  await connect(ana);
});

afterAll(async () => {
  await stopWorker();
});

describe("empezar una subida", () => {
  it("rechaza de entrada más de 100 MB", async () => {
    await expect(startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 * 1024 * 1024 + 1 }, deps)).rejects.toMatchObject({
      status: 400,
      message: "El vídeo pesa demasiado (máximo 100 MB).",
    });
    for (const totalBytes of [0, -1, 1.5, Number.NaN]) {
      await expect(startUpload(ana, v.id, { filename: "a.mp4", totalBytes }, deps)).rejects.toMatchObject({ status: 400 });
    }
    expect(await sessionRows()).toEqual([]);
  });

  it("sin Higgsfield conectado no deja empezar", async () => {
    const otroVideo = await createVideo(luis, (await makeProduct(luis)).id);
    await expect(startUpload(luis, otroVideo.id, { filename: "a.mp4", totalBytes: 10 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Conecta primero tu Higgsfield en Ajustes.",
    });
    await connect(luis, { needsReconnect: true });
    await expect(startUpload(luis, otroVideo.id, { filename: "a.mp4", totalBytes: 10 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
  });

  it("solo quien creó el vídeo sube su referencia; quien no lo ve recibe 404", async () => {
    await connect(dueno);
    await expect(startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 10 }, deps)).rejects.toMatchObject({ status: 403 });
    await connect(luis);
    await expect(startUpload(luis, v.id, { filename: "a.mp4", totalBytes: 10 }, deps)).rejects.toMatchObject({
      status: 404,
      message: "Vídeo no encontrado.",
    });
  });

  it("devuelve un identificador imposible de adivinar y el tamaño de los trozos; el vídeo pasa a «subiendo»", async () => {
    const { uploadId, chunkBytes } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 2 * CHUNK_BYTES + 10 }, deps);
    expect(uploadId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(chunkBytes).toBe(CHUNK_BYTES);
    expect((await getVideoFor(ana, v.id)).referenceStatus).toBe("uploading");
    expect(await uploadProgress(uploadId, { userId: ana.id })).toEqual({ received: 0, totalChunks: 3 });
  });

  it("empezar otra subida del mismo vídeo descarta la anterior y su archivo", async () => {
    const primera = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 }, deps);
    await appendChunk(primera.uploadId, 0, mp4(100), { userId: ana.id });
    const segunda = await startUpload(ana, v.id, { filename: "b.mp4", totalBytes: 100 }, deps);
    expect(fs.existsSync(uploadPath(primera.uploadId))).toBe(false);
    expect((await sessionRows()).map((s) => s.id)).toEqual([segunda.uploadId]);
  });
});

describe("trozos", () => {
  const actor = () => ({ userId: ana.id });

  it("el formato lo decide el contenido del primer trozo, no el nombre", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: PDF_BYTES.length }, deps);
    await expect(appendChunk(id, 0, PDF_BYTES, { userId: ana.id })).rejects.toMatchObject({
      status: 400,
      message: "Formato de vídeo no admitido. Usa MP4, MOV o WebM.",
    });
    expect(fs.existsSync(uploadPath(id))).toBe(false);
  });

  it("un trozo repetido (se perdió la respuesta) no se guarda dos veces", async () => {
    const CHUNK = mp4(CHUNK_BYTES);
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mov", totalBytes: CHUNK_BYTES + 100 }, deps);
    expect(await appendChunk(id, 0, CHUNK, actor())).toEqual({ received: 1 });
    expect(await appendChunk(id, 0, CHUNK, actor())).toEqual({ received: 1 });
    expect(fs.statSync(uploadPath(id)).size).toBe(CHUNK.length);
    const [row] = await sessionRows();
    expect(row).toMatchObject({ received: 1, mime: "video/mp4" });
  });

  it("dos envíos a la vez del mismo trozo solo escriben uno", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 1000 }, deps);
    const results = await Promise.all([appendChunk(id, 0, mp4(1000), actor()), appendChunk(id, 0, mp4(1000), actor())]);
    expect(results).toEqual([{ received: 1 }, { received: 1 }]);
    expect(fs.statSync(uploadPath(id)).size).toBe(1000);
  });

  it("un trozo adelantado se rechaza y el progreso dice desde dónde seguir", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 2 * CHUNK_BYTES + 10 }, deps);
    await appendChunk(id, 0, mp4(CHUNK_BYTES), actor());
    await expect(appendChunk(id, 2, Buffer.alloc(10), actor())).rejects.toMatchObject({ status: 409, message: "Faltan trozos anteriores." });
    expect(await uploadProgress(id, actor())).toEqual({ received: 1, totalChunks: 3 });
  });

  it("un trozo de tamaño equivocado o con índice imposible no se acepta", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: CHUNK_BYTES + 10 }, deps);
    await expect(appendChunk(id, 0, mp4(1000), actor())).rejects.toMatchObject({ status: 400 });
    await appendChunk(id, 0, mp4(CHUNK_BYTES), actor());
    await expect(appendChunk(id, 1, Buffer.alloc(11), actor())).rejects.toMatchObject({ status: 400 });
    for (const index of [2, -1, 0.5, Number.NaN]) {
      await expect(appendChunk(id, index, Buffer.alloc(10), actor())).rejects.toMatchObject({ status: 400 });
    }
    expect(fs.statSync(uploadPath(id)).size).toBe(CHUNK_BYTES);
  });

  it("si el servidor se reinició y el archivo ya no está, lo dice claro", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: CHUNK_BYTES + 10 }, deps);
    await appendChunk(id, 0, mp4(CHUNK_BYTES), actor());
    fs.rmSync(uploadPath(id));
    const GONE = { status: 410, message: "La subida se ha interrumpido. Vuelve a elegir el vídeo." };
    await expect(uploadProgress(id, actor())).rejects.toMatchObject(GONE);
    await expect(appendChunk(id, 1, Buffer.alloc(10), actor())).rejects.toMatchObject(GONE);
    await expect(finishUpload(id, actor())).rejects.toMatchObject(GONE);
  });

  it("si quedó medio trozo escrito de un intento anterior, se recorta antes de seguir", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: CHUNK_BYTES + 10 }, deps);
    await appendChunk(id, 0, mp4(CHUNK_BYTES), actor());
    fs.appendFileSync(uploadPath(id), Buffer.alloc(5));
    expect(await appendChunk(id, 1, Buffer.alloc(10), actor())).toEqual({ received: 2 });
    expect(fs.statSync(uploadPath(id)).size).toBe(CHUNK_BYTES + 10);
  });

  it("otra persona no puede añadir trozos a la subida de Ana", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 }, deps);
    const NOT_FOUND = { status: 404, message: "Subida no encontrada." };
    await expect(appendChunk(id, 0, mp4(100), { userId: luis.id })).rejects.toMatchObject(NOT_FOUND);
    await expect(uploadProgress(id, { userId: luis.id })).rejects.toMatchObject(NOT_FOUND);
    await expect(finishUpload(id, { userId: luis.id })).rejects.toMatchObject(NOT_FOUND);
    await expect(appendChunk(id, 0, mp4(100), { agentTaskId: 1 })).rejects.toMatchObject(NOT_FOUND);
    // Con el id de otro vídeo (aunque también sea de Ana), la subida no existe.
    const otro = await createVideo(ana, v.productId);
    await expect(appendChunk(id, 0, mp4(100), { userId: ana.id }, otro.id)).rejects.toMatchObject(NOT_FOUND);
    await expect(uploadProgress(id, { userId: ana.id }, otro.id)).rejects.toMatchObject(NOT_FOUND);
    await expect(finishUpload(id, { userId: ana.id }, otro.id)).rejects.toMatchObject(NOT_FOUND);
    expect(await uploadProgress(id, { userId: ana.id }, v.id)).toEqual({ received: 0, totalChunks: 1 });
    for (const bad of ["../../etc/passwd", "x", ""]) {
      await expect(uploadProgress(bad, { userId: ana.id })).rejects.toMatchObject(NOT_FOUND);
    }
    expect(fs.existsSync(uploadPath(id))).toBe(false);
  });
});

describe("terminar", () => {
  it("terminar con menos bytes de los anunciados no se acepta", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: CHUNK_BYTES + 10 }, deps);
    await appendChunk(id, 0, mp4(CHUNK_BYTES), { userId: ana.id });
    await expect(finishUpload(id, { userId: ana.id })).rejects.toMatchObject({
      status: 400,
      message: "El vídeo no ha llegado entero. Inténtalo de nuevo.",
    });
    expect((await getVideoFor(ana, v.id)).referenceStatus).toBe("uploading");
  });

  it("encola la preparación una sola vez aunque se pulse dos veces", async () => {
    const { uploadId: id } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 }, deps);
    await appendChunk(id, 0, mp4(100), { userId: ana.id });
    await finishUpload(id, { userId: ana.id });
    await finishUpload(id, { userId: ana.id });
    const video = await getVideoFor(ana, v.id);
    expect(video.referenceStatus).toBe("processing");
    const key = jobKey("video.referencia", ana.id, video.productId, { videoId: v.id, uploadId: id });
    const jobs = await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"));
    expect(jobs.map((j) => [j.key, j.status])).toEqual([[key, "queued"]]);
    // Mientras se prepara no se puede empezar otra subida.
    await expect(startUpload(ana, v.id, { filename: "b.mp4", totalBytes: 100 }, deps)).rejects.toMatchObject({ status: 409 });
    // Y ya no admite más trozos nuevos.
    await expect(appendChunk(id, 1, Buffer.alloc(10), { userId: ana.id })).rejects.toMatchObject({ status: 400 });
  });
});

describe("a la vez", () => {
  it("terminar y empezar otra subida del mismo vídeo a la vez no se bloquean entre sí", async () => {
    for (let round = 0; round < 5; round++) {
      await getDb().update(schema.videos).set({ referenceStatus: "none" }).where(eq(schema.videos.id, v.id));
      const { uploadId } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 }, deps);
      await appendChunk(uploadId, 0, mp4(100), { userId: ana.id });
      const results = await Promise.allSettled([
        finishUpload(uploadId, { userId: ana.id }),
        startUpload(ana, v.id, { filename: "b.mp4", totalBytes: 100 }, deps),
      ]);
      // Gane quien gane, el otro recibe un error claro (404 o 409), nunca un fallo de la base de datos.
      for (const result of results) {
        if (result.status === "rejected") expect([404, 409]).toContain((result.reason as { status?: number }).status);
      }
    }
  });
});

describe("limpieza", () => {
  it("borra las sesiones de más de 24 horas y sus archivos", async () => {
    const { uploadId: vieja } = await startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 }, deps);
    await appendChunk(vieja, 0, mp4(100), { userId: ana.id });
    const otro = await createVideo(ana, v.productId);
    const { uploadId: nueva } = await startUpload(ana, otro.id, { filename: "b.mp4", totalBytes: 100 }, deps);
    await getDb()
      .update(schema.uploadSessions)
      .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(schema.uploadSessions.id, vieja));

    expect(await cleanStaleUploads()).toBe(1);
    expect(fs.existsSync(uploadPath(vieja))).toBe(false);
    expect((await sessionRows()).map((s) => s.id)).toEqual([nueva]);
    // El vídeo que se quedó «subiendo» lo dice.
    expect(await getVideoFor(ana, v.id)).toMatchObject({
      referenceStatus: "failed",
      referenceError: "La subida se ha interrumpido. Vuelve a elegir el vídeo.",
    });
    expect((await getVideoFor(ana, otro.id)).referenceStatus).toBe("uploading");
  });
});
