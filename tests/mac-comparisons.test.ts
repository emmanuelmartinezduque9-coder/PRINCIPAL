import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));
vi.mock("@/db/client", () => {
  const schema = {
    agentTasks: { id: "taskId" },
    llmComparisons: { id: "comparisonId", agentTaskId: "taskId", uploadId: "uploadId" },
  };
  return { schema, getDb: () => ({
    select: () => ({ from: (table: unknown) => ({ where: async () => table === schema.agentTasks ? [{ id: 9, kind: "claude_code", agentId: 4 }] : [state.row] }) }),
    update: () => ({ set: (changes: Record<string, unknown>) => ({ where: () => {
      state.updates.push(changes);
      Object.assign(state.row, changes);
      // El endpoint pide RETURNING; el observador solo espera a que termine el UPDATE.
      return { returning: async () => [{ id: 1 }], then: (resolve: (v: unknown) => void) => resolve([]) };
    } }) }),
  }) };
});
vi.mock("@/server/http", () => ({
  HttpError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  state.row = { id: 1, agentTaskId: 9, uploadId: "reserva", codexMs: null, codexText: null, codexError: null, codexTruncated: false, codexValid: null };
  state.updates = [];
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const body = { taskId: 9, uploadId: "reserva", claudeMs: 10, codexMs: 20, claudeText: "Claude", codexText: '{"valor":"Codex"}', codexError: null };

it("guarda la fila con el Zod original y rechaza la reserva de otro intento", async () => {
  const { bindMacSchema, saveMacComparison } = await import("@/server/mac-comparisons");
  bindMacSchema(9, z.object({ valor: z.string() }));
  await expect(saveMacComparison(4, { ...body, uploadId: "otra" })).rejects.toMatchObject({ status: 409 });
  await expect(saveMacComparison(5, body)).rejects.toMatchObject({ status: 409 });
  await saveMacComparison(4, body);
  expect(state.row).toMatchObject({ claudeMs: 10, codexMs: 20, codexText: body.codexText, codexValid: true });
});

it("el worker valida aunque el POST llegue a otro proceso, incluidos refinamientos de Zod", async () => {
  const worker = await import("@/server/mac-comparisons");
  worker.bindMacSchema(9, z.object({ valor: z.string() }).refine((data) => data.valor === "permitido"));
  // Una segunda carga simula el proceso web, que no comparte el mapa de esquemas del worker.
  vi.resetModules();
  const web = await import("@/server/mac-comparisons");
  await web.saveMacComparison(4, body);
  expect(state.row.codexValid).toBeNull();
  await vi.advanceTimersByTimeAsync(1500);
  expect(state.row.codexValid).toBe(false);
});

it("un texto recortado nunca se presenta como un fallo de Zod ni como aprobado", async () => {
  const { bindMacSchema, saveMacComparison } = await import("@/server/mac-comparisons");
  bindMacSchema(9, z.object({ valor: z.string() }));
  await saveMacComparison(4, { ...body, codexTruncated: true });
  expect(state.row.codexValid).toBeNull();
});
