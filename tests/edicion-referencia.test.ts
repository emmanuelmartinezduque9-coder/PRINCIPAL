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
import { REFERENCE_EDIT_INSTRUCTIONS, refineSwitch, targetPlace, withLocalPlaces, withoutThirdParties } from "@/server/videos/edicion-referencia";
import { setAssignments } from "@/server/access";
import { requestEditChange, undoEditChangesOnce } from "@/server/videos/cambio-montaje";
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
/** Lo que contesta Claude al «¿Qué quieres cambiar?» del montaje (`cambio-montaje.ts`). */
let changeAnswer: Record<string, unknown> = {};

const gateway: LlmGateway = {
  async call<T>(request: LlmCall<T>): Promise<LlmResult<T>> {
    calls.push(request as LlmCall<unknown>);
    if (request.stepKey.includes(":cambio:")) {
      return { text: "", data: changeAnswer as T, model: "prueba", usage: { inputTokens: 0, outputTokens: 0 } as never, costMicros: 0, spendEntryId: 0, ruleVersions: {}, webSources: [] };
    }
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

  it("las correcciones aprendidas de rótulos («Mejoras») van a las instrucciones, el montaje las apunta y, si cambian, se vuelve a leer", async () => {
    await store.putBuffer("referencias/x/ref.mp4", mp4, { contentType: "video/mp4" });
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4" });
    const [lugar] = await getDb()
      .insert(schema.learnedCorrections)
      .values({ key: "precios", version: 1, stage: "montaje", problemType: "rotulos", directive: "Escribe los precios con el símbolo del euro detrás (p. ej. «19,99 €»).", note: "Precios" })
      .returning();
    // Una de imagen no entra en los rótulos.
    await getDb().insert(schema.learnedCorrections).values({ key: "img", version: 1, stage: "frame", problemType: "producto", directive: "Keep the product.", note: "x" });
    const first = await mount(video.id);
    expect(first.outcome).toBe("done");
    expect(calls).toHaveLength(1);
    expect(calls[0].instructions).toContain("Correcciones aprendidas de problemas reportados");
    expect(calls[0].instructions).toContain("símbolo del euro detrás");
    expect(calls[0].instructions).not.toContain("Keep the product.");
    expect(first.row.learnedCorrections).toEqual([lugar.id]);
    // Otra corrección: la edición en caché ya no vale y se vuelve a leer con las dos.
    const [grandes] = await getDb()
      .insert(schema.learnedCorrections)
      .values({ key: "grandes", version: 1, stage: "montaje", problemType: "rotulos", directive: "Los rótulos del gancho, en dos líneas como mucho.", note: "x" })
      .returning();
    const second = await mount(video.id);
    expect(calls).toHaveLength(2);
    expect(calls[1].instructions).toContain("en dos líneas como mucho");
    expect([...second.row.learnedCorrections].sort()).toEqual([lugar.id, grandes.id].sort());
    // Regla fija del dueño: una corrección que prohíbe marcas o personajes de terceros nunca se aplica.
    await getDb().insert(schema.learnedCorrections).values({ key: "marcas", version: 1, stage: "montaje", problemType: "rotulos", directive: "Ninguna marca de terceros (p. ej. Harry Potter) en los rótulos.", note: "Harry Potter" });
    await mount(video.id);
    expect(calls.at(-1)!.instructions).not.toContain("Harry Potter");
  });

  it("una lectura guardada antes de las correcciones se reutiliza al volver a montar (sus rótulos no cambian) y no se apuntan", async () => {
    await store.putBuffer("referencias/x/ref.mp4", mp4, { contentType: "video/mp4" });
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4" });
    const first = await mount(video.id);
    expect(first.row.learnedCorrections).toEqual([]);
    await getDb().insert(schema.learnedCorrections).values({ key: "grandes", version: 1, stage: "montaje", problemType: "rotulos", directive: "Rótulos en dos líneas como mucho.", note: "x" });
    const second = await mount(video.id);
    expect(second.outcome).toBe("done");
    expect(calls).toHaveLength(1);
    expect(second.row.learnedCorrections).toEqual([]);
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

describe("marcas y personajes de terceros en los rótulos", () => {
  // Orden de Emmanuel (25/11/2026): en marketing orgánico se nombran; la prohibición la inventamos nosotros.
  it("la instrucción conserva las marcas, tiendas y personajes de terceros", () => {
    expect(REFERENCE_EDIT_INSTRUCTIONS).not.toMatch(/NUNCA nombres marcas/);
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("SE CONSERVAN tal cual");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toMatch(/8\. ajenos: devuelve siempre la lista vacía/);
  });

  it("si uno se cuela, se cambia por el producto y la colaboración queda solo con el producto (vídeo 22)", () => {
    expect(withoutThirdParties("FalterPfote|X|HARRY POTTER", ["Harry Potter"], "FalterPfote")).toBe("FalterPfote");
    expect(withoutThirdParties("FalterPfote × Disney 🎉", ["Disney"], "FalterPfote")).toBe("FalterPfote 🎉");
    expect(withoutThirdParties("Magisch wie Harry Potter ✨", ["harry potter"], "FalterPfote")).toBe("Magisch wie FalterPfote ✨");
    expect(withoutThirdParties("LINK IN BIO „FalterPfote“", [], "FalterPfote")).toBe("LINK IN BIO „FalterPfote“");
    // El propio producto en la lista no se toca.
    expect(withoutThirdParties("FalterPfote ist da", ["FalterPfote"], "FalterPfote")).toBe("FalterPfote ist da");
  });
});

describe("lugares de la referencia en los rótulos (regla 6c, vídeo 24)", () => {
  it("la instrucción manda cambiar lugares y países por los de nuestro anuncio y pide la lista", () => {
    expect(REFERENCE_EDIT_INSTRUCTIONS).toMatch(/6c\. Lugares/);
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("{LUGAR}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toMatch(/9\. lugares/);
  });

  it("el lugar sale de la tarjeta (ciudad) o del país del producto", () => {
    expect(targetPlace("Grábalo en las calles de Berlín, Alemania", ["DE"], "de")).toBe("Berlin");
    expect(targetPlace("en Múnich", ["DE"], "de")).toBe("München");
    // Sin ciudad en las indicaciones: la más reconocible del país (localización, 24/11/2026).
    expect(targetPlace("", ["AT", "DE"], "de")).toBe("Wien");
    expect(targetPlace("", ["DE", "AT", "CH"], "de")).toBe("Berlin");
    expect(targetPlace("", ["IT"], "it")).toBe("Roma");
    expect(targetPlace("calles de Milán", ["IT"], "it")).toBe("Milano");
    expect(targetPlace("", ["US"], "en")).toBe("the US");
    expect(targetPlace("", [], "en")).toBe("the US");
  });

  it("si un lugar de otro mercado se cuela, se cambia por el nuestro con su artículo fuera", () => {
    expect(withLocalPlaces("Ich verteile christliche Notizen an Fremde in den USA 🙏", [], "Berlin")).toBe(
      "Ich verteile christliche Notizen an Fremde in Berlin 🙏",
    );
    expect(withLocalPlaces("Fremde in Amerika|Teil 2", [], "Deutschland")).toBe("Fremde in Deutschland|Teil 2");
    expect(withLocalPlaces("in the US", [], "Berlin")).toBe("in Berlin");
    expect(withLocalPlaces("Straßen von New York", [], "Berlin")).toBe("Straßen von Berlin");
    // Un anuncio que pasa en EE. UU. (TargetAlarm) conserva sus lugares de allí; Londres sí se cambia.
    expect(withLocalPlaces("Streets of New York, USA", [], "the US")).toBe("Streets of New York, USA");
    expect(withLocalPlaces("Straight from London", [], "the US")).toBe("Straight from the US");
    // Lo que Claude vio en el original también.
    expect(withLocalPlaces("Mitten in Brooklyn", ["Brooklyn"], "Berlin")).toBe("Mitten in Berlin");
    // Nada que tocar: palabras que contienen las siglas, el propio destino y la tienda.
    expect(withLocalPlaces("MUSS PLUS USB in Berlin bei dm", [], "Berlin")).toBe("MUSS PLUS USB in Berlin bei dm");
    expect(withLocalPlaces("Hamburg ist schön", ["Hamburg"], "Hamburg")).toBe("Hamburg ist schön");
  });
});

describe("«¿Qué quieres cambiar?» en el montaje", () => {
  const cueTexts = (row: { notes: string[] | null }) =>
    JSON.parse(String(row.notes!.find((n) => n.startsWith("edicion:"))).slice("edicion:".length)).rotulos.map((r: { texto: string }) => r.texto);

  async function runNext() {
    const outcome = await runEdit((await claimRun(new Date()))!, deps());
    return outcome;
  }

  it("Claude aplica el cambio a los rótulos, se vuelve a montar ese vídeo, queda en Mejoras y los siguientes montajes lo conservan", async () => {
    await store.putBuffer("referencias/x/ref.mp4", mp4, { contentType: "video/mp4" });
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4" });
    expect((await mount(video.id)).outcome).toBe("done");
    changeAnswer = {
      rotulos: [
        { desde_s: 0, texto: "Eisfans in Berlin, RENNT zu|EisWerk ❄️🍦", cta: false },
        { desde_s: 1.2, texto: "Kommentiere „EisWerk“ für den Link 😅", cta: true },
      ],
      texto_principal: "EISWERK 😍",
      cta: "Kommentiere „EisWerk“",
      cambia_cancion: false,
      cancion_id: null,
      doblar: "igual",
      resumen: "El primer rótulo dice Berlin.",
    };
    const { runId, reportId } = await requestEditChange(ana, video.id, "  que el primer rótulo diga que es en Berlín  ");
    expect(await runNext()).toBe("done");
    const [row] = await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.id, runId));
    expect(cueTexts(row)).toEqual(["Eisfans in Berlin, RENNT zu|EisWerk ❄️🍦", "Kommentiere „EisWerk“ für den Link 😅"]);
    expect(row.notes).toContain("Cambio pedido aplicado: El primer rótulo dice Berlin.");
    // A Claude le llega la ficha actual (los rótulos leídos) y el cambio tal cual.
    const change = calls.find((c) => c.stepKey.includes(":cambio:"))!;
    expect(JSON.stringify(change.content)).toContain("Eisfans, RENNT zu|EisWerk");
    expect(JSON.stringify(change.content)).toContain("que el primer rótulo diga que es en Berlín");
    expect(change.userId).toBe(ana.id);
    // El vídeo guarda los rótulos cambiados y el historial; nada pendiente.
    const after = await getVideoFor(ana, video.id);
    expect(after.editOverride?.pendiente).toBeNull();
    expect(after.editOverride?.rotulos?.[0].texto).toBe("Eisfans in Berlin, RENNT zu|EisWerk ❄️🍦");
    expect(after.editOverride?.cambios.map((c) => c.texto)).toEqual(["que el primer rótulo diga que es en Berlín"]);
    // Reporte en «Mejoras» ligado a la versión que se vio (la primera).
    const [report] = await getDb().select().from(schema.problemReports).where(eq(schema.problemReports.id, reportId));
    expect(report).toMatchObject({ stage: "montaje", videoId: video.id, createdBy: ana.id });
    expect(report.body).toContain("que el primer rótulo diga que es en Berlín");
    expect(report.versionLabel).toBe("montaje v1");
    // Deshacerlo: vuelve a montarse como el primer montaje (los rótulos leídos), sin pasar por Claude.
    const original = (await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.videoId, video.id)).orderBy(schema.editRuns.id))[0];
    await undoEditChangesOnce("prueba.deshacer", video.id, original.id);
    await undoEditChangesOnce("prueba.deshacer", video.id, original.id);
    expect(await runNext()).toBe("done");
    const undone = (await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.videoId, video.id)).orderBy(schema.editRuns.id)).at(-1)!;
    expect(cueTexts(undone)).toEqual(cueTexts(original));
    expect((await getVideoFor(ana, video.id)).editOverride).toBeNull();
    await requestEditChange(ana, video.id, "que el primer rótulo diga que es en Berlín");
    expect(await runNext()).toBe("done");
    // Volver a montar sin cambio: los rótulos cambiados se quedan y no se vuelve a llamar a Claude para el cambio.
    const before = calls.length;
    const again = await mount(video.id);
    expect(cueTexts(again.row)[0]).toBe("Eisfans in Berlin, RENNT zu|EisWerk ❄️🍦");
    expect(calls.length).toBe(before);
  });

  it("otra música: se guarda en el vídeo, la ficha se rehace y el montaje sale con la canción", async () => {
    const video = await videoWithClip();
    expect((await mount(video.id)).outcome).toBe("done");
    const { song } = await uploadSong(ana, fs.readFileSync(await makeSampleAudio(dir, "mp3", { seconds: 8 })), { title: "Fiesta", dropMs: 2000 });
    changeAnswer = { rotulos: [], texto_principal: "EISWERK 😍", cta: "Kommentiere „EisWerk“", cambia_cancion: true, cancion_id: song.id, doblar: "igual", resumen: "Música: Fiesta." };
    const { runId } = await requestEditChange(ana, video.id, "pon la canción Fiesta");
    expect(await runNext()).toBe("deferred");
    expect((await getVideoFor(ana, video.id)).songId).toBe(song.id);
    expect(await runNext()).toBe("done");
    const [row] = await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.id, runId));
    expect((row.spec as EditSpec).song?.id).toBe(song.id);
    expect(row.status).toBe("done");
  });

  it("lo puede pedir una colaboradora que ve el vídeo; con un montaje en marcha, 409; sin texto, 400", async () => {
    await store.putBuffer("referencias/x/ref.mp4", mp4, { contentType: "video/mp4" });
    const video = await videoWithClip({ referenceStorageKey: "referencias/x/ref.mp4" });
    expect((await mount(video.id)).outcome).toBe("done");
    const samuel = await makeUser("colaborador", { name: "Samuel" });
    await setAssignments(ana, samuel.id, [video.productId]);
    await expect(requestEditChange(samuel, video.id, "   ")).rejects.toMatchObject({ status: 400 });
    changeAnswer = { rotulos: [{ desde_s: 0, texto: "Ohne Emoji", cta: false }], texto_principal: "EISWERK", cta: "Kommentiere „EisWerk“", cambia_cancion: false, cancion_id: null, doblar: "igual", resumen: "Sin emojis." };
    await requestEditChange(samuel, video.id, "quita los emojis");
    await expect(requestEditChange(samuel, video.id, "otro cambio")).rejects.toMatchObject({ status: 409 });
    expect(await runNext()).toBe("done");
    expect(calls.find((c) => c.stepKey.includes(":cambio:"))!.userId).toBe(samuel.id);
    const [report] = await getDb().select().from(schema.problemReports).where(eq(schema.problemReports.videoId, video.id));
    expect(report.createdBy).toBe(samuel.id);
  });
});
