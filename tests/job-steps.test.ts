import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getPool, schema } from "@/db/client";
import {
  JobPausedError,
  MAX_ATTEMPTS,
  runStep,
  STALE_RUNNING_MS,
  StepBusyError,
  StepFailedError,
  stepKey,
  type JobContext,
} from "@/jobs/steps";
import { createGateway } from "@/llm/gateway";
import { setAssignments } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import { reserveSpend, settleSpend, setUserCap, SpendCapError } from "@/server/spend";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let dueno: AuthUser;
let ana: AuthUser;
let ctx: JobContext;

const RESERVADO = 15_000;
const capError = () => new SpendCapError("persona", 0, 0);

async function step(key: string) {
  const [row] = await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.key, key));
  return row;
}

async function entriesByStep(key: string) {
  return getDb().select().from(schema.spendEntries).where(eq(schema.spendEntries.stepKey, key));
}

async function entryByStep(key: string) {
  const rows = await entriesByStep(key);
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** Deja una fila como la dejaría un proceso que se cayó a mitad del paso. */
async function insertStep(over: Partial<typeof schema.jobSteps.$inferInsert> & { key: string }) {
  await getDb()
    .insert(schema.jobSteps)
    .values({
      jobName: ctx.jobName,
      userId: ctx.userId,
      productId: ctx.productId,
      status: "running",
      attempts: 1,
      startedAt: new Date(),
      ...over,
    });
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const disable = (user: AuthUser) =>
  getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, user.id));

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana" });
  ctx = { jobName: "prueba", userId: ana.id, productId: null };
});

describe("stepKey", () => {
  it("stepKey es estable ante el orden de las claves del input y cambia si cambia el input", () => {
    expect(stepKey(ctx, "ficha", { a: 1, b: 2 })).toBe(stepKey(ctx, "ficha", { b: 2, a: 1 }));
    expect(stepKey(ctx, "ficha", { a: 1 })).not.toBe(stepKey(ctx, "ficha", { a: 2 }));
  });

  it("también es estable en objetos anidados y distingue el orden de las listas", () => {
    expect(stepKey(ctx, "ficha", { a: { x: 1, y: [1, 2] } })).toBe(stepKey(ctx, "ficha", { a: { y: [1, 2], x: 1 } }));
    expect(stepKey(ctx, "ficha", [1, 2])).not.toBe(stepKey(ctx, "ficha", [2, 1]));
  });

  it("tiene la forma trabajo:producto:paso:huella, con «-» si no hay producto", () => {
    expect(stepKey(ctx, "ficha", { a: 1 })).toMatch(/^prueba:-:ficha:[0-9a-f]{16}$/);
    expect(stepKey({ ...ctx, productId: 42 }, "ficha", { a: 1 })).toMatch(/^prueba:42:ficha:[0-9a-f]{16}$/);
    expect(stepKey(ctx, "ficha", undefined)).toMatch(/^prueba:-:ficha:[0-9a-f]{16}$/);
  });

  it("cambia con el trabajo, el producto y el nombre del paso", () => {
    const base = stepKey(ctx, "ficha", { a: 1 });
    expect(stepKey({ ...ctx, jobName: "otro" }, "ficha", { a: 1 })).not.toBe(base);
    expect(stepKey({ ...ctx, productId: 7 }, "ficha", { a: 1 })).not.toBe(base);
    expect(stepKey(ctx, "angulos", { a: 1 })).not.toBe(base);
  });
});

describe("runStep", () => {
  it("un paso hecho no se vuelve a ejecutar: devuelve el resultado guardado", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      return { n: 7 };
    };
    expect(await runStep(ctx, "k1", fn)).toEqual({ n: 7 });
    expect(await runStep(ctx, "k1", fn)).toEqual({ n: 7 });
    expect(runs).toBe(1);
    expect(await step("k1")).toMatchObject({
      status: "done",
      attempts: 1,
      result: { n: 7 },
      jobName: "prueba",
      userId: ana.id,
      productId: null,
      error: null,
    });
    expect((await step("k1")).finishedAt).toBeInstanceOf(Date);
  });

  it("la intención queda guardada antes de ejecutar", async () => {
    await runStep(ctx, "k2", async () => {
      expect((await step("k2")).status).toBe("running");
      return 1;
    });
    expect((await step("k2")).status).toBe("done");
  });

  it("reutilizar la clave de un paso hecho no vuelve a reservar ni a gastar", async () => {
    const pay = async () => {
      const { entryId } = await reserveSpend({
        userId: ana.id,
        productId: null,
        provider: "claude",
        stepKey: "k-pago",
        estimateMicros: RESERVADO,
      });
      await settleSpend(entryId, { costMicros: 9_000 });
      return "pagado";
    };
    expect(await runStep(ctx, "k-pago", pay)).toBe("pagado");
    expect(await runStep(ctx, "k-pago", pay)).toBe("pagado");
    expect(await entriesByStep("k-pago")).toHaveLength(1);
  });

  it("un paso sin resultado también se da por hecho y no se repite", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
    };
    await runStep(ctx, "k-vacio", fn);
    await runStep(ctx, "k-vacio", fn);
    expect(runs).toBe(1);
    expect(await step("k-vacio")).toMatchObject({ status: "done", result: null });
  });

  it("devuelve lo mismo la primera vez que al repetir (lo que cabe en JSON)", async () => {
    const fn = async () => ({ cuando: new Date("2026-11-22T10:00:00Z"), nada: undefined, lista: [1, "dos"] });
    const first = await runStep(ctx, "k-json", fn);
    const second = await runStep(ctx, "k-json", fn);
    expect(first).toEqual({ cuando: "2026-11-22T10:00:00.000Z", lista: [1, "dos"] });
    expect(second).toEqual(first);
  });

  it("un resultado de texto que parece JSON vuelve como texto, no convertido", async () => {
    for (const [key, text] of [
      ["k-texto-1", "42"],
      ["k-texto-2", '{"a":1}'],
      ["k-texto-3", "true"],
      ["k-texto-4", "null"],
    ]) {
      expect(await runStep(ctx, key, async () => text)).toBe(text);
      expect(await runStep(ctx, key, async () => "otra cosa")).toBe(text);
    }
  });

  it("fuera de un trabajo encolado el paso no guarda datos para reencolar", async () => {
    await runStep(ctx, "k-suelto", async () => 1);
    expect((await step("k-suelto")).payload).toBeNull();
  });

  it("si el paso lanza SpendCapError queda en pausa, sin contar como intento fallido", async () => {
    await expect(
      runStep(ctx, "k3", async () => {
        throw capError();
      }),
    ).rejects.toBeInstanceOf(JobPausedError);
    expect(await step("k3")).toMatchObject({ status: "paused_cap", attempts: 0, error: null });
  });

  it("un paso en pausa se retoma al volver a llamarlo y sigue sin contar la pausa como intento", async () => {
    await expect(
      runStep(ctx, "k3b", async () => {
        throw capError();
      }),
    ).rejects.toBeInstanceOf(JobPausedError);
    expect(await runStep(ctx, "k3b", async () => "ok")).toBe("ok");
    expect(await step("k3b")).toMatchObject({ status: "done", attempts: 1 });
  });

  it("el tope alcanzado en la pasarela también deja el paso en pausa, sin llamar al modelo", async () => {
    await setUserCap(dueno, ana.id, 0);
    const { client, calls } = fakeMessages([{ text: "hola" }]);
    const gateway = createGateway({ client });
    const attempt = runStep(ctx, "k-pasarela", () =>
      gateway.call({
        tier: "small",
        stepKey: "k-pasarela",
        userId: ana.id,
        productId: null,
        rules: [],
        instructions: "Saluda.",
        content: "Hola",
        maxTokens: 100,
      }),
    );
    await expect(attempt).rejects.toBeInstanceOf(JobPausedError);
    await expect(attempt).rejects.toMatchObject({ scope: "persona" });
    expect(calls).toHaveLength(0);
    expect(await step("k-pasarela")).toMatchObject({ status: "paused_cap", attempts: 0 });
    expect(await entriesByStep("k-pasarela")).toHaveLength(0);
  });

  it("un paso que se quedó 'running' hace más de 15 minutos se reintenta y su reserva pendiente se da por gastada", async () => {
    // fila running con startedAt hace 16 min + spend_entries 'reserved' con el mismo stepKey
    await insertStep({ key: "k4", startedAt: minutesAgo(16) });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "k4", estimateMicros: RESERVADO });

    await runStep(ctx, "k4", async () => "ok");

    expect(await entryByStep("k4")).toMatchObject({
      status: "settled",
      costMicros: RESERVADO,
      detail: { outcome: "unknown", interrupted: true },
    });
    expect((await entryByStep("k4")).settledAt).toBeInstanceOf(Date);
    expect(await step("k4")).toMatchObject({ status: "done", attempts: 2 });
  });

  it("la reserva interrumpida se da por gastada antes de volver a ejecutar el paso, y no toca las de otros pasos", async () => {
    await insertStep({ key: "k4b", startedAt: minutesAgo(16) });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "k4b", estimateMicros: RESERVADO });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "otro", estimateMicros: 1_000 });

    await runStep(ctx, "k4b", async () => {
      expect((await entryByStep("k4b")).status).toBe("settled");
      return "ok";
    });

    expect(await entryByStep("otro")).toMatchObject({ status: "reserved", costMicros: null });
  });

  it("STALE_RUNNING_MS son 15 minutos y MAX_ATTEMPTS 3", () => {
    expect(STALE_RUNNING_MS).toBe(15 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it("un paso 'running' reciente no se ejecuta en paralelo", async () => {
    await insertStep({ key: "k5", startedAt: minutesAgo(14) });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "k5", estimateMicros: RESERVADO });
    let runs = 0;
    const attempt = runStep(ctx, "k5", async () => {
      runs++;
    });
    await expect(attempt).rejects.toThrow("Este paso ya está en marcha.");
    await expect(attempt).rejects.toBeInstanceOf(StepBusyError);
    expect(runs).toBe(0);
    expect(await step("k5")).toMatchObject({ status: "running", attempts: 1 });
    // La reserva de quien lo tiene en marcha no se toca.
    expect((await entryByStep("k5")).status).toBe("reserved");
  });

  it("dos llamadas a la vez con la misma clave: solo una ejecuta el paso", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fn = async () => {
      runs++;
      await gate;
      return "uno";
    };
    const first = runStep(ctx, "k5b", fn);
    const second = runStep(ctx, "k5b", fn);
    const settled = Promise.allSettled([first, second]);
    // Las dos han pasado ya por la base de datos: una espera en `gate`, la otra ha sido rechazada.
    await expect(Promise.race([first, second])).rejects.toBeInstanceOf(StepBusyError);
    release();
    const results = await settled;
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(runs).toBe(1);
    expect(await step("k5b")).toMatchObject({ status: "done", attempts: 1, result: "uno" });
  });

  it("un fallo deja el paso como fallido con su mensaje y la siguiente llamada lo reintenta", async () => {
    await expect(
      runStep(ctx, "k6a", async () => {
        throw new Error("se cayó la red");
      }),
    ).rejects.toThrow("se cayó la red");
    expect(await step("k6a")).toMatchObject({ status: "failed", attempts: 1, error: "se cayó la red" });
    expect((await step("k6a")).finishedAt).toBeInstanceOf(Date);

    expect(await runStep(ctx, "k6a", async () => "ahora sí")).toBe("ahora sí");
    expect(await step("k6a")).toMatchObject({ status: "done", attempts: 2, error: null });
  });

  it("al tercer fallo el paso queda como fallido y no se reintenta más", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      throw new Error(`fallo ${runs}`);
    };
    for (let i = 1; i <= 3; i++) await expect(runStep(ctx, "k6", fn)).rejects.toThrow(`fallo ${i}`);
    expect(await step("k6")).toMatchObject({ status: "failed", attempts: 3, error: "fallo 3" });

    const fourth = runStep(ctx, "k6", fn);
    await expect(fourth).rejects.toBeInstanceOf(StepFailedError);
    await expect(fourth).rejects.toThrow("fallo 3");
    expect(runs).toBe(3);
    expect(await step("k6")).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("un paso que lanza StepFailedError no se reintenta: es un fallo definitivo", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      throw new StepFailedError("Claude ha rechazado esta petición.");
    };
    await expect(runStep(ctx, "k-def", fn)).rejects.toThrow("Claude ha rechazado esta petición.");
    expect(await step("k-def")).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    await expect(runStep(ctx, "k-def", fn)).rejects.toBeInstanceOf(StepFailedError);
    expect(runs).toBe(1);
  });

  it("un resultado que no se puede guardar es un fallo definitivo (no se paga tres veces por lo mismo)", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      return { n: BigInt(1) };
    };
    await expect(runStep(ctx, "k-big", fn)).rejects.toBeInstanceOf(StepFailedError);
    expect(await step("k-big")).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    await expect(runStep(ctx, "k-big", fn)).rejects.toBeInstanceOf(StepFailedError);
    expect(runs).toBe(1);
  });

  it("un paso interrumpido que ya gastó sus tres intentos queda fallido y su reserva cuenta como gastada", async () => {
    await insertStep({ key: "k7", attempts: 3, startedAt: minutesAgo(16) });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "k7", estimateMicros: RESERVADO });
    let runs = 0;
    await expect(
      runStep(ctx, "k7", async () => {
        runs++;
      }),
    ).rejects.toBeInstanceOf(StepFailedError);
    expect(runs).toBe(0);
    expect(await step("k7")).toMatchObject({ status: "failed", attempts: 3 });
    expect((await step("k7")).error).toMatch(/interrumpi/);
    expect(await entryByStep("k7")).toMatchObject({ status: "settled", costMicros: RESERVADO });
  });

  it("si el paso termina tarde y ya se había mandado reintentar, su resultado se guarda y el reintento no paga", async () => {
    let runs = 0;
    const result = await runStep(ctx, "k8", async () => {
      runs++;
      // Mientras tanto, el barrido lo da por interrumpido y lo deja listo para reintentar.
      await getDb().update(schema.jobSteps).set({ status: "queued" }).where(eq(schema.jobSteps.key, "k8"));
      return "tarde pero pagado";
    });
    expect(result).toBe("tarde pero pagado");
    expect(await step("k8")).toMatchObject({ status: "done", result: "tarde pero pagado" });
    expect(await runStep(ctx, "k8", async () => `otra vez ${++runs}`)).toBe("tarde pero pagado");
    expect(runs).toBe(1);
  });

  it("si otro proceso ya dejó hecho el paso, se devuelve su resultado y no se pisa", async () => {
    const result = await runStep(ctx, "k9", async () => {
      await getDb()
        .update(schema.jobSteps)
        .set({ status: "done", result: "el primero" })
        .where(eq(schema.jobSteps.key, "k9"));
      return "el segundo";
    });
    expect(result).toBe("el primero");
    expect(await step("k9")).toMatchObject({ status: "done", result: "el primero" });
  });

  it("el fallo de una ejecución que ya fue relevada no pisa a la que la relevó", async () => {
    const takenAt = new Date(Date.now() + 1_000);
    await expect(
      runStep(ctx, "k10", async () => {
        // Otro proceso reclama el paso (lo dio por interrumpido) mientras este sigue en marcha.
        await getDb()
          .update(schema.jobSteps)
          .set({ attempts: 2, startedAt: takenAt })
          .where(eq(schema.jobSteps.key, "k10"));
        throw new Error("fallo tardío");
      }),
    ).rejects.toThrow("fallo tardío");
    expect(await step("k10")).toMatchObject({ status: "running", attempts: 2, error: null });
  });

  it("la pausa de una ejecución que ya fue relevada tampoco pisa a la que la relevó", async () => {
    const takenAt = new Date(Date.now() + 1_000);
    await expect(
      runStep(ctx, "k11", async () => {
        await getDb()
          .update(schema.jobSteps)
          .set({ attempts: 2, startedAt: takenAt })
          .where(eq(schema.jobSteps.key, "k11"));
        throw capError();
      }),
    ).rejects.toBeInstanceOf(JobPausedError);
    expect(await step("k11")).toMatchObject({ status: "running", attempts: 2 });
  });

  it("si la base de datos falla un momento al guardar el resultado, se reintenta el guardado y no el paso", async () => {
    const pool = getPool();
    await pool.query("create sequence prueba_fallo_guardado");
    await pool.query(`
      create function prueba_fallar_una_vez() returns trigger language plpgsql as $$
      begin
        if new.status = 'done' and nextval('prueba_fallo_guardado') = 1 then
          raise exception 'fallo de prueba al guardar';
        end if;
        return new;
      end $$`);
    await pool.query(
      "create trigger prueba_fallo before update on job_steps for each row execute function prueba_fallar_una_vez()",
    );
    try {
      let runs = 0;
      expect(await runStep(ctx, "k12", async () => `pagado ${++runs}`)).toBe("pagado 1");
      expect(runs).toBe(1);
      expect(await step("k12")).toMatchObject({ status: "done", result: "pagado 1" });
    } finally {
      await pool.query("drop trigger prueba_fallo on job_steps");
      await pool.query("drop function prueba_fallar_una_vez()");
      await pool.query("drop sequence prueba_fallo_guardado");
    }
  });

  it("si no se puede anotar el fallo, sale el error del paso y la fila queda para recuperarse como interrumpida", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = getPool();
    await pool.query(`
      create function prueba_no_anotar() returns trigger language plpgsql as $$
      begin
        if new.status in ('failed', 'paused_cap') then raise exception 'fallo de prueba al anotar'; end if;
        return new;
      end $$`);
    await pool.query(
      "create trigger prueba_no_anotar before update on job_steps for each row execute function prueba_no_anotar()",
    );
    try {
      await expect(
        runStep(ctx, "k13", async () => {
          throw new Error("se cayó la red");
        }),
      ).rejects.toThrow("se cayó la red");
      await expect(
        runStep(ctx, "k14", async () => {
          throw capError();
        }),
      ).rejects.toBeInstanceOf(JobPausedError);
    } finally {
      await pool.query("drop trigger prueba_no_anotar on job_steps");
      await pool.query("drop function prueba_no_anotar()");
    }
    expect(await step("k13")).toMatchObject({ status: "running", attempts: 1 });
    expect(await step("k14")).toMatchObject({ status: "running", attempts: 1 });
    expect(errors).toHaveBeenCalledTimes(2);
    expect(errors.mock.calls[0][0]).toContain("k13");
    errors.mockRestore();
  });

  it("si un paso ejecutado dentro de otro queda en pausa, el de fuera también queda en pausa y no como fallido", async () => {
    await expect(
      runStep(ctx, "k-fuera", () =>
        runStep(ctx, "k-dentro", async () => {
          throw capError();
        }),
      ),
    ).rejects.toBeInstanceOf(JobPausedError);
    expect(await step("k-dentro")).toMatchObject({ status: "paused_cap", attempts: 0 });
    expect(await step("k-fuera")).toMatchObject({ status: "paused_cap", attempts: 0 });
  });

  it("exige una clave", async () => {
    await expect(runStep(ctx, "", async () => 1)).rejects.toThrow("Falta la clave del paso.");
  });
});

describe("runStep: quién puede ejecutar un paso", () => {
  it("el paso de una persona desactivada queda fallido sin ejecutarse ni gastar", async () => {
    await disable(ana);
    let runs = 0;
    const attempt = runStep(ctx, "k20", async () => {
      runs++;
    });
    await expect(attempt).rejects.toBeInstanceOf(StepFailedError);
    await expect(attempt).rejects.toThrow("Esta cuenta está desactivada.");
    expect(runs).toBe(0);
    expect(await step("k20")).toMatchObject({ status: "failed", error: "Esta cuenta está desactivada.", payload: null });
    expect(await getDb().select().from(schema.spendEntries)).toHaveLength(0);
  });

  it("también se detiene el paso de un dueño desactivado", async () => {
    await disable(dueno);
    let runs = 0;
    await expect(
      runStep({ ...ctx, userId: dueno.id }, "k21", async () => {
        runs++;
      }),
    ).rejects.toThrow("Esta cuenta está desactivada.");
    expect(runs).toBe(0);
    expect(await step("k21")).toMatchObject({ status: "failed", userId: dueno.id });
  });

  it("una persona que no existe tampoco ejecuta pasos", async () => {
    let runs = 0;
    for (const userId of [999_999, 0, -1, 1.5]) {
      await expect(
        runStep({ ...ctx, userId }, `k22:${userId}`, async () => {
          runs++;
        }),
      ).rejects.toBeInstanceOf(StepFailedError);
    }
    expect(runs).toBe(0);
  });

  it("el paso de un producto que la persona ya no ve queda fallido sin ejecutarse", async () => {
    const product = await makeProduct(ana);
    const productCtx = { ...ctx, productId: product.id };
    expect(await runStep(productCtx, "k23-antes", async () => "lo veía")).toBe("lo veía");

    await setAssignments(dueno, ana.id, []);
    let runs = 0;
    const attempt = runStep(productCtx, "k23", async () => {
      runs++;
    });
    await expect(attempt).rejects.toBeInstanceOf(StepFailedError);
    await expect(attempt).rejects.toThrow("Producto no encontrado.");
    expect(runs).toBe(0);
    expect(await step("k23")).toMatchObject({ status: "failed", error: "Producto no encontrado." });
    // Ni siquiera recibe el resultado guardado de cuando sí lo veía.
    await expect(runStep(productCtx, "k23-antes", async () => "otra")).rejects.toThrow("Producto no encontrado.");
    expect(await step("k23-antes")).toMatchObject({ status: "done", result: "lo veía" });
  });

  it("el paso de un producto que no existe no se ejecuta, tampoco para el dueño", async () => {
    let runs = 0;
    await expect(
      runStep({ jobName: "prueba", userId: dueno.id, productId: 999_999 }, "k24", async () => {
        runs++;
      }),
    ).rejects.toThrow("Producto no encontrado.");
    expect(runs).toBe(0);
  });

  it("un paso detenido por falta de acceso no bloquea a quien sí puede ejecutarlo", async () => {
    const product = await makeProduct(ana);
    await setAssignments(dueno, ana.id, []);
    await expect(runStep({ ...ctx, productId: product.id }, "k25", async () => 1)).rejects.toThrow(
      "Producto no encontrado.",
    );
    // El dueño lanza el mismo paso (misma clave) y sí se ejecuta.
    expect(await runStep({ jobName: "prueba", userId: dueno.id, productId: product.id }, "k25", async () => "hecho")).toBe(
      "hecho",
    );
    expect(await step("k25")).toMatchObject({ status: "done", userId: dueno.id, attempts: 1 });
  });

  it("si la persona vuelve a estar activa, el paso detenido se puede ejecutar", async () => {
    await disable(ana);
    await expect(runStep(ctx, "k26", async () => 1)).rejects.toThrow("Esta cuenta está desactivada.");
    await getDb().update(schema.users).set({ disabledAt: null }).where(eq(schema.users.id, ana.id));
    expect(await runStep(ctx, "k26", async () => "de vuelta")).toBe("de vuelta");
  });

  it("al detener un paso interrumpido de una persona desactivada, su reserva pendiente cuenta como gastada", async () => {
    await insertStep({ key: "k27", startedAt: minutesAgo(16), payload: { a: 1 } });
    await reserveSpend({ userId: ana.id, productId: null, provider: "claude", stepKey: "k27", estimateMicros: RESERVADO });
    await disable(ana);
    await expect(runStep(ctx, "k27", async () => 1)).rejects.toThrow("Esta cuenta está desactivada.");
    expect(await step("k27")).toMatchObject({ status: "failed", payload: null });
    expect(await entryByStep("k27")).toMatchObject({ status: "settled", costMicros: RESERVADO });
  });

  it("detener a una persona no toca el paso que otra tiene en marcha ni el que ya está hecho", async () => {
    await insertStep({ key: "k28", userId: dueno.id, startedAt: minutesAgo(1) });
    await insertStep({ key: "k29", status: "done", result: "hecho", startedAt: minutesAgo(30) });
    await disable(ana);
    await expect(runStep(ctx, "k28", async () => 1)).rejects.toThrow("Esta cuenta está desactivada.");
    await expect(runStep(ctx, "k29", async () => 1)).rejects.toThrow("Esta cuenta está desactivada.");
    expect(await step("k28")).toMatchObject({ status: "running", userId: dueno.id, error: null });
    expect(await step("k29")).toMatchObject({ status: "done", result: "hecho", error: null });
  });
});
