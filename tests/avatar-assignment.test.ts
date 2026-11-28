import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AvatarInfo } from "@/server/avatars";
const mock = vi.hoisted(() => ({ execute: vi.fn(), library: vi.fn(), find: vi.fn(), inTransaction: false }));
vi.mock("@/db/client", () => ({ getDb: () => ({ execute: mock.execute, transaction: async (fn: (tx: unknown) => unknown) => { mock.inTransaction = true; try { return await fn({ execute: mock.execute }); } finally { mock.inTransaction = false; } } }) }));
vi.mock("@/server/avatars", () => ({ activeAvatarSummaries: mock.library, readAvatarImage: async (id: number) => ({ sha256: `hash-${id}`, data: Buffer.from(`face-${id}`), mime: "image/jpeg" }) }));
vi.mock("@/server/videos/pinterest", () => ({ findRealAvatar: mock.find }));
import { assignPeople } from "@/server/videos/avatar-assignment";

const people = ["a", "b"].map((id, i) => ({ id, gender: "mujer" as const, approxAge: 30, notes: "", opening: i === 0, appearances: [{ startS: i * 2, endS: i * 2 + 2 }] }));
const target = { group: "mujer", age: 30, source: "referencia", label: null } as const;
const context = { videoId: 1, analysisId: 2, productId: 3, userId: 4, batchId: 5 };
const portrait = (id: number) => ({ id, group: "mujer", ageYears: 30, tags: ["aleman"], name: `mujer ${id}`, number: id });
beforeEach(() => {
  vi.resetAllMocks();
  mock.execute.mockResolvedValue({ rows: [] });
  mock.inTransaction = false;
  mock.library.mockImplementation(async () => { expect(mock.inTransaction).toBe(false); return [portrait(1)]; });
  mock.find.mockImplementation(async () => {
    expect(mock.inTransaction).toBe(false);
    mock.library.mockResolvedValue([portrait(1), portrait(2)]);
    return { ...portrait(2), sha256: "hash-2" } as AvatarInfo;
  });
});
describe("reserva y ampliación de biblioteca con fotos reales", () => {
  it("busca Pinterest cuando faltan personas distintas; nunca recicla la de apertura", async () => {
    expect(await assignPeople(context, people, target, ["DE"])).toEqual([{ personId: "a", avatarId: 1 }, { personId: "b", avatarId: 2 }]);
    expect(mock.find).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ group: "mujer", age: 30 }), countries: ["DE"], excludedHashes: ["hash-1"] }));
    expect(mock.execute).toHaveBeenCalledTimes(8); // initial shortage, refreshed snapshot, locked recheck and save
  });
  it("no busca si la biblioteca tiene suficientes personas válidas", async () => {
    mock.library.mockResolvedValue([portrait(1), portrait(2)]);
    const assigned = await assignPeople(context, people, target, ["DE"]);
    expect(new Set(assigned.map((a) => a.avatarId)).size).toBe(2);
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("sin retrato real válido no inventa cara ni guarda una asignación incompleta", async () => {
    mock.find.mockRejectedValue(new Error("Ningún retrato real encaja"));
    await expect(assignPeople(context, people, target, ["DE"])).rejects.toThrow("No hay ningún avatar de b en la biblioteca ni en Pinterest");
    expect(mock.find).toHaveBeenCalledTimes(1);
    const queries = mock.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).sql);
    expect(queries.some((q) => q.startsWith("update video_analyses"))).toBe(false);
  });
  it("reintentar el mismo desglose reutiliza su reserva sin buscar ni consumir otros retratos", async () => {
    const assignments = [{ personId: "a", avatarId: 1 }, { personId: "b", avatarId: 2 }];
    mock.execute.mockResolvedValue({ rows: [{ assignments, ids: [], used_at: new Date() }] });
    expect(await assignPeople(context, people, target, ["DE"])).toEqual(assignments);
    expect(mock.find).not.toHaveBeenCalled();
    expect(mock.execute).toHaveBeenCalledTimes(6);
  });
  it("el historial del producto/lote excluye a los reservados aunque otro retrato tenga más uso global", async () => {
    const history = { rows: [{ product_id: "3", batch_id: "5", used_at: new Date(), ids: [1] }] };
    mock.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce(history)
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce(history);
    mock.library.mockResolvedValue([portrait(1), portrait(2), portrait(3)]);
    expect(await assignPeople(context, people, target, ["DE"])).toEqual([{ personId: "a", avatarId: 2 }, { personId: "b", avatarId: 3 }]);
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("revalida una reserva concurrente y busca fuera del bloqueo antes de guardar", async () => {
    mock.library.mockResolvedValue([portrait(1), portrait(2)]);
    const history = { rows: [{ product_id: "3", batch_id: "5", used_at: new Date(), ids: [1] }] };
    mock.execute.mockResolvedValue(history)
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    mock.find.mockImplementation(async () => {
      expect(mock.inTransaction).toBe(false);
      mock.library.mockResolvedValue([portrait(1), portrait(2), portrait(3)]);
      return portrait(3);
    });
    expect(await assignPeople(context, people, target, ["DE"])).toEqual([
      { personId: "a", avatarId: 2 }, { personId: "b", avatarId: 3 },
    ]);
    expect(mock.find).toHaveBeenCalledWith(expect.objectContaining({ excludedHashes: ["hash-2", "hash-1"] }));
    const queries = mock.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).sql);
    expect(queries.filter((q) => q.includes("pg_advisory_xact_lock"))).toHaveLength(2);
    expect(queries.some((q) => q.includes("pg_try_advisory"))).toBe(false);
    expect(queries.filter((q) => q.startsWith("update video_analyses"))).toHaveLength(1);
  });
  it("una foto duplicada de Pinterest no permite repetir persona dentro del vídeo", async () => {
    mock.find.mockResolvedValue(portrait(1));
    await expect(assignPeople(context, people, target, ["DE"])).rejects.toThrow("No hay ningún avatar de b en la biblioteca ni en Pinterest");
    expect(mock.find).toHaveBeenCalledTimes(1);
    const queries = mock.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).sql);
    expect(queries.some((q) => q.startsWith("update video_analyses"))).toBe(false);
  });
  it.each(["fallo", "duplicado"])("Pinterest %s: reutiliza retratos reales reservados en otros vídeos, empezando por el menos usado", async (failure) => {
    mock.library.mockResolvedValue([portrait(1), portrait(2), portrait(3)]);
    mock.execute.mockResolvedValue({ rows: [{ product_id: 3, batch_id: 5, used_at: new Date(), ids: [1, 2, 3] },
      { product_id: 3, batch_id: 5, used_at: new Date(), ids: [1, 2] },
      { product_id: 3, batch_id: 5, used_at: new Date(), ids: [1] }] });
    if (failure === "fallo") mock.find.mockRejectedValue(new Error("Ningún retrato real encaja"));
    else mock.find.mockResolvedValue(portrait(1));
    const assigned = await assignPeople(context, people, target, ["DE"]);
    expect(assigned).toEqual([{ personId: "a", avatarId: 3 }, { personId: "b", avatarId: 2 }]);
    expect(new Set(assigned.map((a) => a.avatarId)).size).toBe(people.length);
    expect(mock.find).toHaveBeenCalledTimes(1);
    const queries = mock.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).sql);
    expect(queries.filter((q) => q.startsWith("update video_analyses"))).toHaveLength(1);
  });
});
