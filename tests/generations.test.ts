import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHiggsfield,
  HiggsfieldAuthError,
  HiggsfieldConnectError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  type HfHistoryItem,
  type HfJob,
  type HiggsfieldPort,
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
  adoptCandidate,
  approveResult,
  BLOCKED,
  CANNOT_CONFIRM,
  DISMISSED,
  dismissUnknown,
  finalizeGeneration,
  GENERATION_ACCESS_LOST,
  INTENT_EXPIRED,
  JOB_FAILED,
  JOB_NOT_FOUND,
  NEVER_ARRIVED,
  pollGeneration,
  quoteGeneration,
  readResultThumb,
  registerRequestBuilder,
  rejectRound,
  requestGeneration,
  SEND_TOO_SLOW,
  submitGeneration,
  sweepGenerations,
  TIMED_OUT,
  UNKNOWN_OUTCOME,
  urlNames,
  type GenDeps,
} from "@/server/videos/generations";
import { createVideo, getVideoFor, videoView, type Video } from "@/server/videos/videos";
import { GET as thumbRoute } from "@/app/api/resultados/[resultId]/miniatura/route";
import { GET as getVideoRoute } from "@/app/api/videos/[videoId]/route";
import { POST as adoptFrameRoute } from "@/app/api/videos/[videoId]/imagen/es-este/route";
import { POST as dismissFrameRoute } from "@/app/api/videos/[videoId]/imagen/no-esta/route";
import { POST as adoptClipRoute } from "@/app/api/videos/[videoId]/clip/es-este/route";
import { POST as dismissClipRoute } from "@/app/api/videos/[videoId]/clip/no-esta/route";
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
/** Como un `media_id` real: un UUID (en las direcciones del historial aparece tal cual). */
const MEDIA = "852dd20b-4f2a-4c1e-9b7d-0a1b2c3d4e5f";

let dir: string;
let jpeg: Buffer;
let fake: FakeHiggsfield;
let deps: GenDeps;
let fetched: string[];
let frameCount = 2;
let frameModel = "nano_banana_pro";

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
    request: { model: frameModel, prompt: SAME_PROMPT, aspectRatio: "9:16", resolution: "2k", medias: [{ role: "image_references", value: MEDIA }] },
    count: frameCount,
  }));
  // El clip se apoya en la imagen aprobada: la declara en `snapshot` (la imagen inicial, no: compatibilidad).
  registerRequestBuilder("clip", async (_user, video) => ({
    snapshot: { approvedFrameResultId: video.approvedFrameResultId },
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
  frameModel = "nano_banana_pro";
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
  recheckUntil: Date | null;
}

async function rowOf(id: number): Promise<Row> {
  const { rows } = await getPool().query(
    `select status, round, error, job_ids as "jobIds", credits_spent as "creditsSpent", quoted_credits as "quotedCredits",
            reject_reason as "rejectReason", request, raw, recheck_until as "recheckUntil"
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
async function finalizeJobsQueued(): Promise<number> {
  const { rows } = await getPool().query("select count(*)::int as n from job_steps where job_name = 'video.finalizar'");
  return rows[0].n;
}
const submits = () => fake.calls.filter((c) => c.method === "submitImages" || c.method === "submitVideo");
const jobCalls = () => fake.calls.filter((c) => c.method === "jobs");
const minutes = (n: number) => () => new Date(Date.now() + n * 60_000);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pone una columna de hora de la fila `ms` milisegundos en el pasado. */
async function setAgo(id: number, column: string, ms: number): Promise<void> {
  await getPool().query(`update generations set ${column} = now() - make_interval(secs => $2) where id = $1`, [id, ms / 1000]);
}
async function setUnknown(id: number): Promise<void> {
  await getPool().query("update generations set status = 'unknown', submit_started_at = now() where id = $1", [id]);
}

/** Una entrada del historial como la real: con fecha, modelo, entradas y resolución. */
function hist(jobId: string, prompt: string | null, over: Partial<HfHistoryItem> = {}): HfHistoryItem {
  return { jobId, type: "image", model: frameModel, prompt, createdAt: new Date(), media: [{ id: MEDIA, url: null }], resolution: "2k", thumbUrl: null, ...over };
}

/** Pide y envía una imagen inicial (4 créditos). */
async function sendFrame(user = ana): Promise<number> {
  const { generationId } = await requestGeneration(user, v.id, "frame", { expectedCredits: 4 * (frameCount / 2) }, deps);
  await submitGeneration(generationId, deps);
  return generationId;
}

/** Pone en el simulado los trabajos de la generación como `job` (por defecto, terminados con dirección). */
async function setJobs(id: number, job: Partial<HfJob> = {}, urls = (i: number) => [`https://cdn.test/r${id}-${i}.png`]): Promise<void> {
  const { jobIds } = await rowOf(id);
  jobIds.forEach((jobId, i) => {
    const done = (job.status ?? "done") === "done";
    fake.state.jobs[jobId] = { jobId, status: "done", failure: null, error: null, urls: done ? urls(i) : [], ...job };
  });
}

/** Termina los trabajos y ejecuta la finalización (lo que haría el trabajo `video.finalizar`). */
async function finish(id: number, job: Partial<HfJob> = {}, urls?: (i: number) => string[]): Promise<void> {
  await setJobs(id, job, urls);
  await finalizeGeneration(id, deps);
}

/** Una ronda completa: enviar, terminar bien y rechazar. */
async function roundRejected(): Promise<number> {
  const id = await sendFrame();
  await finish(id);
  await rejectRound(ana, v.id, "frame", "No me gusta la luz");
  return id;
}

/** Un puerto que ejecuta `before` justo antes del envío de imágenes del simulado. */
function withBeforeSubmit(before: () => Promise<void>, port: HiggsfieldPort = fake.port): HiggsfieldPort {
  return {
    ...port,
    submitImages: async (...args: Parameters<HiggsfieldPort["submitImages"]>) => {
      await before();
      return port.submitImages(...args);
    },
  };
}

// ───────────────────────── Pedir ─────────────────────────

describe("pedir una generación", () => {
  it("sin Higgsfield conectado o con la conexión caducada, el 409 lleva el código «higgsfield_connect»", async () => {
    fake.failNext("balance", new HiggsfieldNotConnectedError());
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 409, code: "higgsfield_connect" });
    fake.failNext("balance", new HiggsfieldAuthError());
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({ status: 409, code: "higgsfield_connect" });
    fake.state.credits = 1;
    await expect(quoteGeneration(ana, v.id, "frame", deps)).resolves.toMatchObject({ enough: false });
  });

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

  it("la base de datos tampoco admite dos generaciones activas del mismo tipo en un vídeo", async () => {
    const { generationId } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    const { rows } = await getPool().query("select video_id, user_id, request from generations where id = $1", [generationId]);
    await expect(
      getPool().query(
        "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'frame', 2, 'unknown', $2, $3, 2, 4)",
        [rows[0].video_id, rows[0].user_id, rows[0].request],
      ),
    ).rejects.toThrow(/generations_one_active/);
  });

  it("la intención está guardada antes de llamar a Higgsfield", async () => {
    const { generationId } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    expect(await rowOf(generationId)).toMatchObject({ status: "intent", round: 1, quotedCredits: 4 });
    let seen: Row | null = null;
    const watching = withBeforeSubmit(async () => {
      seen = await rowOf(generationId);
    });
    await submitGeneration(generationId, { ...deps, higgsfield: watching });
    expect(seen).toMatchObject({ status: "submitting", request: { model: "nano_banana_pro", prompt: SAME_PROMPT, resolution: "2k" } });
    expect(await rowOf(generationId)).toMatchObject({ status: "submitted", jobIds: ["job-1", "job-2"], creditsSpent: 4 });
  });

  it("el clip se envía con el `quote_ref` del presupuesto fresco: exactamente lo presupuestado", async () => {
    const { generationId } = await requestGeneration(ana, v.id, "clip", { expectedCredits: 30 }, deps);
    await submitGeneration(generationId, deps);
    const quoted = fake.calls.filter((c) => c.method === "quoteVideo");
    expect(quoted).toHaveLength(2); // al pedir y justo antes de enviar
    expect(submits()).toHaveLength(1);
    expect(submits()[0].args).toMatchObject({ quoteRef: "quote:fake-2" });
    expect(await rowOf(generationId)).toMatchObject({ status: "submitted", creditsSpent: 30 });
  });

  it("si el vídeo cambia entre construir la petición y apuntarla (otra pestaña rechaza la imagen), no se apunta nada", async () => {
    const frame = await sendFrame();
    await finish(frame);
    const [result] = (await videoView(ana, v.id)).frame.current!.results;
    await approveResult(ana, v.id, "frame", result.id);

    const otherTab: HiggsfieldPort = {
      ...fake.port,
      quoteVideo: async (...args: Parameters<HiggsfieldPort["quoteVideo"]>) => {
        await rejectRound(ana, v.id, "frame", "Al final no"); // desaprueba la imagen en la que se apoyaba el clip
        return fake.port.quoteVideo(...args);
      },
    };
    await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 30 }, { ...deps, higgsfield: otherTab })).rejects.toMatchObject({
      status: 409,
      message: "El vídeo ha cambiado mientras se preparaba el envío. Vuelve a intentarlo.",
    });
    const { rows } = await getPool().query("select count(*)::int as n from generations where kind = 'clip'");
    expect(rows[0].n).toBe(0);
    // Sin cambios entretanto, el clip se apunta.
    await expect(requestGeneration(ana, v.id, "clip", { expectedCredits: 30 }, deps)).resolves.toMatchObject({ generationId: expect.any(Number) });
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

  it("sin conexión con Higgsfield, o si rechaza el presupuesto, lo dice y no se apunta nada", async () => {
    fake.failNext("balance", new HiggsfieldAuthError());
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    fake.failNext("quoteImages", new HiggsfieldUnavailableError());
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 503 });
    fake.failNext("quoteImages", new HiggsfieldRejectedError("cost params failed validation"));
    await expect(quoteGeneration(ana, v.id, "frame", deps)).rejects.toMatchObject({
      status: 409,
      message: "Higgsfield no ha aceptado la petición: cost params failed validation",
    });
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

  it("si el seguimiento da el envío por perdido mientras está en marcha, los identificadores no se pierden", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    const racing = withBeforeSubmit(async () => {
      // El seguimiento de otro proceso cree que el envío se cortó.
      await setAgo(id, "submit_started_at", 3 * 60_000);
      await sweepGenerations(deps);
      expect(await statusOf(id)).toBe("unknown");
    });
    await submitGeneration(id, { ...deps, higgsfield: racing });
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["job-1", "job-2"], creditsSpent: 4, error: null });
    expect(submits()).toHaveLength(1);
  });

  it("la marca de envío se pone justo antes de la llamada que gasta, no al hacerse con la fila", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    let stampedAt: Date | null = null;
    const slowChecks: HiggsfieldPort = {
      ...fake.port,
      balance: async (userId) => {
        await wait(150);
        return fake.port.balance(userId);
      },
    };
    const port = withBeforeSubmit(async () => {
      const { rows } = await getPool().query("select submit_started_at from generations where id = $1", [id]);
      stampedAt = rows[0].submit_started_at;
    }, slowChecks);
    const started = Date.now();
    await submitGeneration(id, { ...deps, higgsfield: port });
    expect(stampedAt!.getTime()).toBeGreaterThanOrEqual(started + 140);
  });

  it("si las comprobaciones previas tardan demasiado, no se envía", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    const slow: HiggsfieldPort = {
      ...fake.port,
      balance: async (userId) => {
        await wait(400);
        return fake.port.balance(userId);
      },
    };
    await submitGeneration(id, { ...deps, higgsfield: slow, submitDeadlineMs: 300 });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: SEND_TOO_SLOW });
    expect(submits()).toHaveLength(0);
  });

  it("un envío que no responde a tiempo queda «desconocido»; si la respuesta llega después, se anota", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    const slowSend = withBeforeSubmit(async () => {
      await wait(500);
    });
    await submitGeneration(id, { ...deps, higgsfield: slowSend, submitDeadlineMs: 300 });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: UNKNOWN_OUTCOME });
    for (let i = 0; i < 40 && (await statusOf(id)) !== "submitted"; i++) await wait(50);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["job-1", "job-2"], error: null });
    expect(submits()).toHaveLength(1);
  });

  /** Un puerto cuyo envío de imágenes tarda 500 ms y devuelve `jobIds`. */
  const lateReply = (jobIds: string[]): HiggsfieldPort => ({
    ...fake.port,
    submitImages: async () => {
      await wait(500);
      return { jobIds, rejected: [], raw: { jobs: jobIds } };
    },
  });
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40 && !(await check()); i++) await wait(50);
  };

  it("si la reconciliación adoptó parte y la respuesta tardía trae más, se añaden los que faltan", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await submitGeneration(id, { ...deps, higgsfield: lateReply(["j1", "j2"]), submitDeadlineMs: 200 });
    expect(await statusOf(id)).toBe("unknown");
    fake.state.history = [hist("j1", SAME_PROMPT)]; // solo uno aparece aún
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j1"], creditsSpent: 2 });
    await waitFor(async () => (await rowOf(id)).jobIds.length === 2);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j1", "j2"], creditsSpent: 4 });
  });

  it.each(["done", "lease"] as const)(
    "si la parte adoptada ya terminó o su finalización caducó (%s), la respuesta tardía añade los que faltan",
    async (setup) => {
      const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
      await submitGeneration(id, { ...deps, higgsfield: lateReply(["j1", "j2"]), submitDeadlineMs: 200 });
      fake.state.history = [hist("j1", SAME_PROMPT)];
      await sweepGenerations(deps);
      expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j1"] });
      if (setup === "done") {
        // La parte adoptada ya se finalizó antes de que llegue la respuesta.
        fake.state.jobs.j1 = { jobId: "j1", status: "done", failure: null, error: null, urls: ["https://cdn.test/j1.png"] };
        await finalizeGeneration(id, deps);
        expect(await statusOf(id)).toBe("done");
      } else {
        // Una finalización que se cayó a mitad: su reserva ya caducó.
        await getPool().query("update generations set finalizing_at = now() - interval '11 minutes' where id = $1", [id]);
      }
      await waitFor(async () => (await rowOf(id)).jobIds.length === 2);
      expect(await rowOf(id)).toMatchObject({ jobIds: ["j1", "j2"], creditsSpent: 4 });
      if (setup === "done") {
        const { rows } = await getPool().query("select recheck_until > now() as rechecking from generations where id = $1", [id]);
        expect(rows[0].rechecking).toBe(true);
        // La finalización recoge el trabajo nuevo como un resultado más.
        fake.state.jobs.j2 = { jobId: "j2", status: "done", failure: null, error: null, urls: ["https://cdn.test/j2.png"] };
        await finalizeGeneration(id, deps);
        const results = await getPool().query("select index, job_id as \"jobId\" from generation_results where generation_id = $1 order by index", [id]);
        expect(results.rows).toEqual([{ index: 0, jobId: "j1" }, { index: 1, jobId: "j2" }]);
      }
    },
  );

  it("una finalización vieja colgada (reserva caducada) no pisa lo que añade la respuesta tardía", async () => {
    // El envío responde cuando la prueba quiera.
    let reply!: () => void;
    const replied = new Promise<void>((resolve) => (reply = resolve));
    const controlled: HiggsfieldPort = {
      ...fake.port,
      submitImages: async () => {
        await replied;
        return { jobIds: ["j1", "j2"], rejected: [], raw: { jobs: ["j1", "j2"] } };
      },
    };
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await submitGeneration(id, { ...deps, higgsfield: controlled, submitDeadlineMs: 100 });
    expect(await statusOf(id)).toBe("unknown");
    fake.state.history = [hist("j1", SAME_PROMPT)];
    await sweepGenerations(deps); // adopta j1
    fake.state.jobs.j1 = { jobId: "j1", status: "done", failure: null, error: null, urls: ["https://cdn.test/j1.png"] };
    await finalizeGeneration(id, deps); // `done` con j1
    await getPool().query("update generations set recheck_until = now() + interval '1 hour' where id = $1", [id]);

    // Una finalización que se hizo con la fila hace 11 minutos (reserva ya caducada) y sigue colgada en `jobs`.
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => (unblock = resolve));
    let entered!: () => void;
    const inJobs = new Promise<void>((resolve) => (entered = resolve));
    const hanging: HiggsfieldPort = {
      ...fake.port,
      jobs: async (...args: Parameters<HiggsfieldPort["jobs"]>) => {
        entered();
        await gate;
        return fake.port.jobs(...args);
      },
    };
    const old = finalizeGeneration(id, { ...deps, higgsfield: hanging, now: minutes(-11) });
    await inJobs;

    reply(); // llega la respuesta: añade j2, vuelve a mirar y le quita la reserva a la vieja
    await waitFor(async () => (await rowOf(id)).jobIds.length === 2);
    unblock();
    await old; // escribe lo que leyó (j1 solo, sin volver a mirar): ya no debe poder

    const { rows } = await getPool().query(
      "select status, job_ids as \"jobIds\", recheck_until > now() as rechecking, finalizing_at as \"finalizingAt\" from generations where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({ status: "done", jobIds: ["j1", "j2"], rechecking: true, finalizingAt: null });
    fake.state.jobs.j2 = { jobId: "j2", status: "done", failure: null, error: null, urls: ["https://cdn.test/j2.png"] };
    await finalizeGeneration(id, deps);
    const results = await getPool().query("select index, job_id as \"jobId\", ok from generation_results where generation_id = $1 order by index", [id]);
    expect(results.rows).toEqual([
      { index: 0, jobId: "j1", ok: true },
      { index: 1, jobId: "j2", ok: true },
    ]);
  });

  it("al volver a mirar una generación hecha, un resultado ya guardado bien la mantiene `done`", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await submitGeneration(id, deps);
    const { jobIds } = await rowOf(id);
    fake.state.jobs[jobIds[0]] = { jobId: jobIds[0], status: "done", failure: null, error: null, urls: ["https://cdn.test/a.png"] };
    fake.state.jobs[jobIds[1]] = { jobId: jobIds[1], status: "failed", failure: "failed", error: null, urls: [] };
    await finalizeGeneration(id, deps);
    expect(await statusOf(id)).toBe("done");
    // Se vuelve a mirar y ahora Higgsfield da los dos como fallidos (p. ej. el primero ya no está): sigue `done`.
    await getPool().query("update generations set recheck_until = now() + interval '1 hour' where id = $1", [id]);
    fake.state.jobs[jobIds[0]] = { jobId: jobIds[0], status: "failed", failure: "failed", error: null, urls: [] };
    await finalizeGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({ status: "done", error: null });
    const { rows } = await getPool().query("select index, ok from generation_results where generation_id = $1 order by index", [id]);
    expect(rows).toEqual([
      { index: 0, ok: true },
      { index: 1, ok: false },
    ]);
  });

  it("una respuesta que llega después de la espera tardía no se anota, pero sus trabajos quedan en el registro", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
      await submitGeneration(id, { ...deps, higgsfield: lateReply(["j1", "j2"]), submitDeadlineMs: 100, lateReplyWaitMs: 100 });
      expect(await statusOf(id)).toBe("unknown");
      for (let i = 0; i < 40 && errors.mock.calls.length === 0; i++) await wait(50);
      expect(errors).toHaveBeenCalledWith(`[generaciones] Envío ${id}: respuesta después de la espera, sin anotar. Trabajos de Higgsfield: j1, j2`);
      expect(await rowOf(id)).toMatchObject({ status: "unknown", jobIds: [] });
    } finally {
      errors.mockRestore();
    }
  });

  it("al anotar un envío no se queda trabajos que ya tiene otra generación", async () => {
    const otro = await createVideo(ana, producto.id);
    await getPool().query(
      `insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, job_ids)
       values ($1, 'frame', 1, 'done', $2, '{}'::jsonb, 1, 2, '["j2"]'::jsonb)`,
      [otro.id, ana.id],
    );
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await submitGeneration(id, { ...deps, higgsfield: lateReply(["j1", "j2"]) });
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j1"], creditsSpent: 2 });
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
    expect((await rowOf(id)).status).toBe("submitted");
    expect([...(await rowOf(id)).jobIds].sort()).toEqual(["j10", "j9"]);
    expect((await rowOf(id)).creditsSpent).toBe(4);
    expect(submits()).toHaveLength(0);
  });

  it("al reconciliar no se adopta lo anterior al envío, lo que ya es de otra generación ni lo de otras entradas", async () => {
    const old = await sendFrame(); // job-1 y job-2
    await finish(old);
    await rejectRound(ana, v.id, "frame", "Otra vez");
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    fake.state.history = [
      hist("j-viejo", SAME_PROMPT, { createdAt: new Date(Date.now() - 10 * 60_000) }),
      hist("job-1", SAME_PROMPT),
      hist("j-otras-fotos", SAME_PROMPT, { media: [{ id: "otra-foto", url: "https://cdn.test/user_XXXX/otra-foto.png" }] }),
      hist("j-4k", SAME_PROMPT, { resolution: "4k" }),
      hist("j-otro-modelo", SAME_PROMPT, { model: "seedream_4" }),
      hist("j-nuevo", SAME_PROMPT),
    ];
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-nuevo"], creditsSpent: 2 });
  });

  it("el modelo cuenta por familia: `nano_banana_2` en el historial para un envío `nano_banana_2_1`", async () => {
    frameModel = "nano_banana_2_1";
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    fake.state.history = [hist("j-a", SAME_PROMPT, { model: "nano_banana_2" }), hist("j-b", SAME_PROMPT, { model: "nano_banana_2" })];
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", creditsSpent: 4 });
  });

  it("una entrada sin fecha nunca se adopta sola, y mientras exista no se da por no enviado", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    fake.state.history = [hist("j-sin-fecha", SAME_PROMPT, { createdAt: null })];
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", jobIds: [], error: CANNOT_CONFIRM });
  });

  it("un historial sin prompts no prueba nada: sigue «desconocido» y pide mirar la cuenta", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    fake.state.history = [hist("j-x", null), hist("j-y", null)];
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: CANNOT_CONFIRM });
  });

  it("el historial se recorre por páginas hasta cubrir desde el envío; si no se llega, no se da por no enviado", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    const recent = (n: number) => Array.from({ length: n }, (_, i) => hist(`otro-${i}`, `otro prompt ${i}`, { createdAt: new Date(Date.now() + 60_000 - i * 100) }));
    fake.state.history = recent(300); // más de 5 páginas, todas posteriores al envío
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: CANNOT_CONFIRM });
    expect(fake.calls.filter((c) => c.method === "history")).toHaveLength(5);

    // Una duda que no se puede confirmar no se vuelve a mirar cada minuto…
    await sweepGenerations({ ...deps, now: minutes(12) });
    expect(fake.calls.filter((c) => c.method === "history")).toHaveLength(5);

    fake.state.history = recent(120); // tres páginas: la última llega al final del historial (sin cursor)
    await sweepGenerations({ ...deps, now: minutes(27) }); // …sino pasados 15 minutos
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: NEVER_ARRIVED });
  });

  it("una página sin `next_cursor` (ni `null` explícito) tampoco prueba que no haya más", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    const unknownEnd: HiggsfieldPort = {
      ...fake.port,
      history: async () => ({ items: [hist("otro", "otro prompt")], nextCursor: null, end: false }),
    };
    await sweepGenerations({ ...deps, higgsfield: unknownEnd, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: CANNOT_CONFIRM });
    const explicitEnd: HiggsfieldPort = { ...unknownEnd, history: async () => ({ items: [hist("otro", "otro prompt")], nextCursor: null, end: true }) };
    await sweepGenerations({ ...deps, higgsfield: explicitEnd, now: minutes(30) });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: NEVER_ARRIVED });
  });

  it("una página corta no prueba nada si Higgsfield aún da cursor", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    const endless: HiggsfieldPort = {
      ...fake.port,
      history: async () => ({ items: [hist("otro", "otro prompt")], nextCursor: 1, end: false }),
    };
    await sweepGenerations({ ...deps, higgsfield: endless, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: CANNOT_CONFIRM });
  });

  it("lo anterior al envío no cuenta para la credibilidad: una entrada vieja sin prompt no impide dar por no enviado", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    const page: HiggsfieldPort = {
      ...fake.port,
      history: async () => ({
        items: [hist("reciente", "otro prompt"), hist("vieja", null, { model: "", createdAt: new Date(Date.now() - 60 * 60_000) })],
        nextCursor: 1,
        end: false,
      }),
    };
    await sweepGenerations({ ...deps, higgsfield: page, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: NEVER_ARRIVED });
  });

  it("una entrada es nuestra también si su dirección lleva uno de nuestros identificadores", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
    fake.state.history = [
      hist("j-url", SAME_PROMPT, { media: [{ id: "convertido-123", url: `https://cdn.test/user_XXXX/hf_20261122_${MEDIA}.png` }] }),
    ];
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-url"] });
  });

  it("una dirección solo cuenta con identificadores largos y como trozo entero, no por contener un texto corto", async () => {
    expect(urlNames(`https://d8j0ntlcm91z4.cloudfront.net/user_XXXX/hf_20261121_233605_${MEDIA}.png`, MEDIA)).toBe(true);
    expect(urlNames(`https://x.cloudfront.net/${MEDIA}/min.webp`, MEDIA)).toBe(true);
    expect(urlNames(`https://x.cloudfront.net/a?id=${MEDIA}`, MEDIA)).toBe(true);
    expect(urlNames("https://x.cloudfront.net/user/hf_m1.png", "m1")).toBe(false); // corto
    expect(urlNames("https://x.cloudfront.net/ref-media-1234567890.png", "media-1234567890")).toBe(false); // otro id que acaba igual
    expect(urlNames(`https://x.cloudfront.net/x${MEDIA}.png`, MEDIA)).toBe(false); // pegado a otro texto
    expect(urlNames(`https://x.cloudfront.net/${MEDIA}0.png`, MEDIA)).toBe(false);
  });

  it("resultado desconocido sin rastro: a los 10 minutos queda «no enviado»; antes no deja repetir", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setUnknown(id);
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
    await setUnknown(id);
    fake.failNext("history", new HiggsfieldUnavailableError());
    await sweepGenerations({ ...deps, now: minutes(11) });
    expect(await rowOf(id)).toMatchObject({ status: "unknown", error: null });
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

  it("si no se pudo abrir la conexión para enviar, queda «no enviado» al momento (no «desconocido»)", async () => {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    fake.failNext("submitImages", new HiggsfieldConnectError());
    await submitGeneration(id, deps);
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: new HiggsfieldConnectError().message });
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
    const pricier = { ...fake.port, quoteImages: async () => ({ credits: 6, quoteRef: null }) };
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

  it("una intención de hace más de 15 minutos ya no se envía", async () => {
    const late = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setAgo(late.generationId, "intent_at", 16 * 60_000);
    await submitGeneration(late.generationId, deps); // el trabajo llega tarde
    expect(await rowOf(late.generationId)).toMatchObject({ status: "not_sent", error: INTENT_EXPIRED });

    const forgotten = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await setAgo(forgotten.generationId, "intent_at", 16 * 60_000);
    await sweepGenerations(deps);
    expect(await rowOf(forgotten.generationId)).toMatchObject({ status: "not_sent", error: INTENT_EXPIRED });
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

  it("aprobar un resultado de otro vídeo da 404; aprobar uno propio lo marca; rechazar la ronda lo desmarca y ya no se aprueba", async () => {
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
    await expect(approveResult(ana, v.id, "frame", first.id)).rejects.toMatchObject({ status: 404, message: "Resultado no encontrado." });
  });
});

// ───────────────────────── Seguimiento y finalización ─────────────────────────

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

  it("consultar no descarga nada: cuando todo ha terminado encola la finalización", async () => {
    const id = await sendFrame();
    await setJobs(id);
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
    await pollGeneration(id, deps);
    expect(fetched).toHaveLength(0);
    expect(await statusOf(id)).toBe("submitted");
    expect(await finalizeJobsQueued()).toBe(1);
    await finalizeGeneration(id, deps);
    expect(await statusOf(id)).toBe("done");
    expect(fetched).toHaveLength(2);
  });

  it("dos finalizaciones a la vez descargan una sola vez", async () => {
    const id = await sendFrame();
    await setJobs(id);
    await Promise.all([finalizeGeneration(id, deps), finalizeGeneration(id, deps), finalizeGeneration(id, deps)]);
    expect(fetched).toHaveLength(2);
    expect(await statusOf(id)).toBe("done");
    // Una finalización repetida después tampoco hace nada.
    await finalizeGeneration(id, deps);
    expect(fetched).toHaveLength(2);
    expect((await videoView(ana, v.id)).frame.current!.results).toHaveLength(2);
  });

  it("un trabajo «terminado» sin dirección sigue pendiente (no se da por fallido)", async () => {
    const id = await sendFrame();
    await setJobs(id, { status: "done" }, () => []);
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
    await pollGeneration(id, deps);
    await finalizeGeneration(id, deps);
    expect(await statusOf(id)).toBe("submitted");
    expect(await finalizeJobsQueued()).toBe(0);
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
    expect(await rowOf(id)).toMatchObject({ status: "failed", error: failure === "failed" ? JOB_FAILED : BLOCKED, recheckUntil: null });
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([false, false]);
    // Gastó ronda, y como falló no hace falta rechazarla para regenerar.
    expect(await quoteGeneration(ana, v.id, "frame", deps)).toMatchObject({ round: 2 });
  });

  it("con un resultado bueno y otro bloqueado, la generación termina bien", async () => {
    const id = await sendFrame();
    const { jobIds } = await rowOf(id);
    fake.state.jobs[jobIds[0]] = { jobId: jobIds[0], status: "done", failure: null, error: null, urls: ["https://cdn.test/ok.png"] };
    fake.state.jobs[jobIds[1]] = { jobId: jobIds[1], status: "failed", failure: "nsfw", error: null, urls: [] };
    await finalizeGeneration(id, deps);
    expect(await statusOf(id)).toBe("done");
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([true, false]);
  });

  it("un «no encontrado» recién enviado cuenta como pendiente: no falla un trabajo pagado ni deja regenerar", async () => {
    const id = await sendFrame();
    await setJobs(id, { status: "failed", failure: "not_found", error: "Job not found." });
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);
    await pollGeneration(id, deps);
    await finalizeGeneration(id, deps);
    expect(await statusOf(id)).toBe("submitted");
    expect(await finalizeJobsQueued()).toBe(0);
    await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({
      status: 409,
      message: "Ya hay una generación en marcha.",
    });
    // Aparece terminado: la generación termina bien.
    await finish(id);
    expect(await rowOf(id)).toMatchObject({ status: "done", error: null, recheckUntil: null });
  });

  it("si Higgsfield sigue sin encontrarlos pasado el margen, error, y se sigue mirando por si aparecen", async () => {
    const id = await sendFrame();
    await setJobs(id, { status: "failed", failure: "not_found", error: "Job not found." });
    await finalizeGeneration(id, { ...deps, now: minutes(16) });
    const failed = await rowOf(id);
    expect(failed).toMatchObject({ status: "failed", error: JOB_NOT_FOUND });
    expect(failed.recheckUntil!.getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
    // Aparecen más tarde, terminados: el seguimiento los recoge.
    await setJobs(id);
    await sweepGenerations({ ...deps, now: minutes(22) });
    expect(await finalizeJobsQueued()).toBe(1);
    await finalizeGeneration(id, { ...deps, now: minutes(22) });
    expect(await rowOf(id)).toMatchObject({ status: "done", error: null, recheckUntil: null });
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([true, true]);
  });

  it("si una candidata sale bien y la otra no aparece, termina bien y la otra se sigue mirando", async () => {
    const id = await sendFrame();
    const { jobIds } = await rowOf(id);
    fake.state.jobs[jobIds[0]] = { jobId: jobIds[0], status: "done", failure: null, error: null, urls: ["https://cdn.test/a.png"] };
    fake.state.jobs[jobIds[1]] = { jobId: jobIds[1], status: "failed", failure: "not_found", error: null, urls: [] };
    await finalizeGeneration(id, { ...deps, now: minutes(16) });
    const done = await rowOf(id);
    expect(done).toMatchObject({ status: "done", error: null });
    expect(done.recheckUntil).not.toBeNull();
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([true, false]);
    expect(fetched).toHaveLength(1);

    fake.state.jobs[jobIds[1]] = { jobId: jobIds[1], status: "done", failure: null, error: null, urls: ["https://cdn.test/b.png"] };
    await sweepGenerations({ ...deps, now: minutes(22) });
    expect(await finalizeJobsQueued()).toBe(1);
    await finalizeGeneration(id, { ...deps, now: minutes(22) });
    expect(await rowOf(id)).toMatchObject({ status: "done", recheckUntil: null });
    expect((await videoView(ana, v.id)).frame.current!.results.map((r) => r.ok)).toEqual([true, true]);
    expect(fetched).toHaveLength(2); // la que ya estaba bien no se descarga otra vez
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

  it("una generación enviada que no termina en una hora queda en error sin reenviarse, y si termina tarde se recoge", async () => {
    const id = await sendFrame();
    await setAgo(id, "submitted_at", 61 * 60_000);
    await setAgo(id, "last_polled_at", 60_000);
    await sweepGenerations(deps);
    expect(await rowOf(id)).toMatchObject({ status: "failed", error: TIMED_OUT });
    expect(submits()).toHaveLength(1);
    // Termina dos horas después: el seguimiento lo ve (como mucho cada 5 minutos) y lo guarda.
    await setJobs(id);
    await sweepGenerations({ ...deps, now: minutes(2) });
    expect(await finalizeJobsQueued()).toBe(0);
    await sweepGenerations({ ...deps, now: minutes(6) });
    expect(await finalizeJobsQueued()).toBe(1);
    await finalizeGeneration(id, { ...deps, now: minutes(6) });
    expect(await rowOf(id)).toMatchObject({ status: "done", error: null });
  });

  it("una generación que lleva menos de una hora sigue esperando", async () => {
    const id = await sendFrame();
    await setAgo(id, "submitted_at", 30 * 60_000);
    await setAgo(id, "last_polled_at", 60_000);
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

// ───────────────────────── Dudas atascadas ─────────────────────────

describe("resolver a mano una duda atascada", () => {
  /** Una generación en duda cuyo envío fue hace `minutesAgo` minutos. */
  async function stuck(minutesAgo = 11): Promise<number> {
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps);
    await getPool().query("update generations set status = 'unknown' where id = $1", [id]);
    await setAgo(id, "submit_started_at", minutesAgo * 60_000);
    return id;
  }
  const candidate = (jobId: string) => hist(jobId, SAME_PROMPT, { createdAt: null, thumbUrl: `https://cdn.test/${jobId}_min.webp` });

  it("los parecidos que no se pueden adoptar solos se ven como candidatos con su miniatura", async () => {
    const id = await stuck();
    fake.state.history = [candidate("j-cand")];
    await sweepGenerations(deps);
    const view = await videoView(ana, v.id);
    expect(view.frame.current).toMatchObject({
      id,
      status: "unknown",
      error: CANNOT_CONFIRM,
      stuck: {
        canResolve: true,
        risk: "Si sí estaba, Higgsfield te cobrará las dos.",
        candidates: [{ jobId: "j-cand", createdAt: null, model: "nano_banana_pro", thumbUrl: "https://cdn.test/j-cand_min.webp" }],
      },
    });
  });

  it("los candidatos y resolver la duda solo los ve quien creó el vídeo", async () => {
    await stuck();
    fake.state.history = [candidate("j-cand")];
    await sweepGenerations(deps);
    expect((await videoView(ana, v.id)).frame.current!.stuck).toMatchObject({ canResolve: true, candidates: [{ jobId: "j-cand" }] });
    expect((await videoView(dueno, v.id)).frame.current!.stuck).toEqual({
      canResolve: false,
      candidates: [],
      risk: "Si sí estaba, Higgsfield te cobrará las dos.",
    });
  });

  it("«Es este» adopta el candidato tras una comprobación fresca, y anota quién y cuándo", async () => {
    const id = await stuck();
    fake.state.history = [candidate("j-cand")];
    await expect(adoptCandidate(ana, v.id, "frame", "otro", deps)).rejects.toMatchObject({ status: 400, message: "Ese trabajo no es uno de los posibles." });
    expect(await adoptCandidate(ana, v.id, "frame", "j-cand", deps)).toEqual({ risk: "Si sí estaba, Higgsfield te cobrará las dos." });
    const { rows } = await getPool().query("select resolved_by, resolved_at, resolved_as from generations where id = $1", [id]);
    expect(rows[0]).toMatchObject({ resolved_by: ana.id, resolved_as: "adoptado" });
    expect(rows[0].resolved_at).toBeInstanceOf(Date);
    expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-cand"], creditsSpent: 2, error: null });
    expect(submits()).toHaveLength(0);
  });

  it("«Ya lo revisé: no está» la deja «no enviada» (se puede volver a generar) y anota quién y cuándo", async () => {
    const id = await stuck();
    fake.state.history = [candidate("j-cand")]; // hay algo parecido: la reconciliación sola no se rinde
    expect(await dismissUnknown(ana, v.id, "frame", deps)).toEqual({ risk: "Si sí estaba, Higgsfield te cobrará las dos." });
    expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: DISMISSED });
    const { rows } = await getPool().query("select resolved_by, resolved_as from generations where id = $1", [id]);
    expect(rows[0]).toMatchObject({ resolved_by: ana.id, resolved_as: "no_esta" });
    expect((await quoteGeneration(ana, v.id, "frame", deps)).round).toBe(1);
  });

  it("solo quien creó el vídeo, solo pasados 10 minutos, y no si la comprobación fresca lo encuentra o no se puede leer", async () => {
    await stuck(5);
    await expect(dismissUnknown(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 409, message: "Aún lo estamos comprobando con Higgsfield. Espera unos minutos." });
    await getPool().query("update generations set submit_started_at = now() - interval '11 minutes'");
    fake.state.history = [candidate("j-cand")];
    await expect(dismissUnknown(dueno, v.id, "frame", deps)).rejects.toMatchObject({ status: 403 });
    await expect(adoptCandidate(luis, v.id, "frame", "j-cand", deps)).rejects.toMatchObject({ status: 404 });

    fake.failNext("history", new HiggsfieldUnavailableError());
    await expect(dismissUnknown(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 503 });

    fake.state.history = [hist("j-seguro", SAME_PROMPT, { createdAt: new Date(Date.now() - 10 * 60_000) })];
    await expect(dismissUnknown(ana, v.id, "frame", deps)).rejects.toMatchObject({
      status: 409,
      message: "Higgsfield acaba de encontrarlo: la generación sigue su curso.",
    });
    expect((await videoView(ana, v.id)).frame.current).toMatchObject({ status: "submitted", stuck: null });
    await expect(dismissUnknown(ana, v.id, "frame", deps)).rejects.toMatchObject({ status: 409, message: "No hay ninguna petición pendiente de comprobar." });
  });
});

// ───────────────────────── Rutas ─────────────────────────

describe("rutas", () => {
  const as = async (user: AuthUser) => {
    cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
  };
  const getVideo = async () =>
    (await getVideoRoute(new Request("http://localhost/x"), { params: Promise.resolve({ videoId: String(v.id) }) })).json();

  it("la ruta del vídeo define los trabajos de vídeo: puede encolar la finalización en el proceso de la web", () => {
    // Estas pruebas importan `@/jobs/video-jobs` para todos; la ruta tiene que hacerlo por su cuenta.
    const source = fs.readFileSync(path.join(__dirname, "../src/app/api/videos/[videoId]/route.ts"), "utf8");
    expect(source).toMatch(/^import "@\/jobs\/video-jobs";/m);
  });

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

  it("GET /api/videos/[id] solo consulta (sin descargar) si mira quien lo creó; la finalización la hace el trabajo (modo local)", async () => {
    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    const local = getHiggsfield(); // trabajos que terminan a la segunda consulta, con una muestra `data:`
    const { generationId: id } = await requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, { higgsfield: local });
    await submitGeneration(id, { higgsfield: local }); // primera consulta: pendientes
    await getPool().query("update generations set last_polled_at = null where id = $1", [id]);

    await as(dueno); // ve el vídeo, pero no es quien lo creó: no pregunta
    expect((await getVideo()).frame.current.status).toBe("submitted");
    expect(await finalizeJobsQueued()).toBe(0);

    await as(ana);
    const seen = await getVideo();
    expect(seen.frame.current).toMatchObject({ id, status: "submitted", results: [] }); // nada descargado en la petición
    expect(await finalizeJobsQueued()).toBe(1);

    await finalizeGeneration(id, { higgsfield: local }); // lo que hace el trabajo `video.finalizar`
    const body = await getVideo();
    expect(body.frame.current).toMatchObject({ id, status: "done" });
    expect(body.frame.current.results).toHaveLength(2);
    expect(body.frame.current.results[0]).toMatchObject({ ok: true, hasThumb: true });
    expect(body.frame.current.results[0].url).toMatch(/^data:image\/png;base64,/);
    expect(body.clip.current).toBeNull();
  });

  describe("resolver una duda atascada", () => {
    const post = (body?: unknown) =>
      new Request("http://localhost/x", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
    const params = (value: string) => ({ params: Promise.resolve({ videoId: value }) });
    /** El simulado del modo local (el que usan las rutas), con un parecido que no se adopta solo. */
    async function stuckLocal(kind: "frame" | "clip" = "frame"): Promise<{ id: number; local: FakeHiggsfield }> {
      process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
      getHiggsfield();
      const local = (globalThis as unknown as { __principalHiggsfieldFake: FakeHiggsfield }).__principalHiggsfieldFake;
      local.state.history = [hist("j-cand", kind === "frame" ? SAME_PROMPT : "@Video1 sets the pace.", { createdAt: null, type: kind === "frame" ? "image" : "video" })];
      if (kind === "clip") {
        const frameId = await sendFrame();
        await finish(frameId);
        await approveResult(ana, v.id, "frame", (await videoView(ana, v.id)).frame.current!.results[0].id);
      }
      const { generationId: id } = await requestGeneration(ana, v.id, kind, { expectedCredits: kind === "frame" ? 4 : 30 }, deps);
      await getPool().query("update generations set status = 'unknown' where id = $1", [id]);
      await setAgo(id, "submit_started_at", 11 * 60_000);
      return { id, local };
    }

    it("POST …/imagen/es-este adopta el candidato y devuelve el riesgo; sin jobId, 400", async () => {
      const { id } = await stuckLocal();
      await as(ana);
      expect((await adoptFrameRoute(post({}), params(String(v.id)))).status).toBe(400);
      const response = await adoptFrameRoute(post({ jobId: "j-cand" }), params(String(v.id)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ risk: "Si sí estaba, Higgsfield te cobrará las dos." });
      expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-cand"] });
    });

    it("«Es este» sin trabajo da 400 antes de mirar el historial", async () => {
      const { id, local } = await stuckLocal();
      local.calls.length = 0;
      await expect(adoptCandidate(ana, v.id, "frame", "  ", { higgsfield: local.port })).rejects.toMatchObject({ status: 400 });
      expect(local.calls.filter((c) => c.method === "history")).toHaveLength(0);
      expect(await statusOf(id)).toBe("unknown");
    });

    it("POST …/imagen/no-esta la deja «no enviada»", async () => {
      const { id } = await stuckLocal();
      await as(ana);
      const response = await dismissFrameRoute(post(), params(String(v.id)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ risk: "Si sí estaba, Higgsfield te cobrará las dos." });
      expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: DISMISSED });
    });

    it("POST …/clip/es-este y …/clip/no-esta resuelven la duda del clip", async () => {
      const { id } = await stuckLocal("clip");
      await as(ana);
      expect((await adoptClipRoute(post({ jobId: "j-cand" }), params(String(v.id)))).status).toBe(200);
      expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j-cand"] });
      expect((await dismissClipRoute(post(), params(String(v.id)))).status).toBe(409);
    });

    it("solo quien creó el vídeo: quien solo lo ve recibe 403, quien no lo ve o un id raro, 404", async () => {
      const { id } = await stuckLocal();
      await as(dueno);
      expect((await dismissFrameRoute(post(), params(String(v.id)))).status).toBe(403);
      expect((await adoptFrameRoute(post({ jobId: "j-cand" }), params(String(v.id)))).status).toBe(403);
      await as(luis);
      expect((await dismissFrameRoute(post(), params(String(v.id)))).status).toBe(404);
      await as(ana);
      expect((await dismissFrameRoute(post(), params("1e3"))).status).toBe(404);
      expect(await statusOf(id)).toBe("unknown");
    });
  });
});
