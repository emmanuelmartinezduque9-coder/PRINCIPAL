import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { setObjectStoreForTests } from "@/lib/object-store";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { zipStream } from "@/server/media/zip";
import { batchEditFiles, batchEditsZip, createBatch } from "@/server/videos/batches";
import { editFileName, editVideoResponse } from "@/server/videos/edits";
import { createVideo } from "@/server/videos/videos";
import { GET as editadosRoute } from "@/app/api/lotes/[id]/editados/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined) }),
  headers: async () => new Headers(),
}));

/** Vídeos terminados de un lote: nombres para el iPhone, ZIP (todo, por cuenta) y lista para «uno a uno». */

let dueno: AuthUser;
let ana: AuthUser;
const BERLIN_EVENING = new Date("2026-11-23T22:30:00Z"); // ya es día 23… y en Berlín, 23:30 del 23

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  setObjectStoreForTests(null);
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Lo que Python (`zipfile`) ve en un ZIP: nombres, tamaños y si los CRC cuadran. */
function inspectZip(bytes: Buffer): { names: string[]; sizes: number[]; bad: string | null } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-")), "a.zip");
  fs.writeFileSync(file, bytes);
  const run = spawnSync("python3", ["-I", "-c", "import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({'names':z.namelist(),'sizes':[i.file_size for i in z.infolist()],'bad':z.testzip()}))", file], { encoding: "utf8" });
  return JSON.parse(run.stdout);
}

async function edited(user: AuthUser, batchId: number, productId: number, bytes: string, at = BERLIN_EVENING) {
  const video = await createVideo(user, productId);
  await getDb().update(schema.videos).set({ batchId, editStatus: "hecho" }).where(eq(schema.videos.id, video.id));
  await getDb().insert(schema.edits).values({ videoId: video.id, version: 1, size: bytes.length, data: Buffer.from(bytes), durationMs: 1000, createdAt: at });
  return video;
}

describe("nombres para el iPhone", () => {
  it("cuenta, número del vídeo en el lote y fecha (hora de Alemania)", () => {
    expect(editFileName("EisWerk", 3, BERLIN_EVENING)).toBe("EisWerk - 03 - 2026-11-23.mp4");
    expect(editFileName("Wär/me:Platz", 12, new Date("2026-11-23T23:30:00Z"))).toBe("Wär-mePlatz - 12 - 2026-11-24.mp4");
  });
});

describe("ZIP en flujo", () => {
  it("lo lee Python: nombres UTF-8 con carpetas, tamaños y CRC correctos", async () => {
    const big = Buffer.alloc(300_000, 7);
    const zip = await readAll(
      zipStream([
        { name: "EisWerk/EisWerk - 01 - 2026-11-23.mp4", date: BERLIN_EVENING, open: async () => [new Uint8Array(big.subarray(0, 100_000)), new Uint8Array(big.subarray(100_000))] },
        { name: "../WärmePlatz/WärmePlatz - 02.mp4", date: BERLIN_EVENING, open: async () => [new Uint8Array(Buffer.from("hola"))] },
      ]),
    );
    expect(inspectZip(zip)).toEqual({ names: ["EisWerk/EisWerk - 01 - 2026-11-23.mp4", "WärmePlatz/WärmePlatz - 02.mp4"], sizes: [300_000, 4], bad: null });
  });
});

describe("los vídeos terminados de un lote", () => {
  it("todos en un ZIP con una carpeta por cuenta; o los de una cuenta, sueltos dentro", async () => {
    const batch = await createBatch(dueno, "Lote 23/11");
    const eis = await makeProduct(dueno, { name: "EisWerk" });
    const haar = await makeProduct(dueno, { name: "HaarZauber" });
    const v1 = await edited(dueno, batch.id, eis.id, "uno");
    const sinMontar = await createVideo(dueno, haar.id);
    await getDb().update(schema.videos).set({ batchId: batch.id }).where(eq(schema.videos.id, sinMontar.id));
    await edited(dueno, batch.id, haar.id, "tres!");
    const files = await batchEditFiles(dueno, batch.id);
    expect(files.map((f) => f.fileName)).toEqual(["EisWerk - 01 - 2026-11-23.mp4", "HaarZauber - 03 - 2026-11-23.mp4"]);

    const all = await batchEditsZip(dueno, batch.id, null);
    expect(all.fileName).toBe("Lote 23-11.zip");
    expect(inspectZip(await readAll(all.stream))).toEqual({
      names: ["EisWerk/EisWerk - 01 - 2026-11-23.mp4", "HaarZauber/HaarZauber - 03 - 2026-11-23.mp4"],
      sizes: [3, 5],
      bad: null,
    });
    const one = await batchEditsZip(dueno, batch.id, eis.id);
    expect(inspectZip(await readAll(one.stream)).names).toEqual(["EisWerk - 01 - 2026-11-23.mp4"]);
    // La descarga suelta lleva el mismo nombre.
    const single = await editVideoResponse(dueno, v1.id, null, { download: true });
    expect(single.headers.get("content-disposition")).toContain(encodeURIComponent("EisWerk - 01 - 2026-11-23.mp4"));
  });

  it("cada persona solo ve los de los productos que ve; sin montados, 404", async () => {
    const batch = await createBatch(ana, "Lote de Ana");
    const lumi = await makeProduct(ana, { name: "Lumi" });
    await expect(batchEditsZip(ana, batch.id, null)).rejects.toMatchObject({ status: 404 });
    await edited(ana, batch.id, lumi.id, "x");
    expect((await batchEditFiles(dueno, batch.id)).map((f) => f.account)).toEqual(["Lumi"]);
    const otra = await makeUser("colaborador");
    await expect(batchEditFiles(otra, batch.id)).rejects.toMatchObject({ status: 404 });
  });

  it("la ruta: lista para «uno a uno» y ZIP como adjunto", async () => {
    const batch = await createBatch(dueno, "Lote");
    const eis = await makeProduct(dueno, { name: "EisWerk" });
    const video = await edited(dueno, batch.id, eis.id, "uno");
    cookie.value = (await login(dueno.email, TEST_PASSWORD))!.token;
    const params = { params: Promise.resolve({ id: String(batch.id) }) };
    const list = await editadosRoute(new Request("http://localhost/x"), params);
    expect(await list.json()).toMatchObject({ files: [{ videoId: video.id, fileName: "EisWerk - 01 - 2026-11-23.mp4", url: `/api/videos/${video.id}/montaje/video?v=1&descargar=1` }] });
    const zip = await editadosRoute(new Request(`http://localhost/x?formato=zip&producto=${eis.id}`), params);
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect(zip.headers.get("content-disposition")).toContain("attachment");
    expect(inspectZip(Buffer.from(await zip.arrayBuffer())).bad).toBeNull();
  });
});
