import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { createGateway } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { CHANGE_REQUEST_PREFIX, classifyRejections, classifyReport, mejorasSweep, REPORT_INSTRUCTIONS } from "@/server/videos/mejoras/classify";
import { cleanDirective, directivesSuffix, learnedSuffix } from "@/server/videos/mejoras/corrections";
import { buildEditRecords, buildStageRecords } from "@/server/videos/mejoras/evidence";
import { evaluateCodeFix, evaluateCorrection, MIN_AFTER, type StageRecord } from "@/server/videos/mejoras/metrics";
import { codeQueueMarkdown, createReport, mejorasView, recordAppliedFixOnce, updateReport } from "@/server/videos/mejoras/reports";
import type { Product } from "@/server/products";
import { BLOCKED, SYSTEM_REJECT_PREFIX } from "@/server/videos/generations";
import { createVideo } from "@/server/videos/videos";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * «Mejoras»: reportar un problema, clasificarlo con Haiku, aplicar la corrección en el prompt y
 * comprobar con números (antes y después, citando los vídeos) si de verdad mejora.
 */

const DAY = 24 * 3600 * 1000;
const T0 = new Date("2026-11-01T00:00:00Z");

function record(videoId: number, over: Partial<StageRecord> = {}): StageRecord {
  return {
    videoId,
    productId: 1,
    stage: "frame",
    firstAt: new Date(T0.getTime() + videoId * 60_000),
    decided: true,
    firstAccepted: true,
    regenerations: 0,
    problems: [],
    prompts: ["base prompt"],
    ...over,
  };
}

describe("cuentas de evidencia (sin base de datos)", () => {
  const directive = "Keep the product exactly as in the product photo.";
  const correction = [{ stage: "frame" as const, productId: null, directive, createdAt: new Date(T0.getTime() + DAY) }];

  it("con pocos vídeos después del cambio, «midiendo»", () => {
    const before = [1, 2, 3, 4].map((id) => record(id, { firstAccepted: false, regenerations: 1, problems: ["producto"] }));
    const after = [10, 11].map((id) => record(id, { firstAt: new Date(T0.getTime() + 2 * DAY), prompts: [`base ${directive}`] }));
    const evaluation = evaluateCorrection(correction, "producto", "Producto", [...before, ...after]);
    expect(evaluation.verdict).toBe("midiendo");
    expect(evaluation.after.videos).toBe(2);
    expect(evaluation.reason).toContain(String(MIN_AFTER));
  });

  it("solo cuenta como aprendida si baja el problema y no empeora la aceptación a la primera; cita los vídeos", () => {
    const before = [1, 2, 3, 4].map((id) => record(id, { firstAccepted: id === 4, regenerations: id === 4 ? 0 : 1, problems: id === 4 ? [] : ["producto"] }));
    const after = [10, 11, 12, 13, 14].map((id) =>
      record(id, { firstAt: new Date(T0.getTime() + 2 * DAY), prompts: [`base ${directive}`], firstAccepted: id !== 14, regenerations: id === 14 ? 1 : 0, problems: id === 14 ? ["producto"] : [] }),
    );
    // Un vídeo posterior que NO llevó la corrección (otro producto con alcance de producto no aplica aquí): no cuenta como «después».
    const notCarried = record(20, { firstAt: new Date(T0.getTime() + 3 * DAY), problems: ["producto"], firstAccepted: false });
    const evaluation = evaluateCorrection(correction, "producto", "Producto", [...before, ...after, notCarried]);
    expect(evaluation.verdict).toBe("mejora");
    expect(evaluation.before.typeRate).toBeCloseTo(0.75);
    expect(evaluation.after.typeRate).toBeCloseTo(0.2);
    expect(evaluation.after.videoIds).toEqual([10, 11, 12, 13, 14]);
    expect(evaluation.after.withProblem).toEqual([14]);
    expect(evaluation.before.videoIds).not.toContain(20);
  });

  it("si el problema no baja, «no_mejora» (no se da por aprendida)", () => {
    const before = [1, 2, 3].map((id) => record(id, { problems: id === 1 ? ["fondo"] : [] }));
    const after = [10, 11, 12, 13, 14].map((id) => record(id, { firstAt: new Date(T0.getTime() + 2 * DAY), prompts: [`x ${directive}`], problems: id < 13 ? ["fondo"] : [] }));
    expect(evaluateCorrection(correction, "fondo", "Fondo", [...before, ...after]).verdict).toBe("no_mejora");
  });

  it("una corrección de un producto solo se compara con vídeos de ese producto", () => {
    const scoped = [{ ...correction[0], productId: 7 }];
    const records = [record(1, { productId: 7 }), record(2, { productId: 8 }), record(3, { productId: 7 })];
    expect(evaluateCorrection(scoped, "producto", "Producto", records).before.videoIds.sort()).toEqual([1, 3]);
  });

  it("un arreglo de código compara los vídeos de antes y después del commit, con los reportes (p. ej. audio)", () => {
    const fixedAt = new Date(T0.getTime() + 10 * DAY);
    const records = [
      ...[1, 2, 3].map((id) => record(id, { firstAt: new Date(T0.getTime() + 5 * DAY + id) })),
      ...[10, 11, 12, 13, 14].map((id) => record(id, { firstAt: new Date(T0.getTime() + 11 * DAY + id) })),
    ];
    const reports = new Map<number, ("audio")[]>([
      [1, ["audio"]],
      [2, ["audio"]],
    ]);
    const evaluation = evaluateCodeFix(fixedAt, "audio", "Audio", records, reports);
    expect(evaluation.before.withProblem).toEqual([1, 2]);
    expect(evaluation.after.withProblem).toEqual([]);
    expect(evaluation.verdict).toBe("mejora");
  });

  it("junta las rondas de un vídeo: aceptado a la primera, rechazos de la persona (no los del sistema) y bloqueos", () => {
    const base = { video_id: 5, product_id: 1, kind: "frame" as const, error: null, intent_at: T0, approved: false, rejection_type: null };
    const records = buildStageRecords(
      [
        { ...base, generation_id: 1, round: 1, status: "done", reject_reason: "El producto no se parece", prompt: "p1", rejection_type: "producto" },
        { ...base, generation_id: 2, round: 2, status: "done", reject_reason: `${SYSTEM_REJECT_PREFIX}alas`, prompt: "p2" },
        { ...base, generation_id: 3, round: 3, status: "failed", reject_reason: null, error: BLOCKED, prompt: "p3" },
        { ...base, generation_id: 4, round: 4, status: "done", reject_reason: null, prompt: "p4", approved: true },
        { ...base, generation_id: 5, video_id: 6, round: 1, status: "done", reject_reason: null, prompt: "q1", approved: true },
      ],
      new Map([[6, [{ stage: "frame", type: "luz" as const }]]]),
    );
    const five = records.find((r) => r.videoId === 5)!;
    expect(five).toMatchObject({ decided: true, firstAccepted: false, regenerations: 1, problems: ["producto", "bloqueo_higgsfield"], prompts: ["p1", "p2", "p3", "p4"] });
    const six = records.find((r) => r.videoId === 6)!;
    expect(six).toMatchObject({ firstAccepted: true, regenerations: 0, problems: ["luz"] });
  });

  it("montaje: un registro por vídeo con sus montajes; rehacerlo es regeneración y los reportes del montaje son el problema", () => {
    const at = (h: number) => new Date(T0.getTime() + h * 3600e3);
    const records = buildEditRecords(
      [
        { video_id: 24, product_id: 3, created_at: at(2), learned_corrections: [] },
        { video_id: 24, product_id: 3, created_at: at(1), learned_corrections: [] },
        { video_id: 25, product_id: 3, created_at: at(5), learned_corrections: [9] },
      ],
      new Map([[24, [{ stage: "montaje", type: "rotulos" as const }, { stage: "frame", type: "luz" as const }]]]),
    );
    const v24 = records.find((r) => r.videoId === 24 && r.stage === "montaje")!;
    expect(v24).toMatchObject({ firstAccepted: false, regenerations: 1, problems: ["rotulos"], firstAt: at(1) });
    expect(records.filter((r) => r.videoId === 25).map((r) => r.stage).sort()).toEqual(["doblaje", "montaje"]);
    expect(records.find((r) => r.videoId === 25 && r.stage === "montaje")).toMatchObject({ firstAccepted: true, applied: [[9]] });
  });

  it("una corrección de rótulos se mide por montaje: «después» son los montajes que la usaron (por su id)", () => {
    const when = new Date(T0.getTime() + DAY);
    const versions = [{ id: 9, stage: "montaje" as const, productId: null, directive: "Pon «in Berlin».", createdAt: when }];
    const montage = (id: number, over: Partial<StageRecord>) => record(id, { stage: "montaje", prompts: [], applied: [[]], ...over });
    const before = [1, 2, 3, 4].map((id) => montage(id, { firstAccepted: id === 4, regenerations: id === 4 ? 0 : 1, problems: id === 4 ? [] : ["rotulos"] }));
    const after = [10, 11, 12, 13, 14].map((id) => montage(id, { firstAt: new Date(T0.getTime() + 2 * DAY), applied: [[9]] }));
    const frame = record(30, { firstAt: new Date(T0.getTime() + 2 * DAY), prompts: ["Pon «in Berlin»."] });
    const evaluation = evaluateCorrection(versions, "rotulos", "Rótulos", [...before, ...after, frame]);
    expect(evaluation.after.videoIds).toEqual([10, 11, 12, 13, 14]);
    expect(evaluation.before.typeRate).toBeCloseTo(0.75);
    expect(evaluation.verdict).toBe("mejora");
  });

  it("los cambios pedidos en el montaje son por defecto «uso» (no cuentan como problema ni crean reglas) salvo un error que se repetiría", () => {
    expect(REPORT_INSTRUCTIONS).toContain(`«${CHANGE_REQUEST_PREFIX}»`);
    expect(REPORT_INSTRUCTIONS).toContain("por defecto es \"uso\"");
  });

  it("la instrucción se limpia (una línea, tope, punto final) y se añade literal al final del prompt", () => {
    expect(cleanDirective(' "Keep the label\nreadable" ')).toBe("Keep the label readable.");
    expect(cleanDirective("x ".repeat(400)).length).toBeLessThanOrEqual(301);
    expect(directivesSuffix([])).toBe("");
    expect(directivesSuffix([{ directive: "A." }, { directive: "B." }])).toBe(" A. B.");
  });
});

describe("reportar, clasificar y aplicar (con base de datos)", () => {
  let ana: AuthUser;
  let dueno: AuthUser;
  let producto: Product;

  afterAll(async () => {
    await stopWorker();
  });

  beforeEach(async () => {
    await truncateAll();
    dueno = await makeUser("dueno");
    ana = await makeUser("colaborador", { name: "Hermano" });
    producto = await makeProduct(ana, { name: "EisWerk" });
  });

  const classification = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      problem_type: "producto",
      fix_kind: "regla",
      cause: "La imagen inventa la forma del producto.",
      stage: "frame",
      directive: "Copy the product shape and colors exactly from the product photo, without inventing parts",
      existing_correction_id: null,
      product_specific: false,
      ...over,
    });

  it("un reporte queda ligado al vídeo con su versión; Haiku lo clasifica y la corrección entra en el prompt de la imagen", async () => {
    const video = await createVideo(ana, producto.id, { avatarMode: "nadie", avatarPhotoId: null });
    const pool = getPool();
    const { rows } = await pool.query<{ id: number }>(
      "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'frame', 2, 'done', $2, '{\"prompt\":\"x\"}', 1, 2) returning id",
      [video.id, ana.id],
    );
    const report = await createReport(ana, { stage: "imagen", body: "El helado sale con otra forma", videoId: video.id });
    const { rows: saved } = await pool.query("select generation_id, version_label, product_id, status, app_version from problem_reports where id = $1", [report.id]);
    expect(saved[0]).toMatchObject({ generation_id: rows[0].id, version_label: "imagen, ronda 2", product_id: producto.id, status: "recibido", app_version: "local" });

    const fake = fakeMessages([{ text: classification(), usage: { inputTokens: 800, outputTokens: 120 } }]);
    await classifyReport(report.id, { gateway: createGateway({ client: fake.client }) });
    expect(fake.calls[0].model).toBe("claude-haiku-5-5");
    const { rows: after } = await pool.query("select status, problem_type, fix_kind, correction_id from problem_reports where id = $1", [report.id]);
    expect(after[0]).toMatchObject({ status: "aplicado", problem_type: "producto", fix_kind: "regla" });
    expect(after[0].correction_id).not.toBeNull();
    expect(await learnedSuffix("frame", producto.id)).toBe(" Copy the product shape and colors exactly from the product photo, without inventing parts.");
    expect(await learnedSuffix("clip", producto.id)).toBe("");
    // El gasto queda en el libro de gasto de quien reportó.
    const { rows: spend } = await pool.query("select user_id, model from spend_entries");
    expect(spend[0]).toMatchObject({ user_id: ana.id, model: "claude-haiku-5-5" });
  });

  it("un fallo de código va a la cola del coordinador; al apuntar el commit pasa a «cambio aplicado»", async () => {
    const video = await createVideo(ana, producto.id, { avatarMode: "nadie", avatarPhotoId: null });
    const report = await createReport(ana, { stage: "montaje", body: "Me salió un vídeo sin audio", videoId: video.id });
    const fake = fakeMessages([{ text: classification({ problem_type: "audio", fix_kind: "codigo", stage: null, directive: null, cause: "El clip se pidió sin audio." }) }]);
    await classifyReport(report.id, { gateway: createGateway({ client: fake.client }) });

    const view = await mejorasView(dueno);
    expect(view.codeQueue).toEqual([report.id]);
    const queue = await codeQueueMarkdown(dueno);
    expect(queue).toContain(`Reporte #${report.id}`);
    expect(queue).toContain("sin audio");

    await expect(updateReport(ana, report.id, { codeCommit: "abc1234" })).rejects.toThrow();
    await updateReport(dueno, report.id, { codeCommit: "abc1234" });
    const again = await mejorasView(dueno);
    expect(again.codeQueue).toEqual([]);
    const shown = again.reports.find((r) => r.id === report.id)!;
    expect(shown.status).toBe("aplicado");
    expect(shown.codeEvaluation?.verdict).toBe("midiendo");
  });

  it("un arreglo pedido por otra vía queda como reporte del dueño ligado al montaje, aplicado y midiendo (una sola vez)", async () => {
    const video = await createVideo(dueno, producto.id, { avatarMode: "nadie", avatarPhotoId: null });
    const pool = getPool();
    const { rows: edit } = await pool.query<{ id: number }>(
      "insert into edits (video_id, version, size, storage_key, duration_ms) values ($1, 3, 100, $2, 9000) returning id",
      [video.id, `montajes/${video.id}/67.mp4`],
    );
    const input = {
      videoId: video.id,
      editStorageKey: `montajes/${video.id}/67.mp4`,
      problemType: "rotulos" as const,
      body: "El rótulo dice «in den USA» y el vídeo está en Berlín.",
      cause: "Se dejó el lugar del original.",
      note: "Regla 6c.",
    };
    const id = await recordAppliedFixOnce("prueba.reporte-lugar", input);
    expect(id).not.toBeNull();
    expect(await recordAppliedFixOnce("prueba.reporte-lugar", input)).toBeNull();
    const { rows } = await pool.query("select created_by, edit_id, status, fix_kind, problem_type, code_commit, version_label from problem_reports");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ created_by: dueno.id, edit_id: edit[0].id, status: "aplicado", fix_kind: "codigo", problem_type: "rotulos", code_commit: "local" });
    expect(rows[0].version_label).toContain("montaje v3");
    const view = await mejorasView(dueno);
    expect(view.codeQueue).toEqual([]);
    expect(view.reports.find((r) => r.id === id)?.codeEvaluation?.verdict).toBe("midiendo");
  });

  it("cada persona ve solo sus reportes; el dueño los ve todos", async () => {
    const pepe = await makeUser("colaborador", { email: "pepe@example.com", name: "Pepe" });
    await createReport(ana, { stage: "pantalla", body: "El botón no hace nada" });
    await createReport(pepe, { stage: "pantalla", body: "No carga la lista" });
    expect((await mejorasView(ana)).reports.map((r) => r.body)).toEqual(["El botón no hace nada"]);
    expect((await mejorasView(dueno)).reports).toHaveLength(2);
    expect((await mejorasView(ana)).codeQueue).toEqual([]);
  });

  it("sin texto o con la captura que no es imagen, no se guarda", async () => {
    await expect(createReport(ana, { stage: "pantalla", body: "  " })).rejects.toThrow("Escribe qué ha pasado.");
    await expect(createReport(ana, { stage: "pantalla", body: "x", screenshot: { mime: "application/pdf", data: Buffer.from("x") } })).rejects.toThrow();
  });

  it("si se acaba el tope o falla Claude, el reporte se queda recibido y se reintenta más tarde", async () => {
    const report = await createReport(ana, { stage: "pantalla", body: "No sale nada" });
    const fake = fakeMessages([{ error: new Error("caído") }, { error: new Error("caído") }, { error: new Error("caído") }]);
    await classifyReport(report.id, { gateway: createGateway({ client: fake.client }) });
    const { rows } = await getPool().query("select status, classify_attempts, classify_after from problem_reports where id = $1", [report.id]);
    expect(rows[0].status).toBe("recibido");
    expect(rows[0].classify_attempts).toBe(1);
    expect(rows[0].classify_after).not.toBeNull();
    // El barrido no lo vuelve a intentar antes de tiempo.
    const sweep = fakeMessages([]);
    await mejorasSweep({ gateway: createGateway({ client: sweep.client }) });
    expect(sweep.calls).toHaveLength(0);
  });

  it("los rechazos con motivo se clasifican por tipo en tandas (los del sistema no)", async () => {
    const video = await createVideo(ana, producto.id, { avatarMode: "nadie", avatarPhotoId: null });
    const pool = getPool();
    const insert = (round: number, reason: string) =>
      pool.query<{ id: number }>(
        "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, reject_reason) values ($1, 'frame', $2, 'done', $3, '{}', 1, 2, $4) returning id",
        [video.id, round, ana.id, reason],
      );
    const a = (await insert(1, "La luz es muy oscura")).rows[0].id;
    await insert(2, `${SYSTEM_REJECT_PREFIX}ajuste`);
    const fake = fakeMessages([{ text: JSON.stringify({ items: [{ id: a, problem_type: "luz" }] }) }]);
    expect(await classifyRejections({ gateway: createGateway({ client: fake.client }) })).toBe(1);
    const sent = JSON.stringify(fake.calls[0].messages);
    expect(sent).toContain("muy oscura");
    expect(sent).not.toContain("ajuste");
    const { rows } = await pool.query("select generation_id, problem_type from rejection_types");
    expect(rows).toEqual([{ generation_id: a, problem_type: "luz" }]);
  });
});
