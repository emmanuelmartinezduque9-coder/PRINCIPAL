import { describe, expect, it } from "vitest";
import {
  analysisState,
  autoBatchName,
  generationState,
  needsReview,
  pollEvery,
  ready,
  referenceState,
  rowState,
  type BatchRowJson,
  type BatchViewJson,
} from "@/components/batches/labels";
import { planSend, sendPlan } from "@/components/batches/bulk-plan";
import { createLimiter, runPool } from "@/components/batches/run-pool";

type Gen = BatchRowJson["frame"];
const gen = (current: Partial<NonNullable<Gen["current"]>> | null, extra: Partial<Gen> = {}): Gen => ({
  round: current ? 1 : 0,
  regenerationsLeft: 2,
  approvedResultId: null,
  current: current
    ? { id: 1, status: "done", error: null, quotedCredits: 4, rejectReason: null, results: [{ id: 7, ok: true, url: null, hasThumb: true }], stuck: null, ...current }
    : null,
  ...extra,
});

const row = (over: Partial<BatchRowJson> = {}): BatchRowJson => ({
  id: 1,
  title: "Vídeo 1",
  productId: 1,
  productName: "P",
  note: null,
  kind: "replicar",
  hookSeconds: 4,
  bodies: 0,
  needsAdaptation: false,
  mine: true,
  createdAt: "",
  updatedAt: "",
  referenceStatus: "ready",
  referenceError: null,
  referenceOutdated: false,

  link: null,
  avatarPhotoId: 3,
  avatarMode: "elegido",
  analysis: { status: "done", error: null, stale: false, staleReason: null },
  risks: [],
  removable: true,
  frame: gen(null),
  clip: gen(null),
  costs: { higgsfieldCredits: 0, claudeMicros: 0 },
  clipReady: false,
  ...over,
});

describe("tablero del lote: qué filas cuenta cada acción", () => {
  it("desglosar: referencia lista, avatar o nadie, y sin desglose vigente; nunca vídeos ajenos", () => {
    expect(ready.breakdown(row({ analysis: null }))).toBe(true);
    expect(ready.breakdown(row({ analysis: { status: "failed", error: "x", stale: false, staleReason: null } }))).toBe(true);
    expect(ready.breakdown(row({ analysis: { status: "done", error: null, stale: true, staleReason: "reference" } }))).toBe(true);
    expect(ready.breakdown(row())).toBe(false);
    expect(ready.breakdown(row({ analysis: { status: "running", error: null, stale: true, staleReason: "reference" } }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, referenceStatus: "processing" }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, avatarPhotoId: null }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, avatarPhotoId: null, avatarMode: "nadie" }))).toBe(true);
    expect(ready.breakdown(row({ analysis: null, avatarPhotoId: null, avatarMode: "sin_sustitucion" }))).toBe(true);
    // Una adaptación sin «Qué adaptación quieres» no se puede desglosar.
    expect(ready.breakdown(row({ analysis: null, kind: "adaptacion_concepto", needsAdaptation: true }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, kind: "adaptacion_concepto" }))).toBe(true);
    // Un desglose de otras indicaciones se repite, igual que uno de otra referencia.
    expect(ready.breakdown(row({ analysis: { status: "done", error: null, stale: true, staleReason: "brief" } }))).toBe(true);
    expect(ready.breakdown(row({ analysis: null, mine: false }))).toBe(false);
  });

  it("una referencia preparada con otro gancho hay que volver a subirla: ni se desglosa ni cuenta como lista", () => {
    const outdated = row({ kind: "solo_gancho", referenceOutdated: true, analysis: { status: "done", error: null, stale: true, staleReason: "brief" } });
    expect(ready.breakdown(outdated)).toBe(false);
    expect(referenceState(outdated, { kind: "idle" })).toMatchObject({ label: "Resubir", tone: "error" });
    expect(needsReview(outdated)).toBe(true);
    // Mientras se sube la nueva, manda la subida.
    expect(referenceState(outdated, { kind: "uploading", fraction: 0.5 })).toMatchObject({ label: "Subiendo 50 %", tone: "busy" });
    expect(referenceState(row({ kind: "solo_gancho" }), { kind: "idle" })).toMatchObject({ label: "Lista", tone: "ok" });
  });

  it("imágenes: desglose vigente y ronda disponible; un clip enviado ata la imagen", () => {
    expect(ready.frame(row())).toBe(true);
    expect(ready.frame(row({ analysis: { status: "done", error: null, stale: true, staleReason: "reference" } }))).toBe(false);
    expect(ready.frame(row({ frame: gen({ status: "submitted" }) }))).toBe(false);
    expect(ready.frame(row({ frame: gen({ rejectReason: "feas" }) }))).toBe(true);
    expect(ready.frame(row({ frame: gen({ rejectReason: "feas" }, { regenerationsLeft: 0 }) }))).toBe(false);
    expect(ready.frame(row({ frame: gen({ status: "failed" }), clip: gen({ status: "submitted" }) }))).toBe(false);
  });

  it("revisar y clips", () => {
    expect(ready.review(row({ frame: gen({}) }))).toBe(true);
    expect(ready.review(row({ frame: gen({}, { approvedResultId: 7 }) }))).toBe(false);
    expect(ready.review(row({ frame: gen({ rejectReason: "no" }) }))).toBe(false);
    expect(ready.clip(row({ frame: gen({}, { approvedResultId: 7 }) }))).toBe(true);
    expect(ready.clip(row({ frame: gen({}, { approvedResultId: 7 }), clip: gen({ status: "submitting" }) }))).toBe(false);
    expect(ready.clip(row({ frame: gen({}, { approvedResultId: 7 }), mine: false }))).toBe(false);
  });

  it("estados en palabras", () => {
    expect(analysisState(row({ analysis: { status: "done", error: null, stale: true, staleReason: "brief" } }))).toMatchObject({
      label: "Repetir",
      detail: "Las indicaciones han cambiado.",
    });
    expect(analysisState(row({ analysis: { status: "done", error: null, stale: true, staleReason: "reference" } })).detail).toBe("La referencia ha cambiado.");
    expect(referenceState(row({ referenceStatus: "none" }), { kind: "uploading", fraction: 0.42 }).label).toBe("Subiendo 42 %");
    expect(referenceState(row({ referenceStatus: "none" }), { kind: "uploading", fraction: 0, queued: true }).label).toBe("En cola");
    expect(referenceState(row({ referenceStatus: "failed", referenceError: "Formato" }), { kind: "idle" })).toMatchObject({ tone: "error", detail: "Formato" });
    expect(generationState(gen({}), "frame")).toMatchObject({ label: "Revisar", tone: "review" });
    expect(generationState(gen({}, { approvedResultId: 7 }), "frame").label).toBe("Aprobada");
    expect(generationState(gen({ status: "not_sent", error: "El precio ha cambiado" }), "clip")).toMatchObject({ tone: "error", detail: "El precio ha cambiado" });
  });

  it("se vuelve a pedir mientras algo está en marcha y para cuando no", () => {
    const view = (rows: BatchRowJson[]) => ({ batch: { id: 1, name: "", createdAt: "", createdBy: 1, mine: true }, rows }) as BatchViewJson;
    expect(pollEvery(view([row()]), false)).toBe(false);
    expect(pollEvery(view([row()]), true)).toBe(3000);
    expect(pollEvery(view([row(), row({ frame: gen({ status: "submitted" }) })]), false)).toBe(3000);
    expect(pollEvery(view([row({ analysis: { status: "queued", error: null, stale: false, staleReason: null } })]), false)).toBe(3000);
    expect(pollEvery(view([row({ clip: gen({ status: "unknown" }) })]), false)).toBe(15_000);
  });
});

describe("runPool", () => {
  it("como mucho N a la vez, en orden, y un fallo no para a los demás", async () => {
    let active = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5 * (6 - n)));
      active -= 1;
      if (n === 3) throw new Error("tres");
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map((r) => (r.ok ? r.value : (r.error as Error).message))).toEqual([10, 20, "tres", 40, 50]);
  });
});

describe("envío en bloque", () => {
  it("cada fila se envía con SU precio; la que no tiene precio se queda con su motivo", async () => {
    const { send, skipped } = planSend(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      {
        1: { ok: true, value: { credits: 4, balance: 100 } },
        2: { ok: false, error: new Error("Quita «cinematic»: es una palabra vetada.") },
        3: { ok: true, value: { credits: 90, balance: 100 } },
      },
      "No se pudo calcular el precio.",
    );
    expect(send).toEqual([
      { id: 1, expectedCredits: 4 },
      { id: 3, expectedCredits: 90 },
    ]);
    expect(skipped).toEqual({ 2: "Quita «cinematic»: es una palabra vetada.", 4: "No se pudo calcular el precio." });

    const bodies: Array<[number, number]> = [];
    const states: string[] = [];
    const report = await sendPlan(
      send,
      async (id, expectedCredits) => {
        bodies.push([id, expectedCredits]);
        if (id === 3) throw new Error("El precio ha cambiado: ahora son 120 créditos. Revísalo y confirma de nuevo.");
      },
      (id, state) => states.push(`${id}:${state.kind}`),
    );
    expect(bodies.sort()).toEqual([
      [1, 4],
      [3, 90],
    ]);
    expect(report).toEqual({ 1: null, 3: "El precio ha cambiado: ahora son 120 créditos. Revísalo y confirma de nuevo." });
    expect(states).toEqual(expect.arrayContaining(["1:sending", "3:sending", "1:sent", "3:error"]));
  });

  it("el aviso de una fila caduca cuando la fila cambia de estado", () => {
    const before = row({ frame: gen({ status: "failed" }) });
    expect(rowState(before)).toBe(rowState(row({ frame: gen({ status: "failed" }) })));
    expect(rowState(before)).not.toBe(rowState(row({ frame: gen({ status: "submitted" }) })));
    expect(rowState(before)).not.toBe(rowState(row({ frame: gen({ status: "failed" }), updatedAt: "otra" })));
  });
});

describe("createLimiter", () => {
  it("un solo turno de 2 para tareas que llegan de sitios distintos", async () => {
    const turn = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = (ms: number) =>
      turn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, ms));
        active -= 1;
        return ms;
      });
    const all = await Promise.all([task(10), task(5), task(1), task(3), task(2), task(4)]);
    expect(all).toEqual([10, 5, 1, 3, 2, 4]);
    expect(peak).toBe(2);
  });
});

describe("lote v2: «Por revisar» y nombre automático", () => {
  it("por revisar: error, desglose que ya no vale, candidatas sin aprobar o generación en duda", () => {
    expect(needsReview(row())).toBe(false);
    expect(needsReview(row({ analysis: { status: "failed", error: "x", stale: false, staleReason: null } }))).toBe(true);
    expect(needsReview(row({ analysis: { status: "done", error: null, stale: true, staleReason: "brief" } }))).toBe(true);
    expect(needsReview(row({ frame: gen({}) }))).toBe(true);
    expect(needsReview(row({ frame: gen({ status: "unknown" }) }))).toBe(true);
    expect(needsReview(row({ clip: gen({ status: "failed" }) }))).toBe(true);
    expect(needsReview(row({ referenceStatus: "failed", referenceError: "Formato" }))).toBe(true);
    expect(needsReview(row({ referenceStatus: "none" }), { kind: "failed", message: "Sin red" })).toBe(true);
    // Un rechazo con su motivo no cuenta como fallo; en marcha, tampoco.
    expect(needsReview(row({ frame: gen({ rejectReason: "feas" }) }))).toBe(false);
    expect(needsReview(row({ analysis: { status: "running", error: null, stale: false, staleReason: null } }))).toBe(false);
    // Las candidatas de un vídeo ajeno no se revisan aquí.
    expect(needsReview(row({ mine: false, frame: gen({}) }))).toBe(false);
  });

  it("nombre automático: día/mes y los productos, sin repetir y como mucho 100 caracteres", () => {
    expect(autoBatchName(new Date(2026, 10, 2), ["Lámpara Luna", "Botella", "Lámpara Luna"])).toBe("02/11 · Lámpara Luna, Botella");
    expect(autoBatchName(new Date(2026, 0, 15), [])).toBe("15/01");
    expect(autoBatchName(new Date(2026, 0, 15), ["x".repeat(200)])).toHaveLength(100);
  });
});
