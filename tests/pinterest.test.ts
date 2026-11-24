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
  addApprovedToBank,
  runPinterest,
  seedReferenceBank,
  storePinterestImage,
  sweepPinterest,
  withPinterestRoles,
  type PinterestDeps,
} from "@/server/videos/pinterest";
import { createVideo, getVideoFor, manifestRefsFor, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser, seedanceByDefault } from "./helpers/fixtures";
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
const bank: string[] = [];

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
  namedPlace: null,
};

const COMPOSED = {
  productVisible: false,
  packagingVisible: false,
  effectVisible: false,
  effectPrompt: null,
  composition:
    "Use image 1 ONLY for the exact opening action and foreground arrangement: first-person view, two hands holding the round wrapped gift at 45 percent of frame width. Replace all original living room scenery with the exact living room in image {ROOM}. Do not copy the source shelves and mantel.",
  identity: "The hands and forearms are those of the woman in image {AVATAR} and only her, with fine creases and short natural nails.",
  product: "Do not show the ice cream maker at this opening; the gift stays wrapped and nothing is revealed.",
  environment:
    "Reference image {ROOM} is the EXACT requested background, not an inspiration. Preserve its fireplace with red stockings in the centre, lit tree on the LEFT and television above the fireplace. Camera is lying on the foreground bed looking into this same room. Never raise the camera just to fit the whole room.",
  lighting: "Match the actual warm practical light of the fireplace and the tree lights in reference image {ROOM}, with soft contact shadows on the paper.",
};

/** Claude simulado: primero la escena y las consultas, después la elección (candidatas 3 y 1). */
function gatewayFor(picks: Array<{ n: number; reason: string }> = [{ n: 3, reason: "Salón real de móvil con árbol." }, { n: 1, reason: "Sofá habitado y luz cálida." }]) {
  const { client, calls } = fakeMessages([
    { text: JSON.stringify(SCENE), usage: { inputTokens: 3000, outputTokens: 300 } },
    { text: JSON.stringify({ picks, rejected: "Las demás son de catálogo." }), usage: { inputTokens: 20000, outputTokens: 200 } },
    { text: JSON.stringify(COMPOSED), usage: { inputTokens: 20000, outputTokens: 900 } },
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


// Pruebas del flujo de Seedance (antes de poder elegir el modelo del clip).
seedanceByDefault();
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
  // Banco de aprobadas: tres fotos distintas (verde, azul y blanca).
  bank.length = 0;
  for (const [code, color, description] of [
    ["R01", "green", "POV sofá, manta, taza, perro, TV y árbol"],
    ["R24", "blue", "Cocina blanca con isla, ventana y decoración navideña"],
    ["R36", "white", "POV sofá con piernas, TV, chimenea y árbol"],
  ] as const) {
    const sha256 = await storePinterestImage(makeImage(`${code}.jpg`, color), { url: `banco:${code}`, pinId: code, width: null, height: null });
    await getDb().insert(schema.referenceBank).values({ sha256, code, description, accounts: ["EISWERK"], source: "aprobada_manual" });
    bank.push(sha256);
  }
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
    expect(prompt).toContain("image 2 and image 3 are real everyday phone photos of this kind of place, chosen and approved by the owner");
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
  it("sin referencia a mano: espera, elige sola del banco de aprobadas (sin buscar en Pinterest) y las adjunta", async () => {
    // Antes de tenerlas, la imagen no se pide.
    await expect(buildFrameRequest(ana, v, deps)).rejects.toMatchObject({ status: 409, message: PINTEREST_PENDING });
    const run = await runOfVideo(v.id);
    expect(run.status).toBe("pending");

    let searched = false;
    const { gateway, calls } = gatewayFor();
    await runPinterest(run.id, pinterestDeps({ gateway, search: async () => ((searched = true), { status: "failed", error: "no" }) }));
    expect(searched).toBe(false); // orden del dueño: de momento no se busca en Pinterest
    const done = await runOfVideo(v.id);
    expect(done.status).toBe("ready");
    const refs = done.refs as Array<{ pinId: string; reason: string; sha256: string }>;
    // Referencias 3 y 1 del banco, en ese orden.
    expect(refs.map((r) => r.pinId)).toEqual(["R36", "R01"]);
    expect(refs.map((r) => r.sha256)).toEqual([bank[2], bank[0]]);
    expect(refs[0].reason).toBe("Salón real de móvil con árbol.");
    // Claude miró todo el banco con visión (3 fotos y el fotograma), con su descripción.
    const content = calls[1].messages[0].content as Array<{ type: string; text?: string }>;
    expect(content.filter((b) => b.type === "image")).toHaveLength(4);
    expect(content.some((b) => b.text?.includes("R24, usada en EISWERK"))).toBe(true);
    expect(await readyPinterestRefs(v.id)).toHaveLength(2);

    const { request } = await buildFrameRequest(ana, await getVideoFor(ana, v.id), deps);
    const image = request as { prompt: string; medias: Array<{ value: string }> };
    // Orden del método aprobado: composición, sala, avatar, realismo; el artículo no se ve en esta toma y no va.
    expect(image.medias).toHaveLength(4);
    const view = await videoView(ana, v.id);
    expect(view.imageManifest.map((m) => m.role)).toEqual(["composicion", "pinterest", "avatar", "pinterest"]);
    // El prompt reescrito con el método aprobado, con los números reales: sala 2, avatar 3, realismo 4.
    expect(image.prompt).toContain("Replace all original living room scenery with the exact living room in image 2.");
    expect(image.prompt).toContain("Reference image 2 is the EXACT requested background, not an inspiration.");
    expect(image.prompt).toContain("the woman in image 3 and only her");
    expect(image.prompt).toContain("When a room, space or environment reference is supplied, its observed lighting is the primary authority");
    expect(image.prompt).toContain("Image 4 is realism reference only for texture.");
    expect(image.prompt).toContain("NEGATIVE: no source captions");
    expect(image.prompt).not.toContain("{ROOM}");
    expect(image.prompt.split("\n\n")).toHaveLength(8);
    const uploaded = fake.calls.filter((c) => c.method === "uploadMedia").map((c) => (c.args as { filename: string }).filename);
    expect(uploaded.filter((name) => name.startsWith("pinterest-"))).toHaveLength(2);
  });

  it("lo que él aprueba alimenta el banco: su referencia puesta a mano pasa a las aprobadas", async () => {
    await updateVideoChoices(ana, v.id, { environmentPhotoId: ids.entorno });
    await addApprovedToBank(ana, v.id);
    await addApprovedToBank(ana, v.id);
    const added = await getDb().select().from(schema.referenceBank).where(eq(schema.referenceBank.code, `V${v.id}`));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ source: "aprobada_en_lote", accounts: ["EISWERK"] });
  });

  it("el banco se siembra con las aprobadas del sistema anterior, sin repetir", async () => {
    await getDb().delete(schema.referenceBank);
    const first = await seedReferenceBank();
    expect(first).toBe(44);
    expect(await seedReferenceBank()).toBe(0);
    const codes = (await getDb().select({ code: schema.referenceBank.code }).from(schema.referenceBank)).map((r) => r.code);
    // Fuera las que no son sitios (R03, R19, R42) y las que él rechazó (R07, R08).
    for (const out of ["R03", "R07", "R08", "R19", "R42"]) expect(codes).not.toContain(out);
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
    // El rechazo del dueño rehace la escena (con su motivo como corrección).
    expect(await getDb().select().from(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.videoId, v.id))).toHaveLength(0);
    await requirePinterestRefs(v.id).catch(() => {});
    await runPinterest((await runOfVideo(v.id)).id, pinterestDeps());

    const second = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    const [row] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, second.generationId));
    const request = row.request as { prompt: string; medias: unknown[] };
    expect(row.round).toBe(2);
    expect(request.medias).toHaveLength(4);
    expect(request.prompt).toContain("EXACT requested background");
  });

  it("si no elige ninguna, lo vuelve a intentar antes de rendirse", async () => {
    await requirePinterestRefs(v.id).catch(() => {});
    const run = await runOfVideo(v.id);
    await runPinterest(run.id, pinterestDeps(gatewayFor([])));
    const again = await runOfVideo(v.id);
    expect(again).toMatchObject({ status: "pending", attempts: 1, scene: null });
    expect(again.error).toContain("No se eligió ninguna referencia del banco");
  });
});

describe("el producto funcionando", () => {
  it("la foto «Funcionando» va con el artículo en la imagen (y la caja solo si se ve con el método aprobado)", async () => {
    const working = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("efecto")]), "funcionamiento")).id;
    const refs = await manifestRefsFor(ana, v);
    const normal = imageManifest(v, refs);
    expect(normal.find((m) => m.role === "funcionamiento")?.source).toEqual({ kind: "photo", photoId: working });
    const codex = imageManifest(v, { ...refs, pinterest: [bank[0], bank[1]], approvedMethod: true, packagingHidden: true });
    expect(codex.map((m) => m.role)).toEqual(["composicion", "articulo", "funcionamiento", "pinterest", "avatar", "pinterest"]);
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

describe("una corrección automática no gasta regeneraciones", () => {
  it("un rechazo con «Corrección automática: …» no cuenta para el máximo de rondas", async () => {
    const { stageOf } = await import("@/server/videos/lote");
    const { SYSTEM_REJECT_PREFIX } = await import("@/server/videos/generations");
    const at = new Date();
    const round = (rejectReason: string | null) => ({ status: "done", rejectReason, finishedAt: at, intentAt: at, error: null });
    const owner = [round("No me gusta"), round("Tampoco"), round("Otra vez no")];
    expect(stageOf(owner, false, at)).toBe("maxed");
    expect(stageOf([round("No me gusta"), round("Tampoco"), round(`${SYSTEM_REJECT_PREFIX}alas de mariposa`)], false, at)).toBe("need");
  });
});

describe("paso del efecto del producto (foto «Funcionando»)", () => {
  it("tras la imagen principal se pide sola la edición del efecto; si la comprobación falla se repite una vez y no más", async () => {
    const { afterFrameDone, EFFECT_PROMPT_START } = await import("@/server/videos/efecto");
    const { vi } = await import("vitest");
    const working = (await addProductPhoto(ana, producto.id, Buffer.concat([jpeg, Buffer.from("efecto")]), "funcionamiento")).id;
    expect(working).toBeGreaterThan(0);
    // El prompt con sala dice que el efecto se ve y trae el prompt corto del paso.
    const effectPrompt = "Edit image 1. Change only the two glowing projections; draw the exact butterfly wings of image 2. Not feathers.";
    const composed = { ...COMPOSED, productVisible: true, effectVisible: true, effectPrompt };
    const { client } = fakeMessages([
      { text: JSON.stringify(SCENE) },
      { text: JSON.stringify({ picks: [{ n: 3, reason: "Sala." }, { n: 1, reason: "Realismo." }], rejected: "" }) },
      { text: JSON.stringify(composed) },
    ]);
    await requirePinterestRefs(v.id).catch(() => {});
    await runPinterest((await runOfVideo(v.id)).id, pinterestDeps({ gateway: createGateway({ client }) }));
    v = await getVideoFor(ana, v.id);

    vi.stubGlobal("fetch", (async () => new Response(new Uint8Array(jpeg), { status: 200 })) as typeof fetch);
    const finish = async () => {
      for (const jobId of Object.keys(fake.state.jobs)) {
        if (fake.state.jobs[jobId].status !== "done") {
          fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: [`https://cdn.test/${jobId}.png`] };
        }
      }
    };
    const verdicts = (matches: boolean) => createGateway({ client: fakeMessages([{ text: JSON.stringify({ matches, reason: "forma" }) }]).client });

    // 1. La imagen principal: al terminar, pasa sola al paso del efecto (sin gastar una regeneración).
    const main = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    await submitGeneration(main.generationId, deps);
    await finish();
    await finalizeGeneration(main.generationId, deps);
    await afterFrameDone(main.generationId);
    const [mainRow] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, main.generationId));
    expect(mainRow.rejectReason).toBe("Corrección automática: paso del efecto (1)");

    // 2. La ronda siguiente es la edición: image 1 = la imagen principal, image 2 = la foto de funcionamiento.
    const effect1 = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    const [e1] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, effect1.generationId));
    const req1 = e1.request as { prompt: string; medias: Array<{ value: string }> };
    expect(req1.prompt.startsWith(EFFECT_PROMPT_START)).toBe(true);
    expect(req1.medias).toHaveLength(2);
    expect(e1.count).toBe(1);
    await submitGeneration(effect1.generationId, deps);
    await finish();
    await finalizeGeneration(effect1.generationId, deps);

    // 3. La comprobación dice que no tiene la forma: se repite una vez, desde la misma imagen principal.
    await afterFrameDone(effect1.generationId, { gateway: verdicts(false) });
    const [e1After] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, effect1.generationId));
    expect(e1After.rejectReason).toBe("Corrección automática: paso del efecto (2)");
    const effect2 = await requestGeneration(ana, v.id, "frame", { expectedCredits: 999 }, deps);
    const [e2] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, effect2.generationId));
    const req2 = e2.request as { prompt: string; medias: Array<{ value: string }> };
    expect(req2.medias[0].value).toBe(req1.medias[0].value);
    expect(req2.prompt).toContain("The previous attempt kept the old shape");
    await submitGeneration(effect2.generationId, deps);
    await finish();
    await finalizeGeneration(effect2.generationId, deps);

    // 4. Segundo intento: aunque falle, no se repite más; la candidata queda para el dueño.
    await afterFrameDone(effect2.generationId, { gateway: verdicts(false) });
    const [e2After] = await getDb().select().from(schema.generations).where(eq(schema.generations.id, effect2.generationId));
    expect(e2After.rejectReason).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("imágenes de referencia subidas a mano", () => {
  it("se suben, viajan con la tarjeta y el duplicado; un fondo a mano es la sala (sin banco) y al aprobar entra en el banco", async () => {
    const { uploadReference, listReferences } = await import("@/server/videos/referencias");
    const { addVideoToBatch, createBatch, duplicateBatchVideo } = await import("@/server/videos/batches");
    const { addApprovedToBank } = await import("@/server/videos/pinterest");

    const fondo = await uploadReference(makeImage("fondo-a-mano.jpg", "purple"));
    const ropa = await uploadReference(makeImage("ropa-a-mano.jpg", "yellow"));
    expect(fondo.sha256).toMatch(/^[0-9a-f]{64}$/);

    const batch = await createBatch(ana, "Lote con referencias");
    const created = await addVideoToBatch(ana, batch.id, {
      productId: producto.id,
      avatarPhotoId: ids.avatar,
      avatarMode: "elegido",
      references: [
        { sha256: fondo.sha256, role: "fondo" },
        { sha256: ropa.sha256, role: "ropa" },
      ],
    });
    expect(await listReferences(created.id)).toEqual([
      { sha256: fondo.sha256, role: "fondo" },
      { sha256: ropa.sha256, role: "ropa" },
    ]);
    // Una huella que no está subida no vale.
    await expect(
      addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: ids.avatar, avatarMode: "elegido", references: [{ sha256: "f".repeat(64), role: "fondo" }] }),
    ).rejects.toMatchObject({ status: 400 });

    // «Duplicar» las conserva.
    const copy = await duplicateBatchVideo(ana, batch.id, created.id);
    expect(await listReferences(copy.id)).toHaveLength(2);

    // Con un fondo a mano no se elige del banco: la sala es la suya y Claude escribe «user-selected».
    await analysed(created.id);
    await requirePinterestRefs(created.id).catch(() => {});
    const [run] = await getDb().select().from(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.videoId, created.id));
    const { client, calls } = fakeMessages([
      { text: JSON.stringify(SCENE) },
      { text: JSON.stringify({ ...COMPOSED, environment: "Image {ROOM} is the user-selected room background only, not product identity. Preserve its sofa on the LEFT." }) },
    ]);
    await runPinterest(run.id, pinterestDeps({ gateway: createGateway({ client }) }));
    const [done] = await getDb().select().from(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.id, run.id));
    expect(done.status).toBe("ready");
    expect((done.refs as Array<{ sha256: string }>).map((r) => r.sha256)).toEqual([fondo.sha256]);
    expect(calls).toHaveLength(2); // escena y prompt: ninguna llamada para elegir del banco
    const texts = (calls[1].messages[0].content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    expect(texts).toContain("user-selected room background only, not product identity");
    expect(texts).toContain("image {MANUAL1} — la ropa que debe llevar la persona");

    // La imagen: la sala es su fondo y la ropa va adjunta con su papel.
    const video = await getVideoFor(ana, created.id);
    const manifest = imageManifest(video, await manifestRefsFor(ana, video));
    expect(manifest.filter((m) => m.role === "pinterest").map((m) => (m.source as { sha256: string }).sha256)).toEqual([fondo.sha256]);
    expect(manifest.find((m) => m.role === "referencia")?.source).toEqual({ kind: "manual", sha256: ropa.sha256, refRole: "ropa" });

    // Al aprobar, el fondo subido a mano entra en el banco de aprobadas.
    await addApprovedToBank(ana, created.id);
    const [banked] = await getDb().select().from(schema.referenceBank).where(eq(schema.referenceBank.sha256, fondo.sha256));
    expect(banked).toMatchObject({ source: "aprobada_en_lote", code: `V${created.id}` });
  });

  it("el borrador guarda las imágenes de la tarjeta y del grupo; la tarjeta sin las suyas usa las del grupo", async () => {
    const { serializeDraft, parseDraft, effectiveRefs, newGroup } = await import("@/components/batches/draft");
    const sha = "a".repeat(64);
    const group = { ...newGroup(7), refs: [{ sha256: sha, role: "fondo" as const }] };
    const restored = parseDraft(JSON.parse(JSON.stringify(serializeDraft({ name: "x", autoAnalyze: true, groups: [group], batchId: null }))));
    expect(restored?.groups[0].refs).toEqual([{ sha256: sha, role: "fondo" }]);
    expect(effectiveRefs(group, { refs: [] })).toEqual(group.refs);
    expect(effectiveRefs(group, { refs: [{ sha256: "b".repeat(64), role: "ropa" }] })).toEqual([{ sha256: "b".repeat(64), role: "ropa" }]);
  });
});

describe("sin saldo en la API de Claude", () => {
  it("un 400 por créditos no es «no válida»: queda en espera con aviso claro, sin gastar intentos, y una búsqueda atascada se relanza", async () => {
    const { isNoCredit, NO_CREDIT } = await import("@/llm/gateway");
    expect(isNoCredit(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), 400)).toBe(true);
    expect(isNoCredit(new Error("400 messages: field required"), 400)).toBe(false);

    await requirePinterestRefs(v.id).catch(() => {});
    const run = await runOfVideo(v.id);
    const { JobPausedError } = await import("@/jobs/steps");
    const broke = { call: async () => Promise.reject(new JobPausedError("saldo")) } as unknown as PinterestDeps["gateway"];
    await expect(runPinterest(run.id, pinterestDeps({ gateway: broke }))).rejects.toBeInstanceOf(JobPausedError);
    const waiting = await runOfVideo(v.id);
    expect(waiting).toMatchObject({ status: "pending", error: NO_CREDIT, attempts: 0 });
    await expect(requirePinterestRefs(v.id)).rejects.toMatchObject({ status: 409, message: NO_CREDIT });

    // Una búsqueda que se quedó «buscando» (pasos agotados) se relanza con un intento nuevo.
    await getDb().update(schema.videoPinterestRefs).set({ status: "searching", error: null, updatedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(schema.videoPinterestRefs.id, run.id));
    await sweepPinterest(new Date());
    expect(await runOfVideo(v.id)).toMatchObject({ status: "pending", attempts: 1 });
  });
});

describe("tienda concreta pedida en la tarjeta", () => {
  it("si se nombra una tienda, no se usa el banco: se busca en Pinterest su interior y el prompt va con la redacción de tienda", async () => {
    await requirePinterestRefs(v.id).catch(() => {});
    const run = await runOfVideo(v.id);
    const scene = { ...SCENE, place: "droguería dm en Alemania", namedPlace: "dm Drogeriemarkt, Alemania", queries: ["dm Drogeriemarkt Filiale innen", "dm Deutschland Regal Innenansicht"] };
    const { client, calls } = fakeMessages([
      { text: JSON.stringify(scene) },
      { text: JSON.stringify({ picks: [{ n: 2, reason: "Interior real de dm con su cartelería." }], rejected: "Las demás no son dm." }) },
      { text: JSON.stringify(COMPOSED) },
    ]);
    const searched: string[] = [];
    const search: PinterestDeps["search"] = async (query) => {
      searched.push(query);
      return { status: "ready", via: "servidor", candidates: candidatesOf(pinterestResponse(3, query.includes("Filiale") ? "dm" : "de")) };
    };
    await runPinterest(run.id, pinterestDeps({ gateway: createGateway({ client }), search }));
    const done = await runOfVideo(v.id);
    expect(done.status).toBe("ready");
    expect(searched).toEqual(scene.queries);
    expect((done.refs as Array<{ pinId: string }>).map((r) => r.pinId)).toEqual(["dm2"]);
    const pickText = (calls[1].messages[0].content as Array<{ type: string; text?: string }>).map((b) => b.text ?? "").join("\n");
    expect(pickText).toContain("El dueño pide este sitio concreto: dm Drogeriemarkt, Alemania");
    const composeText = (calls[2].messages[0].content as Array<{ type: string; text?: string }>).map((b) => b.text ?? "").join("\n");
    expect(composeText).toContain("NO escribas el nombre de la tienda ni de ninguna marca");
    expect(composeText).toContain("exposure authority");
  });
});
