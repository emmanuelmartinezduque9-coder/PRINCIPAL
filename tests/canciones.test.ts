import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import type { LlmGateway } from "@/llm/gateway";
import { composeSong, downloadSong, ensurePersonalizedSong, type Composition } from "@/server/videos/canciones";
import { createProduct } from "@/server/products";
import { createVideo } from "@/server/videos/videos";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";

const composition: Composition = { recipientName: "Hildegard", relationship: "abuela", story: "Mi abuela me preparaba Kakao nach der Schule", timing: [{ atMs: 0, text: "[Verse]\nDu warst immer hier" }, { atMs: 9000, text: "[Chorus]\nHildegard ich danke dir" }], lyrics: "[Verse]\nDu warst immer hier\n[Chorus]\nHildegard ich danke dir", genre: "pop", styles: ["car radio hit"], mood: "emotivo", voice: "femenina" };
const timingReport = [{ atMs: 9000, text: "Hildegard", actualMs: 9200, offsetMs: 200 }];
const verification = { heardRatio: 0.95, nameHeard: true, attempts: 1, transcript: "Hildegard", passed: true };
const musical = { timingReport, verification, id: "musical-1", title: "Hildegard", durationMs: 20000, sections: [composition.lyrics], words: [{ word: "Du", startMs: 0, endMs: 0 }, { word: "warst", startMs: 100, endMs: 350 }] };
let dir: string;
let mp3: Buffer;
beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "cancion-test-")); mp3 = await fs.readFile(await makeSampleAudio(dir, "mp3", { seconds: 20 })); });
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });
beforeEach(async () => { vi.stubEnv("WEB_MUSICAL_URL", "https://musical.example/"); vi.stubEnv("WEB_MUSICAL_INTERNAL_KEY", "clave-solo-prueba"); });

it("envía cabecera interna, idioma y duración exacta, sin relationship ni secretos en el cuerpo", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(musical, { status: 201 }));
  expect(await composeSong({ ...composition, language: "de", durationSeconds: 23.456 }, fetcher)).toEqual(musical);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://musical.example/api/internal/songs");
  expect(init?.headers).toEqual({ "x-internal-key": "clave-solo-prueba", "Content-Type": "application/json" });
  const { relationship: _, ...body } = composition;
  expect(JSON.parse(init!.body as string)).toEqual({ ...body, language: "de", durationSeconds: 23.5, leadMs: 700, verify: true });
});

it.each([400, 401, 429, 502])("explica el error %s en español sin guardar el cuerpo remoto", async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("secreto remoto", { status }));
  await expect(composeSong({ ...composition, language: "de", durationSeconds: 20 }, fetcher)).rejects.toThrow("Web musical:");
  await expect(downloadSong("1", fetcher)).rejects.not.toThrow("secreto remoto");
});

it("descarga solo del endpoint autenticado y escapa el identificador remoto", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(mp3)));
  expect(await downloadSong("a/b", fetcher)).toEqual(mp3);
  expect(fetcher.mock.calls[0][0]).toBe("https://musical.example/api/internal/songs/a%2Fb/audio");
  expect(fetcher.mock.calls[0][1]?.headers).toEqual({ "x-internal-key": "clave-solo-prueba" });
});

it.each([true, false])("transcribe, adapta y guarda una sola vez cuando hay desglose (con desglose=%s); reintentar descarga no recompone", async withAnalysis => {
  await truncateAll();
  const owner = await makeUser("dueno");
  const product = await createProduct(owner, { name: "Tu canción", summary: "Regala música", kind: "cancion", language: "de", countries: ["DE"] });
  const video = await createVideo(owner, product.id);
  await getDb().update(schema.videos).set({ referenceStatus: "ready", referenceMediaId: "ref-1", referenceDurationMs: 20000 }).where(eq(schema.videos.id, video.id));
  await getDb().insert(schema.videoReferenceAudio).values({ videoId: video.id, mime: "audio/mp4", size: mp3.length, data: mp3, durationMs: 20000 });
  const shots = [{ startS: 9, endS: 20, seen: "Abuela", action: "Llora al oír su nombre", onScreenText: "" }];
  if (withAnalysis) await getDb().insert(schema.videoAnalyses).values([
    { videoId: video.id, version: 1, status: "done", result: { shots: [] }, createdBy: owner.id },
    { videoId: video.id, version: 2, status: "done", result: { shots }, createdBy: owner.id },
    { videoId: video.id, version: 3, status: "queued", createdBy: owner.id },
  ]);
  const transcribe = vi.fn().mockResolvedValue({ idioma: "es", texto: "Abuela Carmen", frases: [{ desde: 0, hasta: 20, texto: "Abuela Carmen" }] });
  const call = vi.fn().mockResolvedValue({ data: composition });
  let audioAttempts = 0;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") return Response.json(musical, { status: 201 });
    if (++audioAttempts === 1) return new Response("error", { status: 502 });
    return new Response(new Uint8Array(mp3));
  });
  const deps = { transcribe, gateway: { call } as unknown as LlmGateway, fetch: fetcher };
  if (!withAnalysis) {
    // Sin desglose no hay reacciones a las que alinear la letra: espera, sin gastar nada.
    await expect(ensurePersonalizedSong(video.id, deps)).rejects.toThrow("aún no tiene desglose");
    expect(call).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    return;
  }
  for (const status of withAnalysis ? ["queued", "running"] : []) {
    await getDb().update(schema.videoAnalyses).set({ status }).where(eq(schema.videoAnalyses.version, 3));
    await expect(ensurePersonalizedSong(video.id, deps)).rejects.toThrow("reintentar");
    expect(call).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  }
  await getDb().update(schema.videoAnalyses).set({ status: "failed" }).where(eq(schema.videoAnalyses.version, 3));
  await expect(ensurePersonalizedSong(video.id, deps)).rejects.toThrow("proveedor");
  const songId = await ensurePersonalizedSong(video.id, deps);
  expect(await ensurePersonalizedSong(video.id, deps)).toBe(songId);
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][0].content[0].text).toContain('"language":"de"');
  expect(JSON.parse(call.mock.calls[0][0].content[0].text)).toMatchObject({ shots: withAnalysis ? shots : [] });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  const [saved] = await getDb().select().from(schema.songs);
  expect(saved).toMatchObject({ id: songId, sections: ["canciones-personalizadas", "Tu canción"], startMs: 0, dropMs: 0, mime: "audio/mpeg", data: mp3 });
  const [lyrics] = await getDb().select().from(schema.songLyrics);
  expect(lyrics).toMatchObject({ songId, lyrics: composition.lyrics, sections: musical.sections, words: musical.words });
  const [linked] = await getDb().select().from(schema.videos).where(eq(schema.videos.id, video.id));
  expect(linked).toMatchObject({ songId, audioMode: "cancion" });
});

it("un producto físico no crea canciones ni llama proveedores", async () => {
  await truncateAll();
  const owner = await makeUser("dueno");
  const product = await createProduct(owner, { name: "Físico", summary: "Artículo" });
  const video = await createVideo(owner, product.id);
  const fetcher = vi.fn<typeof fetch>();
  expect(await ensurePersonalizedSong(video.id, { fetch: fetcher })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("conserva los informes y avisa si la verificación falla", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = { ...musical, verification: { ...verification, passed: false } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    expect(await composeSong({ ...composition, language: "de", durationSeconds: 20 }, fetcher)).toEqual(response);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});

it.each([
  { timing: [{ atMs: 1, text: "inicio" }] },
  { timing: [{ atMs: 0, text: "inicio" }, { atMs: 2999, text: "cerca" }] },
  { timing: [{ atMs: 0, text: "inicio" }, { atMs: 20000, text: "final" }] },
])("rechaza tiempos inválidos antes de llamar al proveedor: %j", async ({ timing }) => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(composeSong({ ...composition, timing, language: "de", durationSeconds: 20 }, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it("junta las secciones a menos de 3 s, empieza en 0 y no deja nada fuera de la duración", async () => {
  const { normalizeTiming } = await import("@/server/videos/canciones");
  expect(normalizeTiming([{ atMs: 9000, text: "C" }, { atMs: 400, text: "A" }, { atMs: 2000, text: "B" }, { atMs: 31000, text: "D" }], 30600))
    .toEqual([{ atMs: 0, text: "A\nB" }, { atMs: 9000, text: "C\nD" }]);
});
