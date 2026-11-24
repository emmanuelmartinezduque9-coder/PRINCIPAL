import type { ProblemType } from "@/lib/mejoras";

/**
 * Las cuentas de «Mejoras»: si una corrección (regla/prompt o arreglo de código) mejora de verdad.
 * Todo son funciones puras sobre registros ya leídos de la base de datos (`loadStageRecords` en
 * `evidence.ts`), para poder probarlas sin base de datos. Ver `docs/decisiones-mejoras.md`.
 */

/** Mínimo de vídeos después del cambio para dar un veredicto; antes, «midiendo». */
export const MIN_AFTER = 5;
/** Mínimo de vídeos de antes con los que comparar. */
export const MIN_BEFORE = 3;
/** Cuántos vídeos de antes se comparan como mucho (los más recientes). */
export const MAX_BEFORE = 40;
/** Ventana de «antes» de un arreglo de código. */
export const CODE_BEFORE_DAYS = 30;

export type Stage = "frame" | "clip" | "montaje" | "doblaje";

/**
 * Lo que pasó en un paso de un vídeo: la imagen inicial o el clip (por rondas), o el montaje (por montajes hechos;
 * `montaje` y `doblaje` son el mismo montaje visto desde las correcciones de rótulos o de doblaje).
 */
export interface StageRecord {
  videoId: number;
  productId: number;
  stage: Stage;
  /** Cuándo se pidió la primera ronda. */
  firstAt: Date;
  /** Ya hay un veredicto de la persona: un resultado aprobado o al menos un rechazo suyo. */
  decided: boolean;
  /** El resultado aprobado es de la primera ronda y no hubo rechazos de la persona. */
  firstAccepted: boolean;
  /** Rondas rechazadas por la persona (los rechazos del sistema no cuentan). */
  regenerations: number;
  /** Tipo de cada problema: rechazos clasificados, bloqueos de Higgsfield y reportes de ese paso. */
  problems: ProblemType[];
  /** El prompt de cada ronda, la primera la primera (imagen y clip). */
  prompts: string[];
  /** Correcciones aprendidas que usó cada intento, el primero el primero (montaje: `edit_runs.learned_corrections`). */
  applied?: number[][];
}

export interface SideStats {
  videos: number;
  firstPassRate: number | null;
  regenerationsPerVideo: number | null;
  /** Parte de los vídeos con al menos un problema del tipo de la corrección. */
  typeRate: number | null;
  /** Vídeos en los que se basa (para citarlos). */
  videoIds: number[];
  /** Vídeos con un problema de ese tipo. */
  withProblem: number[];
}

export type Verdict = "midiendo" | "mejora" | "no_mejora";

export interface Evaluation {
  before: SideStats;
  after: SideStats;
  verdict: Verdict;
  /** Por qué ese veredicto, en español sencillo. */
  reason: string;
}

const ratio = (part: number, total: number) => (total === 0 ? null : part / total);

export function sideStats(records: StageRecord[], type: ProblemType): SideStats {
  const decided = records.filter((r) => r.decided);
  const withProblem = decided.filter((r) => r.problems.includes(type)).map((r) => r.videoId);
  return {
    videos: decided.length,
    firstPassRate: ratio(decided.filter((r) => r.firstAccepted).length, decided.length),
    regenerationsPerVideo: ratio(
      decided.reduce((sum, r) => sum + r.regenerations, 0),
      decided.length,
    ),
    typeRate: ratio(withProblem.length, decided.length),
    videoIds: decided.map((r) => r.videoId),
    withProblem,
  };
}

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);

/**
 * Veredicto: solo «mejora» si, con suficientes vídeos a cada lado, baja la parte de vídeos con ese
 * problema y no empeora la aceptación a la primera. Si no, «no_mejora». Con pocos vídeos, «midiendo».
 */
export function verdictOf(before: SideStats, after: SideStats, typeLabel: string): { verdict: Verdict; reason: string } {
  if (after.videos < MIN_AFTER) {
    return { verdict: "midiendo", reason: `Faltan vídeos: hay ${after.videos} con el cambio y hacen falta ${MIN_AFTER}.` };
  }
  if (before.videos < MIN_BEFORE) {
    return { verdict: "midiendo", reason: `Hay pocos vídeos de antes del cambio con los que comparar (${before.videos}).` };
  }
  const fewer = (after.typeRate ?? 0) < (before.typeRate ?? 0);
  const notWorse = (after.firstPassRate ?? 0) >= (before.firstPassRate ?? 0);
  const numbers = `«${typeLabel}»: ${pct(before.typeRate)} → ${pct(after.typeRate)}; aceptados a la primera: ${pct(before.firstPassRate)} → ${pct(after.firstPassRate)}.`;
  if (fewer && notWorse) return { verdict: "mejora", reason: `Mejora. ${numbers}` };
  if (!fewer) return { verdict: "no_mejora", reason: `No baja el problema. ${numbers}` };
  return { verdict: "no_mejora", reason: `Baja el problema pero se aceptan menos a la primera. ${numbers}` };
}

export interface CorrectionVersion {
  id?: number;
  stage: Stage;
  productId: number | null;
  directive: string;
  createdAt: Date;
}

/**
 * Evalúa una corrección (todas sus versiones): después = vídeos cuya primera ronda llevó el texto de
 * alguna versión en el prompt (o cuyo primer montaje la usó); antes = los vídeos anteriores a la primera versión, del mismo paso y del
 * mismo producto si la corrección es de un producto (los `MAX_BEFORE` más recientes).
 */
export function evaluateCorrection(
  versions: CorrectionVersion[],
  type: ProblemType,
  typeLabel: string,
  records: StageRecord[],
): Evaluation {
  if (versions.length === 0) throw new Error("Una corrección sin versiones.");
  const { stage, productId } = versions[0];
  const start = Math.min(...versions.map((v) => v.createdAt.getTime()));
  const directives = versions.map((v) => v.directive);
  const scoped = records.filter((r) => r.stage === stage && (productId === null || r.productId === productId));
  const ids = versions.map((v) => v.id).filter((id): id is number => id !== undefined);
  const inPrompt = (prompt: string | undefined) => prompt !== undefined && directives.some((d) => prompt.includes(d));
  const inApplied = (list: number[] | undefined) => list !== undefined && list.some((id) => ids.includes(id));
  // Imagen y clip: el texto va literal en el prompt guardado. Montaje: el montaje apunta qué correcciones usó.
  const carried = (r: StageRecord) => inPrompt(r.prompts[0]) || inApplied(r.applied?.[0]);
  const ever = (r: StageRecord) => r.prompts.some(inPrompt) || (r.applied ?? []).some(inApplied);
  const after = scoped.filter(carried);
  const before = scoped
    .filter((r) => r.firstAt.getTime() < start && !ever(r))
    .sort((a, b) => b.firstAt.getTime() - a.firstAt.getTime())
    .slice(0, MAX_BEFORE);
  const b = sideStats(before, type);
  const a = sideStats(after, type);
  return { before: b, after: a, ...verdictOf(b, a, typeLabel) };
}

/**
 * Evalúa un arreglo de código: vídeos empezados en los `CODE_BEFORE_DAYS` días antes del arreglo frente
 * a los empezados después. Cuenta cualquier paso (imagen o clip) y, para el problema, también los
 * reportes de esos vídeos (`extraProblems`: vídeo → tipos reportados, p. ej. audio del montaje).
 */
export function evaluateCodeFix(
  fixedAt: Date,
  type: ProblemType,
  typeLabel: string,
  records: StageRecord[],
  extraProblems: Map<number, ProblemType[]>,
): Evaluation {
  // Un registro por vídeo: lo que pasó en todos sus pasos.
  const byVideo = new Map<number, StageRecord>();
  // `doblaje` es el mismo montaje que `montaje`: no se cuenta dos veces.
  for (const r of records.filter((record) => record.stage !== "doblaje")) {
    const seen = byVideo.get(r.videoId);
    if (!seen) {
      byVideo.set(r.videoId, { ...r, problems: [...r.problems, ...(extraProblems.get(r.videoId) ?? [])] });
      continue;
    }
    seen.firstAt = seen.firstAt < r.firstAt ? seen.firstAt : r.firstAt;
    seen.decided = seen.decided || r.decided;
    seen.firstAccepted = seen.firstAccepted && r.firstAccepted;
    seen.regenerations += r.regenerations;
    seen.problems.push(...r.problems);
  }
  const all = [...byVideo.values()];
  const from = fixedAt.getTime() - CODE_BEFORE_DAYS * 24 * 3600 * 1000;
  const before = all.filter((r) => r.firstAt.getTime() >= from && r.firstAt < fixedAt);
  const after = all.filter((r) => r.firstAt >= fixedAt);
  const b = sideStats(before, type);
  const a = sideStats(after, type);
  return { before: b, after: a, ...verdictOf(b, a, typeLabel) };
}
