import { captureVideoSignals, captureBatchSignals } from "@/server/videos/aprendizaje/senales";
import { and, desc, eq } from "drizzle-orm";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import {
  FIX_KINDS,
  isProblemType,
  isReportStage,
  MAX_REPORT_CHARS,
  MAX_SCREENSHOT_BYTES,
  PROBLEM_TYPES,
  SCREENSHOT_TYPES,
  type ProblemType,
  type ReportStage,
} from "@/lib/mejoras";
import { appVersion } from "@/lib/version";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { allCorrections, reviseCorrection, setCorrectionActive, type Correction } from "@/server/videos/mejoras/corrections";
import { loadStageRecords } from "@/server/videos/mejoras/evidence";
import { evaluateCodeFix, evaluateCorrection, type Evaluation, type Stage } from "@/server/videos/mejoras/metrics";
import { productNamesByIds } from "@/server/products";
import { getVideoFor } from "@/server/videos/videos";

/**
 * «Reportar un problema» y la página «Mejoras». Cualquiera reporta desde donde lo ve; el reporte queda
 * ligado al objeto (vídeo, generación y resultado, montaje, lote o pantalla) con su versión. El dueño ve
 * todos; cada persona, los suyos. Ver `docs/decisiones-mejoras.md`.
 */

const NOT_FOUND = "No existe ese reporte.";

export interface NewReport {
  stage: ReportStage;
  body: string;
  page?: string | null;
  videoId?: number | null;
  generationId?: number | null;
  resultId?: number | null;
  editId?: number | null;
  batchId?: number | null;
  screenshot?: { mime: string; data: Buffer } | null;
}

const optionalId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "Identificador no válido.");
  return n;
};

/** Crea un reporte. Comprueba que la persona ve ese vídeo y que la generación o el montaje son de él. */
export async function createReport(user: AuthUser, input: NewReport): Promise<{ id: number }> {
  if (!isReportStage(input.stage)) throw new HttpError(400, "Falta dónde está el problema.");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) throw new HttpError(400, "Escribe qué ha pasado.");
  if (body.length > MAX_REPORT_CHARS) throw new HttpError(400, `Como mucho ${MAX_REPORT_CHARS} caracteres.`);
  const shot = input.screenshot ?? null;
  if (shot) {
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(shot.mime)) throw new HttpError(400, "La captura tiene que ser PNG, JPEG o WebP.");
    if (shot.data.length === 0 || shot.data.length > MAX_SCREENSHOT_BYTES) throw new HttpError(400, "La captura pesa demasiado (máx. 4 MB).");
  }
  const db = getDb();
  let videoId = optionalId(input.videoId);
  let generationId = optionalId(input.generationId);
  let resultId = optionalId(input.resultId);
  let editId = optionalId(input.editId);
  let batchId = optionalId(input.batchId);
  let productId: number | null = null;
  const labels: string[] = [];

  if (videoId !== null) {
    const video = await getVideoFor(user, videoId);
    productId = video.productId;
    batchId ??= video.batchId ?? null;
  }
  if (resultId !== null) {
    const [row] = await db
      .select({ generationId: schema.generationResults.generationId, index: schema.generationResults.index })
      .from(schema.generationResults)
      .where(eq(schema.generationResults.id, resultId));
    if (!row) resultId = null;
    else {
      generationId ??= row.generationId;
      labels.push(`resultado ${row.index + 1}`);
    }
  }
  if (generationId !== null) {
    const [gen] = await db
      .select({ videoId: schema.generations.videoId, kind: schema.generations.kind, round: schema.generations.round })
      .from(schema.generations)
      .where(eq(schema.generations.id, generationId));
    if (!gen || (videoId !== null && gen.videoId !== videoId)) throw new HttpError(400, "Esa generación no es de este vídeo.");
    labels.unshift(`${gen.kind === "frame" ? "imagen" : "clip"}, ronda ${gen.round}`);
    if (videoId === null) {
      const video = await getVideoFor(user, gen.videoId);
      videoId = video.id;
      productId = video.productId;
    }
  }
  if (editId !== null) {
    const [edit] = await db.select({ videoId: schema.edits.videoId, version: schema.edits.version }).from(schema.edits).where(eq(schema.edits.id, editId));
    if (!edit || (videoId !== null && edit.videoId !== videoId)) throw new HttpError(400, "Ese montaje no es de este vídeo.");
    labels.push(`montaje v${edit.version}`);
    if (videoId === null) {
      const video = await getVideoFor(user, edit.videoId);
      videoId = video.id;
      productId = video.productId;
    }
  } else if (videoId !== null && input.stage === "montaje") {
    // Sin montaje concreto: el último del vídeo.
    const [edit] = await db
      .select({ id: schema.edits.id, version: schema.edits.version })
      .from(schema.edits)
      .where(eq(schema.edits.videoId, videoId))
      .orderBy(desc(schema.edits.version))
      .limit(1);
    if (edit) {
      editId = edit.id;
      labels.push(`montaje v${edit.version}`);
    }
  } else if (videoId !== null && generationId === null && (input.stage === "imagen" || input.stage === "clip")) {
    // Sin generación concreta: la última de ese paso.
    const [gen] = await db
      .select({ id: schema.generations.id, round: schema.generations.round })
      .from(schema.generations)
      .where(and(eq(schema.generations.videoId, videoId), eq(schema.generations.kind, input.stage === "imagen" ? "frame" : "clip")))
      .orderBy(desc(schema.generations.id))
      .limit(1);
    if (gen) {
      generationId = gen.id;
      labels.push(`${input.stage}, ronda ${gen.round}`);
    }
  }
  if (batchId !== null) {
    const [batch] = await db.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.id, batchId));
    if (!batch) batchId = null;
  }

  const [row] = await db
    .insert(schema.problemReports)
    .values({
      createdBy: user.id,
      stage: input.stage,
      body,
      screenshotMime: shot?.mime ?? null,
      screenshot: shot?.data ?? null,
      videoId,
      generationId,
      resultId,
      editId,
      batchId,
      productId,
      page: typeof input.page === "string" ? input.page.slice(0, 300) : null,
      versionLabel: labels.length ? labels.join(" · ") : null,
      appVersion: appVersion(),
    })
    .returning({ id: schema.problemReports.id });
  if (videoId !== null) await captureVideoSignals(videoId);
  else if (batchId !== null) await captureBatchSignals(batchId);
  return row;
}

/** La captura de un reporte: su autor o el dueño. */
export async function readScreenshot(user: AuthUser, reportId: number): Promise<{ mime: string; data: Buffer }> {
  const [row] = await getDb()
    .select({ createdBy: schema.problemReports.createdBy, mime: schema.problemReports.screenshotMime, data: schema.problemReports.screenshot })
    .from(schema.problemReports)
    .where(eq(schema.problemReports.id, reportId));
  if (!row || (user.role !== "dueno" && row.createdBy !== user.id) || !row.mime || !row.data) throw new HttpError(404, NOT_FOUND);
  return { mime: row.mime, data: Buffer.from(row.data) };
}

/** Lo que se enseña de una corrección: su texto vigente, sus versiones y la evidencia. */
export interface CorrectionView {
  key: string;
  stage: Stage;
  problemType: ProblemType;
  productId: number | null;
  productName: string | null;
  active: boolean;
  current: { id: number; version: number; directive: string; note: string; createdAt: Date; automatic: boolean };
  versions: Array<{ version: number; directive: string; createdAt: Date; status: string }>;
  evaluation: Evaluation;
  reportIds: number[];
}

export interface ReportView {
  id: number;
  createdAt: Date;
  authorName: string;
  mine: boolean;
  stage: string;
  body: string;
  hasScreenshot: boolean;
  videoId: number | null;
  videoTitle: string | null;
  batchId: number | null;
  versionLabel: string | null;
  appVersion: string;
  page: string | null;
  status: string;
  problemType: string | null;
  fixKind: string | null;
  cause: string | null;
  classifyError: string | null;
  correctionKey: string | null;
  codeCommit: string | null;
  codeFixedAt: Date | null;
  codeNote: string | null;
  /** Evidencia de un arreglo de código (antes y después del commit). */
  codeEvaluation: Evaluation | null;
}

export interface MejorasView {
  owner: boolean;
  reports: ReportView[];
  corrections: CorrectionView[];
  /** Arreglos de código sin hacer: la cola para una sesión de Claude. */
  codeQueue: number[];
  totals: { reports: number; applied: number; learned: number; measuring: number; notImproving: number };
  /** Producto de cada vídeo citado (para enlazarlo). */
  videoProducts: Record<number, number>;
}

const typeLabel = (type: string | null) => (type && isProblemType(type) ? PROBLEM_TYPES[type] : "Otro");

/** Estado que se enseña según la evidencia: «comprobado» solo si los números mejoran. */
function statusWithEvidence(status: string, evaluation: Evaluation | null): string {
  if (!evaluation || (status !== "aplicado" && status !== "comprobado" && status !== "no_mejora")) return status;
  return evaluation.verdict === "mejora" ? "comprobado" : evaluation.verdict === "no_mejora" ? "no_mejora" : "aplicado";
}

/** Todo lo de la página «Mejoras». El dueño ve todo; cada persona, sus reportes y las correcciones que salen de ellos. */
export async function mejorasView(user: AuthUser): Promise<MejorasView> {
  const owner = user.role === "dueno";
  const db = getDb();
  const r = schema.problemReports;
  const rows = await db
    .select({
      report: {
        id: r.id,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        stage: r.stage,
        body: r.body,
        screenshotMime: r.screenshotMime,
        videoId: r.videoId,
        productId: r.productId,
        batchId: r.batchId,
        versionLabel: r.versionLabel,
        appVersion: r.appVersion,
        page: r.page,
        status: r.status,
        problemType: r.problemType,
        fixKind: r.fixKind,
        cause: r.cause,
        classifyError: r.classifyError,
        correctionId: r.correctionId,
        codeCommit: r.codeCommit,
        codeFixedAt: r.codeFixedAt,
        codeNote: r.codeNote,
      },
      authorName: schema.users.name,
      videoTitle: schema.videos.title,
    })
    .from(r)
    .leftJoin(schema.users, eq(schema.users.id, r.createdBy))
    .leftJoin(schema.videos, eq(schema.videos.id, r.videoId))
    .where(owner ? undefined : eq(r.createdBy, user.id))
    .orderBy(desc(r.id))
    .limit(500);

  const corrections = await allCorrections();
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const byKey = new Map<string, Correction[]>();
  for (const c of corrections) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);

  const { records, reports: reported } = await loadStageRecords();
  const extra = new Map<number, ProblemType[]>();
  for (const [videoId, list] of reported) extra.set(videoId, list.map((item) => item.type));

  // Correcciones a enseñar: todas para el dueño; para los demás, las que salen de sus reportes.
  const visibleKeys = new Set<string>();
  for (const { report } of rows) {
    const c = report.correctionId ? byId.get(report.correctionId) : undefined;
    if (c) visibleKeys.add(c.key);
  }
  if (owner) for (const key of byKey.keys()) visibleKeys.add(key);

  const productIds = [...new Set(corrections.map((c) => c.productId).filter((id): id is number => id !== null))];
  const names = await productNamesByIds(productIds);

  const evaluations = new Map<string, Evaluation>();
  const correctionViews: CorrectionView[] = [];
  for (const key of visibleKeys) {
    const versions = byKey.get(key)!;
    const last = versions[versions.length - 1];
    const type = isProblemType(last.problemType) ? last.problemType : "otro";
    const evaluation = evaluateCorrection(
      versions.map((v) => ({ id: v.id, stage: v.stage as Stage, productId: v.productId, directive: v.directive, createdAt: v.createdAt })),
      type,
      typeLabel(type),
      records,
    );
    evaluations.set(key, evaluation);
    correctionViews.push({
      key,
      stage: last.stage as Stage,
      problemType: type,
      productId: last.productId,
      productName: last.productId ? (names.get(last.productId) ?? null) : null,
      active: last.status === "activa",
      current: { id: last.id, version: last.version, directive: last.directive, note: last.note, createdAt: last.createdAt, automatic: last.createdBy === null },
      versions: versions.map((v) => ({ version: v.version, directive: v.directive, createdAt: v.createdAt, status: v.status })).reverse(),
      evaluation,
      reportIds: rows.filter(({ report }) => report.correctionId !== null && byId.get(report.correctionId)?.key === key).map(({ report }) => report.id),
    });
  }
  correctionViews.sort((a, b) => b.current.createdAt.getTime() - a.current.createdAt.getTime());

  const reports: ReportView[] = rows.map(({ report, authorName, videoTitle }) => {
    const correction = report.correctionId ? byId.get(report.correctionId) : undefined;
    const codeEvaluation =
      report.fixKind === "codigo" && report.codeFixedAt
        ? evaluateCodeFix(report.codeFixedAt, isProblemType(report.problemType) ? report.problemType : "otro", typeLabel(report.problemType), records, extra)
        : null;
    const evaluation = correction ? (evaluations.get(correction.key) ?? null) : codeEvaluation;
    return {
      id: report.id,
      createdAt: report.createdAt,
      authorName: authorName ?? (report.createdBy === 0 ? "Dueño" : "—"),
      mine: report.createdBy === user.id,
      stage: report.stage,
      body: report.body,
      hasScreenshot: report.screenshotMime !== null,
      videoId: report.videoId,
      videoTitle,
      batchId: report.batchId,
      versionLabel: report.versionLabel,
      appVersion: report.appVersion,
      page: report.page,
      status: statusWithEvidence(report.status, evaluation),
      problemType: report.problemType,
      fixKind: report.fixKind,
      cause: report.cause,
      classifyError: owner ? report.classifyError : null,
      correctionKey: correction?.key ?? null,
      codeCommit: report.codeCommit,
      codeFixedAt: report.codeFixedAt,
      codeNote: report.codeNote,
      codeEvaluation,
    };
  });

  const learned = correctionViews.filter((c) => c.evaluation.verdict === "mejora").length + reports.filter((r) => r.codeEvaluation?.verdict === "mejora").length;
  const notImproving = correctionViews.filter((c) => c.evaluation.verdict === "no_mejora").length + reports.filter((r) => r.codeEvaluation?.verdict === "no_mejora").length;
  const videoProducts: Record<number, number> = {};
  if (owner) for (const record of records) videoProducts[record.videoId] = record.productId;
  for (const { report } of rows) if (report.videoId !== null && report.productId !== null) videoProducts[report.videoId] = report.productId;
  return {
    owner,
    videoProducts,
    reports,
    corrections: correctionViews,
    codeQueue: owner ? reports.filter((r) => r.fixKind === "codigo" && !r.codeCommit).map((r) => r.id) : [],
    totals: {
      reports: reports.length,
      applied: reports.filter((r) => ["aplicado", "comprobado", "no_mejora"].includes(r.status)).length,
      learned,
      measuring: correctionViews.length + reports.filter((r) => r.codeEvaluation).length - learned - notImproving,
      notImproving,
    },
  };
}

/** Cambios del dueño en un reporte: apuntar el commit del arreglo, cambiar el tipo o lo que hace falta. */
export async function updateReport(
  owner: AuthUser,
  reportId: number,
  patch: { codeCommit?: string | null; codeNote?: string | null; problemType?: string; fixKind?: string; status?: string },
): Promise<void> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const [report] = await getDb().select().from(schema.problemReports).where(eq(schema.problemReports.id, reportId));
  if (!report) throw new HttpError(404, NOT_FOUND);
  const set: Partial<typeof schema.problemReports.$inferInsert> = { updatedAt: new Date() };
  if (patch.codeCommit !== undefined) {
    const commit = patch.codeCommit?.trim() ?? "";
    if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) throw new HttpError(400, "El commit tiene que ser su código (7 a 40 letras y números).");
    set.codeCommit = commit || null;
    set.codeFixedAt = commit ? new Date() : null;
    set.status = commit ? "aplicado" : report.status === "aplicado" ? "clasificado" : report.status;
    if (commit) set.fixKind = "codigo";
  }
  if (patch.codeNote !== undefined) set.codeNote = patch.codeNote?.slice(0, 1000) || null;
  if (patch.problemType !== undefined) {
    if (!isProblemType(patch.problemType)) throw new HttpError(400, "Tipo de problema no válido.");
    set.problemType = patch.problemType;
  }
  if (patch.fixKind !== undefined) {
    if (!(patch.fixKind in FIX_KINDS)) throw new HttpError(400, "No válido.");
    set.fixKind = patch.fixKind;
  }
  if (patch.status === "sin_arreglo" || patch.status === "clasificado") set.status = patch.status;
  await getDb().update(schema.problemReports).set(set).where(eq(schema.problemReports.id, reportId));
}

/** El dueño retira, reactiva o reescribe una corrección (versión nueva). */
export async function updateCorrection(owner: AuthUser, key: string, patch: { active?: boolean; directive?: string; note?: string }): Promise<void> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const versions = (await allCorrections()).filter((c) => c.key === key);
  const last = versions.at(-1);
  if (!last) throw new HttpError(404, "No existe esa corrección.");
  if (typeof patch.directive === "string" && patch.directive.trim() && patch.directive.trim() !== last.directive) {
    await getDb().transaction((tx) => reviseCorrection(tx, last, patch.directive!, patch.note ?? last.note, owner.id || null));
    return;
  }
  if (typeof patch.active === "boolean") await setCorrectionActive(key, patch.active);
}

/** La cola de arreglos de código en Markdown, para que una sesión de Claude la lea y los arregle. */
export async function codeQueueMarkdown(owner: AuthUser): Promise<string> {
  const view = await mejorasView(owner);
  const pending = view.reports.filter((r) => view.codeQueue.includes(r.id));
  if (pending.length === 0) return "# Arreglos de código pendientes\n\nNinguno.\n";
  const lines = ["# Arreglos de código pendientes", "", "Al arreglar uno: commit en `main` y apuntar el commit en «Mejoras» (o `PATCH /api/mejoras/<id>` con `{ codeCommit }`).", ""];
  for (const r of pending) {
    lines.push(
      `## Reporte #${r.id} · ${typeLabel(r.problemType)} · ${r.stage}`,
      `- Quién y cuándo: ${r.authorName}, ${r.createdAt.toISOString()} (web ${r.appVersion})`,
      r.videoId ? `- Vídeo ${r.videoId}${r.videoTitle ? ` «${r.videoTitle}»` : ""}${r.versionLabel ? ` · ${r.versionLabel}` : ""}` : "",
      r.page ? `- Página: ${r.page}` : "",
      `- Dice: ${r.body.replace(/\n+/g, " ")}`,
      r.cause ? `- Causa probable: ${r.cause}` : "",
      "",
    );
  }
  return lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
}

/**
 * Una vez por `key` (reparaciones al arrancar el worker): deja en Mejoras el reporte de un problema que el dueño
 * pidió arreglar por otra vía (el coordinador), ligado al montaje que lo tenía, ya clasificado y con la corrección
 * de código aplicada (`codeCommit` = la versión desplegada). Así queda la prueba de que se aprendió y entra en la
 * medición como cualquier arreglo de código.
 */
export async function recordAppliedFixOnce(
  key: string,
  input: { videoId: number; editStorageKey: string; problemType: ProblemType; body: string; cause: string; note: string },
  now: Date = new Date(),
): Promise<number | null> {
  if (await getSetting<string>(key)) return null;
  await setSetting(key, now.toISOString());
  const db = getDb();
  const [video] = await db
    .select({ createdBy: schema.videos.createdBy, productId: schema.videos.productId, batchId: schema.videos.batchId })
    .from(schema.videos)
    .where(eq(schema.videos.id, input.videoId));
  if (!video) return null;
  const [edit] = await db
    .select({ id: schema.edits.id, version: schema.edits.version })
    .from(schema.edits)
    .where(and(eq(schema.edits.videoId, input.videoId), eq(schema.edits.storageKey, input.editStorageKey)))
    .limit(1);
  const version = appVersion();
  const [row] = await db
    .insert(schema.problemReports)
    .values({
      createdBy: video.createdBy,
      stage: "montaje",
      body: input.body.slice(0, MAX_REPORT_CHARS),
      videoId: input.videoId,
      editId: edit?.id ?? null,
      batchId: video.batchId,
      productId: video.productId,
      page: `/videos/${input.videoId}`,
      versionLabel: edit ? `montaje v${edit.version} (${input.editStorageKey})` : input.editStorageKey,
      appVersion: version,
      status: "aplicado",
      problemType: input.problemType,
      fixKind: "codigo",
      cause: input.cause,
      classifiedAt: now,
      codeCommit: version,
      codeFixedAt: now,
      codeNote: input.note,
      updatedAt: now,
    })
    .returning({ id: schema.problemReports.id });
  console.log(`[mejoras] Reporte ${row.id} (${key}): vídeo ${input.videoId}, ${input.editStorageKey}, arreglo de código ${version}.`);
  return row.id;
}
