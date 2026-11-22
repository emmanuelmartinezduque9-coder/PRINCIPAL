import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { setAssignments } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import {
  getGlobalCap,
  hasRoom,
  monthRange,
  releaseSpend,
  reserveSpend,
  setGlobalCap,
  settleSpend,
  setUserCap,
  SpendCapError,
  spendSummary,
} from "@/server/spend";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;

const base = (user: AuthUser) => ({
  userId: user.id,
  productId: null,
  provider: "claude" as const,
  model: "claude-haiku",
  stepKey: "paso",
});

async function countEntries(): Promise<number> {
  const { rows } = await getPool().query<{ n: number }>("select count(*)::int as n from spend_entries");
  return rows[0].n;
}

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana" });
  luis = await makeUser("colaborador", { name: "Luis" });
});

describe("monthRange", () => {
  it("es el mes natural en UTC, con el final exclusivo", () => {
    const { start, end } = monthRange(new Date("2026-12-31T23:59:59Z"));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("libro de gasto", () => {
  it("sin tope configurado, el global es 30 USD y el de un colaborador 10 USD", async () => {
    expect(await getGlobalCap()).toBe(30_000_000);
    expect((await spendSummary(ana)).capMicros).toBe(10_000_000);
    expect((await spendSummary(dueno)).capMicros).toBe(30_000_000);
  });

  it("reservar por encima del tope personal lanza SpendCapError y no deja rastro", async () => {
    await reserveSpend({ ...base(ana), estimateMicros: 9_990_000 });
    const attempt = reserveSpend({ ...base(ana), estimateMicros: 20_000 });
    await expect(attempt).rejects.toBeInstanceOf(SpendCapError);
    await expect(attempt).rejects.toMatchObject({
      scope: "persona",
      capMicros: 10_000_000,
      spentMicros: 9_990_000,
      message: "Has alcanzado tu tope mensual de gasto.",
    });
    expect(await countEntries()).toBe(1);
  });

  it("reservar justo hasta el tope sí se puede", async () => {
    await reserveSpend({ ...base(ana), estimateMicros: 9_990_000 });
    await expect(reserveSpend({ ...base(ana), estimateMicros: 10_000 })).resolves.toBeDefined();
    expect(await hasRoom(ana.id)).toBe(false);
  });

  it("el tope global frena aunque a la persona le quede saldo", async () => {
    await setGlobalCap(dueno, 1_000_000);
    await expect(reserveSpend({ ...base(ana), estimateMicros: 1_500_000 })).rejects.toMatchObject({
      scope: "global",
      capMicros: 1_000_000,
      spentMicros: 0,
      message: "Se ha alcanzado el tope mensual de gasto.",
    });
    expect(await countEntries()).toBe(0);
  });

  it("el gasto de todos cuenta para el tope global", async () => {
    await setGlobalCap(dueno, 1_000_000);
    await reserveSpend({ ...base(luis), estimateMicros: 800_000 });
    await expect(reserveSpend({ ...base(ana), estimateMicros: 300_000 })).rejects.toMatchObject({
      scope: "global",
      spentMicros: 800_000,
    });
    expect(await hasRoom(ana.id)).toBe(true);
  });

  it("el dueño solo está limitado por el tope global", async () => {
    await expect(reserveSpend({ ...base(dueno), estimateMicros: 15_000_000 })).resolves.toBeDefined();
    await expect(reserveSpend({ ...base(dueno), estimateMicros: 16_000_000 })).rejects.toMatchObject({
      scope: "global",
      capMicros: 30_000_000,
    });
    await expect(reserveSpend({ ...base(dueno), estimateMicros: 31_000_000 })).rejects.toMatchObject({ scope: "global" });
  });

  it("dos reservas a la vez junto al tope: solo pasa una", async () => {
    await setUserCap(dueno, ana.id, 20_000);
    const r = await Promise.allSettled([
      reserveSpend({ ...base(ana), stepKey: "a", estimateMicros: 15_000 }),
      reserveSpend({ ...base(ana), stepKey: "b", estimateMicros: 15_000 }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = r.filter((x) => x.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SpendCapError);
    expect(await countEntries()).toBe(1);
  });

  it("dos reservas que se cruzan de verdad junto al tope: solo pasa una", async () => {
    // Sin forzarlo, las dos reservas pueden ir una detrás de otra por pura casualidad y la prueba
    // pasaría aunque faltara el cerrojo. Aquí otra conexión bloquea la tabla del libro hasta que
    // las dos están esperando, y luego la suelta: sin cerrojo las dos leerían el saldo a la vez.
    await setUserCap(dueno, ana.id, 20_000);
    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    try {
      await blocker.query("begin");
      await blocker.query("lock table spend_entries in access exclusive mode");
      const pending = Promise.allSettled([
        reserveSpend({ ...base(ana), stepKey: "a", estimateMicros: 15_000 }),
        reserveSpend({ ...base(ana), stepKey: "b", estimateMicros: 15_000 }),
      ]);
      for (let waiting = 0; waiting < 2; ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const { rows } = await blocker.query<{ n: number }>("select count(*)::int as n from pg_locks where not granted");
        waiting = rows[0].n;
      }
      await blocker.query("commit");
      const r = await pending;
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await countEntries()).toBe(1);
    } finally {
      await blocker.end();
    }
  });

  it("muchas reservas a la vez contra el tope global nunca lo superan", async () => {
    await setGlobalCap(dueno, 100_000);
    const people = [ana, luis, dueno];
    const r = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        reserveSpend({ ...base(people[i % 3]), stepKey: `p${i}`, estimateMicros: 15_000 }),
      ),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(6);
    expect((await spendSummary(dueno)).spentMicros).toBe(90_000);
  });

  it("al liquidar cuenta el coste real, no el reservado", async () => {
    const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
    await settleSpend(entryId, { costMicros: 42_000, inputTokens: 1200, outputTokens: 300, detail: { intento: 1 } });
    expect((await spendSummary(ana)).spentMicros).toBe(42_000);
    const { rows } = await getPool().query("select * from spend_entries");
    expect(rows[0]).toMatchObject({
      status: "settled",
      reserved_micros: 500_000,
      cost_micros: 42_000,
      input_tokens: 1200,
      output_tokens: 300,
      model: "claude-haiku",
      detail: { intento: 1 },
    });
    expect(rows[0].settled_at).toBeInstanceOf(Date);
  });

  it("liquidar dos veces el mismo cargo se rechaza y no cambia el coste", async () => {
    const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
    await settleSpend(entryId, { costMicros: 42_000 });
    await expect(settleSpend(entryId, { costMicros: 1 })).rejects.toThrow("Este cargo ya está liquidado.");
    expect((await spendSummary(ana)).spentMicros).toBe(42_000);
  });

  it("una reserva liberada no cuenta", async () => {
    const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
    await releaseSpend(entryId);
    expect((await spendSummary(ana)).spentMicros).toBe(0);
    const { rows } = await getPool().query("select status from spend_entries");
    expect(rows[0].status).toBe("released");
  });

  it("liberar un cargo ya liquidado no lo borra del gasto", async () => {
    const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
    await settleSpend(entryId, { costMicros: 42_000 });
    await releaseSpend(entryId);
    expect((await spendSummary(ana)).spentMicros).toBe(42_000);
  });

  it("si se liquida un cargo ya liberado, el coste real cuenta", async () => {
    const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
    await releaseSpend(entryId);
    await settleSpend(entryId, { costMicros: 42_000 });
    expect((await spendSummary(ana)).spentMicros).toBe(42_000);
  });

  it("el gasto del mes pasado no cuenta para el tope de este mes", async () => {
    await reserveSpend({ ...base(ana), estimateMicros: 9_990_000, now: new Date("2026-11-30T23:59:00Z") });
    const { rows } = await getPool().query("select created_at from spend_entries");
    expect(rows[0].created_at.toISOString()).toBe("2026-11-30T23:59:00.000Z");
    const december = new Date("2026-12-01T00:01:00Z");
    await expect(reserveSpend({ ...base(ana), estimateMicros: 9_000_000, now: december })).resolves.toBeDefined();
    expect((await spendSummary(ana, december)).spentMicros).toBe(9_000_000);
    expect((await spendSummary(ana, december)).month).toBe("2026-12");
    expect((await spendSummary(ana, new Date("2026-11-15T00:00:00Z"))).spentMicros).toBe(9_990_000);
  });

  it("una persona desactivada no puede gastar", async () => {
    await getPool().query("update users set disabled_at = now() where id = $1", [ana.id]);
    await expect(reserveSpend({ ...base(ana), estimateMicros: 1_000 })).rejects.toThrow("Esta cuenta está desactivada.");
    expect(await hasRoom(ana.id)).toBe(false);
    expect(await countEntries()).toBe(0);
  });

  it("una persona que no existe no puede gastar", async () => {
    await expect(reserveSpend({ ...base(ana), userId: 999_999, estimateMicros: 1_000 })).rejects.toThrow();
    expect(await hasRoom(999_999)).toBe(false);
    expect(await countEntries()).toBe(0);
  });

  it("una estimación que no es un entero positivo se rechaza", async () => {
    await expect(reserveSpend({ ...base(ana), estimateMicros: 0 })).rejects.toThrow();
    await expect(reserveSpend({ ...base(ana), estimateMicros: -5 })).rejects.toThrow();
    await expect(reserveSpend({ ...base(ana), estimateMicros: 1.5 })).rejects.toThrow();
    expect(await countEntries()).toBe(0);
  });

  it("hasRoom mira los dos topes", async () => {
    expect(await hasRoom(ana.id)).toBe(true);
    await setUserCap(dueno, ana.id, 0);
    expect(await hasRoom(ana.id)).toBe(false);
    expect(await hasRoom(luis.id)).toBe(true);
    await setGlobalCap(dueno, 0);
    expect(await hasRoom(luis.id)).toBe(false);
    expect(await hasRoom(dueno.id)).toBe(false);
  });

  it("subir el tope de una persona le devuelve saldo", async () => {
    await reserveSpend({ ...base(ana), estimateMicros: 10_000_000 });
    expect(await hasRoom(ana.id)).toBe(false);
    await setUserCap(dueno, ana.id, 12_000_000);
    expect(await hasRoom(ana.id)).toBe(true);
    expect((await spendSummary(ana)).capMicros).toBe(12_000_000);
  });

  it("un colaborador solo ve su gasto; el dueño ve el de todos por producto y por persona", async () => {
    const pAna = await makeProduct(ana, { name: "Botas" });
    const pLuis = await makeProduct(luis, { name: "Secreto de Luis" });
    await reserveSpend({ ...base(ana), productId: pAna.id, estimateMicros: 100_000 });
    await reserveSpend({ ...base(ana), estimateMicros: 5_000 });
    await reserveSpend({ ...base(luis), productId: pLuis.id, estimateMicros: 200_000 });
    await reserveSpend({ ...base(dueno), productId: pAna.id, estimateMicros: 1_000 });

    const own = await spendSummary(ana);
    expect(own.spentMicros).toBe(105_000);
    expect(own.byUser).toEqual([{ userId: ana.id, name: "Ana", micros: 105_000, capMicros: 10_000_000 }]);
    expect(own.byProduct).toEqual(
      expect.arrayContaining([
        { productId: pAna.id, name: "Botas", micros: 100_000 },
        { productId: null, name: "Sin producto", micros: 5_000 },
      ]),
    );
    expect(own.byProduct).toHaveLength(2);
    expect(JSON.stringify(own)).not.toContain("Secreto de Luis");
    expect(JSON.stringify(own)).not.toContain("Luis");

    const all = await spendSummary(dueno);
    expect(all.capMicros).toBe(30_000_000);
    expect(all.spentMicros).toBe(306_000);
    expect(all.byProduct).toEqual(
      expect.arrayContaining([
        { productId: pAna.id, name: "Botas", micros: 101_000 },
        { productId: pLuis.id, name: "Secreto de Luis", micros: 200_000 },
        { productId: null, name: "Sin producto", micros: 5_000 },
      ]),
    );
    expect(all.byProduct).toHaveLength(3);
    expect(all.byUser).toEqual(
      expect.arrayContaining([
        { userId: ana.id, name: "Ana", micros: 105_000, capMicros: 10_000_000 },
        { userId: luis.id, name: "Luis", micros: 200_000, capMicros: 10_000_000 },
        { userId: dueno.id, name: "Dueña", micros: 1_000, capMicros: null },
      ]),
    );
    expect(all.byUser).toHaveLength(3);
  });

  it("el resumen de un colaborador nunca nombra productos que ya no ve", async () => {
    const pLuis = await makeProduct(luis, { name: "Secreto de Luis" });
    await setAssignments(dueno, ana.id, [pLuis.id]);
    await reserveSpend({ ...base(ana), productId: pLuis.id, estimateMicros: 70_000 });
    await setAssignments(dueno, ana.id, []);

    const own = await spendSummary(ana);
    expect(own.spentMicros).toBe(70_000);
    expect(own.byProduct).toEqual([{ productId: null, name: "Productos que ya no ves", micros: 70_000 }]);
    expect(JSON.stringify(own)).not.toContain("Secreto de Luis");
  });

  it("el resumen del dueño incluye a quien aún no ha gastado, con su tope efectivo", async () => {
    await setUserCap(dueno, luis.id, 2_500_000);
    const all = await spendSummary(dueno);
    expect(all.byUser).toEqual(
      expect.arrayContaining([
        { userId: ana.id, name: "Ana", micros: 0, capMicros: 10_000_000 },
        { userId: luis.id, name: "Luis", micros: 0, capMicros: 2_500_000 },
        { userId: dueno.id, name: "Dueña", micros: 0, capMicros: null },
      ]),
    );
  });

  it("solo el dueño cambia topes, y un tope negativo se rechaza", async () => {
    await expect(setGlobalCap(ana, 1)).rejects.toMatchObject({ status: 403 });
    await expect(setUserCap(ana, ana.id, 99_000_000)).rejects.toMatchObject({ status: 403 });
    await expect(setGlobalCap(dueno, -1)).rejects.toMatchObject({ status: 400, message: "El tope no puede ser negativo." });
    await expect(setUserCap(dueno, ana.id, -1)).rejects.toMatchObject({
      status: 400,
      message: "El tope no puede ser negativo.",
    });
    await expect(setGlobalCap(dueno, 1.5)).rejects.toMatchObject({ status: 400 });
    await expect(setUserCap(dueno, 999_999, 1)).rejects.toMatchObject({ status: 404 });
    await expect(setUserCap(dueno, dueno.id, 1)).rejects.toMatchObject({ status: 400 });
    expect(await getGlobalCap()).toBe(30_000_000);
    expect((await spendSummary(ana)).capMicros).toBe(10_000_000);
  });
});
