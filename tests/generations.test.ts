import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHiggsfield,
  HiggsfieldAuthError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  type HfHistoryItem,
  type HfJob,
} from "@/connectors/higgsfield";
import { createFakeHiggsfield, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { setPersonDisabled } from "@/server/people";
import type { Product } from "@/server/products";
import {
  approveResult,
  BLOCKED,
  GENERATION_ACCESS_LOST,
  JOB_FAILED,
  NEVER_ARRIVED,
  pollGeneration,
  quoteGeneration,
  readResultThumb,
  registerRequestBuilder,
  rejectRound,
  requestGeneration,
  submitGeneration,
  sweepGenerations,
  TIMED_OUT,
  UNKNOWN_OUTCOME,
  type GenDeps,
} from "@/server/videos/generations";
import { createVideo, getVideoFor, videoView, type Video } from "@/server/videos/videos";
import { GET as thumbRoute } from "@/app/api/resultados/[resultId]/miniatura/route";
import { GET as getVideoRoute } from "@/app/api/videos/[videoId]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * Generaciones con Higgsfield simulado y un constructor de peticiones de prueba. Las descargas de
 * resultados van por un `fetch` falso que devuelve un JPEG de verdad (hecho con ffmpeg).
 */

const SAME_PROMPT = "A woman holds the bottle in a bright kitchen.";
const MODEL = "nano_banana_pro";

let dir: string;
let jpeg: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;
let fetched: string[];
let frameCount = 2;

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;
let v: Video;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-generaciones-"));
  const file = path.join(dir, "resultado.jpg");
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=720x1280", "-frames:v", "1", file]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
  jpeg = fs.readFileSync(file);

  registerRequestBuilder("frame", async () => ({
    request: { model: MODEL, prompt: SAME_PROMPT, aspectRatio: "9:16", resolution: "2k", medias: [{ role: "image_references", value: "m1" }] },
    count: frameCount,
  }));
  registerRequestBuilder("clip", async () => ({
    request: {
      model: "seedance_2_5",
      mode: "omni_reference",
      prompt: "@Video1 sets the pace.",
      aspectRatio: "9:16",
      duration: 10,
      resolution: "480p",
      generateAudio: false,
      bitrateMode: "high",
      medias: [{ role: "video_references", value: "ref" }],
    },
    count: 1,
  }));
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.PRINCIPAL_HIGGSFIELD_FAKE;
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  delete process.env.PRINCIPAL_HIGGSFIELD_FAKE;
  cookie.value = undefined;
  frameCount = 2;
  fake = createFakeHiggsfield();
  fetched = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetched.push(url);
    if (url.includes("roto")) return new Response("no", { status: 404 });
    return new Response(new Uint8Array(jpeg), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  }) as typeof fetch;
  deps = { higgsfield: fake.port, fetch: fakeFetch };
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "BrilloMax" });
  v = await createVideo(ana, producto.id);
});

// ───────────────────────── Ayudas ─────────────────────────

interface Row {
  status: string;
  round: number;
  error: string | null;
  jobIds: string[];
  creditsSpent: number | null;
  quotedCredits: number;
  rejectReason: string | null;
  request: Record<string, unknown>;
  raw: unknown;
}

async function rowOf(id: number): Promise<Row> {
  const { rows } = await getPool().query(
    `select status, round, error, job_ids as "jobIds", credits_spent as "creditsSpent", quoted_credits as "quotedCredits",
            reject_reason as "rejectReason", request, raw
       from generations where id = $1`,
    [id],
  );
  return rows[0];
}
const statusOf = async (id: number) => (await rowOf(id)).status;
async function countGenerations(): Promise<number> {
  const { rows } = await getPool().query("select count(*)::int as n from generations");
  return rows[0].n;
}
const submits = () => fake.calls.filter((c) => c.method === "submitImages" || c.method === "submitVideo");
const jobCalls = () => fake.calls.filter((c) => c.method === "jobs");
const minutes = (n: number) => () => new Date(Date.now() + n * 60_000);

/** Pone una columna de hora de la fila `ms` milisegundos en el pasado. */
async function setAgo(id: number, column: string, ms: number): Promise<void> {
  await getPool().query(`update generations set ${column} = now() - make_interval(secs => $2) where id = $1`, [id, ms / 1000]);
}

function hist(jobId: string, prompt: string, createdAt: Date | null = null): HfHistoryItem {
  return { jobId, type: "image", model: MODEL, prompt, createdAt };
}

/** Pide y envía una imagen inicial (4 créditos). */
async function sendFrame(user = ana): Promise<number> {
  const { generationId } = await requestGeneration(user, v.id, "frame", { expectedCredits: 4 * (frameCount / 2) }, deps);
  await submitGeneration(generationId, deps);
  return generationId;
}

/** Termina en el simulado los trabajos de la generación y deja que el seguimiento pregunte otra vez. */
async function finish(id: number, job: Partial<HfJob> = {}, urls = (i: number) => [`https://cdn.test/r${id}-${i}.png`]): Promise<void> {
  const { jobIds } = await rowOf(id);
  jobIds.forEach((jobId, i) => {
    const done = (job.status ?? "done") === "done";
    fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: done ? urls(i) : [], ...job };
  });
  await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
  await pollGeneration(id, deps);
}

/** Una ronda completa: enviar, terminar bien y rechazar. */
async function roundRejected(): Promise<number> {
  const id = await sendFrame();
  await finish(id);
  await rejectRound(ana, v.id, "frame", "No me gusta la luz");
  return id;
}

// ───────────────────────── Pedir ─────────────────────────

describe("pedir una generación", () => {
  it("el presupuesto dice créditos, saldo y si alcanza", async () => {
    expect(await quoteGeneration(ana, v.id, "frame", deps)).toEqual({ credits: 4, balance: 1000, enough: true, round: 1, regenerationsLeft: 2 });
    expect(await quoteGeneration(ana, v.id, "clip", deps)).toMatchObject({ credits: 30, enough: true, round: 1 });
    fake.state.credits = 3;
    expect(await quoteGeneration(ana, v.id, "frame", deps)).toMatchObject({ credits: 4, balance: 3, enough: false });
    expect(submits()).toHaveLength(0);
  });

  it("sin créditos suficientes no se crea ni se envía nada, y lo dice con cifras", async () => {
    fake.state.credits = 3;
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "No tienes créditos suficientes en Higgsfield: hacen falta 4 y tienes 3.",
    });
    expect(await countGenerations()).toBe(0);
    expect(submits()).toHaveLength(0);
  });

  it("si el precio ha subido desde que la persona lo vio, no se envía", async () => {
    frameCount = 3; // ahora son 6 créditos
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "El precio ha cambiado: ahora son 6 créditos. Revísalo y confirma de nuevo.",
    });
    expect(await countGenerations()).toBe(0);
  });

  it("doble clic: dos peticiones a la vez crean una sola generación", async () => {
    const results = await Promise.allSettled([
      requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps),
      requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, message: "Ya hay una generación en marcha." });
    expect(await countGenerations()).toBe(1);
  });

  it("la intención está guardada antes de llamar a Higgsfield", async () => {
    const { generationId } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    expect(await rowOf(generationId)).toMatchObject({ status: "intent", round: 1, quotedCredits: 4 });
    let seen: Row | null = null;
    const watching = {
      ...fake.port,
      submitImages: async (...args: Parameters<typeof fake.port.submitImages>) => {
        seen = await rowOf(generationId);
        return fake.port.submitImages(...args);
      },
    };
    await submitGeneration(generationId, { ...deps, higgsfield: watching });
    expect(seen).toMatchObject({ status: "submitting", request: { model: MODEL, prompt: SAME_PROMPT, resolution: "2k" } });
    expect(await rowOf(generationId)).toMatchObject({ status: "submitted", jobIds: ["job-1", "job-2"], creditsSpent: 4 });
  });

  it("solo quien creó el vídeo genera: el dueño recibe 403 y quien no tiene el producto, 404", async () => {
    for (const call of [
      (u: AuthUser) => quoteGeneration(u, v.id, "frame", deps),
      (u: AuthUser) => requestGeneration(u, v.id, "frame", { expectedCredits: 4 }, deps),
      (u: AuthUser) => rejectRound(u, v.id, "frame", "motivo"),
      (u: AuthUser) => approveResult(u, v.id, "frame", 1),
    ]) {
      await expect(call(dueno)).rejects.toMatchObject({ status: 403 });
      await expect(call(luis)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    }
    expect(fake.calls).toHaveLength(0);
    expect(await countGenerations()).toBe(0);
  });

  it("sin conexión con Higgsfield, el presupuesto lo dice y no se apunta nada", async () => {
    fake.failNext("balance", new HiggsfieldAuthError());
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    fake.failNext("quoteImages", new HiggsfieldUnavailableError());
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 503 });
    expect(await countGenerations()).toBe(0);
  });
});

// ───────────────────────── Enviar una sola vez ─────────────────────────

describe("envío único", () => {
  it("dos trabajos para la misma generación envían una sola vez", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await Promise.all([submitGeneration(id, deps), submitGeneration(id, deps)]);
    expect(submits()).toHaveLength(1);
    // Y un trabajo repetido más tarde tampoco.
    await submitGeneration(id, deps);
    expect(submits()).toHaveLength(1);
  });

  it("caída a mitad del envío: al volver no se reenvía; se adopta lo que aparece en el historial", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await getPool().query("update generations set status = 'submitting' where id = $1", [id]);
    await setAgo(id, "submit_started_at", 3 * 60_000);
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: UNKNOWN_OUTCOME });
    await submitGeneration(id, deps); // el trabajo vuelve: no reenvía
    fake.state.history = [hist("j9", SAME_PROMPT), hist("j10", SAME_PROMPT), hist("j1", "otro prompt")];
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j9", "j10"], creditsSpent: 4 });
    expect(submits()).toHaveLength(0);
  });

  it("al reconciliar no se adopta lo anterior al envío ni lo que ya es de otra generación", async () => {
    const old = await sendFrame(); // job-1 y job-2
    await finish(old);
    await rejectRound(ana, v.id, "frame", "Otra vez");
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await getPool().query("update generations set status = 'unknown', submit_started_at = now() where id = $1", [id]);
    fake.state.history = [
      hist("j-viejo", SAME_PROMPT, new Date(Date.now() - 10 * 60_000)),
      hist("job-1", SAME_PROMPT),
      hist("j-nuevo", SAME_PROMPT, new Date()),
      { ...hist("j-otro-modelo", SAME_PROMPT), model: "nano_banana_2_1" },
    ];
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-nuevo"], creditsSpent: 2 });
  });

  it("resultado desconocido sin rastro: a los 10 minutos queda «no enviado»; antes no deja repetir", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await getPool().query("update generations set status = 'unknown', submit_started_at = now() where id = $1", [id]);
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, { ...deps, now: minutes(5) })).rejects.toMatchObject({
      status: 409,
      message: "Estamos comprobando con Higgsfield si la petición anterior llegó. No se vuelve a enviar para no cobrarte dos veces.",
    });
    await sweepGenerations({ ...deps, now: minutes(5) });
    expect(await statusOf(id)).toBe("unknown");
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: NEVER_ARRIVED });
    expect((await quoteGeneration(ana, v.id, "frame", deps)).round).toBe(1); // no gastó ronda
    expect(submits()).toHaveLength(0);
  });

  it("si el historial no se puede leer, sigue «desconocido» aunque pasen 10 minutos", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await getPool().query("update generations set status = 'unknown', submit_started_at = now() where id = $1", [id]);
    fake.failNext("history", new HiggsfieldUnavailableError());
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await statusOf(id)).toBe("unknown");
  });

  it("un envío cortado sin respuesta queda «desconocido» y no se repite", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.failNext("submitImages", new HiggsfieldUnknownOutcomeError({ texto: "a medias" }));
    await submitGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: UNKNOWN_OUTCOME, raw: { texto: "a medias" } });
    await submitGeneration(id, deps);
    expect(submits()).toHaveLength(1);
  });

  it("un envío que Higgsfield rechaza queda «no enviado» con su motivo", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.failNext("submitImages", new HiggsfieldRejectedError("Prompt not allowed.", { error: "Prompt not allowed." }));
    await submitGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({
      status: "not_sent",
      error: "Higgsfield no ha aceptado la petición: Prompt not allowed.",
      raw: { error: "Prompt not allowed." },
    });
    // No gastó ronda: se puede volver a pedir la primera.
    const again = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    expect((await rowOf(again.generationId)).round).toBe(1);
  });

  it("permiso caducado al enviar: no se llama a generar y queda «no enviado» con el aviso de reconectar", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.failNext("balance", new HiggsfieldAuthError());
    await submitGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes." });
    expect(submits()).toHaveLength(0);
  });

  it("permiso que caduca en el propio envío: «no enviado», nunca «desconocido»", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.failNext("submitImages", new HiggsfieldAuthError());
    await submitGeneration(id, deps);
    expect(await statusOf(id)).toBe("not_sent");
  });

  it("el saldo bajó entre pedir y enviar: no se envía", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.state.credits = 1;
    await submitGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: "No tienes créditos suficientes en Higgsfield: hacen falta 4 y tienes 1." });
    expect(submits()).toHaveLength(0);
  });

  it("el precio subió entre pedir y enviar: no se envía", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    const pricier = { ...fake.port, quoteImages: async () => ({ credits: 6 }) };
    await submitGeneration(id, { ...deps, higgsfield: pricier });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: "El precio ha cambiado: ahora son 6 créditos. Revísalo y confirma de nuevo." });
    expect(submits()).toHaveLength(0);
  });

  it("persona desactivada o producto desasignado después de pedir: el trabajo no envía nada", async () => {
    const first = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setPersonDisabled(dueno, ana.id, true);
    await submitGeneration(first.generationId, deps);
    expect(await rowOf(first.generationId)).toMatchObject({ status: "not_sent", error: GENERATION_ACCESS_LOST });

    await setPersonDisabled(dueno, ana.id, false);
    const second = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setAssignments(dueno, ana.id, []);
    await submitGeneration(second.generationId, deps);
    expect(await rowOf(second.generationId)).toMatchObject({ status: "not_sent", error: GENERATION_ACCESS_LOST });
    expect(submits()).toHaveLength(0);
  });

  it("una intención que se quedó sin enviar vuelve a la cola; si ya no hay acceso, queda «no enviada»", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setAgo(id, "intent_at", 3 * 60_000);
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "intent", error: null });
    await setPersonDisabled(dueno, ana.id, true);
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: GENERATION_ACCESS_LOST });
    expect(submits()).toHaveLength(0);
  });
});

// ───────────────────────── Rondas ─────────────────────────

describe("rondas, rechazo y aprobación", () => {
  it("máximo 2 regeneraciones: la cuarta ronda se rechaza", async () => {
    for (let round = 1; round <= 3; round++) {
      expect(await quoteGeneration(ana, v.id, "frame", deps)).toMatchObject({ round, regenerationsLeft: 3 - round });
      const id = await roundRejected();
      expect((await rowOf(id)).round).toBe(round);
    }
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Has llegado al máximo de 2 regeneraciones.",
    });
    expect((await videoView(ana, v.id)).frame).toMatchObject({ round: 3, regenerationsLeft: 0 });
    // El clip lleva su propia cuenta.
    expect((await quoteGeneration(ana, v.id, "clip", deps)).round).toBe(1);
  });

  it("para regenerar hay que haber rechazado lo anterior con un motivo de una línea", async () => {
    const id = await sendFrame();
    await finish(id);
    for (const reason of ["", "   ", "dos\nlíneas", "x".repeat(301)]) {
      await expect(rejectRound(ana, v.id, "frame", reason)).rejects.toMatchObject({
        status: 400,
        message: "Escribe en una línea por qué lo rechazas (máximo 300 caracteres).",
      });
    }
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Antes de regenerar, rechaza el resultado anterior y di por qué.",
    });
    await rejectRound(ana, v.id, "frame", "La caja sale deformada");
    expect((await rowOf(id)).rejectReason).toBe("La caja sale deformada");
    const next = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    expect((await rowOf(next.generationId)).round).toBe(2);
  });

  it("no se rechaza una generación en marcha ni algo que no existe", async () => {
    await expect(rejectRound(ana, v.id, "frame", "nada")).rejects.toMatchObject({ status: 409, message: "No hay ningún resultado que rechazar." });
    await sendFrame();
    await expect(rejectRound(ana, v.id, "frame", "aún no")).rejects.toMatchObject({ status: 409, message: "Ya hay una generación en marcha." });
  });

  it("aprobar un resultado de otro vídeo da 404; aprobar uno propio lo marca; rechazar la ronda lo desmarca", async () => {
    const id = await sendFrame();
    await finish(id);
    const view = await videoView(ana, v.id);
    const [first, second] = view.frame.current!.results;

    const otro = await createVideo(ana, producto.id);
    await expect(approveResult(ana, otro.id, "frame", first.id)).rejects.toMatchObject({ status: 404, message: "Resultado no encontrado." });
    await expect(approveResult(ana, v.id, "clip", first.id)).rejects.toMatchObject({ status: 404 });
    await expect(approveResult(ana, v.id, "frame", 999_999)).rejects.toMatchObject({ status: 404 });

    await approveResult(ana, v.id, "frame", second.id);
    expect((await getVideoFor(ana, v.id)).approvedFrameResultId).toBe(second.id);
    expect((await videoView(ana, v.id)).frame.approvedResultId).toBe(second.id);

    await rejectRound(ana, v.id, "frame", "Mejor otra");
    expect((await getVideoFor(ana, v.id)).approvedFrameResultId).toBeNull();
  });
});

// ───────────────────────── Seguimiento ─────────────────────────

describe("seguimiento", () => {
  it("el seguimiento guarda resultados y miniaturas y termina la generación", async () => {
    const id = await sendFrame();
    expect(await statusOf(id)).toBe("submitted");
    await finish(id);
    expect(await rowOf(id)).toMatchObject({ status: "done", error: null, creditsSpent: 4 });
    const view = await videoView(ana, v.id);
    expect(view.frame).toMatchObject({ round: 1, regenerationsLeft: 2, approvedResultId: null, current: { id, status: "done", quotedCredits: 4 } });
    expect(view.frame.current!.results).toEqual([
      { id: expect.any(Number), ok: true, url: `https://cdn.test/r${id}-0.png`, hasThumb: true },
      { id: expect.any(Number), ok: true, url: `https://cdn.test/r${id}-1.png`, hasThumb: true },
    ]);
    expect(view.clip).toEqual({ round: 0, regenerationsLeft: 2, approvedResultId: null, current: null });
    const thumb = await readResultThumb(ana, view.frame.current!.results[0].id);
    expect(thumb.mime).toBe("image/jpeg");
    expect(thumb.data.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(thumb.data.equals(jpeg)).toBe(false); // reducida
    // Quien ve el producto ve la miniatura; quien no, 404.
    await readResultThumb(dueno, view.frame.current!.results[0].id);
    await expect(readResultThumb(luis, view.frame.current!.results[0].id)).rejects.toMatchObject({ status: 404, message: "Miniatura no encontrada." });
  });

  it("si la miniatura no se puede hacer, el resultado se guarda sin ella", async () => {
    const id = await sendFrame();
    await finish(id, {}, (i) => [i === 0 ? "https://cdn.test/roto.png" : `https://cdn.test/bien-${i}.png`]);
    const results = (await videoView(ana, v.id)).frame.current!.results;
    expect(results.map((r) => [r.ok, r.hasThumb])).toEqual([
      [true, false],
      [true, true],
    ]);
    await expect(readResultThumb(ana, results[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it("si Higgsfield solo aceptó una de las dos, sigue con una y apunta la mitad de créditos", async () => {
    fake.state.maxAccepted = 1;
    const id = await sendFrame();
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["job-1"], creditsSpent: 2 });
    await finish(id);
    expect((await videoView(ana, v.id)).frame.current!.results).toHaveLength(1);
  });

  it.each([["nsfw"], ["ip_detected"], ["failed"]] as const)("un trabajo %s deja la generación en error con texto claro y gasta ronda", async (failure) => {
    const id = await sendFrame();
    await finish(id, { status: "failed", failure, error: "flagged" });
    expect(await rowOf(id)).toMatchObject({ status: "failed", error: failure === "failed" ? JOB_FAILED : BLOCKED });
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([false, false]);
    // Gastó ronda, y como falló no hace falta rechazarla para regenerar.
    expect(await quoteGeneration(ana, v.id, "frame", deps)).toMatchObject({ round: 2 });
  });

  it("con un resultado bueno y otro bloqueado, la generación termina bien", async () => {
    const id = await sendFrame();
    const { jobIds } = await rowOf(id);
    fake.state.jobs[jobIds[0]] = { jobId: jobIds[0], status: "done", failure: null, error: null, urls: ["https://cdn.test/ok.png"] };
    fake.state.jobs[jobIds[1]] = { jobId: jobIds[1], status: "failed", failure: "nsfw", error: null, urls: [] };
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
    await pollGeneration(id, deps);
    expect(await statusOf(id)).toBe("done");
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([true, false]);
  });

  it("no pregunta a Higgsfield más de una vez cada 8 segundos por generación", async () => {
    const id = await sendFrame(); // el envío ya pregunta una vez
    expect(jobCalls()).toHaveLength(1);
    await pollGeneration(id, deps);
    await Promise.all([pollGeneration(id, deps), pollGeneration(id, deps)]);
    expect(jobCalls()).toHaveLength(1);
    await pollGeneration(id, { ...deps, now: () => new Date(Date.now() + 9_000) });
    expect(jobCalls()).toHaveLength(2);
  });

  it("una generación enviada que no termina en una hora queda en error sin reenviarse", async () => {
    const id = await sendFrame();
    await setAgo(id, "submitted_at", 61 * 60_000);
    await setAgo(id, "last_polled_at", 60_000);
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "failed", error: TIMED_OUT });
    expect(submits()).toHaveLength(1);
    // Una que lleva menos de una hora sigue esperando.
    await getPool().query("update generations set status = 'submitted', error = null where id = $1", [id]);
    await setAgo(id, "submitted_at", 30 * 60_000);
    await sweepGenerations(deps);
    expect(await statusOf(id)).toBe("submitted");
  });

  it("si Higgsfield no responde al preguntar, la generación sigue enviada", async () => {
    const id = await sendFrame();
    fake.failNext("jobs", new HiggsfieldUnavailableError());
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
    await pollGeneration(id, deps);
    expect(await statusOf(id)).toBe("submitted");
  });
});

// ───────────────────────── Rutas ─────────────────────────

describe("rutas", () => {
  const as = async (user: AuthUser) => {
    cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
  };

  it("GET /api/resultados/[id]/miniatura da el JPEG a quien ve el vídeo y 404 a quien no", async () => {
    const id = await sendFrame();
    await finish(id);
    const resultId = (await videoView(ana, v.id)).frame.current!.results[0].id;
    const params = (value: string) => ({ params: Promise.resolve({ resultId: value }) });
    await as(ana);
    const response = await thumbRoute(new Request("http://localhost/x"), params(String(resultId)));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect((await thumbRoute(new Request("http://localhost/x"), params("abc"))).status).toBe(404);
    await as(luis);
    expect((await thumbRoute(new Request("http://localhost/x"), params(String(resultId)))).status).toBe(404);
  });

  it("GET /api/videos/[id] pregunta por la generación en curso si mira quien la creó (modo local simulado)", async () => {
    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    const local = getHiggsfield(); // trabajos que terminan a la segunda consulta, con una muestra `data:`
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, { higgsfield: local });
    await submitGeneration(id, { higgsfield: local }); // primera consulta: pendientes
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);

    await as(dueno); // ve el vídeo, pero no es quien lo creó: no pregunta
    const seenByOwner = await (await getVideoRoute(new Request("http://localhost/x"), { params: Promise.resolve({ videoId: String(v.id) }) })).json();
    expect(seenByOwner.frame.current.status).toBe("submitted");

    await as(ana);
    const response = await getVideoRoute(new Request("http://localhost/x"), { params: Promise.resolve({ videoId: String(v.id) }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.frame.current).toMatchObject({ id, status: "done" });
    expect(body.frame.current.results).toHaveLength(2);
    expect(body.frame.current.results[0]).toMatchObject({ ok: true, hasThumb: true });
    expect(body.frame.current.results[0].url).toMatch(/^data:image\/png;base64,/);
    expect(body.clip.current).toBeNull();
  });
});
