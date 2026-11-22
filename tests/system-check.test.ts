import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getSetting, schema } from "@/db/client";
import { createGateway } from "@/llm/gateway";
import { runSystemCheck, SYSTEM_CHECK_JOB, systemCheckStatus, type SystemCheckResult } from "@/jobs/system-check";
import type { JobContext } from "@/jobs/steps";
import type { AuthUser } from "@/server/auth";
import { seedRules } from "@/server/rules";
import { setGlobalCap, spendSummary } from "@/server/spend";
import { fakeApiError, fakeMessages } from "./helpers/fake-llm";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let dueno: AuthUser;
const ctx = (user: AuthUser): JobContext => ({ jobName: SYSTEM_CHECK_JOB, userId: user.id, productId: null });
const at = (iso: string) => () => new Date(iso);

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  await seedRules();
});

describe("comprobación del sistema", () => {
  it("la comprobación recorre cola → reglas → pasarela → libro de gasto con el modelo pequeño", async () => {
    const { client, calls } = fakeMessages([{ text: "OK", usage: { inputTokens: 3_000, outputTokens: 2 } }]);
    const r = await runSystemCheck(ctx(dueno), { gateway: createGateway({ client }) });
    expect(r).toMatchObject({ ok: true, model: "claude-haiku-5-5" });
    expect(r.costMicros).toBeGreaterThan(0);
    expect(r.costMicros).toBeLessThan(10_000); // menos de un céntimo
    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(16);
    expect((await spendSummary(dueno)).spentMicros).toBe(r.costMicros);
    expect(r.stages.cola.ok && r.stages.reglas?.ok && r.stages.pasarela?.ok && r.stages.libro?.ok).toBe(true);
    // Queda guardado para la pantalla.
    expect(await getSetting<SystemCheckResult>("system.lastCheck")).toMatchObject({ ok: true, costMicros: r.costMicros });
  });

  it("repetir la misma comprobación dentro del mismo minuto no vuelve a pagar", async () => {
    const { client, calls } = fakeMessages([
      { text: "OK", usage: { inputTokens: 3_000, outputTokens: 2 } },
      { text: "OK", usage: { inputTokens: 3_000, outputTokens: 2 } },
    ]);
    const gateway = createGateway({ client });
    const first = await runSystemCheck(ctx(dueno), { gateway, now: at("2026-11-22T10:00:05Z") });
    const again = await runSystemCheck(ctx(dueno), { gateway, now: at("2026-11-22T10:00:50Z") });
    expect(calls).toHaveLength(1);
    expect(again).toEqual(first);
    await runSystemCheck(ctx(dueno), { gateway, now: at("2026-11-22T10:01:05Z") });
    expect(calls).toHaveLength(2);
  });

  it("sin clave de Claude lo dice en claro y no gasta nada", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await runSystemCheck(ctx(dueno), { gateway: createGateway() });
      expect(r).toMatchObject({ ok: false, error: "Falta la clave de Claude (ANTHROPIC_API_KEY)." });
      expect(r.stages.reglas?.ok).toBe(true);
      expect(r.stages.pasarela).toMatchObject({ ok: false });
      expect(r.stages.libro).toBeNull();
      expect((await spendSummary(dueno)).spentMicros).toBe(0);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("con el tope alcanzado lo dice y no llama al modelo", async () => {
    await setGlobalCap(dueno, 0);
    const { client, calls } = fakeMessages([]);
    const r = await runSystemCheck(ctx(dueno), { gateway: createGateway({ client }) });
    expect(r).toMatchObject({ ok: false, error: "Se ha alcanzado el tope mensual de gasto." });
    expect(calls).toHaveLength(0);
  });

  it("si Claude falla, el error sale en claro y el paso no se reintenta ni se cobra dos veces", async () => {
    const { client, calls } = fakeMessages([{ error: fakeApiError(500) }]);
    const gateway = createGateway({ client });
    const now = at("2026-11-22T10:00:05Z");
    const r = await runSystemCheck(ctx(dueno), { gateway, now });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Claude no ha respondido/);
    await runSystemCheck(ctx(dueno), { gateway, now });
    expect(calls).toHaveLength(1);
  });

  it("si falta la regla, falla en la etapa de reglas sin llamar al modelo", async () => {
    await getDb().delete(schema.ruleVersions);
    const { client, calls } = fakeMessages([]);
    const r = await runSystemCheck(ctx(dueno), { gateway: createGateway({ client }) });
    expect(r.ok).toBe(false);
    expect(r.stages.reglas?.ok).toBe(false);
    expect(r.stages.pasarela).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("estado de la comprobación", () => {
  it("sin nada hecho no hay nada en marcha ni resultado; con la fila del trabajo en cola, está en marcha", async () => {
    expect(await systemCheckStatus()).toEqual({ running: false, last: null });
    await getDb()
      .insert(schema.jobSteps)
      .values({ key: "k", jobName: SYSTEM_CHECK_JOB, userId: dueno.id, productId: null, status: "queued", payload: {} });
    expect((await systemCheckStatus()).running).toBe(true);
    await getDb().update(schema.jobSteps).set({ status: "done" }).where(eq(schema.jobSteps.key, "k"));
    expect((await systemCheckStatus()).running).toBe(false);
  });
});
