import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "@/jobs/video-jobs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, getPool, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { createGateway } from "@/llm/gateway";
import { setObjectStoreForTests } from "@/lib/object-store";
import { agentHeartbeat, appendTaskChunk, claimTask, createAgentToken, finishTask } from "@/server/agent";
import type { AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import { candidatesOf, searchPins, type PinCandidate } from "@/server/pinterest-searches";
import type { Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { buildFrameRequest, rejectFrame } from "@/server/videos/frame";
import { finalizeGeneration, requestGeneration, submitGeneration, type GenDeps } from "@/server/videos/generations";
import { imageManifest } from "@/server/videos/manifest";
import {
  PINTEREST_PENDING,
  readyPinterestRefs,
  requirePinterestRefs,
  runPinterest,
  sweepPinterest,
  withPinterestRoles,
  type PinterestDeps,
} from "@/server/videos/pinterest";
import { createVideo, getVideoFor, manifestRefsFor, updateVideoChoices, type Video } from "@/server/videos/videos";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * Regla fija del dueño (23/11/2026): la imagen inicial lleva SIEMPRE referencias de Pinterest,
 * también al regenerar; solo una referencia de entorno puesta a mano lo evita. Sin red: Pinterest,
 * las fotos y Claude van simulados; las imágenes son JPEG de verdad (ffmpeg).
 */

const PROMPT = "Image 1 sets the composition and the framing. The woman is the person from image 2. She holds the machine from image 3.";

let dir: string;
let jpeg: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;
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

/** Una respuesta del buscador de Pinterest como la de su web, con pines, un vídeo y un anuncio. */
function pinterestResponse(n: number, prefix = "a"): unknown {
  const pin = (i: number) => ({
    type: "pin",
    id: `${prefix}${i}`,
    grid_title: `Salón ${i}`,
    images: {
      "236x": { url: `https://i.pinimg.com/236x/${prefix}${i}.jpg` },
      "474x": { url: `https://i.pinimg.com/474x/${prefix}${i}.jpg` },
      "736x": { url: `https://i.pinimg.com/736x/${prefix}${i}.jpg` },
      orig: { url: `https://i.pinimg.com/originals/${prefix}${i}.jpg`, width: 1080, height: 1440 },
    },
  });
  return {
    resource_response: {
      data: {
        results: [
          { type: "story", id: "x" },
          { ...pin(99), videos: { video_list: {} } },
          { ...pin(98), is_promoted: true },
          ...Array.from({ length: n }, (_, i) => pin(i + 1)),
        ],
      },
    },
  };
}

const SCENE = {
  place: "salón con decoración navideña",
  season: "Navidad",
  light: "lámparas cálidas de tarde y luces del árbol",
  style: "casa alemana normal y habitada",
  needs: "sofá y mesa baja con sitio para las manos",
  queries: ["Wohnzimmer Weihnachten Sofa Handyfoto", "christmas living room sofa real home"],
};

/** Claude simulado: primero la escena y las consultas, después la elección (candidatas 3 y 1). */
function gatewayFor(picks: Array<{ n: number; reason: string }> = [{ n: 3, reason: "Salón real de móvil con árbol." }, { n: 1, reason: "Sofá habitado y luz cálida." }]) {
  const { client, calls } = fakeMessages([
    { text: JSON.stringify(SCENE), usage: { inputTokens: 3000, outputTokens: 300 } },
    { text: JSON.stringify({ picks, rejected: "Las demás son de catálogo." }), usage: { inputTokens: 20000, outputTokens: 200 } },
  ]);
  return { gateway: createGateway({ client }), calls };
}

function pinterestDeps(extra: Partial<PinterestDeps> = {}): PinterestDeps {
  const search: PinterestDeps["search"] = async (query) => ({
    status: "ready",
    via: "servidor",
    candidates: candidatesOf(pinterestResponse(4, query.startsWith("Wohn") ? "de" : "en")),
  });
  return { search, fetchImage: async () => jpeg, ...gatewayFor(), ...extra };
}

async function analysed(videoId: number): Promise<number> {
  const pool = getPool();
  await pool.query("update videos set reference_status = 'ready', reference_media_id = 'ref-1', image_prompt = $2 where id = $1", [videoId, PROMPT]);
  await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [videoId, jpeg.length, jpeg]);
  const { rows } = await pool.query(
    "insert into video_analyses (video_id, version, status, reference_media_id, created_by, result) values ($1, 1, 'done', 'ref-1', $2, $3) returning id",
    [videoId, ana.id, JSON.stringify({ conceptLogic: "Regalo de Navidad en el salón", shots: [{ startS: 0, endS: 2, seen: "Manos con un regalo redondo en un salón navideño", action: "Abre el regalo", onScreenText: "" }] })],
  );
  return Number(rows[0].id);
}

async function runOfVideo(videoId: number) {
  const [run] = await getDb().select().from(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.videoId, videoId));
  return run;
}

const pinterestMedias = (request: unknown) =>
  ((request as { medias: Array<{ value: string }> }).medias ?? []).filter((m) => m.value.length > 0);

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-pinterest-"));
  jpeg = makeImage("foto.jpg", "orange");
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  setObjectStoreForTests(undefined);
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  await seedRules();
  // Sin almacén: las fotos van a la base de datos (en la nube van al almacén).
  setObjectStoreForTests(null);
  fake = createFakeHiggsfield();
  const fakeFetch = (async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { "Content-Type": "image/jpeg" } })) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };
  ana = await makeUser("dueno");
  producto = await makeProduct(ana, { name: "EisWerk" });
  ids.articulo = (await addProductPhoto(ana, producto.id, jpeg, "articulo")).id;
  ids.avatar = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("avatar")]), "avatar")).id;
  ids.entorno = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("entorno")]), "entorno")).id;
  v = await createVideo(ana, producto.id);
  await updateVideoChoices(ana, v.id, { avatarPhotoId: ids.avatar });
  await analysed(v.id);
  v = await getVideoFor(ana, v.id);
});

describe("lo que devuelve Pinterest", () => {
  it("se queda solo con pines de foto (sin vídeos, anuncios ni historias) y sus direcciones de i.pinimg.com", () => {
    const pins = candidatesOf(pinterestResponse(3));
    expect(pins.map((p) => p.pinId)).toEqual(["a1", "a2", "a3"]);
    expect(pins[0]).toMatchObject({ imageUrl: "https://i.pinimg.com/originals/a1.jpg", thumbUrl: "https://i.pinimg.com/474x/a1.jpg", width: 1080 });
  });

  it("una página que no es del buscador cuenta como bloqueo", () => {
    expect(() => candidatesOf({ resource_response: { error: "Invalid Resource Request" } })).toThrow();
  });
});

describe("el papel de las fotos en el prompt", () => {
  it("van al final del manifiesto, con su número real, y el prompt dice para qué sirven", () => {
    const manifest = imageManifest({ ...v, environmentPhotoId: null }, { photos: [], variant: null, avatar: null, pinterest: ["a".repeat(64), "b".repeat(64)] });
    expect(manifest.map((m) => m.role)).toEqual(["composicion", "pinterest", "pinterest"]);
    const prompt = withPinterestRoles(PROMPT, manifest);
    expect(prompt).toContain("image 2 and image 3 are real everyday phone photos found on Pinterest");
    expect(prompt).toContain("Do not copy any person, face, text, logo, watermark");
  });

  it("con una referencia de entorno puesta a mano, no entra ninguna de Pinterest", async () => {
    await updateVideoChoices(ana, v.id, { environmentPhotoId: ids.entorno });
    v = await getVideoFor(ana, v.id);
    const refs = await manifestRefsFor(ana, v);
    const manifest = imageManifest(v, { ...refs, pinterest: ["a".repeat(64)] });
    expect(manifest.some((m) => m.role === "pinterest")).toBe(false);
    expect(manifest.at(-1)?.role).toBe("entorno");
  });
});

describe("la imagen inicial lleva siempre referencias de Pinterest", () => {
  it("sin referencia a mano: espera a Pinterest, las busca, elige con visión, las guarda y las adjunta", async () => {
    // Antes de tenerlas, la imagen no se pide: se ponen a buscar.
    await expect(buildFrameRequest(ana, v, deps)).rejects.toMatchObject({ status: 409, message: PINTEREST_PENDING });
    const run = await runOfVideo(v.id);
    expect(run.status).toBe("pending");

    const { gateway, calls } = gatewayFor();
    await runPinterest(run.id, pinterestDeps({ gateway }));
    const done = await runOfVideo(v.id);
    expect(done.status).toBe("ready");
    expect(done.queries).toEqual(SCENE.queries);
    const refs = done.refs as Array<{ query: string; pinId: string; reason: string; sha256: string }>;
    // Candidatas 3 y 1, en ese orden (repartidas: 4 de la primera búsqueda y 4 de la segunda).
    expect(refs.map((r) => r.pinId)).toEqual(["de3", "de1"]);
    expect(refs[0]).toMatchObject({ query: SCENE.queries[0], reason: "Salón real de móvil con árbol." });
    // Claude miró las candidatas con visión (8 miniaturas y el fotograma).
    const images = (calls[1].messages[0].content as Array<{ type: string }>).filter((b) => b.type === "image");
    expect(images).toHaveLength(9);
    // La misma foto (misma huella) se guarda una sola vez.
    const stored = await getDb().select().from(schema.pinterestImages);
    expect(stored).toHaveLength(1);
    expect(await readyPinterestRefs(v.id)).toHaveLength(2);

    const { request } = await buildFrameRequest(ana, await getVideoFor(ana, v.id), deps);
    const image = request as { prompt: string; medias: Array<{ value: string }> };
    // Composición, avatar, artículo y las dos de Pinterest.
    expect(image.medias).toHaveLength(5);
    expect(image.prompt).toContain("image 4 and image 5 are real everyday phone photos found on Pinterest");
    const uploaded = fake.calls.filter((c) => c.method === "uploadMedia").map((c) => (c.args as { filename: string }).filename);
    expect(uploaded.some((name) => name.startsWith("pinterest-"))).toBe(true);
  });

  it("con referencia a mano en el vídeo: no busca en Pinterest y genera con la suya", async () => {
    await updateVideoChoices(ana, v.id, { environmentPhotoId: ids.entorno });
    v = await getVideoFor(ana, v.id);
    const { request } = await buildFrameRequest(ana, v, deps);
    expect(pinterestMedias(request)).toHaveLength(4); // composición, avatar, artículo, entorno
    expect((request as { prompt: string }).prompt).not.toContain("Pinterest");
    expect(await getDb().select().from(schema.videoPinterestRefs)).toHaveLength(0);
  });

  it("al regenerar una imagen rechazada, también van las de Pinterest", async () => {
    await requirePinterestRefs(v.id).catch(() => {});
    await runPinterest((await runOfVideo(v.id)).id, pinterestDeps());
    v = await getVideoFor(ana, v.id);

    const first = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    await submitGeneration(first.generationId, deps);
    for (const jobId of Object.keys(fake.state.jobs)) {
      fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: [`https://cdn.test/${jobId}.png`] };
    }
    await finalizeGeneration(first.generationId, deps);
    await rejectFrame(ana, v.id, "Se ve falsa, poco realista");

    const second = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    const [row] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, second.generationId));
    const request = row.request as { prompt: string; medias: unknown[] };
    expect(row.round).toBe(2);
    expect(request.medias).toHaveLength(5);
    expect(request.prompt).toContain("found on Pinterest");
  });

  it("si ninguna vale, vuelve a buscar con otras consultas antes de rendirse", async () => {
    await requirePinterestRefs(v.id).catch(() => {});
    const run = await runOfVideo(v.id);
    await runPinterest(run.id, pinterestDeps(gatewayFor([])));
    const again = await runOfVideo(v.id);
    expect(again).toMatchObject({ status: "pending", attempts: 1, scene: null });
    expect(again.error).toContain("Ninguna foto de Pinterest valía");
  });
});

describe("el seguimiento", () => {
  it("pone en marcha la búsqueda de los vídeos desglosados que aún esperan imagen (no los de entorno a mano)", async () => {
    const other = await createVideo(ana, producto.id);
    await updateVideoChoices(ana, other.id, { avatarPhotoId: ids.avatar, environmentPhotoId: ids.entorno });
    await analysed(other.id);
    await sweepPinterest(new Date());
    const rows = await getDb().select().from(schema.videoPinterestRefs);
    expect(rows.map((r) => r.videoId)).toEqual([v.id]);
    expect(rows[0].status).toBe("pending");
  });
});

describe("si Pinterest no deja a la nube, busca el Mac del dueño", () => {
  const blocked = (async () => new Response("<html>login</html>", { status: 403 })) as typeof fetch;

  it("la consulta pasa al Mac (1.6.0), que entrega la respuesta y queda lista", async () => {
    const { agentId } = await createAgentToken(ana, "Mac de casa");
    await agentHeartbeat(agentId, { version: "1.6.0", ytDlp: "2026.11.01" });
    expect(await searchPins("Wohnzimmer Weihnachten Sofa", { fetch: blocked })).toEqual({ status: "waiting_mac" });

    // Un Mac anterior no se la lleva.
    expect(await claimTask(agentId, new Date(), { can: ["enlace_medio", "perfil"] })).toBeNull();
    const task = await claimTask(agentId, new Date(), { can: ["enlace_medio", "perfil", "pinterest"] });
    expect(task).toMatchObject({ kind: "pinterest" });
    expect((task as { url: string }).url).toMatch(/^https:\/\/www\.pinterest\.com\/resource\/BaseSearchResource\/get\//);
    const json = Buffer.from(JSON.stringify(pinterestResponse(5)));
    await appendTaskChunk(agentId, task!.taskId, task!.uploadId, 0, json);
    await finishTask(agentId, task!.taskId, { ok: true, uploadId: task!.uploadId, totalBytes: json.length });

    const state = await searchPins("Wohnzimmer Weihnachten Sofa", { fetch: blocked });
    expect(state.status).toBe("ready");
    expect((state as { candidates: PinCandidate[]; via: string }).via).toBe("mac");
    expect((state as { candidates: PinCandidate[] }).candidates).toHaveLength(5);
  });

  it("sin Mac del dueño, la búsqueda falla con el motivo", async () => {
    const state = await searchPins("Küche Weihnachten", { fetch: blocked });
    expect(state.status).toBe("failed");
  });
});
