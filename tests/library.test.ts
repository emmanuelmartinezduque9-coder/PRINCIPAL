import { beforeEach, describe, expect, it, vi } from "vitest";
import { HiggsfieldAuthError, HiggsfieldUnavailableError, type HfHistoryItem } from "@/connectors/higgsfield/port";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import { markBody } from "@/server/videos/bodies";
import { LIBRARY_MAX_PAGES, LIBRARY_PAGE_SIZE, listLibrary, refreshLibrary } from "@/server/videos/library";
import { createVideo } from "@/server/videos/videos";
import { GET as listRoute } from "@/app/api/biblioteca/route";
import { POST as refreshRoute } from "@/app/api/biblioteca/actualizar/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** La biblioteca de clips contra el Higgsfield simulado: nunca sale a la red. */

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_x";
const BASE = Date.parse("2026-11-20T00:00:00Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Un vídeo terminado del historial, creado `n` minutos después de `BASE`. */
function clip(n: number, over: Partial<HfHistoryItem> = {}): HfHistoryItem {
  return {
    jobId: `hf-${n}`,
    type: "video",
    model: "seedance_2_5",
    prompt: `Prompt del clip ${n}`,
    createdAt: new Date(BASE + n * MINUTE),
    media: [],
    resolution: "480p",
    thumbUrl: `${CDN}/hf-${n}_min.webp`,
    completed: true,
    resultUrl: `${CDN}/hf-${n}.mp4`,
    ...over,
  };
}

/** El historial del simulado, el más reciente primero (como el real). */
const newestFirst = (items: HfHistoryItem[]) => [...items].sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

let fake: FakeHiggsfield;
let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;

const connect = (user: AuthUser, meta: Record<string, unknown> = { needsReconnect: false }) =>
  saveCredential(user.id, "higgsfield", { accessToken: "a", refreshToken: "r", clientId: "c" }, meta);
const historyCalls = () => fake.calls.filter((call) => call.method === "history");
const at = (ms: number) => ({ higgsfield: fake.port, now: () => new Date(ms) });
const stored = (user: AuthUser) =>
  getDb()
    .select()
    .from(schema.libraryClips)
    .then((rows) => rows.filter((row) => row.userId === user.id));

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  cookie.value = undefined;
  fake = createFakeHiggsfield();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  await connect(ana);
});

describe("actualizar la biblioteca", () => {
  it("pide el historial de vídeos terminados de la persona, página a página con el cursor, hasta el final", async () => {
    fake.state.history = newestFirst(range(1, 120).map((n) => clip(n)));
    const result = await refreshLibrary(ana, at(BASE + DAY));
    expect(result).toEqual({ added: 120, pages: 3 });
    expect(historyCalls().map((call) => call.userId)).toEqual([ana.id, ana.id, ana.id]);
    expect(historyCalls().map((call) => call.args)).toEqual([
      { type: "video", limit: LIBRARY_PAGE_SIZE, cursor: null, onlyCompleted: true },
      { type: "video", limit: LIBRARY_PAGE_SIZE, cursor: (BASE + 71 * MINUTE) / 1000, onlyCompleted: true },
      { type: "video", limit: LIBRARY_PAGE_SIZE, cursor: (BASE + 21 * MINUTE) / 1000, onlyCompleted: true },
    ]);
    const rows = await stored(ana);
    expect(rows).toHaveLength(120);
    expect(rows.find((row) => row.jobId === "hf-7")).toMatchObject({
      userId: ana.id,
      videoUrl: `${CDN}/hf-7.mp4`,
      thumbUrl: `${CDN}/hf-7_min.webp`,
      model: "seedance_2_5",
      createdAtHf: new Date(BASE + 7 * MINUTE),
      prompt: "Prompt del clip 7",
      videoId: null,
      fetchedAt: new Date(BASE + DAY),
    });
  });

  it("la primera carga se queda en 10 páginas de 50", async () => {
    fake.state.history = newestFirst(range(1, 520).map((n) => clip(n)));
    expect(await refreshLibrary(ana, at(BASE + DAY))).toEqual({ added: 500, pages: LIBRARY_MAX_PAGES });
    expect(historyCalls()).toHaveLength(10);
    const rows = await stored(ana);
    expect(rows).toHaveLength(500);
    // Los 500 más recientes: del 21 al 520.
    expect(rows.some((row) => row.jobId === "hf-20")).toBe(false);
    expect(rows.some((row) => row.jobId === "hf-21")).toBe(true);
  });

  it("al volver a actualizar se para en cuanto llega a un clip que ya tenía", async () => {
    fake.state.history = newestFirst(range(1, 120).map((n) => clip(n)));
    await refreshLibrary(ana, at(BASE + DAY));
    fake.calls.length = 0;
    // Tres clips nuevos, un día después.
    fake.state.history = newestFirst([...range(1, 120).map((n) => clip(n)), ...[1, 2, 3].map((n) => clip(DAY / MINUTE + n))]);
    expect(await refreshLibrary(ana, at(BASE + 2 * DAY))).toEqual({ added: 3, pages: 1 });
    expect(historyCalls()).toHaveLength(1);
    expect(await stored(ana)).toHaveLength(123);
    // Y sin nada nuevo, una sola página y nada añadido.
    fake.calls.length = 0;
    expect(await refreshLibrary(ana, at(BASE + 3 * DAY))).toEqual({ added: 0, pages: 1 });
    expect(await stored(ana)).toHaveLength(123);
  });

  it("un clip que termina tarde (por debajo de otros ya conocidos) también entra", async () => {
    const first = BASE + DAY;
    const minutesAtFirst = (first - BASE) / MINUTE;
    // «tarde» se creó 40 minutos antes de la primera actualización y entonces seguía generándose.
    const late = clip(minutesAtFirst - 40, { jobId: "tarde", completed: false, resultUrl: null });
    const done = range(1, 60).map((k) => clip(minutesAtFirst - 40 + k * 0.5, { jobId: `rapido-${k}`, resultUrl: `${CDN}/rapido-${k}.mp4` }));
    fake.state.history = newestFirst([late, ...done]);
    expect(await refreshLibrary(ana, at(first))).toMatchObject({ added: 60 });
    expect((await stored(ana)).some((row) => row.jobId === "tarde")).toBe(false);

    fake.state.history = newestFirst([{ ...late, completed: true, resultUrl: `${CDN}/tarde.mp4` }, ...done]);
    // La primera página son 50 clips conocidos, pero recientes: no basta para parar.
    expect(await refreshLibrary(ana, at(first + 5 * MINUTE))).toEqual({ added: 1, pages: 2 });
    expect((await stored(ana)).find((row) => row.jobId === "tarde")).toMatchObject({ videoUrl: `${CDN}/tarde.mp4` });
  });

  it("solo guarda direcciones https de cloudfront.net; lo demás no entra", async () => {
    fake.state.history = newestFirst([
      clip(1),
      clip(2, { resultUrl: "https://evil.example/hf-2.mp4" }),
      clip(3, { resultUrl: "http://d8j0ntlcm91z4.cloudfront.net/hf-3.mp4" }),
      clip(4, { resultUrl: "https://user:clave@d8j0ntlcm91z4.cloudfront.net/hf-4.mp4" }),
      clip(5, { resultUrl: "https://cloudfront.net.evil.example/hf-5.mp4" }),
      clip(6, { resultUrl: null }),
      clip(7, { thumbUrl: "https://evil.example/hf-7_min.webp" }),
      clip(8, { thumbUrl: null }),
      clip(9, { resultUrl: "data:video/mp4;base64,AAAA" }),
    ]);
    expect(await refreshLibrary(ana, at(BASE + DAY))).toMatchObject({ added: 3 });
    const rows = await stored(ana);
    expect(rows.map((row) => row.jobId).sort()).toEqual(["hf-1", "hf-7", "hf-8"]);
    expect(rows.find((row) => row.jobId === "hf-7")!.thumbUrl).toBeNull();
    expect(rows.find((row) => row.jobId === "hf-8")!.thumbUrl).toBeNull();
    expect(rows.every((row) => new URL(row.videoUrl).hostname.endsWith(".cloudfront.net"))).toBe(true);
  });

  it("el prompt se guarda en una línea y recortado a 300 caracteres; uno vacío, sin prompt", async () => {
    fake.state.history = newestFirst([clip(1, { prompt: `uno\n\n  dos ${"x".repeat(400)}` }), clip(2, { prompt: "" }), clip(3, { prompt: null })]);
    await refreshLibrary(ana, at(BASE + DAY));
    const rows = await stored(ana);
    const long = rows.find((row) => row.jobId === "hf-1")!.prompt!;
    expect(long).toHaveLength(300);
    expect(long.startsWith("uno dos xxx")).toBe(true);
    expect(long.endsWith("…")).toBe(true);
    expect(rows.find((row) => row.jobId === "hf-2")!.prompt).toBeNull();
    expect(rows.find((row) => row.jobId === "hf-3")!.prompt).toBeNull();
  });

  it("sin Higgsfield conectado o con la conexión caducada: 409 con el código «higgsfield_connect», sin llamar", async () => {
    await expect(refreshLibrary(luis, at(BASE))).rejects.toMatchObject({ status: 409, code: "higgsfield_connect" });
    await connect(luis, { needsReconnect: true });
    await expect(refreshLibrary(luis, at(BASE))).rejects.toMatchObject({ status: 409, code: "higgsfield_connect" });
    expect(fake.calls).toEqual([]);
    // Y si es Higgsfield quien rechaza el permiso al pedir el historial, lo mismo.
    fake.failNext("history", new HiggsfieldAuthError());
    await expect(refreshLibrary(ana, at(BASE))).rejects.toMatchObject({ status: 409, code: "higgsfield_connect" });
  });

  it("si Higgsfield falla a mitad no se guarda una carga a medias", async () => {
    fake.state.history = newestFirst(range(1, 120).map((n) => clip(n)));
    const port = { ...fake.port, history: fake.port.history };
    let calls = 0;
    port.history = async (...args) => {
      calls += 1;
      if (calls === 2) throw new HiggsfieldUnavailableError();
      return fake.port.history(...args);
    };
    await expect(refreshLibrary(ana, { higgsfield: port, now: () => new Date(BASE + DAY) })).rejects.toMatchObject({ status: 503 });
    expect(await stored(ana)).toEqual([]);
    // Al repetirlo entra todo: no quedó nada «conocido» que corte la carga.
    expect(await refreshLibrary(ana, at(BASE + DAY))).toMatchObject({ added: 120 });
  });

  it("marca con su vídeo los clips que salieron de PRINCIPAL", async () => {
    const product = await makeProduct(ana);
    const video = await createVideo(ana, product.id);
    const [generation] = await getDb()
      .insert(schema.generations)
      .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: ana.id, request: {}, count: 1, quotedCredits: 12, jobIds: ["hf-2"] })
      .returning();
    await getDb().insert(schema.generationResults).values({ generationId: generation.id, index: 0, jobId: "hf-2", ok: true, url: `${CDN}/hf-2.mp4` });
    fake.state.history = newestFirst([clip(1), clip(2)]);
    await refreshLibrary(ana, at(BASE + DAY));
    const rows = await stored(ana);
    expect(rows.find((row) => row.jobId === "hf-2")!.videoId).toBe(video.id);
    expect(rows.find((row) => row.jobId === "hf-1")!.videoId).toBeNull();
    const page = await listLibrary(ana);
    expect(page.clips.find((c) => c.videoUrl.endsWith("hf-2.mp4"))!.video).toEqual({ id: video.id, productId: product.id });
  });
});

describe("ver la biblioteca", () => {
  it("cada persona actualiza con su propia conexión y solo ve sus clips", async () => {
    await connect(luis);
    fake.state.history = newestFirst([clip(1), clip(2)]);
    await refreshLibrary(ana, at(BASE + DAY));
    fake.state.history = newestFirst([clip(3, { jobId: "de-luis", resultUrl: `${CDN}/de-luis.mp4` })]);
    await refreshLibrary(luis, at(BASE + DAY));
    expect(historyCalls().map((call) => call.userId)).toEqual([ana.id, luis.id]);

    const mine = await listLibrary(ana);
    expect(mine.clips.map((c) => c.videoUrl)).toEqual([`${CDN}/hf-2.mp4`, `${CDN}/hf-1.mp4`]);
    expect(mine.clips.every((c) => c.mine)).toBe(true);
    expect(mine.total).toBe(2);
    expect((await listLibrary(luis)).clips.map((c) => c.videoUrl)).toEqual([`${CDN}/de-luis.mp4`]);
    // El dueño tampoco ve los clips de otros en su biblioteca.
    expect((await listLibrary(dueno)).clips).toEqual([]);
  });

  it("pagina de los más recientes a los más antiguos con el cursor", async () => {
    fake.state.history = newestFirst(range(1, 25).map((n) => clip(n)));
    await refreshLibrary(ana, at(BASE + DAY));
    const first = await listLibrary(ana, { limit: 10 });
    expect(first.clips.map((c) => c.videoUrl)).toEqual(range(16, 25).reverse().map((n) => `${CDN}/hf-${n}.mp4`));
    expect(first.nextCursor).not.toBeNull();
    const second = await listLibrary(ana, { limit: 10, cursor: first.nextCursor });
    expect(second.clips.map((c) => c.videoUrl)).toEqual(range(6, 15).reverse().map((n) => `${CDN}/hf-${n}.mp4`));
    const third = await listLibrary(ana, { limit: 10, cursor: second.nextCursor });
    expect(third.clips).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    await expect(listLibrary(ana, { cursor: "abc" })).rejects.toMatchObject({ status: 400 });
  });

  it("dice si hay que actualizarla sola: vacía o con más de 10 minutos", async () => {
    expect(await listLibrary(ana, {}, { now: () => new Date(BASE) })).toMatchObject({ clips: [], total: 0, refreshedAt: null, stale: true });
    fake.state.history = newestFirst([clip(1)]);
    await refreshLibrary(ana, at(BASE + DAY));
    expect(await listLibrary(ana, {}, { now: () => new Date(BASE + DAY + 9 * MINUTE) })).toMatchObject({ stale: false, refreshedAt: new Date(BASE + DAY) });
    expect(await listLibrary(ana, {}, { now: () => new Date(BASE + DAY + 11 * MINUTE) })).toMatchObject({ stale: true });
  });

  it("con un producto, enseña sus cuerpos (de quien sean) a quien ve el producto; a quien no, 404", async () => {
    const product = await makeProduct(ana);
    fake.state.history = newestFirst([clip(1), clip(2)]);
    await refreshLibrary(ana, at(BASE + DAY));
    const [one] = (await listLibrary(ana)).clips.filter((c) => c.videoUrl.endsWith("hf-1.mp4"));
    await markBody(ana, product.id, { clipId: one.id, label: "Demostración" });

    const forAna = await listLibrary(ana, { productId: product.id });
    expect(forAna.clips).toHaveLength(1);
    expect(forAna.clips[0]).toMatchObject({ id: one.id, mine: true, bodies: [{ productId: product.id, productName: product.name, label: "Demostración", canRemove: true }] });
    // El dueño ve el cuerpo aunque el clip no sea suyo.
    const forOwner = await listLibrary(dueno, { productId: product.id });
    expect(forOwner.clips.map((c) => ({ id: c.id, mine: c.mine }))).toEqual([{ id: one.id, mine: false }]);
    expect(forOwner.clips[0].bodies[0].canRemove).toBe(true);
    await expect(listLibrary(luis, { productId: product.id })).rejects.toMatchObject({ status: 404 });
    // En su propia biblioteca, el clip lleva su marca.
    expect((await listLibrary(ana)).clips.find((c) => c.id === one.id)!.bodies).toHaveLength(1);
  });
});

describe("rutas de la biblioteca", () => {
  const as = async (user: AuthUser) => {
    cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
  };

  it("sin sesión, 401; con sesión, la biblioteca de quien pregunta", async () => {
    expect((await listRoute(new Request("http://localhost/api/biblioteca"))).status).toBe(401);
    expect((await refreshRoute()).status).toBe(401);

    fake.state.history = newestFirst([clip(1), clip(2), clip(3)]);
    await refreshLibrary(ana, at(BASE + DAY));
    await as(ana);
    const response = await listRoute(new Request("http://localhost/api/biblioteca?limite=2"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.clips.map((c: { videoUrl: string }) => c.videoUrl)).toEqual([`${CDN}/hf-3.mp4`, `${CDN}/hf-2.mp4`]);
    expect(body.total).toBe(3);
    expect(typeof body.nextCursor).toBe("string");
    expect((await listRoute(new Request("http://localhost/api/biblioteca?producto=abc"))).status).toBe(400);
    expect((await listRoute(new Request("http://localhost/api/biblioteca?producto=999999"))).status).toBe(404);
  });

  it("«Actualizar» sin Higgsfield conectado responde 409 con el código para ir a Ajustes", async () => {
    await as(luis);
    const response = await refreshRoute();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Conecta tu Higgsfield en Ajustes.", code: "higgsfield_connect" });
  });
});
