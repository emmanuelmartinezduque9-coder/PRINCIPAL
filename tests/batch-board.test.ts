import { describe, expect, it } from "vitest";
import { generationState, pollEvery, ready, referenceState, type BatchRowJson, type BatchViewJson } from "@/components/batches/labels";
import { runPool } from "@/components/batches/run-pool";

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
  mine: true,
  createdAt: "",
  updatedAt: "",
  referenceStatus: "ready",
  referenceError: null,
  avatarPhotoId: 3,
  noPerson: false,
  analysis: { status: "done", error: null, stale: false },
  frame: gen(null),
  clip: gen(null),
  costs: { higgsfieldCredits: 0, claudeMicros: 0 },
  clipReady: false,
  ...over,
});

describe("tablero del lote: qué filas cuenta cada acción", () => {
  it("desglosar: referencia lista, avatar o nadie, y sin desglose vigente; nunca vídeos ajenos", () => {
    expect(ready.breakdown(row({ analysis: null }))).toBe(true);
    expect(ready.breakdown(row({ analysis: { status: "failed", error: "x", stale: false } }))).toBe(true);
    expect(ready.breakdown(row({ analysis: { status: "done", error: null, stale: true } }))).toBe(true);
    expect(ready.breakdown(row())).toBe(false);
    expect(ready.breakdown(row({ analysis: { status: "running", error: null, stale: true } }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, referenceStatus: "processing" }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, avatarPhotoId: null }))).toBe(false);
    expect(ready.breakdown(row({ analysis: null, avatarPhotoId: null, noPerson: true }))).toBe(true);
    expect(ready.breakdown(row({ analysis: null, mine: false }))).toBe(false);
  });

  it("imágenes: desglose vigente y ronda disponible; un clip enviado ata la imagen", () => {
    expect(ready.frame(row())).toBe(true);
    expect(ready.frame(row({ analysis: { status: "done", error: null, stale: true } }))).toBe(false);
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
    expect(pollEvery(view([row({ analysis: { status: "queued", error: null, stale: false } })]), false)).toBe(3000);
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
