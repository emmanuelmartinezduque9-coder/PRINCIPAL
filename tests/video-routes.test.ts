import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stopWorker } from "@/jobs/boss";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import type { Product } from "@/server/products";
import { CHUNK_BYTES } from "@/server/videos/upload";
import { GET as listVideos, POST as postVideo } from "@/app/api/productos/[id]/videos/route";
import { GET as getVideo, PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { POST as startRoute } from "@/app/api/videos/[videoId]/referencia/subida/route";
import { GET as progressRoute, POST as finishRoute, PUT as chunkRoute } from "@/app/api/videos/[videoId]/referencia/subida/[uploadId]/route";
import { GET as frameRoute } from "@/app/api/videos/[videoId]/fotogramas/[index]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

const mp4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 7)]);
const URL_BASE = "http://localhost/api/videos/x";

let ana: AuthUser;
let luis: AuthUser;
let producto: Product;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const vid = (videoId: number) => ({ params: Promise.resolve({ videoId: String(videoId) }) });
const up = (videoId: number, uploadId: string) => ({ params: Promise.resolve({ videoId: String(videoId), uploadId }) });

async function newVideo(): Promise<number> {
  const response = await postVideo(new Request("http://localhost/api/productos/x/videos", { method: "POST" }), {
    params: Promise.resolve({ id: String(producto.id) }),
  });
  expect(response.status).toBe(201);
  return (await response.json()).video.id;
}

async function start(videoId: number, totalBytes: number): Promise<string> {
  const response = await startRoute(
    new Request(URL_BASE, { method: "POST", body: JSON.stringify({ filename: "a.mp4", totalBytes }) }),
    vid(videoId),
  );
  expect(response.status).toBe(201);
  return (await response.json()).uploadId;
}

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
  await saveCredential(ana.id, "higgsfield", { accessToken: "a" }, { needsReconnect: false });
});

afterAll(async () => {
  await stopWorker();
});

describe("rutas de vídeos", () => {
  it("crear, listar, ver y renombrar; quien no ve el producto recibe 404", async () => {
    await as(ana);
    const id = await newVideo();
    const list = await listVideos(new Request("http://localhost"), { params: Promise.resolve({ id: String(producto.id) }) });
    expect((await list.json()).videos).toMatchObject([{ id, title: "Vídeo 1", mine: true }]);
    const renamed = await putVideo(new Request(URL_BASE, { method: "PUT", body: JSON.stringify({ title: "Gancho" }) }), vid(id));
    expect((await renamed.json()).video.title).toBe("Gancho");
    const bad = await putVideo(new Request(URL_BASE, { method: "PUT", body: JSON.stringify({ avatarPhotoId: "1" }) }), vid(id));
    expect(bad.status).toBe(400);
    expect((await (await getVideo(new Request(URL_BASE), vid(id))).json())).toMatchObject({ mine: true, frames: [] });

    await as(luis);
    const foreign = await getVideo(new Request(URL_BASE), vid(id));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: "Vídeo no encontrado." });
    expect((await frameRoute(new Request(URL_BASE), { params: Promise.resolve({ videoId: String(id), index: "0" }) })).status).toBe(404);
  });

  it("sube por trozos con PUT ?indice=N y termina", async () => {
    await as(ana);
    const id = await newVideo();
    const uploadId = await start(id, 100);
    const put = await chunkRoute(new Request(`${URL_BASE}?indice=0`, { method: "PUT", body: new Uint8Array(mp4(100)) }), up(id, uploadId));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ received: 1 });
    expect(await (await progressRoute(new Request(URL_BASE), up(id, uploadId))).json()).toEqual({ received: 1, totalChunks: 1 });
    const done = await finishRoute(new Request(URL_BASE, { method: "POST" }), up(id, uploadId));
    expect(done.status).toBe(202);
  });

  it("un trozo que dice pesar más del máximo da 413 sin leer el cuerpo", async () => {
    await as(ana);
    const id = await newVideo();
    const uploadId = await start(id, 100);
    let pulled = false;
    // Sin búfer previo: solo se pide un trozo cuando alguien lee.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`${URL_BASE}?indice=0`, {
      method: "PUT",
      body,
      headers: { "Content-Length": String(CHUNK_BYTES + 1025) },
      duplex: "half",
    } as RequestInit);
    const response = await chunkRoute(request, up(id, uploadId));
    expect(response.status).toBe(413);
    expect(pulled).toBe(false);
  });

  it("sin Content-Length, deja de leer en cuanto pasa del máximo", async () => {
    await as(ana);
    const id = await newVideo();
    const uploadId = await start(id, 100);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1024 * 1024;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (sent > 50 * 1024 * 1024) controller.close();
      },
    });
    const request = new Request(`${URL_BASE}?indice=0`, { method: "PUT", body, duplex: "half" } as RequestInit);
    expect((await chunkRoute(request, up(id, uploadId))).status).toBe(413);
    expect(sent).toBeLessThan(10 * 1024 * 1024);
  });

  it("los trozos de una subida ajena dan 404", async () => {
    await as(ana);
    const id = await newVideo();
    const uploadId = await start(id, 100);
    await as(luis);
    const put = await chunkRoute(new Request(`${URL_BASE}?indice=0`, { method: "PUT", body: new Uint8Array(mp4(100)) }), up(id, uploadId));
    expect(put.status).toBe(404);
  });
});
