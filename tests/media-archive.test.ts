import { createServer, type IncomingMessage, type Server } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { LocalStore, S3Store, s3ConfigFromEnv, setObjectStoreForTests } from "@/lib/object-store";
import { checkCloudEnv } from "@/lib/cloud-env";
import type { AuthUser } from "@/server/auth";
import {
  ARCHIVE_MAX_ATTEMPTS,
  archivePending,
  archiveSweep,
  discoverMedia,
  mediaDownloadUrl,
  mediaLinks,
  retryDelayMs,
} from "@/server/videos/archive";
import { listLibrary } from "@/server/videos/library";
import { createVideo } from "@/server/videos/videos";
import { GET as objectRoute } from "@/app/api/objetos/[...key]/route";
import { makeProduct, makeUser, seedanceByDefault } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleVideo } from "./helpers/sample-video";

/** Copia al almacén propio: contra un almacén en carpeta y un Higgsfield simulado (nunca sale a la red). */

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_x";
let dir: string;
let store: LocalStore;
let videoBytes: Buffer;
let imageBytes: Buffer;
let ana: AuthUser;
const requested: string[] = [];
let failNext = 0;

/** Higgsfield simulado: sirve el vídeo o la imagen de muestra según la extensión. */
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input);
  requested.push(url);
  if (url.includes("caido")) return new Response("caído", { status: 503 });
  if (failNext > 0) {
    failNext -= 1;
    return new Response("caído", { status: 503 });
  }
  if (url.endsWith(".mp4")) return new Response(new Uint8Array(videoBytes), { headers: { "content-length": String(videoBytes.length) } });
  if (url.endsWith(".png")) return new Response(new Uint8Array(imageBytes), { headers: { "content-length": String(imageBytes.length) } });
  if (url.endsWith(".txt")) return new Response("hola, no soy un vídeo", { headers: { "content-length": "21" } });
  return new Response("no", { status: 404 });
};

function makePng(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=1536x2048", "-frames:v", "1", target]);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}


// Pruebas del flujo de Seedance (antes de poder elegir el modelo del clip).
seedanceByDefault();
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-prueba-"));
  videoBytes = await fs.readFile(await makeSampleVideo(dir, { seconds: 3 }));
  await makePng(path.join(dir, "imagen.png"));
  imageBytes = await fs.readFile(path.join(dir, "imagen.png"));
});

afterAll(async () => {
  setObjectStoreForTests(undefined);
  await fs.rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await truncateAll();
  store = new LocalStore(path.join(dir, `objetos-${Date.now()}`), Buffer.alloc(32, 7));
  setObjectStoreForTests(store);
  requested.length = 0;
  failNext = 0;
  ana = await makeUser("colaborador", { email: "ana@example.com" });
});

/** Un vídeo con una generación terminada de `kind` y sus resultados. */
async function generation(kind: "frame" | "clip", results: Array<{ jobId: string; url: string | null; ok?: boolean }>) {
  const product = await makeProduct(ana);
  const video = await createVideo(ana, product.id);
  const [gen] = await getDb()
    .insert(schema.generations)
    .values({ videoId: video.id, kind, round: 1, status: "done", userId: ana.id, request: {}, count: results.length, quotedCredits: 1 })
    .returning();
  await getDb()
    .insert(schema.generationResults)
    .values(results.map((r, index) => ({ generationId: gen.id, index, jobId: r.jobId, ok: r.ok ?? true, url: r.url })));
  return { video, gen };
}

async function libraryClip(jobId: string, url = `${CDN}/${jobId}.mp4`) {
  const [row] = await getDb()
    .insert(schema.libraryClips)
    .values({ userId: ana.id, jobId, videoUrl: url, thumbUrl: `${CDN}/${jobId}_min.webp`, createdAtHf: new Date("2026-11-20T10:00:00Z") })
    .returning();
  return row;
}

const rowOf = async (jobId: string) => (await getDb().select().from(schema.storedMedia).where(eq(schema.storedMedia.jobId, jobId)))[0];

describe("descubrir lo que hay que copiar", () => {
  it("crea una fila por trabajo (resultados buenos y biblioteca), sin repetir y sin direcciones raras", async () => {
    await generation("frame", [
      { jobId: "img-1", url: `${CDN}/img-1.png` },
      { jobId: "img-mal", url: null, ok: false },
    ]);
    await generation("clip", [{ jobId: "clip-1", url: `${CDN}/clip-1.mp4` }]);
    await libraryClip("clip-1"); // el mismo trabajo en la biblioteca: una sola fila
    await libraryClip("lib-2");
    await libraryClip("otro-sitio", "https://example.com/x.mp4");
    expect(await discoverMedia()).toBe(3);
    expect(await discoverMedia()).toBe(0);
    const rows = await getDb().select().from(schema.storedMedia);
    expect(rows.map((r) => [r.jobId, r.kind, r.status]).sort()).toEqual([
      ["clip-1", "video", "pending"],
      ["img-1", "image", "pending"],
      ["lib-2", "video", "pending"],
    ]);
  });
});

describe("copiar", () => {
  it("guarda el vídeo, su miniatura y una vista ligera, y es idempotente", async () => {
    await libraryClip("lib-1");
    await discoverMedia();
    expect(await archivePending({ fetch: fakeFetch })).toEqual({ done: 1, failed: 0 });
    const row = await rowOf("lib-1");
    expect(row).toMatchObject({
      status: "done",
      kind: "video",
      mime: "video/mp4",
      originalKey: "medios/lib-1/original.mp4",
      thumbKey: "medios/lib-1/miniatura.jpg",
      previewKey: "medios/lib-1/vista.mp4",
      size: videoBytes.length,
      width: 360,
      height: 640,
      attempts: 1,
    });
    expect(row.durationMs).toBeGreaterThan(2500);
    expect(await store.head("medios/lib-1/original.mp4")).toBe(videoBytes.length);
    const thumb = await fs.readFile(store.pathOf("medios/lib-1/miniatura.jpg"));
    expect(thumb.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(await store.contentType("medios/lib-1/vista.mp4")).toBe("video/mp4");
    // Ya está hecho: otra pasada no lo vuelve a bajar.
    requested.length = 0;
    expect(await archivePending({ fetch: fakeFetch })).toEqual({ done: 0, failed: 0 });
    expect(requested).toEqual([]);
  });

  it("guarda una imagen con miniatura y vista JPEG reducidas", async () => {
    await generation("frame", [{ jobId: "img-1", url: `${CDN}/img-1.png` }]);
    await archiveSweep({ fetch: fakeFetch });
    const row = await rowOf("img-1");
    expect(row).toMatchObject({ status: "done", kind: "image", mime: "image/png", originalKey: "medios/img-1/original.png", previewKey: "medios/img-1/vista.jpg" });
    const preview = await fs.stat(store.pathOf("medios/img-1/vista.jpg"));
    expect(preview.size).toBeGreaterThan(0);
  });

  it("si Higgsfield falla, reintenta más tarde, espaciando los intentos", async () => {
    await libraryClip("lib-1");
    await discoverMedia();
    failNext = 1;
    const t0 = new Date("2026-11-23T10:00:00Z");
    expect(await archivePending({ fetch: fakeFetch, now: () => t0 })).toEqual({ done: 0, failed: 0 });
    const row = await rowOf("lib-1");
    expect(row.status).toBe("pending");
    expect(row.nextAttemptAt.getTime()).toBe(t0.getTime() + retryDelayMs(1));
    // Antes de su hora no se intenta.
    expect(await archivePending({ fetch: fakeFetch, now: () => t0 })).toEqual({ done: 0, failed: 0 });
    const later = new Date(t0.getTime() + retryDelayMs(1) + 1000);
    expect(await archivePending({ fetch: fakeFetch, now: () => later })).toEqual({ done: 1, failed: 0 });
    expect((await rowOf("lib-1")).attempts).toBe(2);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(2 * 60 * 60 * 1000);
  });

  it("deja de intentar tras los intentos máximos o si el contenido no es un vídeo", async () => {
    await libraryClip("txt", `${CDN}/txt.txt`);
    await libraryClip("caido");
    await discoverMedia();
    await getDb().update(schema.storedMedia).set({ attempts: ARCHIVE_MAX_ATTEMPTS - 1 }).where(eq(schema.storedMedia.jobId, "caido"));
    // El de texto falla siempre (no es vídeo); el caído agota su último intento.
    const result = await archivePending({ fetch: fakeFetch });
    expect(result.failed).toBe(2);
    expect(await rowOf("caido")).toMatchObject({ status: "failed", attempts: ARCHIVE_MAX_ATTEMPTS });
    expect((await rowOf("txt")).status).toBe("failed");
  });

  it("dos pasadas a la vez no copian lo mismo dos veces", async () => {
    for (const id of ["a1", "a2", "a3", "a4"]) await libraryClip(id);
    await discoverMedia();
    const [one, two] = await Promise.all([archivePending({ fetch: fakeFetch }), archivePending({ fetch: fakeFetch })]);
    expect(one.done + two.done).toBe(4);
    expect(requested.filter((url) => url.endsWith(".mp4")).length).toBe(4);
  });

  it("sin almacén (nube sin bucket) no hace nada", async () => {
    await libraryClip("lib-1");
    await archiveSweep({ fetch: fakeFetch, store: null });
    expect(await getDb().select().from(schema.storedMedia)).toEqual([]);
  });
});

describe("servir desde el almacén", () => {
  it("la biblioteca usa los enlaces propios cuando el clip ya está copiado (y los de Higgsfield si no)", async () => {
    await libraryClip("copiado");
    await libraryClip("pendiente");
    await discoverMedia();
    await getDb().update(schema.storedMedia).set({ nextAttemptAt: new Date(Date.now() + 3600_000) }).where(eq(schema.storedMedia.jobId, "pendiente"));
    await archivePending({ fetch: fakeFetch });
    const page = await listLibrary(ana);
    const copied = page.clips.find((clip) => clip.videoUrl.includes("copiado"))!;
    expect(copied.videoUrl).toMatch(/^\/api\/objetos\/medios\/copiado\/original\.mp4\?/);
    expect(copied.thumbUrl).toMatch(/^\/api\/objetos\/medios\/copiado\/miniatura\.jpg\?/);
    expect(copied.previewUrl).toMatch(/^\/api\/objetos\/medios\/copiado\/vista\.mp4\?/);
    const pending = page.clips.find((clip) => clip.videoUrl.includes("pendiente"))!;
    expect(pending).toMatchObject({ videoUrl: `${CDN}/pendiente.mp4`, previewUrl: null });
  });

  it("el enlace local firmado sirve el archivo (también por tramos) y sin firma válida da 404", async () => {
    await libraryClip("lib-1");
    await archiveSweep({ fetch: fakeFetch });
    const links = await mediaLinks(["lib-1"]);
    const url = new URL(links.get("lib-1")!.original, "http://localhost");
    const call = (u: URL, headers: Record<string, string> = {}) =>
      objectRoute(new Request(u, { headers }), { params: Promise.resolve({ key: u.pathname.replace("/api/objetos/", "").split("/") }) });
    const full = await call(url);
    expect(full.status).toBe(200);
    expect(Buffer.from(await full.arrayBuffer())).toEqual(videoBytes);
    const part = await call(url, { range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    const forged = new URL(url);
    forged.pathname = "/api/objetos/medios/lib-1/miniatura.jpg";
    expect((await call(forged)).status).toBe(404);
    const expired = new URL(url);
    expired.searchParams.set("e", "1000");
    expect((await call(expired)).status).toBe(404);
  });

  it("la descarga lleva el nombre del archivo", async () => {
    await libraryClip("lib-1");
    await archiveSweep({ fetch: fakeFetch });
    const url = await mediaDownloadUrl("lib-1", "grifo-cuerpo-1.mp4");
    expect(url).toContain("n=grifo-cuerpo-1.mp4");
    expect(await mediaDownloadUrl("no-existe", "x.mp4")).toBeNull();
  });
});

describe("bucket S3", () => {
  let server: Server;
  let endpoint: string;
  const seen: Array<{ method: string; url: string; auth: string | undefined; sha: string | undefined; body: number }> = [];
  const objects = new Map<string, Buffer>();

  beforeAll(async () => {
    server = createServer(async (req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, sha: req.headers["x-amz-content-sha256"] as string, body: body.length });
      if (req.method === "PUT") objects.set(req.url!, body);
      if (req.method === "HEAD") {
        const found = objects.get(req.url!);
        res.writeHead(found ? 200 : 404, found ? { "content-length": found.length } : {});
        return res.end();
      }
      res.writeHead(200);
      res.end(req.method === "GET" ? (objects.get(req.url!.split("?")[0]) ?? "") : "");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("lee la configuración del entorno (todas juntas o ninguna)", () => {
    expect(s3ConfigFromEnv({})).toBeNull();
    expect(s3ConfigFromEnv({ BUCKET_ENDPOINT: "https://t3.storageapi.dev/", BUCKET_NAME: "b", BUCKET_ACCESS_KEY_ID: "k", BUCKET_SECRET_ACCESS_KEY: "s" })).toEqual({
      endpoint: "https://t3.storageapi.dev",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
      region: "auto",
      pathStyle: false,
    });
    const base = { DATABASE_URL: "x", VAULT_KEY: Buffer.alloc(32).toString("base64"), PUBLIC_URL: "https://a.b", ANTHROPIC_API_KEY: "k" };
    expect(checkCloudEnv({ ...base, BUCKET_NAME: "b" }).problems.join()).toMatch(/almacén/);
    expect(checkCloudEnv(base).warnings.join()).toMatch(/Sin almacén/);
    expect(checkCloudEnv({ ...base, BUCKET_ENDPOINT: "e", BUCKET_NAME: "b", BUCKET_ACCESS_KEY_ID: "k", BUCKET_SECRET_ACCESS_KEY: "s" })).toEqual({ problems: [], warnings: [] });
  });

  it("sube firmado (contenido sin firmar, en flujo), lee, y firma enlaces de lectura con nombre de descarga", async () => {
    const s3 = new S3Store({ endpoint, bucket: "cubo", accessKeyId: "AK", secretAccessKey: "SK", region: "auto", pathStyle: true });
    const file = path.join(dir, "subir.bin");
    await fs.writeFile(file, Buffer.alloc(5000, 1));
    await s3.putFile("medios/x/original.mp4", file, { contentType: "video/mp4" });
    const put = seen.find((s) => s.method === "PUT")!;
    expect(put.url).toBe("/cubo/medios/x/original.mp4");
    expect(put.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request/);
    expect(put.sha).toBe("UNSIGNED-PAYLOAD");
    expect(put.body).toBe(5000);
    expect(await s3.head("medios/x/original.mp4")).toBe(5000);
    expect(await s3.head("medios/x/no.mp4")).toBeNull();
    const out = path.join(dir, "bajado.bin");
    await s3.download("medios/x/original.mp4", out);
    expect((await fs.stat(out)).size).toBe(5000);
    const signed = new URL(await s3.signedUrl("medios/x/original.mp4", { downloadName: "mi vídeo.mp4", expiresIn: 600 }));
    expect(signed.pathname).toBe("/cubo/medios/x/original.mp4");
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(signed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.searchParams.get("response-content-disposition")).toContain("attachment");
    const virtual = new S3Store({ endpoint: "https://t3.storageapi.dev", bucket: "cubo", accessKeyId: "AK", secretAccessKey: "SK", region: "auto", pathStyle: false });
    expect(new URL(await virtual.signedUrl("a/b.jpg")).host).toBe("cubo.t3.storageapi.dev");
    await expect(virtual.signedUrl("../fuera")).rejects.toThrow();
  });
});
