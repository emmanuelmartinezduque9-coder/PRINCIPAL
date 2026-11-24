import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import type { LlmCall, LlmGateway, LlmResult } from "@/llm/gateway";
import { LocalStore, setObjectStoreForTests } from "@/lib/object-store";
import type { AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import { refineSwitch } from "@/server/videos/edicion-referencia";
import { startEdit, type EditSpec } from "@/server/videos/edits";
import { processReference } from "@/server/videos/intake";
import { claimRun, runEdit, type MontajeDeps } from "@/server/videos/montaje-nube";
import { appendChunk, CHUNK_BYTES, finishUpload, startUpload } from "@/server/videos/upload";
import { createVideo, getVideoFor, type Video } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";
import { makeSampleVideo } from "./helpers/sample-video";
import { uploadSong } from "@/server/songs";

/**
 * «Editar como el vídeo de referencia de la réplica» (regla de Codex: «enlace de edición vacío → el vídeo
 * de referencia original»): la referencia se guarda entera al prepararla, la ficha la lleva cuando no hay
 * referencia de edición, el montaje lee sus rótulos (Claude simulado) y se los pasa al montador, y no vuelve
 * a gastar al montar otra vez. El montador de verdad lo prueba `montador/test_montar_auto.py`.
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const CLIP = "https://d1abc.cloudfront.net/clip.mp4";
/** Montador de prueba: copia el clip y guarda la ficha que recibió. */
const FAKE_MONTADOR = `
import json, shutil, sys
from pathlib import Path
spec = json.loads(Path(sys.argv[1]).read_text())
work = Path(sys.argv[2])
Path(spec['videoId'] and sys.argv[1]).with_name('ficha-vista.json').write_text(json.dumps(spec))
shutil.copy(spec['clips'][0]['path'], work / 'salida.mp4')
(work / 'resultado.json').write_text(json.dumps({'ok': True, 'avisos': spec.get('avisos', []) + ['edicion:' + json.dumps(spec.get('edicionReferencia'), ensure_ascii=False)],
  'autocomprobacion': {'ok': True, 'avisos': [], 'planos': 1, 'cortesEnBeat': None, 'intentos': 1}}))
`;

let dir: string;
let sample: string;
let mp4: Buffer;
let montadorDir: string;
let fontPath: string;
let store: LocalStore;
let ana: AuthUser;
const calls: Array<LlmCall<unknown>> = [];

const gateway: LlmGateway = {
  async call<T>(request: LlmCall<T>): Promise<LlmResult<T>> {
    calls.push(request as LlmCall<unknown>);
    const data = {
      rotulos: [
        { desde_s: 0, texto_original: "Frozen fans RUN to H&M ❄️🥺", texto_adaptado: "Eisfans, RENNT zu|EisWerk ❄️🍦", traduccion_es: "Fans del helado, corred", es_cta: false, franja_superior: 0.15, franja_inferior: 0.25 },
        { desde_s: 1.5, texto_original: "Comment “Frozen” for the link 😅", texto_adaptado: "Kommentiere „EisWerk“ für den Link 😅", traduccion_es: "Comenta", es_cta: true, franja_superior: 0.15, franja_inferior: 0.25 },
      ],
    };
    return { text: "", data: data as T, model: "prueba", usage: { inputTokens: 0, outputTokens: 0 } as never, costMicros: 0, spendEntryId: 0, ruleVersions: {}, webSources: [] };
  },
};

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-edicion-ref-"));
  sample = await makeSampleVideo(dir, { seconds: 3 });
  mp4 = fs.readFileSync(sample);
  montadorDir = path.join(dir, "montador");
  fs.mkdirSync(montadorDir);
  fs.writeFileSync(path.join(montadorDir, "montar_auto.py"), FAKE_MONTADOR);
  fontPath = path.join(dir, "fuente.ttf");
  fs.writeFileSync(fontPath, "fuente");
}, 120_000);

afterAll(async () => {
  setObjectStoreForTests(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  calls.length = 0;
  store = new LocalStore(path.join(dir, `objetos-${Math.random().toString(36).slice(2)}`), Buffer.alloc(32, 7));
  setObjectStoreForTests(store);
  ana = await makeUser("dueno");
});

const deps = (over: Partial<MontajeDeps> = {}): MontajeDeps => ({
  fetch: async () => new Response(new Uint8Array(mp4)),
  python: "python3",
  reaPython: null,
  font: fontPath,
  emojiFont: fontPath,
  montadorDir,
  gateway,
  ...over,
});

async function videoWithClip(over: Partial<typeof schema.videos.$inferInsert> = {}): Promise<Video> {
  const video = await createVideo(ana, (await makeProduct(ana, { name: "EisWerk" })).id);
  const db = getDb();
  if (Object.keys(over).length > 0) await db.update(schema.videos).set(over).where(eq(schema.videos.id, video.id));
  const [gen] = await db
    .insert(schema.generations)
    .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: ana.id, request: {}, count: 1, quotedCredits: 10 })
    .returning({ id: schema.generations.id });
  await db.insert(schema.generationResults).values({ generationId: gen.id, index: 0, jobId: `job-${video.id}`, ok: true, url: CLIP });
  return getVideoFor(ana, video.id);
}

async function mount(videoId: number) {
  const { runId } = await startEdit(ana, videoId);
  const outcome = await runEdit((await claimRun(new Date()))!, deps());
  const [row] = await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.id, runId));
  return { outcome, row, spec: row.spec as EditSpec };
}

describe("la referencia entera", () => {
  it("se guarda en el almacén al prepararla", async () => {
    const fake = createFakeHiggsfield();
    const video = await createVideo(ana, (await makeProduct(ana)).id);
    await saveCredential(ana.id, "higgsfield", { accessToken: "a", refreshToken: "r", clientId: "c" }, { needsReconnect: false });
    const bytes = fs.readFileSync(sample);
    const { uploadId } = await startUpload(ana, video.id, { filename: "ref.mp4", totalBytes: bytes.length }, { higgsfield: fake.port });
    for (let i = 0; i * CHUNK_BYTES < bytes.length; i++) await appendChunk(uploadId, i, bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES), { userId: ana.id });
    await finishUpload(uploadId, { userId: ana.id });
    await processReference(video.id, uploadId, { higgsfield: fake.port, store });
    const ready = await getVideoFor(ana, video.id);
    expect(ready.referenceStorageKey).toBe(`referencias/${video.id}/${uploadId}.mp4`);
    expect(await store.head(ready.referenceStorageKey!)).toBe(bytes.length);
  });
});

describe("editar como la referencia", () => {
  it("sin referencia de edición, el montaje lee la de la réplica (almacén), adapta sus rótulos y no vuelve a gastar", async () => {
    await store.putBuffer("referencias/x/ref.mp4", mp4, { contentType: "video/mp4" });
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4" });
    const first = await mount(video.id);
    expect(first.outcome).toBe("done");
    expect(first.spec.replicaReference).toEqual({ source: "almacen", key: "referencias/x/ref.mp4" });
    const edicion = JSON.parse(String(first.row.notes!.find((n) => n.startsWith("edicion:"))).slice("edicion:".length));
    expect(edicion.rotulos.map((r: { texto: string; cta: boolean }) => [r.texto, r.cta])).toEqual([
      ["Eisfans, RENNT zu|EisWerk ❄️🍦", false],
      ["Kommentiere „EisWerk“ für den Link 😅", true],
    ]);
    expect(edicion.rotulos[0].desde_s).toBe(0);
    expect(edicion.rotulos[1].desde_s).toBeGreaterThan(0.9);
    expect(edicion.rotulos[1].desde_s).toBeLessThanOrEqual(1.5);
    expect(edicion.duracion_s).toBeGreaterThan(2.9);
    // A Claude se le enseñan los fotogramas a 2 por segundo, con su tiempo, y el nombre del producto.
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0].content)).toContain("Nuestro producto: EisWerk");
    expect((calls[0].content as Array<{ type: string }>).filter((c) => c.type === "image").length).toBe(6);
    // Volver a montar: la misma edición, del almacén, sin llamar otra vez a Claude.
    const second = await mount(video.id);
    expect(second.outcome).toBe("done");
    expect(calls).toHaveLength(1);
  });

  it("con referencia de edición se usa esa, no la de la réplica", async () => {
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4", editReferenceUrl: "https://www.instagram.com/reel/abc/" });
    const { spec } = await mount(video.id);
    expect(spec.editReferenceUrl).toBe("https://www.instagram.com/reel/abc/");
    expect(spec.replicaReference).toBeNull();
  });

  it("de los antiguos (sin la referencia guardada) se usa su enlace; sin nada, el patrón de siempre y un aviso", async () => {
    const linked = await videoWithClip({ referenceSource: "link", referenceUrl: "https://www.tiktok.com/@a/video/1" });
    expect((await mount(linked.id)).spec.replicaReference).toEqual({ source: "enlace", url: "https://www.tiktok.com/@a/video/1" });
    const none = await videoWithClip();
    const { row, spec } = await mount(none.id);
    expect(spec.replicaReference).toBeNull();
    expect(row.notes).toContain("No está el vídeo de referencia de la réplica: se monta con el patrón de siempre");
  });
});

describe("ningún montaje sale mudo", () => {
  it("sin audio guardado ni canción, se usa el audio del vídeo de referencia; sin referencia, una canción de la biblioteca", async () => {
    await store.putBuffer("referencias/y/ref.mp4", mp4, { contentType: "video/mp4" });
    const withRef = await videoWithClip({ referenceStorageKey: "referencias/y/ref.mp4", dubDialogue: false });
    const first = await mount(withRef.id);
    expect(first.row.notes).toContain("No estaba guardado el audio de la referencia: se usa el del vídeo de referencia");

    const bare = await videoWithClip({ dubDialogue: false });
    const empty = await mount(bare.id);
    expect(empty.row.notes).toContain("El vídeo no tiene audio y la biblioteca no tiene canciones con drop: elige una canción");
    const { song } = await uploadSong(ana, fs.readFileSync(await makeSampleAudio(dir, "mp3", { seconds: 8 })), { title: "Respaldo", dropMs: 2000 });
    const again = await mount(bare.id);
    expect(again.row.notes).toContain(`El vídeo no tenía audio (ni canción ni audio de la referencia): se pone la canción «${song.title}» de la biblioteca`);
  });
});

describe("el fotograma del cambio de rótulo", () => {
  it("se afina al fotograma donde cambia la franja del texto", async () => {
    // 2 s a 24 fps: la franja de arriba es negra hasta 1,25 s y blanca después; el resto, gris fijo.
    const file = path.join(dir, "cambio.mp4");
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=270x480:r=24:d=2",
      "-vf", "drawbox=x=0:y=48:w=270:h=72:color=black:t=fill:enable='lt(t,1.25)',drawbox=x=0:y=48:w=270:h=72:color=white:t=fill:enable='gte(t,1.25)'",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
    ]);
    const t = await refineSwitch(file, 1.0, 1.5, 0.1, 0.25);
    expect(Math.abs(t - 1.25)).toBeLessThanOrEqual(1 / 24 + 1e-6);
  });
});
