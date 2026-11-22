import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { enqueueJob, getBoss, startWorker, stopWorker } from "@/jobs/boss";
import { defineJob } from "@/jobs/registry";
import "@/jobs/system-check"; // el proceso de trabajos solo atiende lo definido al arrancar
import { listPausedJobs, runStep, stepKey, type JobContext } from "@/jobs/steps";
import { setAssignments } from "@/server/access";
import { login, type AuthUser } from "@/server/auth";
import { seedRules } from "@/server/rules";
import { getGlobalCap, reserveSpend, settleSpend, setUserCap } from "@/server/spend";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

const JOB = "prueba-gasto";
defineJob<{ nota: string }>(JOB, async (data, ctx: JobContext) => {
  const key = stepKey(ctx, "paga", data);
  await runStep(ctx, key, async () => {
    const { entryId } = await reserveSpend({
      userId: ctx.userId,
      productId: ctx.productId,
      provider: "claude",
      stepKey: key,
      estimateMicros: 15_000,
    });
    await settleSpend(entryId, { costMicros: 9_000 });
    return "pagado";
  });
});

const gasto = () => import("@/app/api/gasto/route");
const tope = () => import("@/app/api/gasto/tope/route");
const comprobar = () => import("@/app/api/gasto/comprobar/route");
const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const put = (body: unknown) =>
  new Request("http://localhost/api/gasto/tope", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let dueno: AuthUser;
let ana: AuthUser;
let boss: PgBoss;

async function runToIdle() {
  expect((await boss.drain({ timeoutSeconds: 15 })).timedOut).toBe(false);
}

beforeAll(async () => {
  await truncateAll();
  await startWorker();
  boss = await getBoss();
  for (const schedule of await boss.getSchedules()) await boss.unschedule(schedule.name, schedule.key);
});

afterAll(async () => {
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana" });
});

describe("API de gasto", () => {
  it("el dueño ve el total, el tope global y el desglose por producto y por persona", async () => {
    const producto = await makeProduct(dueno, { name: "Lámpara" });
    await setAssignments(dueno, ana.id, [producto.id]);
    const entry = await reserveSpend({ userId: ana.id, productId: producto.id, provider: "claude", stepKey: "a", estimateMicros: 2_000 });
    await settleSpend(entry.entryId, { costMicros: 1_500 });

    await as(dueno);
    const response = await (await gasto()).GET();
    expect(response.status).toBe(200);
    const { summary, paused } = await response.json();
    expect(summary).toMatchObject({ capMicros: 30_000_000, spentMicros: 1_500 });
    expect(summary.byProduct).toEqual([{ productId: producto.id, name: "Lámpara", micros: 1_500 }]);
    expect(summary.byUser.find((u: { name: string }) => u.name === "Ana")).toMatchObject({ micros: 1_500, capMicros: 10_000_000 });
    expect(paused).toEqual([]);
  });

  it("un colaborador solo ve su gasto y su tope, y no puede cambiar el tope (403)", async () => {
    const entry = await reserveSpend({ userId: dueno.id, productId: null, provider: "claude", stepKey: "d", estimateMicros: 5_000 });
    await settleSpend(entry.entryId, { costMicros: 4_000 });
    await as(ana);
    const { summary } = await (await (await gasto()).GET()).json();
    expect(summary.spentMicros).toBe(0);
    expect(summary.capMicros).toBe(10_000_000);
    expect(summary.byUser).toHaveLength(1);
    expect(summary.byUser[0].name).toBe("Ana");

    expect((await (await tope()).PUT(put({ capUsd: "99" }))).status).toBe(403);
    expect(await getGlobalCap()).toBe(30_000_000);
    // Tampoco puede lanzar ni consultar la comprobación del sistema.
    expect((await (await comprobar()).POST()).status).toBe(403);
    expect((await (await comprobar()).GET()).status).toBe(403);
  });

  it("PUT tope con '45' guarda 45 USD y reanuda los trabajos en pausa", async () => {
    await as(dueno);
    await (await tope()).PUT(put({ capUsd: "0" }));
    await enqueueJob(JOB, { userId: dueno.id, productId: null }, { nota: "x" });
    await runToIdle();
    expect(await listPausedJobs(dueno)).toHaveLength(1);

    const response = await (await tope()).PUT(put({ capUsd: "45" }));
    expect(response.status).toBe(200);
    expect(await getGlobalCap()).toBe(45_000_000);
    await runToIdle();
    expect(await listPausedJobs(dueno)).toHaveLength(0);
  });

  it("un importe que no vale da 400 en español y no cambia el tope", async () => {
    await as(dueno);
    for (const body of [{ capUsd: "mucho" }, { capUsd: "-3" }, {}, { capUsd: 45 }]) {
      const response = await (await tope()).PUT(put(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/importe|tope/i);
    }
    expect(await getGlobalCap()).toBe(30_000_000);
  });

  it("la respuesta incluye cuántos trabajos están en pausa por el tope, con persona y motivo", async () => {
    await as(dueno);
    await (await tope()).PUT(put({ capUsd: "0" }));
    await enqueueJob(JOB, { userId: dueno.id, productId: null }, { nota: "y" });
    await runToIdle();
    const { paused } = await (await (await gasto()).GET()).json();
    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({ jobName: JOB, userName: "Dueña", productName: null, reason: "global" });

    // Un colaborador solo ve los suyos.
    await as(ana);
    expect((await (await (await gasto()).GET()).json()).paused).toEqual([]);
  });

  it("el motivo es el tope de la persona cuando el global tiene saldo", async () => {
    await setUserCap(dueno, ana.id, 0);
    await enqueueJob(JOB, { userId: ana.id, productId: null }, { nota: "z" });
    await runToIdle();
    await as(dueno);
    const { paused } = await (await (await gasto()).GET()).json();
    expect(paused[0]).toMatchObject({ userName: "Ana", reason: "persona" });
    await as(ana);
    expect((await (await (await gasto()).GET()).json()).paused).toHaveLength(1);
  });
});

describe("API de comprobación del sistema", () => {
  it("encola una sola comprobación a la vez, la ejecuta el proceso en segundo plano y deja su resultado", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await seedRules();
      await as(dueno);
      const route = await comprobar();
      const first = await route.POST();
      expect(first.status).toBe(202);
      expect(await first.json()).toMatchObject({ started: true, running: true });
      // Pulsar otra vez mientras corre no encola otra: devuelve la que está en marcha.
      expect(await (await route.POST()).json()).toMatchObject({ started: false, running: true });

      await runToIdle();
      const done = await (await route.GET()).json();
      expect(done.running).toBe(false);
      expect(done.last).toMatchObject({ ok: false, error: "Falta la clave de Claude (ANTHROPIC_API_KEY)." });
      expect(done.last.stages.cola.ok && done.last.stages.reglas.ok).toBe(true);
      expect(done.last.stages.pasarela.ok).toBe(false);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
