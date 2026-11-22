import { eq } from "drizzle-orm";
import type { PgBoss, Schedule } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { enqueueJob, getBoss, recoverInterruptedSteps, resumePausedJobs, startWorker, stopWorker } from "@/jobs/boss";
import { defineJob, defineSchedule } from "@/jobs/registry";
import { jobKey, listPausedJobs, runStep, type JobContext } from "@/jobs/steps";
import { setAssignments } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import { setPersonDisabled } from "@/server/people";
import { reserveSpend, settleSpend, setGlobalCap, setUserCap } from "@/server/spend";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/** pg-boss real sobre el PostgreSQL de pruebas. */

const JOB = "prueba-cola";
const RESERVADO = 15_000;

interface Data {
  nota: string;
}

const runs: Array<{ data: Data; ctx: JobContext }> = [];
let work: (data: Data, ctx: JobContext) => Promise<void> = async () => {};

defineJob<Data>(JOB, async (data, ctx) => {
  runs.push({ data, ctx });
  await work(data, ctx);
});

let scheduledRuns = 0;
defineSchedule("prueba-programada", "0 3 * * *", async () => {
  scheduledRuns++;
});

let boss: PgBoss;
let schedules: Schedule[] = [];
let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;

/**
 * Arranca el proceso de trabajos y, una vez anotado lo que programó, quita la programación:
 * así ninguna tarea periódica se cuela en mitad de una prueba.
 */
async function start(): Promise<void> {
  await startWorker();
  boss = await getBoss();
  schedules = await boss.getSchedules();
  for (const schedule of schedules) await boss.unschedule(schedule.name, schedule.key);
}

/** Espera a que la cola se quede sin nada que hacer. */
async function runToIdle(): Promise<void> {
  const result = await boss.drain({ timeoutSeconds: 15 });
  expect(result.timedOut).toBe(false);
}

async function step(key: string) {
  const [row] = await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.key, key));
  return row;
}

const entriesByStep = (key: string) =>
  getDb().select().from(schema.spendEntries).where(eq(schema.spendEntries.stepKey, key));

async function insertStep(over: Partial<typeof schema.jobSteps.$inferInsert> & { key: string }) {
  await getDb()
    .insert(schema.jobSteps)
    .values({ jobName: JOB, userId: ana.id, productId: null, status: "running", attempts: 1, startedAt: new Date(), ...over });
}

/** Un paso que paga: reserva, «llama» y liquida. */
const pay = (ctx: JobContext, key: string) =>
  runStep(ctx, key, async () => {
    const { entryId } = await reserveSpend({
      userId: ctx.userId,
      productId: ctx.productId,
      provider: "claude",
      stepKey: key,
      estimateMicros: RESERVADO,
    });
    await settleSpend(entryId, { costMicros: 9_000 });
    return "pagado";
  });

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const disable = (user: AuthUser) =>
  getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, user.id));
const forAna = () => ({ userId: ana.id, productId: null });

/** La fila del trabajo entero (la que escribe quien encola). */
const jobRow = (data: Data, user: AuthUser = ana, productId: number | null = null) =>
  step(jobKey(JOB, user.id, productId, data));

/** Como si hubiera pasado el tiempo: la fila lleva `minutes` sin tocarse. */
const age = (key: string, minutes: number) =>
  getDb().update(schema.jobSteps).set({ updatedAt: minutesAgo(minutes) }).where(eq(schema.jobSteps.key, key));

function silenceErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

beforeAll(async () => {
  await truncateAll();
  await start();
});

afterAll(async () => {
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  await boss.deleteAllJobs();
  runs.length = 0;
  scheduledRuns = 0;
  work = async () => {};
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana" });
  luis = await makeUser("colaborador", { name: "Luis" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cola de trabajos", () => {
  it("un trabajo encolado se ejecuta con su contexto", async () => {
    const product = await makeProduct(ana);
    const id = await enqueueJob<Data>(JOB, { userId: ana.id, productId: product.id }, { nota: "hola" });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await runToIdle();
    expect(runs).toEqual([{ data: { nota: "hola" }, ctx: { jobName: JOB, userId: ana.id, productId: product.id } }]);
    const [job] = await boss.findJobs(JOB, { id });
    expect(job).toMatchObject({ state: "completed", retryLimit: 0 });
    expect(await jobRow({ nota: "hola" }, ana, product.id)).toMatchObject({ status: "done", attempts: 1 });
  });

  it("al encolar queda apuntado el trabajo, con sus datos, a la vez que entra en la cola", async () => {
    await stopWorker(); // nadie lo ejecuta todavía
    try {
      const id = await enqueueJob<Data>(JOB, forAna(), { nota: "apuntado" });
      expect(await jobRow({ nota: "apuntado" })).toMatchObject({
        status: "queued",
        attempts: 0,
        payload: { nota: "apuntado" },
        jobName: JOB,
        userId: ana.id,
        productId: null,
      });
      expect(await (await getBoss()).findJobs(JOB, { id })).toHaveLength(1);
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["apuntado"]);
  });

  it("no encola un trabajo que no está definido, y lo dice", async () => {
    await expect(enqueueJob("trabajo-sin-definir", forAna(), { nota: "x" })).rejects.toThrow(
      "No hay ningún trabajo definido con el nombre «trabajo-sin-definir».",
    );
    expect(await getDb().select().from(schema.jobSteps)).toHaveLength(0);
  });

  it("encolar dos veces lo mismo seguido lo ejecuta una vez; volver a pedirlo cuando ya terminó lo ejecuta otra vez", async () => {
    await stopWorker();
    try {
      await enqueueJob<Data>(JOB, forAna(), { nota: "repetido" });
      await enqueueJob<Data>(JOB, forAna(), { nota: "repetido" });
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs).toHaveLength(1);

    await enqueueJob<Data>(JOB, forAna(), { nota: "repetido" });
    await runToIdle();
    expect(runs).toHaveLength(2);
    expect(await jobRow({ nota: "repetido" })).toMatchObject({ status: "done", attempts: 1 });
  });

  it("quien encola fija los datos para reencolar: cada paso del trabajo los guarda tal cual", async () => {
    work = async (data, ctx) => {
      await runStep(ctx, "k-uno", async () => 1);
      await runStep(ctx, "k-dos", async () => 2);
    };
    await enqueueJob<Data>(JOB, forAna(), { nota: "con datos" });
    await runToIdle();
    expect(await step("k-uno")).toMatchObject({ status: "done", payload: { nota: "con datos" }, jobName: JOB, userId: ana.id });
    expect(await step("k-dos")).toMatchObject({ status: "done", payload: { nota: "con datos" } });
  });

  it("no encola con un contexto o unos datos que no valen", async () => {
    await expect(enqueueJob(JOB, { userId: 1.5, productId: null }, { nota: "x" })).rejects.toThrow();
    await expect(enqueueJob(JOB, { userId: ana.id, productId: 0 }, { nota: "x" })).rejects.toThrow();
    await expect(enqueueJob(JOB, forAna(), "texto" as unknown as object)).rejects.toThrow();
    await expect(enqueueJob(JOB, forAna(), { n: BigInt(1) })).rejects.toThrow();
    await expect(enqueueJob("", forAna(), { nota: "x" })).rejects.toThrow();
    await runToIdle();
    expect(runs).toHaveLength(0);
  });

  it("un trabajo que falla no lo reintenta la cola por su cuenta, y en ella solo queda el mensaje del error", async () => {
    const errors = silenceErrors();
    work = async () => {
      throw Object.assign(new Error("se rompió"), { detalle: "dato-interno" });
    };
    const id = await enqueueJob<Data>(JOB, forAna(), { nota: "falla" });
    await runToIdle();
    await runToIdle();
    expect(runs).toHaveLength(1);
    const [job] = await boss.findJobs(JOB, { id });
    expect(job).toMatchObject({ state: "failed", retryCount: 0 });
    expect(JSON.stringify(job.output)).toContain("se rompió");
    expect(JSON.stringify(job.output)).not.toContain("dato-interno");
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(`«${JOB}»`));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("se rompió"));
    expect(await jobRow({ nota: "falla" })).toMatchObject({ status: "failed", attempts: 1, error: "se rompió" });
  });

  it("un trabajo que falla fuera de sus pasos se reintenta como mucho tres veces en total", async () => {
    const errors = silenceErrors();
    work = async () => {
      throw new Error("fallo entre pasos");
    };
    await enqueueJob<Data>(JOB, forAna(), { nota: "entre pasos" });
    await runToIdle();
    for (const attempts of [2, 3]) {
      expect(await recoverInterruptedSteps()).toBe(1);
      expect(await recoverInterruptedSteps()).toBe(0);
      await runToIdle();
      expect(await jobRow({ nota: "entre pasos" })).toMatchObject({ status: "failed", attempts });
    }
    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(3);
    expect(errors).toHaveBeenCalledTimes(3);
  });

  it("un trabajo encolado antes de arrancar el proceso de trabajos se ejecuta al arrancarlo", async () => {
    await stopWorker();
    try {
      await enqueueJob<Data>(JOB, forAna(), { nota: "esperando" });
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["esperando"]);
  });
});

describe("pausa por tope", () => {
  it("un trabajo en pausa por tope se reanuda una sola vez al subir el tope", async () => {
    work = async (data, ctx) => {
      await pay(ctx, "k-pausa");
    };
    await setUserCap(dueno, ana.id, 0); // el paso del trabajo intenta reservar y queda en pausa
    const id = await enqueueJob<Data>(JOB, forAna(), { nota: "sin saldo" });
    await runToIdle();
    expect(runs).toHaveLength(1);
    expect(await listPausedJobs(dueno)).toHaveLength(1);
    expect(await step("k-pausa")).toMatchObject({ status: "paused_cap", attempts: 0, payload: { nota: "sin saldo" } });
    expect(await jobRow({ nota: "sin saldo" })).toMatchObject({ status: "paused_cap", attempts: 0 });
    // Para la cola, un trabajo en pausa ha terminado bien: no es un fallo.
    expect((await boss.findJobs(JOB, { id }))[0]).toMatchObject({ state: "completed" });

    await setUserCap(dueno, ana.id, 10_000_000); // setUserCap llama a resumePausedJobs
    expect((await step("k-pausa")).status).toBe("queued");
    expect(await resumePausedJobs()).toBe(0); // ya se reencoló: una segunda pasada no lo duplica
    await runToIdle();
    expect(runs).toHaveLength(2);
    expect(runs[1]).toEqual(runs[0]);
    expect(await listPausedJobs(dueno)).toHaveLength(0);
    expect(await step("k-pausa")).toMatchObject({ status: "done", attempts: 1, result: "pagado" });
    expect(await entriesByStep("k-pausa")).toHaveLength(1);
    expect(await jobRow({ nota: "sin saldo" })).toMatchObject({ status: "done", attempts: 1 });
  });

  it("si el trabajo reanudado muere antes de llegar a su paso, el barrido lo recoge una sola vez", async () => {
    work = async (data, ctx) => {
      await pay(ctx, "k-muere");
    };
    await setUserCap(dueno, ana.id, 0);
    await enqueueJob<Data>(JOB, forAna(), { nota: "muere" });
    await runToIdle();
    expect(runs).toHaveLength(1);

    // Se reanuda, pero el proceso muere antes de empezar el trabajo: su mensaje desaparece.
    await stopWorker();
    try {
      await setUserCap(dueno, ana.id, 10_000_000);
      expect((await step("k-muere")).status).toBe("queued");
      await (await getBoss()).deleteAllJobs();
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs).toHaveLength(1);

    // Recién reencolado no se da por perdido: puede estar esperando turno.
    expect(await recoverInterruptedSteps()).toBe(0);
    // Pasado el tiempo sin que nadie lo empiece, sí; y una sola vez.
    await age(jobKey(JOB, ana.id, null, { nota: "muere" }), 3);
    await age("k-muere", 3);
    expect(await recoverInterruptedSteps()).toBe(1);
    expect(await recoverInterruptedSteps()).toBe(0);
    expect(await resumePausedJobs()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(2);
    expect(await step("k-muere")).toMatchObject({ status: "done", attempts: 1, result: "pagado" });
    expect(await entriesByStep("k-muere")).toHaveLength(1);
    expect(await recoverInterruptedSteps()).toBe(0);
  });

  it("subir el tope global también reanuda los trabajos en pausa", async () => {
    work = async (data, ctx) => {
      await pay(ctx, "k-global");
    };
    await setGlobalCap(dueno, 0);
    await enqueueJob<Data>(JOB, forAna(), { nota: "tope global" });
    await runToIdle();
    expect(await listPausedJobs(dueno)).toHaveLength(1);

    await setGlobalCap(dueno, 30_000_000);
    await runToIdle();
    expect(runs).toHaveLength(2);
    expect(await step("k-global")).toMatchObject({ status: "done" });
  });

  it("sin saldo, resumePausedJobs no reencola nada", async () => {
    work = async (data, ctx) => {
      await pay(ctx, "k-sin-saldo");
    };
    await setUserCap(dueno, ana.id, 0);
    await enqueueJob<Data>(JOB, forAna(), { nota: "sin saldo" });
    await runToIdle();

    expect(await resumePausedJobs()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(1);
    expect(await step("k-sin-saldo")).toMatchObject({ status: "paused_cap" });
  });

  it("al cambiar de mes, el trabajo en pausa se reanuda una sola vez y el gasto del mes anterior no cuenta", async () => {
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    await setUserCap(dueno, ana.id, 20_000);
    await reserveSpend({ ...forAna(), provider: "claude", stepKey: "otro", estimateMicros: 20_000, now: lastMonth });
    await insertStep({ key: "k-mes", status: "paused_cap", attempts: 0, payload: { nota: "del mes pasado" } });

    expect(await resumePausedJobs(lastMonth)).toBe(0); // en su mes no quedaba saldo
    expect(await resumePausedJobs()).toBe(1); // en el mes nuevo sí
    expect(await resumePausedJobs()).toBe(0);
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["del mes pasado"]);
  });

  it("un trabajo con dos pasos en pausa se reencola una sola vez; dos trabajos distintos, una vez cada uno", async () => {
    await insertStep({ key: "k-a1", status: "paused_cap", attempts: 0, payload: { nota: "a" } });
    await insertStep({ key: "k-a2", status: "paused_cap", attempts: 0, payload: { nota: "a" } });
    await insertStep({ key: "k-b", status: "paused_cap", attempts: 0, payload: { nota: "b" } });
    // Un paso suelto (sin datos para reencolar) no se puede reanudar desde aquí.
    await insertStep({ key: "k-suelto", status: "paused_cap", attempts: 0 });

    // El paso suelto no sale: nunca se reanudará solo.
    expect(await listPausedJobs(dueno)).toHaveLength(2);
    expect(await resumePausedJobs()).toBe(2);
    await runToIdle();
    expect(runs.map((run) => run.data.nota).sort()).toEqual(["a", "b"]);
    expect((await step("k-a1")).status).toBe("queued");
    expect((await step("k-a2")).status).toBe("queued");
    expect((await step("k-suelto")).status).toBe("paused_cap");
  });

  it("dos pasadas a la vez no reencolan dos veces el mismo trabajo", async () => {
    await insertStep({ key: "k-carrera", status: "paused_cap", attempts: 0, payload: { nota: "carrera" } });
    const counts = await Promise.all([resumePausedJobs(), resumePausedJobs(), resumePausedJobs()]);
    expect(counts.reduce((total, n) => total + n, 0)).toBe(1);
    await runToIdle();
    expect(runs).toHaveLength(1);
  });

  it("listPausedJobs: el dueño ve todos y un colaborador solo los suyos", async () => {
    const product = await makeProduct(ana);
    const since = minutesAgo(3);
    await insertStep({ key: "k-ana", status: "paused_cap", productId: product.id, payload: { nota: "a" }, updatedAt: since });
    await insertStep({ key: "k-luis", status: "paused_cap", userId: luis.id, payload: { nota: "l" } });
    await insertStep({ key: "k-hecho", status: "done", payload: { nota: "h" } });

    const all = await listPausedJobs(dueno);
    expect(all.map((job) => job.userId).sort()).toEqual([ana.id, luis.id].sort());
    expect(await listPausedJobs(ana)).toEqual([{ jobName: JOB, productId: product.id, userId: ana.id, since }]);
    expect(await listPausedJobs(luis)).toEqual([
      { jobName: JOB, productId: null, userId: luis.id, since: expect.any(Date) },
    ]);

    // Los trabajos en pausa de una persona desactivada no se van a reanudar: no salen.
    await disable(luis);
    expect((await listPausedJobs(dueno)).map((job) => job.userId)).toEqual([ana.id]);
  });
});

describe("persona desactivada o producto desasignado con trabajos en cola", () => {
  it("si desactivan a la persona con el trabajo a medias, el siguiente paso no se ejecuta ni gasta", async () => {
    silenceErrors();
    work = async (data, ctx) => {
      await pay(ctx, "k-antes");
      await disable(ana);
      await pay(ctx, "k-despues");
    };
    await enqueueJob<Data>(JOB, forAna(), { nota: "a medias" });
    await runToIdle();
    expect(await step("k-antes")).toMatchObject({ status: "done" });
    expect(await step("k-despues")).toMatchObject({ status: "failed", error: "Esta cuenta está desactivada.", payload: null });
    expect(await entriesByStep("k-despues")).toHaveLength(0);
    // El trabajo queda fallido para siempre: nadie lo reencola.
    expect(await jobRow({ nota: "a medias" })).toMatchObject({ status: "failed", attempts: 3 });
    expect(await recoverInterruptedSteps()).toBe(0);
  });

  it("el trabajo de una persona desactivada se detiene sin gastar", async () => {
    const errors = silenceErrors();
    work = async (data, ctx) => {
      await pay(ctx, "k-desactivada");
    };
    await enqueueJob<Data>(JOB, forAna(), { nota: "en cola" });
    await disable(ana);
    await runToIdle();

    // El trabajo ni empieza: queda fallido con el motivo y sin datos para reencolar.
    expect(runs).toHaveLength(0);
    expect(await jobRow({ nota: "en cola" })).toMatchObject({
      status: "failed",
      error: "Esta cuenta está desactivada.",
      payload: null,
    });
    expect(await step("k-desactivada")).toBeUndefined();
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
    // Y no se vuelve a intentar, tampoco pasado el tiempo.
    await age(jobKey(JOB, ana.id, null, { nota: "en cola" }), 30);
    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("Esta cuenta está desactivada."));
  });

  it("el trabajo de un dueño desactivado también se detiene sin gastar", async () => {
    silenceErrors();
    work = async (data, ctx) => {
      await pay(ctx, "k-dueno");
    };
    await enqueueJob<Data>(JOB, { userId: dueno.id, productId: null }, { nota: "en cola" });
    await disable(dueno);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(await jobRow({ nota: "en cola" }, dueno)).toMatchObject({ status: "failed", error: "Esta cuenta está desactivada." });
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
  });

  it("el trabajo sobre un producto que la persona ya no ve se detiene sin gastar", async () => {
    silenceErrors();
    const product = await makeProduct(ana);
    work = async (data, ctx) => {
      await pay(ctx, "k-desasignado");
    };
    await enqueueJob<Data>(JOB, { userId: ana.id, productId: product.id }, { nota: "en cola" });
    await setAssignments(dueno, ana.id, []);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(await jobRow({ nota: "en cola" }, ana, product.id)).toMatchObject({ status: "failed", error: "Producto no encontrado." });
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
    expect(await recoverInterruptedSteps()).toBe(0);
  });

  it("desactivar a la persona desde Personas detiene su trabajo en cola sin gastar, también si luego se reactiva", async () => {
    silenceErrors();
    work = async (data, ctx) => {
      await pay(ctx, "k-personas");
    };
    await stopWorker(); // el trabajo queda encolado y nadie lo empieza todavía
    try {
      await enqueueJob<Data>(JOB, forAna(), { nota: "desde personas" });
      expect(await jobRow({ nota: "desde personas" })).toMatchObject({ status: "queued" });
      await setPersonDisabled(dueno, ana.id, true);
    } finally {
      await start();
    }
    await runToIdle();

    expect(runs).toHaveLength(0);
    expect(await jobRow({ nota: "desde personas" })).toMatchObject({
      status: "failed",
      error: "Esta cuenta está desactivada.",
      payload: null,
    });
    expect(await step("k-personas")).toBeUndefined();
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);

    // Reactivarla no resucita el trabajo detenido: se queda sin datos para reencolar.
    await setPersonDisabled(dueno, ana.id, false);
    await age(jobKey(JOB, ana.id, null, { nota: "desde personas" }), 30);
    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
  });

  it("desactivar a la persona desde Personas deja su trabajo en pausa sin reanudar", async () => {
    await insertStep({ key: "k-pausa-personas", status: "paused_cap", attempts: 0, payload: { nota: "x" } });
    await setPersonDisabled(dueno, ana.id, true);
    expect(await resumePausedJobs()).toBe(0);
    expect(await listPausedJobs(dueno)).toEqual([]);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect((await step("k-pausa-personas")).status).toBe("paused_cap");
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
  });

  it("un trabajo en pausa de una persona desactivada no se reanuda", async () => {
    await insertStep({ key: "k-pausa-des", status: "paused_cap", attempts: 0, payload: { nota: "x" } });
    await disable(ana);
    expect(await resumePausedJobs()).toBe(0);
    expect((await step("k-pausa-des")).status).toBe("paused_cap");
  });
});

describe("recuperación tras una caída", () => {
  it("un paso interrumpido se reencola una vez, conserva el cargo previsto y se reintenta", async () => {
    await insertStep({ key: "k-caida", startedAt: minutesAgo(16), payload: { nota: "interrumpido" } });
    await reserveSpend({ ...forAna(), provider: "claude", stepKey: "k-caida", estimateMicros: RESERVADO });
    // Otro paso lleva poco en marcha: puede seguir vivo en otro proceso y no se toca.
    await insertStep({ key: "k-vivo", startedAt: new Date(Date.now() - 30_000), payload: { nota: "vivo" } });
    await reserveSpend({ ...forAna(), provider: "claude", stepKey: "k-vivo", estimateMicros: RESERVADO });
    work = async (data, ctx) => {
      await runStep(ctx, "k-caida", async () => "ok");
    };

    expect(await recoverInterruptedSteps()).toBe(1);
    // El libro conserva el cargo previsto: no se sabe si la llamada llegó a cobrarse.
    expect(await entriesByStep("k-caida")).toMatchObject([
      { status: "settled", costMicros: RESERVADO, detail: { outcome: "unknown", interrupted: true } },
    ]);
    expect(await step("k-caida")).toMatchObject({ status: "queued", attempts: 1 });
    expect(await recoverInterruptedSteps()).toBe(0);

    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["interrumpido"]);
    expect(await step("k-caida")).toMatchObject({ status: "done", attempts: 2, result: "ok" });
    expect(await entriesByStep("k-caida")).toHaveLength(1);
    expect(await step("k-vivo")).toMatchObject({ status: "running", attempts: 1 });
    expect(await entriesByStep("k-vivo")).toMatchObject([{ status: "reserved" }]);
  });

  it("un paso largo que sigue en marcha (da señales de vida) no se reencola ni pierde su reserva", async () => {
    await insertStep({
      key: "k-largo",
      startedAt: minutesAgo(40),
      heartbeatAt: new Date(Date.now() - 20_000),
      payload: { nota: "largo" },
    });
    await reserveSpend({ ...forAna(), provider: "claude", stepKey: "k-largo", estimateMicros: RESERVADO });

    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(await step("k-largo")).toMatchObject({ status: "running", attempts: 1 });
    expect(await entriesByStep("k-largo")).toMatchObject([{ status: "reserved", costMicros: null }]);
  });

  it("si deja de dar señales de vida más de 2 minutos, sí se reencola", async () => {
    await insertStep({
      key: "k-mudo",
      startedAt: minutesAgo(40),
      heartbeatAt: minutesAgo(3),
      payload: { nota: "mudo" },
    });
    expect(await recoverInterruptedSteps()).toBe(1);
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["mudo"]);
  });

  it("un trabajo cuyo proceso muere antes de empezarlo no se pierde: el barrido lo vuelve a encolar una vez", async () => {
    await stopWorker();
    try {
      await enqueueJob<Data>(JOB, forAna(), { nota: "perdido" });
      await (await getBoss()).deleteAllJobs(); // el mensaje se pierde; queda la fila del trabajo
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs).toHaveLength(0);

    expect(await recoverInterruptedSteps()).toBe(0); // recién encolado: puede estar esperando turno
    await age(jobKey(JOB, ana.id, null, { nota: "perdido" }), 3);
    expect(await recoverInterruptedSteps()).toBe(1);
    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["perdido"]);
    expect(await jobRow({ nota: "perdido" })).toMatchObject({ status: "done", attempts: 1 });
  });

  it("un trabajo que muere entre dos pasos se retoma donde iba, sin repetir lo hecho", async () => {
    // Como lo deja un proceso que murió con el primer paso hecho y el segundo sin empezar.
    const data = { nota: "entre dos pasos" };
    await insertStep({ key: jobKey(JOB, ana.id, null, data), startedAt: minutesAgo(10), heartbeatAt: minutesAgo(3), payload: data });
    await insertStep({ key: "k-uno", status: "done", result: "uno", payload: data });
    const done: string[] = [];
    work = async (job, ctx) => {
      done.push(await runStep(ctx, "k-uno", async () => "uno otra vez"));
      done.push(await runStep(ctx, "k-dos", async () => "dos"));
    };

    expect(await recoverInterruptedSteps()).toBe(1);
    await runToIdle();
    expect(done).toEqual(["uno", "dos"]);
    expect(await jobRow(data)).toMatchObject({ status: "done", attempts: 2 });
  });

  it("un paso que sigue encolado bajo un trabajo que ya no existe no se reencola una y otra vez", async () => {
    await insertStep({ key: "k-huerfano", status: "queued", attempts: 0, payload: { nota: "huérfano" }, updatedAt: minutesAgo(30) });
    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(0);
  });

  it("al parar, el proceso termina el paso en marcha, no empieza el siguiente y el trabajo se retoma al volver", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inFlight = new Promise<void>((resolve) => (started = resolve));
    let firstRuns = 0;
    work = async (data, ctx) => {
      await runStep(ctx, "k-en-marcha", async () => {
        firstRuns++;
        started();
        await gate;
        return "terminado";
      });
      await runStep(ctx, "k-siguiente", async () => "siguiente");
    };
    const data = { nota: "despliegue" };
    await enqueueJob<Data>(JOB, forAna(), data);
    await inFlight;

    let stopped = false;
    const stopping = stopWorker().then(() => (stopped = true));
    try {
      // La parada espera al paso en marcha.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(stopped).toBe(false);
      expect(await step("k-en-marcha")).toMatchObject({ status: "running" });
      release();
      await stopping;
    } finally {
      release();
      await stopping;
      await start();
    }
    expect(await step("k-en-marcha")).toMatchObject({ status: "done", result: "terminado" });
    expect(await step("k-siguiente")).toBeUndefined();
    expect(await jobRow(data)).toMatchObject({ status: "queued", attempts: 0 });

    // Al volver, pasado el tiempo de espera, el barrido lo retoma donde iba.
    await age(jobKey(JOB, ana.id, null, data), 3);
    expect(await recoverInterruptedSteps()).toBe(1);
    await runToIdle();
    expect(firstRuns).toBe(1);
    expect(await step("k-siguiente")).toMatchObject({ status: "done", result: "siguiente" });
    expect(await jobRow(data)).toMatchObject({ status: "done", attempts: 1 });
  });

  it("un paso que falla se reintenta como mucho tres veces en total", async () => {
    const errors = silenceErrors();
    work = async (data, ctx) => {
      await runStep(ctx, "k-falla", async () => {
        throw new Error("no hay red");
      });
    };
    await enqueueJob<Data>(JOB, forAna(), { nota: "falla" });
    await runToIdle();
    expect(await step("k-falla")).toMatchObject({ status: "failed", attempts: 1, error: "no hay red" });

    for (const attempts of [2, 3]) {
      expect(await recoverInterruptedSteps()).toBe(1);
      expect(await recoverInterruptedSteps()).toBe(0); // ya está reencolado: no se duplica
      await runToIdle();
      expect(await step("k-falla")).toMatchObject({ status: "failed", attempts });
    }
    expect(runs).toHaveLength(3);

    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(3);
    expect(await step("k-falla")).toMatchObject({ status: "failed", attempts: 3 });
    expect(errors).toHaveBeenCalledTimes(3);
  });

  it("un paso interrumpido en su tercer intento queda fallido, con el cargo previsto, y no se reencola", async () => {
    await insertStep({ key: "k-agotado", attempts: 3, startedAt: minutesAgo(16), payload: { nota: "agotado" } });
    await reserveSpend({ ...forAna(), provider: "claude", stepKey: "k-agotado", estimateMicros: RESERVADO });

    expect(await recoverInterruptedSteps()).toBe(0);
    await runToIdle();
    expect(runs).toHaveLength(0);
    expect(await step("k-agotado")).toMatchObject({ status: "failed", attempts: 3 });
    expect(await entriesByStep("k-agotado")).toMatchObject([{ status: "settled", costMicros: RESERVADO }]);
  });

  it("los pasos sueltos (sin datos para reencolar) no se reencolan", async () => {
    await insertStep({ key: "k-suelto-caido", startedAt: minutesAgo(16) });
    await insertStep({ key: "k-suelto-fallido", status: "failed", attempts: 1 });
    expect(await recoverInterruptedSteps()).toBe(0);
    expect((await step("k-suelto-caido")).status).toBe("running");
    expect((await step("k-suelto-fallido")).status).toBe("failed");
  });

  it("al arrancar, el proceso de trabajos recupera lo que quedó a medias", async () => {
    await stopWorker();
    try {
      await insertStep({ key: "k-arranque", startedAt: minutesAgo(20), payload: { nota: "de antes de la caída" } });
      await reserveSpend({ ...forAna(), provider: "claude", stepKey: "k-arranque", estimateMicros: RESERVADO });
      work = async (data, ctx) => {
        await runStep(ctx, "k-arranque", async () => "recuperado");
      };
    } finally {
      await start();
    }
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["de antes de la caída"]);
    expect(await step("k-arranque")).toMatchObject({ status: "done", attempts: 2, result: "recuperado" });
    expect(await entriesByStep("k-arranque")).toMatchObject([{ status: "settled", costMicros: RESERVADO }]);
  });
});

describe("tareas programadas", () => {
  it("programa la reanudación cada hora (minuto 5) y la recuperación cada 5 minutos, en UTC", () => {
    const byName = new Map(schedules.map((schedule) => [schedule.name, schedule]));
    expect(byName.get("reanudar-pausados")).toMatchObject({ cron: "5 * * * *", timezone: "UTC" });
    expect(byName.get("recuperar-pasos")).toMatchObject({ cron: "*/5 * * * *", timezone: "UTC" });
    expect(byName.get("prueba-programada")).toMatchObject({ cron: "0 3 * * *", timezone: "UTC" });
  });

  it("la tarea «reanudar-pausados» reanuda los trabajos en pausa", async () => {
    await insertStep({ key: "k-programada", status: "paused_cap", attempts: 0, payload: { nota: "por la tarea" } });
    await boss.send("reanudar-pausados", {});
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["por la tarea"]);
  });

  it("la tarea «recuperar-pasos» reencola los pasos interrumpidos", async () => {
    await insertStep({ key: "k-recuperar", startedAt: minutesAgo(16), payload: { nota: "por la tarea" } });
    await boss.send("recuperar-pasos", {});
    await runToIdle();
    expect(runs.map((run) => run.data.nota)).toEqual(["por la tarea"]);
  });

  it("una tarea programada definida con defineSchedule se ejecuta cuando le toca", async () => {
    await boss.send("prueba-programada", {});
    await runToIdle();
    expect(scheduledRuns).toBe(1);
  });

  it("al arrancar se quita la programación que ya no está definida", async () => {
    await boss.createQueue("tarea-antigua");
    await boss.schedule("tarea-antigua", "0 4 * * *");
    await stopWorker();
    await start();
    expect(schedules.map((schedule) => schedule.name).sort()).toEqual([
      "prueba-programada",
      "reanudar-pausados",
      "recuperar-pasos",
    ]);
  });
});
