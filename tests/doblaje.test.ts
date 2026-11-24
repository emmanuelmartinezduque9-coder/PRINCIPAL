import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHiggsfield, DUB_CREDITS, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { HiggsfieldUnknownOutcomeError } from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import type { LlmCall, LlmGateway, LlmResult } from "@/llm/gateway";
import { LocalStore, setObjectStoreForTests } from "@/lib/object-store";
import type { AuthUser } from "@/server/auth";
import { uploadSong } from "@/server/songs";

import { DUB_UNKNOWN } from "@/server/videos/doblaje";
import { recheckDubbedEdits, reclassifyDubbedEdits, redubTodaysEdits, remountDubbedWithoutEdit, startEdit, type EditSpec } from "@/server/videos/edits";
import { createBatch } from "@/server/videos/batches";
import { claimRun, runEdit, type MontajeDeps } from "@/server/videos/montaje-nube";
import { createVideo, getVideoFor, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";
import { makeSampleVideo } from "./helpers/sample-video";

/**
 * «Traducir el diálogo al alemán» (`doblaje.ts`, copia del método de Codex del 19/11/2026): la opción
 * en la tarjeta y en el lote, y el montaje en la nube con un Higgsfield simulado, un `doblar.py` de
 * prueba (separar/mezclar) y un montador de prueba que apunta qué audio recibió. `doblar.py` de
 * verdad tiene sus pruebas en Python (`montador/test_doblar.py`), que también se lanzan aquí.
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const CLIP = "https://d1abc.cloudfront.net/clip.mp4";
const ORIGINAL = Buffer.from("AUDIO-ORIGINAL-INGLES");

/** Montador de prueba: copia el clip y devuelve en sus avisos el principio del «Audio original» que recibió. */
const FAKE_MONTADOR = `
import json, shutil, sys
from pathlib import Path
spec = json.loads(Path(sys.argv[1]).read_text())
work = Path(sys.argv[2])
ref = (spec.get('referenceAudio') or {}).get('path')
audio = Path(ref).read_bytes()[:30].decode('utf8', 'replace') if ref else 'ninguno'
shutil.copy(spec['clips'][0]['path'], work / 'salida.mp4')
import os
(work / 'resultado.json').write_text(json.dumps({'ok': True, 'avisos': spec.get('avisos', []) + ['audio:' + audio, 'numba:' + os.environ.get('NUMBA_CACHE_DIR', '')],
  'autocomprobacion': {'ok': True, 'avisos': [], 'planos': 3, 'cortesEnBeat': '2/2', 'intentos': 1}}))
`;

/** doblar.py de prueba: «separar» deja el vídeo con la voz; «mezclar», un audio que se reconoce. */
const FAKE_DOBLAR = `
import json, shutil, sys
from pathlib import Path
args = sys.argv[1:]
out = Path(args[args.index('--resultado') + 1]); args = args[args.index('--resultado') + 2:]
if args[0] == 'separar':
    d = Path(args[2]); d.mkdir(parents=True, exist_ok=True)
    (d / 'music.wav').write_bytes(b'musica')
    shutil.copy(args[1], d / 'dialogue-only.mp4')
    audio = Path(args[1]).read_bytes()
    if audio.startswith(b'SIN-VOZ'):
        voz = {'hay': False, 'idioma': None, 'probabilidad': None, 'texto': '', 'motivo': 'sin palabras'}
    elif audio.startswith(b'AUDIO-ALEMAN'):
        voz = {'hay': True, 'idioma': 'de', 'probabilidad': 0.97, 'texto': 'Drei, zwei, eins', 'motivo': None,
               'frases': [{'desde': 0.5, 'hasta': 1.8, 'texto': 'Drei, zwei, eins', 'idioma': 'de', 'prob': 0.97, 'no_habla': 0.05, 'confianza': -0.3}]}
    elif audio.startswith(b'CANCION'):
        texto = 'CANTO: I love her wings, I love her wings'
        voz = {'hay': True, 'idioma': 'en', 'probabilidad': 0.9, 'texto': texto, 'motivo': None,
               'frases': [{'desde': 0.0, 'hasta': 2.0, 'texto': texto, 'idioma': 'en', 'prob': 0.9, 'no_habla': 0.1, 'confianza': -0.9}]}
    else:
        voz = {'hay': True, 'idioma': 'en', 'probabilidad': 0.98, 'texto': 'Three, two, one', 'motivo': None,
               'frases': [{'desde': 0.5, 'hasta': 1.8, 'texto': 'Three, two, one', 'idioma': 'en', 'prob': 0.98, 'no_habla': 0.05, 'confianza': -0.3}]}
    candidatas = []
    if audio.startswith(b'MUSICA-HABLA'):
        voz = {'hay': False, 'idioma': None, 'probabilidad': None, 'texto': '', 'motivo': 'voz casi muda', 'frases': []}
        candidatas = [{'desde': 0.0, 'hasta': 3.5, 'texto': "Three, two, one, let's go!", 'idioma': 'en', 'prob': 0.7, 'no_habla': 0.07, 'confianza': -0.8, 'pista': 'music'},
                      {'desde': 4.0, 'hasta': 11.0, 'texto': 'CANTO: Last Christmas, I gave you my heart', 'idioma': 'en', 'prob': 0.8, 'no_habla': 0.4, 'confianza': -0.5, 'pista': 'music'}]
    elif audio.startswith(b'MUSICA-CANTO'):
        voz = {'hay': False, 'idioma': None, 'probabilidad': None, 'texto': '', 'motivo': 'voz casi muda', 'frases': []}
        candidatas = [{'desde': 2.8, 'hasta': 11.1, 'texto': 'CANTO: Last Christmas, I gave you my heart', 'idioma': 'en', 'prob': 0.73, 'no_habla': 0.43, 'confianza': -0.47, 'pista': 'music'}]
    r = {'ok': True, 'voz': voz, 'candidatas': candidatas}
elif args[0] == 'rescatar':
    Path(args[1]).joinpath('rescatar.json').write_text(json.dumps(args[2:]))
    r = {'ok': True}
elif args[0] == 'comprobar':
    # Con una referencia «FUGA», la primera comprobación encuentra una frase en inglés; después, nada.
    n = Path(args[1]).with_name('comprobaciones')
    veces = int(n.read_text()) if n.exists() else 0
    n.write_text(str(veces + 1))
    fuga = (Path(args[1]).parent / 'referencia-audio.m4a').read_bytes().startswith(b'FUGA') if (Path(args[1]).parent / 'referencia-audio.m4a').exists() else False
    quedan = [{'desde': 11.5, 'hasta': 13.2, 'texto': 'Look at her wings!', 'idioma': 'en'}] if fuga and veces == 0 else []
    if Path(args[1]).read_bytes().startswith(b'DOBLAJE-VIEJO-EN'):
        quedan = [{'desde': 0.0, 'hasta': 3.4, 'texto': "3, 2, 1, let's see this guy!", 'idioma': 'en'}]
    r = {'ok': True, 'comprobado': True, 'quedan': quedan}
elif args[0] == 'tramo':
    shutil.copy(Path(args[1]) / 'dialogue-only.mp4', args[4])
    r = {'ok': True, 'desde': float(args[2]) - 0.25, 'hasta': float(args[3]) + 0.25}
elif args[0] == 'injertar':
    Path(args[4]).write_bytes(b'VOZ-INJERTADA')
    r = {'ok': True}
else:
    Path(args[3]).write_bytes(b'MEZCLA-ALEMANA')
    r = {'ok': True}
out.write_text(json.dumps(r))
`;

let dueno: AuthUser;
let sampleDir: string;
let montadorDir: string;
let fontPath: string;
let mp4: Buffer;
let mp3: Buffer;
let store: LocalStore;
let hf: FakeHiggsfield;

const fakeFetch: typeof fetch = async () => new Response(new Uint8Array(mp4));

beforeAll(async () => {
  sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-doblaje-"));
  mp4 = fs.readFileSync(await makeSampleVideo(sampleDir, { seconds: 2 }));
  mp3 = fs.readFileSync(await makeSampleAudio(sampleDir, "mp3", { seconds: 6 }));
  montadorDir = path.join(sampleDir, "montador");
  fs.mkdirSync(montadorDir);
  fs.writeFileSync(path.join(montadorDir, "montar_auto.py"), FAKE_MONTADOR);
  fs.writeFileSync(path.join(montadorDir, "doblar.py"), FAKE_DOBLAR);
  fontPath = path.join(sampleDir, "fuente.ttf");
  fs.writeFileSync(fontPath, "fuente de prueba");
}, 120_000);

afterAll(async () => {
  setObjectStoreForTests(undefined);
  fs.rmSync(sampleDir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  store = new LocalStore(path.join(sampleDir, `objetos-${Math.random().toString(36).slice(2)}`), Buffer.alloc(32, 3));
  setObjectStoreForTests(store);
  hf = createFakeHiggsfield({}, { autoComplete: true });
  speech.calls = 0;
  speech.down = false;
  dueno = await makeUser("dueno");
});

/** Claude simulado para «¿habla o canto?»: lo que empieza por «CANTO» es canto; el resto, habla. Con `down`, no responde. */
const speech = { calls: 0, down: false };
const gateway: LlmGateway = {
  async call<T>(request: LlmCall<T>): Promise<LlmResult<T>> {
    speech.calls += 1;
    if (speech.down) throw new Error("Claude sin saldo");
    const lines = String((request.content as Array<{ text?: string }>)[0]?.text ?? "").split("\n");
    const data = { frases: lines.map((line, i) => ({ n: i + 1, tipo: line.includes("CANTO") ? "canto" : "habla", motivo: "prueba" })) };
    return { text: "", data: data as T, model: "prueba", usage: {} as never, costMicros: 0, spendEntryId: 0, ruleVersions: {}, webSources: [] };
  },
};

const deps = (over: Partial<MontajeDeps> = {}): MontajeDeps => ({
  fetch: fakeFetch,
  python: "python3",
  reaPython: null,
  font: fontPath,
  montadorDir,
  higgsfield: hf.port,
  dubPollSeconds: 0,
  gateway,
  ...over,
});

/** Un vídeo con su clip terminado y el audio de su referencia guardado («Audio original»). */
async function videoWithAudio(over: Partial<typeof schema.videos.$inferInsert> = {}): Promise<Video> {
  const product = await makeProduct(dueno, { name: "EisWerk" });
  const video = await createVideo(dueno, product.id);
  const db = getDb();
  if (Object.keys(over).length > 0) await db.update(schema.videos).set(over).where(eq(schema.videos.id, video.id));
  const [gen] = await db
    .insert(schema.generations)
    .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: dueno.id, request: {}, count: 1, quotedCredits: 10 })
    .returning({ id: schema.generations.id });
  await db.insert(schema.generationResults).values({ generationId: gen.id, index: 0, jobId: `job-clip-${video.id}`, ok: true, url: CLIP });
  await db.insert(schema.videoReferenceAudio).values({ videoId: video.id, mime: "audio/mp4", size: ORIGINAL.length, durationMs: 2000, data: ORIGINAL });
  return getVideoFor(dueno, video.id);
}

async function mount(videoId: number, over: Partial<MontajeDeps> = {}) {
  const { runId } = await startEdit(dueno, videoId);
  const run = (await claimRun(new Date()))!;
  const outcome = await runEdit(run, deps(over));
  const [row] = await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.id, runId));
  return { outcome, row, spec: row.spec as EditSpec };
}

const dubRows = () => getDb().select().from(schema.dubs).orderBy(schema.dubs.id);
const dubCalls = () => hf.calls.filter((c) => c.method === "submitDubbing");

describe("caché de numba", () => {
  it("cada montaje usa su propia caché de numba (una compartida se corrompe y el montador muere con SIGSEGV)", async () => {
    const video = await videoWithAudio({ dubDialogue: false });
    const { row } = await mount(video.id);
    const numba = row.notes!.find((n) => n.startsWith("numba:"))!.slice("numba:".length);
    expect(numba).toMatch(new RegExp(`montaje-${row.id}-[^/]+/numba$`));
  });
});

describe("la opción", () => {
  it("por defecto se dobla (regla fija del dueño); solo no si se apaga en la tarjeta", async () => {
    const video = await videoWithAudio();
    expect((await videoView(dueno, video.id)).dubDialogue).toBe(true);
    await updateVideoChoices(dueno, video.id, { dubDialogue: false });
    expect((await videoView(dueno, video.id)).dubDialogue).toBe(false);
    await updateVideoChoices(dueno, video.id, { dubDialogue: null });
    expect((await videoView(dueno, video.id)).dubDialogue).toBe(true);
    await expect(updateVideoChoices(dueno, video.id, { dubDialogue: "sí" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("cuándo no hace falta doblar (no se gasta)", () => {
  async function withAudio(bytes: Buffer) {
    const video = await videoWithAudio();
    await getDb().update(schema.videoReferenceAudio).set({ data: bytes, size: bytes.length }).where(eq(schema.videoReferenceAudio.videoId, video.id));
    return video;
  }

  it("con el diálogo ya en alemán: el audio tal cual, sin Higgsfield, y no se vuelve a mirar", async () => {
    const video = await withAudio(Buffer.from("AUDIO-ALEMAN"));
    const first = await mount(video.id);
    expect(first.outcome).toBe("done");
    expect(first.row.notes).toContain("audio:AUDIO-ALEMAN");
    expect(first.row.notes).toContain("El diálogo de la referencia ya está en alemán: no se dobla");
    expect(hf.calls).toEqual([]);
    expect((await dubRows()).map((r) => [r.status, r.quotedCredits])).toEqual([["skipped", 0]]);
    await mount(video.id);
    expect(hf.calls).toEqual([]);
  });

  it("sin diálogo: el audio tal cual y sin gastar", async () => {
    const video = await withAudio(Buffer.from("SIN-VOZ"));
    const { outcome, row } = await mount(video.id);
    expect(outcome).toBe("done");
    expect(row.notes).toContain("audio:SIN-VOZ");
    expect(hf.calls).toEqual([]);
  });

  it("apagado en la tarjeta: ni se mira", async () => {
    const video = await videoWithAudio({ dubDialogue: false });
    const { row } = await mount(video.id);
    expect(row.notes).toContain(`audio:${ORIGINAL.toString()}`);
    expect(hf.calls).toEqual([]);
    expect(await dubRows()).toEqual([]);
  });
});

describe("el montaje con el diálogo traducido", () => {
  it("separa, dobla SOLO la voz con Higgsfield (`dubbing`, deu) una vez y el montaje usa el audio mezclado", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    const first = await mount(video.id);
    expect(first.outcome).toBe("done");
    expect(first.spec.dubDialogue).toBe(true);
    expect(first.row.notes).toContain("audio:MEZCLA-ALEMANA");
    // A Higgsfield se sube el vídeo con solo la voz y se pide el doblaje al alemán, presupuestado antes.
    const methods = hf.calls.map((c) => c.method);
    expect(methods.indexOf("quoteDubbing")).toBeLessThan(methods.indexOf("submitDubbing"));
    expect(hf.calls.find((c) => c.method === "uploadMedia")?.args).toMatchObject({ filename: "dialogue-only.mp4", type: "video" });
    expect(dubCalls().map((c) => c.args)).toEqual([{ request: { mediaId: "media-1", targetLanguage: "deu" } }]);
    const [dub] = await dubRows();
    expect(dub).toMatchObject({ status: "done", quotedCredits: DUB_CREDITS, creditsSpent: DUB_CREDITS, storageKey: `doblajes/${video.id}/${dub.id}.m4a` });
    await store.download(dub.storageKey!, path.join(sampleDir, "d.m4a"));
    expect(fs.readFileSync(path.join(sampleDir, "d.m4a"), "utf8")).toBe("MEZCLA-ALEMANA");

    // Volver a montar: el mismo doblaje, del almacén, sin pagar otra vez.
    const second = await mount(video.id);
    expect(second.outcome).toBe("done");
    expect(second.row.notes).toContain("audio:MEZCLA-ALEMANA");
    expect(dubCalls()).toHaveLength(1);
  });

  it("con canción elegida no hay diálogo que traducir: monta con la canción y lo avisa, sin gastar", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    const { song } = await uploadSong(dueno, mp3, { title: "Canción", dropMs: 1000 });
    await getDb().update(schema.videos).set({ songId: song.id, audioMode: "cancion" }).where(eq(schema.videos.id, video.id));
    await mount(video.id);
    expect(dubCalls()).toEqual([]);
    expect(await dubRows()).toEqual([]);
  });

  it("sin saldo para el doblaje, se para con el motivo y no envía nada", async () => {
    hf.state.credits = 10;
    const video = await videoWithAudio({ dubDialogue: true });
    const { outcome } = await mount(video.id);
    expect(outcome).toBe("failed");
    expect((await getVideoFor(dueno, video.id)).editError).toBe(
      `No se pudo doblar el diálogo: no hay saldo en Higgsfield (hacen falta ${DUB_CREDITS} créditos y quedan 10)`,
    );
    expect(dubCalls()).toEqual([]);
  });

  it("si no se sabe si el envío llegó, no se repite solo; al volver a montar, sí", async () => {
    hf.failNext("submitDubbing", new HiggsfieldUnknownOutcomeError());
    const video = await videoWithAudio({ dubDialogue: true });
    const { outcome } = await mount(video.id);
    expect(outcome).toBe("failed");
    expect((await getVideoFor(dueno, video.id)).editError).toBe(DUB_UNKNOWN);
    expect((await dubRows()).map((r) => r.status)).toEqual(["unknown"]);
    // La persona vuelve a montar: se da la duda por fallida y se envía otra vez.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await mount(video.id);
    expect(again.outcome).toBe("done");
    expect((await dubRows()).map((r) => r.status)).toEqual(["failed", "done"]);
  });

  it("si Higgsfield aún no ha terminado, el montaje vuelve a la cola y luego recoge el mismo trabajo", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    let t = Date.now();
    const clock = () => new Date((t += 6 * 60_000));
    const slow = createFakeHiggsfield();
    const { outcome, row } = await mount(video.id, { higgsfield: slow.port, now: clock });
    expect(outcome).toBe("deferred");
    expect(row.status).toBe("queued");
    const [dub] = await dubRows();
    expect(dub.status).toBe("submitted");
    // Terminó: el siguiente intento lo recoge sin volver a enviar.
    slow.state.jobs[dub.jobId!] = { jobId: dub.jobId!, status: "done", failure: null, error: null, urls: ["https://cdn.higgsfield.ai/dub.mp4"] };
    await getDb().update(schema.editRuns).set({ availableAt: new Date(0) }).where(eq(schema.editRuns.id, row.id));
    const run = (await claimRun(new Date()))!;
    expect(await runEdit(run, deps({ higgsfield: slow.port }))).toBe("done");
    expect(slow.calls.filter((c) => c.method === "submitDubbing")).toHaveLength(1);
    expect((await dubRows())[0].status).toBe("done");
  });
});

describe("que no quede nada en el idioma original", () => {
  it("si Whisper oye una frase en inglés después de mezclar, se vuelve a doblar ese trozo y se injerta", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    const fuga = Buffer.from("FUGA-AUDIO-INGLES");
    await getDb().update(schema.videoReferenceAudio).set({ data: fuga, size: fuga.length }).where(eq(schema.videoReferenceAudio.videoId, video.id));
    const { outcome, row } = await mount(video.id);
    expect(outcome).toBe("done");
    expect(dubCalls()).toHaveLength(2); // el vídeo entero y el trozo
    expect(row.notes).toContain("Vuelto a doblar porque seguía en el idioma original: «Look at her wings!» (11.5–13.2 s)");
    const [dub] = await dubRows();
    expect(dub).toMatchObject({ status: "done", creditsSpent: DUB_CREDITS * 2, error: null });
    expect(dub.raw).toMatchObject({ comprobado: true, quedan: [], reparaciones: [{ desde: 11.5, hasta: 13.2 }] });
  });

  it("una vez al arrancar, los vídeos con un doblaje sin comprobar vuelven a montarse", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    await mount(video.id);
    expect(await recheckDubbedEdits()).toBe(0); // ya comprobado: nada (y la marca queda puesta)
    await getDb().delete(schema.settings).catch(() => {});
    const [first] = await dubRows();
    await getDb().update(schema.dubs).set({ raw: { origen: "en" } }).where(eq(schema.dubs.id, first.id));
    expect(await recheckDubbedEdits()).toBe(1);
    expect(await recheckDubbedEdits()).toBe(0);
  });

  it("al arrancar, un vídeo con el doblaje hecho y comprobado pero sin montar vuelve a montarse (sin gastar)", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    await mount(video.id);
    expect(await remountDubbedWithoutEdit()).toBe(0); // ya montado con ese doblaje
    // El montaje se cortó: el doblaje es más nuevo que el último montaje.
    await getDb().update(schema.dubs).set({ updatedAt: new Date(Date.now() + 60_000) });
    expect(await remountDubbedWithoutEdit()).toBe(1);
    expect(await remountDubbedWithoutEdit()).toBe(0); // ya en cola
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("done");
    expect(dubCalls()).toHaveLength(1);
  });

  it("un doblaje hecho antes de la comprobación (sin `comprobado`) se rehace al volver a montar", async () => {
    const video = await videoWithAudio({ dubDialogue: true });
    await mount(video.id);
    const [first] = await dubRows();
    await getDb().update(schema.dubs).set({ raw: { origen: "en" } }).where(eq(schema.dubs.id, first.id));
    await mount(video.id);
    expect(dubCalls()).toHaveLength(2);
    expect((await dubRows()).map((r) => r.status)).toEqual(["failed", "done"]);
  });
});

describe("una canción no se traduce nunca (orden del 24/11/2026)", () => {
  async function withAudio(bytes: Buffer, over: Partial<typeof schema.videos.$inferInsert> = {}) {
    const video = await videoWithAudio(over);
    await getDb().update(schema.videoReferenceAudio).set({ data: bytes, size: bytes.length }).where(eq(schema.videoReferenceAudio.videoId, video.id));
    return video;
  }

  it("si la voz es una canción, no se dobla ni se gasta: el audio original tal cual", async () => {
    const video = await withAudio(Buffer.from("CANCION-EN-INGLES"));
    const { outcome, row } = await mount(video.id);
    expect(outcome).toBe("done");
    expect(row.notes).toContain("audio:CANCION-EN-INGLES");
    expect(row.notes).toContain("La voz de la referencia es una canción (o no está claro que alguien hable): no se dobla; la canción no se traduce");
    expect(hf.calls).toEqual([]);
    expect((await dubRows()).map((r) => [r.status, r.error])).toEqual([["skipped", "solo canto o duda"]]);
  });

  it("habla que BandIt dejó en la música (voz muda): se dobla solo la habla; la canción de al lado no", async () => {
    const video = await withAudio(Buffer.from("MUSICA-HABLA"));
    const { outcome, row } = await mount(video.id);
    expect(outcome).toBe("done");
    expect(row.notes).toContain("audio:MEZCLA-ALEMANA");
    expect(row.notes).toContain("Habla que estaba en la música, también doblada: «Three, two, one, let's go!» (0–3.5 s)");
    expect(row.notes).toContain("No se dobla (canción o dudoso): «CANTO: Last Christmas, I gave you my heart»");
    expect(dubCalls()).toHaveLength(1);
    const [dub] = await dubRows();
    expect(dub.raw).toMatchObject({ clasificado: true, origen: "en", ventanas: [[0, 3.5]] });
  });

  it("una marca antigua de «sin diálogo» se vuelve a mirar: con habla en la música, ahora se dobla (vídeo 22)", async () => {
    const video = await withAudio(Buffer.from("MUSICA-HABLA"));
    const sha = (await import("node:crypto")).createHash("sha256").update("MUSICA-HABLA").digest("hex");
    await getDb().insert(schema.dubs).values({ videoId: video.id, userId: dueno.id, sourceSha256: sha, language: "deu", status: "skipped", quotedCredits: 0, error: "sin diálogo (voz casi muda)", raw: { hay: false } });
    expect(await reclassifyDubbedEdits()).toBe(1);
    const run = (await claimRun(new Date()))!;
    expect(await runEdit(run, deps())).toBe("done");
    expect(dubCalls()).toHaveLength(1);
    expect((await dubRows()).map((r) => r.status)).toEqual(["failed", "done"]);
  });

  it("solo canción en la música (voz muda): no se dobla", async () => {
    const video = await withAudio(Buffer.from("MUSICA-CANTO"));
    const { row } = await mount(video.id);
    expect(row.notes).toContain("audio:MUSICA-CANTO");
    expect(hf.calls).toEqual([]);
  });

  it("si Claude no puede decidir, en caso de duda no se dobla", async () => {
    speech.down = true;
    const video = await withAudio(Buffer.from("VOZ-INGLES"));
    const { row } = await mount(video.id);
    expect(row.notes).toContain("No se pudo decidir si la voz es habla o una canción: no se dobla");
    expect(hf.calls).toEqual([]);
  });

  it("un doblaje viejo de habla que sigue en el idioma original no se reutiliza: se vuelve a doblar (vídeo 22)", async () => {
    const video = await withAudio(Buffer.from("VOZ-INGLES"));
    const sha = (await import("node:crypto")).createHash("sha256").update("VOZ-INGLES").digest("hex");
    const key = `doblajes/${video.id}/viejo.m4a`;
    await store.putBuffer(key, Buffer.from("DOBLAJE-VIEJO-EN"), { contentType: "audio/mp4" });
    await getDb().insert(schema.dubs).values({ videoId: video.id, userId: dueno.id, sourceSha256: sha, language: "deu", status: "done", quotedCredits: 39, storageKey: key, raw: { comprobado: true, origen: "en" } });
    const { row } = await mount(video.id);
    expect(row.notes).toContain("El doblaje anterior seguía en el idioma original («3, 2, 1, let's see this guy!»): se vuelve a doblar");
    expect(row.notes).toContain("audio:MEZCLA-ALEMANA");
    expect(dubCalls()).toHaveLength(1);
    expect((await dubRows()).map((r) => r.status)).toEqual(["failed", "done"]);
  });

  it("una vez al arrancar, los vídeos con un doblaje sin decidir habla o canto vuelven a montarse", async () => {
    const video = await withAudio(Buffer.from("CANCION-EN-INGLES"));
    await getDb().insert(schema.dubs).values({ videoId: video.id, userId: dueno.id, sourceSha256: "x".repeat(64), language: "deu", status: "done", quotedCredits: 44, storageKey: "doblajes/x.m4a", raw: { comprobado: true } });
    expect(await reclassifyDubbedEdits()).toBe(1);
    expect((await getDb().select().from(schema.editRuns)).map((r) => [r.videoId, r.status])).toEqual([[video.id, "queued"]]);
    expect(await reclassifyDubbedEdits()).toBe(0);
  });

  it("un doblaje ya hecho de una canción se retira y vuelve el audio original; uno de habla se reutiliza sin pagar", async () => {
    const song = await withAudio(Buffer.from("CANCION-EN-INGLES"));
    const talk = await withAudio(Buffer.from("VOZ-INGLES"));
    // Doblajes de antes de decidir habla o canto (sin `clasificado`), ya comprobados.
    for (const video of [song, talk]) {
      const sha = (await import("node:crypto")).createHash("sha256").update(video.id === song.id ? "CANCION-EN-INGLES" : "VOZ-INGLES").digest("hex");
      const key = `doblajes/${video.id}/viejo.m4a`;
      await store.putBuffer(key, Buffer.from("DOBLAJE-VIEJO"), { contentType: "audio/mp4" });
      await getDb().insert(schema.dubs).values({ videoId: video.id, userId: dueno.id, sourceSha256: sha, language: "deu", status: "done", quotedCredits: 44, creditsSpent: 44, storageKey: key, raw: { comprobado: true, origen: "en" } });
    }
    const a = await mount(song.id);
    expect(a.row.notes).toContain("audio:CANCION-EN-INGLES");
    expect(a.row.notes).toContain("El doblaje anterior era de una canción: se quita y vuelve el audio original");
    const b = await mount(talk.id);
    expect(b.row.notes).toContain("audio:DOBLAJE-VIEJO");
    expect(dubCalls()).toEqual([]);
    const rows = await dubRows();
    expect(rows.map((r) => [r.videoId, r.status])).toEqual([[song.id, "skipped"], [talk.id, "done"]]);
    expect(rows[1].raw).toMatchObject({ clasificado: true, ventanas: [[0.5, 1.8]] });
  });
});

describe("los vídeos de hoy ya montados (orden del 24/11/2026)", () => {
  it("se vuelven a montar una sola vez: los de lote con «Audio original», doblaje no apagado y montados desde el 23/11", async () => {
    const batch = await createBatch(dueno, "23/11 · EisWerk");
    const montado = async (over: Partial<typeof schema.videos.$inferInsert>, at = new Date()) => {
      const video = await videoWithAudio({ batchId: batch.id, editStatus: "hecho", ...over });
      await getDb().insert(schema.edits).values({ videoId: video.id, version: 1, size: 1, durationMs: 1000, storageKey: `montajes/${video.id}/1.mp4`, createdAt: at });
      return video;
    };
    const sí = await montado({});
    await montado({ dubDialogue: false });
    await montado({}, new Date("2026-11-20T10:00:00Z"));
    await videoWithAudio({ editStatus: "hecho" }); // sin lote
    expect(await redubTodaysEdits()).toBe(1);
    const runs = await getDb().select().from(schema.editRuns);
    expect(runs.map((r) => [r.videoId, r.status])).toEqual([[sí.id, "queued"]]);
    expect((runs[0].spec as EditSpec).dubDialogue).toBe(true);
    expect(await redubTodaysEdits()).toBe(0);
  });
});

const python = spawnSync("python3", ["--version"], { encoding: "utf8" });

describe.skipIf(python.status !== 0)("doblar.py", () => {
  it("pasa sus pruebas", () => {
    const run = spawnSync("python3", ["-I", "-B", path.resolve(__dirname, "..", "montador", "test_doblar.py")], { encoding: "utf8", timeout: 300_000 });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stderr).toMatch(/\nOK/);
  }, 320_000);
});
