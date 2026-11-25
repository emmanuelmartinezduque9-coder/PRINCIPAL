/**
 * Modelo del «Cerebro de cuentas» (`docs/cerebro-cuentas.md`). Funciones puras, sin base de datos: reciben las cuentas
 * y los reels con sus lecturas y devuelven qué funciona, con qué probabilidad y qué probar. Solo vistas y comentarios
 * (orden de CEREBRO), nunca ventas.
 */

export const DNA_KEYS = ["angulo", "fondo", "texto", "cancion"] as const;
export type DnaKey = (typeof DNA_KEYS)[number];
export type Dna = Partial<Record<DnaKey, string | null>>;

export interface ModelAccount {
  id: number;
  handle: string;
  productId: number | null;
  kind: "propia" | "competidor";
}

export interface ModelReading {
  ageHours: number | null;
  views: number | null;
  comments: number | null;
}

export interface ModelPost {
  id: number;
  accountId: number;
  productId: number | null;
  shortcode: string;
  url: string | null;
  videoId: number | null;
  publishedAt: Date | null;
  excluded: boolean;
  dna: Dna;
  readings: ModelReading[];
}

/** Fuerza del prior que pasa de un nivel al siguiente (global → producto → cuenta), en «reels equivalentes». */
export const PRIOR_STRENGTH = 4;
/** Reels mínimos de una cuenta para usar su propia mediana. */
export const MIN_OWN_MEDIAN = 5;
/** Margen para dar por buena una lectura como de 24, 48 o 72 h. */
export const WINDOW_SLACK_H = 8;
export const RECOMMEND_P = 0.7;
export const AVOID_P = 0.3;
/** Un reel es candidato a split test si supera su mediana por este factor y tiene al menos 48 h. */
export const SPLIT_RATIO = 1.5;
export const SPLIT_MIN_AGE_H = 48;

// ───────────────────────── Vistas comparables ─────────────────────────

/**
 * Parte de las vistas de las 72 h que un reel suele tener a una edad dada. Curva fija (crece deprisa el primer día y
 * casi nada después), a falta de series propias: el histórico no tiene lecturas sistemáticas a 24/48/72 h.
 */
export function shareAt(ageHours: number): number {
  if (ageHours <= 0) return 0.05;
  if (ageHours <= 72) return Math.max(0.05, Math.pow(ageHours / 72, 0.35));
  return Math.pow(ageHours / 72, 0.08);
}

/** La lectura más cercana a esa edad, si está a ±8 h. */
export function windowReading(readings: ModelReading[], hours: number): ModelReading | null {
  let best: ModelReading | null = null;
  for (const r of readings) {
    if (r.ageHours === null || r.views === null) continue;
    const d = Math.abs(r.ageHours - hours);
    if (d <= WINDOW_SLACK_H && (best === null || d < Math.abs(best.ageHours! - hours))) best = r;
  }
  return best;
}

/**
 * Vistas a 72 h: la lectura de las 72 h si la hay; si no, la más cercana entre 24 h y 7 días corregida por la curva;
 * si no consta la edad, la última lectura tal cual (marcada como aproximada).
 */
export function views72(readings: ModelReading[]): { views: number; exact: boolean } | null {
  const exact = windowReading(readings, 72);
  if (exact) return { views: exact.views!, exact: true };
  const aged = readings.filter((r) => r.views !== null && r.ageHours !== null && r.ageHours >= 24 && r.ageHours <= 168);
  if (aged.length) {
    const r = aged.reduce((a, b) => (Math.abs(b.ageHours! - 72) < Math.abs(a.ageHours! - 72) ? b : a));
    return { views: Math.round(r.views! / shareAt(r.ageHours!)), exact: false };
  }
  const any = readings.filter((r) => r.views !== null);
  if (!any.length) return null;
  return { views: Math.max(...any.map((r) => r.views!)), exact: false };
}

/** Comentarios por cada 1.000 vistas en la lectura más reciente que tenga los dos datos. */
export function commentsPerK(readings: ModelReading[]): number | null {
  const both = readings.filter((r) => r.views !== null && r.views > 0 && r.comments !== null);
  if (!both.length) return null;
  const r = both.reduce((a, b) => ((b.ageHours ?? 0) > (a.ageHours ?? 0) ? b : a));
  return (r.comments! / r.views!) * 1000;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ───────────────────────── Beta ─────────────────────────

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Función beta incompleta regularizada I_x(a, b) = P(θ ≤ x) para θ ~ Beta(a, b). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(θ > 0,5): probabilidad de que lo que tiene esta pieza supere la mediana. */
export const pAboveHalf = (a: number, b: number) => 1 - betaCdf(0.5, a, b);

// ───────────────────────── Éxitos y piezas ─────────────────────────

export interface ScoredPost extends ModelPost {
  v72: number | null;
  v72Exact: boolean;
  w24: number | null;
  w48: number | null;
  w72: number | null;
  cpk: number | null;
  /** La mediana con la que se compara (de su cuenta, de su producto o global) y de dónde sale. */
  baseline: number | null;
  baselineFrom: "cuenta" | "producto" | "global" | null;
  ratio: number | null;
  hit: boolean | null;
  commentHit: boolean | null;
}

/**
 * Mediana de referencia de una cuenta. Con 5 reels o más, la suya. Con menos, se mezcla en escala logarítmica con la de
 * su producto (o la global) en proporción a los reels que tiene: las cuentas van de cientos a cientos de miles de
 * vistas, así que comparar una cuenta pequeña con la mediana global la haría parecer viral (o muerta) sin serlo.
 */
export function baselineFor(acc: number[], prod: number[], globalMedian: number | null): [number | null, ScoredPost["baselineFrom"]] {
  const own = median(acc);
  if (acc.length >= MIN_OWN_MEDIAN) return [own, "cuenta"];
  const [parent, from] = prod.length >= MIN_OWN_MEDIAN ? [median(prod), "producto" as const] : [globalMedian, "global" as const];
  if (parent === null || parent <= 0) return [own, acc.length ? "cuenta" : null];
  if (own === null || own <= 0) return [parent, from];
  const w = acc.length / MIN_OWN_MEDIAN;
  return [Math.exp(w * Math.log(own) + (1 - w) * Math.log(parent)), from];
}

/** Vistas comparables, mediana de referencia y si es un éxito (vistas) y un éxito de comentarios. */
export function scorePosts(accounts: ModelAccount[], posts: ModelPost[]): ScoredPost[] {
  const own = new Set(accounts.filter((a) => a.kind === "propia").map((a) => a.id));
  const base = posts.map((p) => {
    const v = views72(p.readings);
    return { ...p, v72: v?.views ?? null, v72Exact: v?.exact ?? false, w24: windowReading(p.readings, 24)?.views ?? null, w48: windowReading(p.readings, 48)?.views ?? null, w72: windowReading(p.readings, 72)?.views ?? null, cpk: commentsPerK(p.readings) };
  });
  const counted = base.filter((p) => !p.excluded && p.v72 !== null);
  const byAccount = new Map<number, number[]>();
  const byProduct = new Map<number, number[]>();
  for (const p of counted) {
    byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p.v72!]);
    if (p.productId !== null && own.has(p.accountId)) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p.v72!]);
  }
  const globalMedian = median(counted.filter((p) => own.has(p.accountId)).map((p) => p.v72!));
  const cpkByAccount = new Map<number, number[]>();
  for (const p of counted) if (p.cpk !== null) cpkByAccount.set(p.accountId, [...(cpkByAccount.get(p.accountId) ?? []), p.cpk]);
  return base.map((p) => {
    const acc = byAccount.get(p.accountId) ?? [];
    const prod = p.productId !== null ? byProduct.get(p.productId) ?? [] : [];
    const [baseline, baselineFrom] = baselineFor(acc, prod, globalMedian);
    const ratio = p.v72 !== null && baseline ? p.v72 / baseline : null;
    const cpkMedian = median(cpkByAccount.get(p.accountId) ?? []);
    return {
      ...p,
      baseline,
      baselineFrom,
      ratio,
      hit: p.excluded || ratio === null ? null : ratio > 1,
      commentHit: p.excluded || p.cpk === null || cpkMedian === null ? null : p.cpk > cpkMedian,
    };
  });
}

export type Verdict = "recomendado" | "evitar" | "por_probar";

export interface PieceStat {
  key: DnaKey;
  value: string;
  /** Reels con esa pieza en ese nivel (y cuántos fueron éxito). */
  n: number;
  hits: number;
  /** Media posterior y probabilidad de superar la mediana. */
  mean: number;
  p: number;
  verdict: Verdict;
  /** Reels en que se basa (ids), para citarlos. */
  postIds: number[];
}

const norm = (v: string | null | undefined) => (typeof v === "string" ? v.trim().toLowerCase() : "");

function verdictOf(p: number, n: number): Verdict {
  if (n >= 2 && p >= RECOMMEND_P) return "recomendado";
  if (n >= 2 && p <= AVOID_P) return "evitar";
  return "por_probar";
}

/**
 * Beta-binomial jerárquico por pieza de ADN: global → producto → cuenta. Cada nivel usa como prior la media del de
 * arriba con fuerza `PRIOR_STRENGTH`; una cuenta sin reels hereda la de su producto (o la global).
 */
export function pieceStats(
  scored: ScoredPost[],
  outcome: (p: ScoredPost) => boolean | null = (p) => p.hit,
): { global: PieceStat[]; byProduct: Map<number, PieceStat[]>; byAccount: Map<number, PieceStat[]> } {
  const rows = scored.filter((p) => outcome(p) !== null);
  type Acc = { s: number; n: number; ids: number[]; label: string };
  const tally = (list: ScoredPost[]) => {
    const out = new Map<string, Acc>();
    for (const p of list)
      for (const key of DNA_KEYS) {
        const label = p.dna[key];
        const v = norm(label);
        if (!v) continue;
        const k = `${key}\u0000${v}`;
        const a = out.get(k) ?? { s: 0, n: 0, ids: [], label: label!.trim() };
        a.n += 1;
        if (outcome(p)) a.s += 1;
        a.ids.push(p.id);
        out.set(k, a);
      }
    return out;
  };
  const toStat = (k: string, a: Acc, alpha: number, beta: number): PieceStat => {
    const [key] = k.split("\u0000") as [DnaKey];
    const A = alpha + a.s;
    const B = beta + (a.n - a.s);
    const p = pAboveHalf(A, B);
    return { key, value: a.label, n: a.n, hits: a.s, mean: A / (A + B), p, verdict: verdictOf(p, a.n), postIds: a.ids };
  };
  const globalTally = tally(rows);
  const globalMean = new Map<string, number>();
  const global: PieceStat[] = [];
  for (const [k, a] of globalTally) {
    const st = toStat(k, a, 1, 1);
    global.push(st);
    globalMean.set(k, st.mean);
  }
  const prior = (mean: number | undefined) => {
    const m = mean ?? 0.5;
    return [PRIOR_STRENGTH * m, PRIOR_STRENGTH * (1 - m)] as const;
  };
  const byProduct = new Map<number, PieceStat[]>();
  const productMean = new Map<string, number>();
  for (const pid of new Set(rows.flatMap((p) => (p.productId === null ? [] : [p.productId])))) {
    const list: PieceStat[] = [];
    for (const [k, a] of tally(rows.filter((p) => p.productId === pid))) {
      const st = toStat(k, a, ...prior(globalMean.get(k)));
      list.push(st);
      productMean.set(`${pid}\u0000${k}`, st.mean);
    }
    byProduct.set(pid, sortStats(list));
  }
  const byAccount = new Map<number, PieceStat[]>();
  for (const aid of new Set(rows.map((p) => p.accountId))) {
    const own = rows.filter((p) => p.accountId === aid);
    const pid = own.find((p) => p.productId !== null)?.productId ?? null;
    const list: PieceStat[] = [];
    for (const [k, a] of tally(own)) list.push(toStat(k, a, ...prior((pid !== null ? productMean.get(`${pid}\u0000${k}`) : undefined) ?? globalMean.get(k))));
    byAccount.set(aid, sortStats(list));
  }
  return { global: sortStats(global), byProduct, byAccount };
}

const sortStats = (list: PieceStat[]) => [...list].sort((a, b) => b.p - a.p || b.n - a.n);

/** Lo que hereda una cuenta sin reels: las piezas de su producto o, si no hay, las globales. */
export function inheritedFor(account: ModelAccount, stats: ReturnType<typeof pieceStats>): PieceStat[] {
  return stats.byAccount.get(account.id) ?? (account.productId !== null ? stats.byProduct.get(account.productId) : undefined) ?? stats.global;
}

// ───────────────────────── Split tests ─────────────────────────

export const PILLARS = ["gancho", "texto", "fondo", "cancion"] as const;
export type Pillar = (typeof PILLARS)[number];

export interface SplitHistory {
  basePostId: number;
  pillar: Pillar;
  step: number;
  /** `null` mientras sus reels no tienen 72 h; `true` si volvió a superar la mediana. */
  won: boolean | null;
}

export interface SplitCandidate {
  post: ScoredPost;
  /** El pilar que toca ahora y por qué; `null` si el concepto no se confirmó (no seguir variándolo). */
  pillar: Pillar | null;
  step: number;
  why: string;
}

/**
 * Regla de Codex (`SplitTesting-20261029/pilot-six/REGLA_FIJA.md`): paso 1, solo el gancho (Genjutsu Motion Transfer,
 * mismo texto, canción y edición); paso 2, solo si el paso 1 vuelve a funcionar, variación mínima del texto; después
 * fondo y canción. Nunca se sustituye el paso 1 por un cambio de descripción.
 */
export function nextPillar(history: SplitHistory[]): { pillar: Pillar | null; step: number; why: string } {
  const done = [...history].sort((a, b) => a.step - b.step);
  const last = done[done.length - 1];
  if (!last) return { pillar: "gancho", step: 1, why: "Paso 1: cambia solo el gancho y conserva texto, canción y edición." };
  if (last.won === null) return { pillar: null, step: last.step, why: `El paso ${last.step} (${last.pillar}) aún no tiene 72 h.` };
  if (!last.won) return { pillar: null, step: last.step, why: `El paso ${last.step} (${last.pillar}) no volvió a funcionar: no se sigue variando este concepto.` };
  const next = PILLARS[PILLARS.indexOf(last.pillar) + 1];
  if (!next) return { pillar: null, step: last.step, why: "Ya se probaron los cuatro pilares." };
  const why = next === "texto" ? "Paso 2: el gancho volvió a funcionar; varía el texto mínimamente (mismo significado)." : `Paso ${last.step + 1}: renueva el ${next} y conserva lo demás.`;
  return { pillar: next, step: last.step + 1, why };
}

/** Los mejores reels propios para split test: superan 1,5× su mediana, con al menos 48 h; uno por original. */
export function splitCandidates(accounts: ModelAccount[], scored: ScoredPost[], history: SplitHistory[], now: Date, limit = 6): SplitCandidate[] {
  const own = new Set(accounts.filter((a) => a.kind === "propia").map((a) => a.id));
  return scored
    .filter((p) => own.has(p.accountId) && !p.excluded && p.ratio !== null && p.ratio >= SPLIT_RATIO)
    .filter((p) => p.publishedAt === null || (now.getTime() - p.publishedAt.getTime()) / 3_600_000 >= SPLIT_MIN_AGE_H)
    .sort((a, b) => b.ratio! - a.ratio!)
    .map((post) => ({ post, ...nextPillar(history.filter((h) => h.basePostId === post.id)) }))
    .filter((c) => c.pillar !== null || history.some((h) => h.basePostId === c.post.id))
    .slice(0, limit);
}

/** Textos en pantalla de los reels con éxito, del mejor al peor (con la probabilidad de su pieza «texto»). */
export function winningTexts(scored: ScoredPost[], stats: PieceStat[], limit = 10): Array<{ text: string; ratio: number; postId: number; p: number | null }> {
  const pOf = new Map(stats.filter((s) => s.key === "texto").map((s) => [norm(s.value), s.p]));
  return scored
    .filter((p) => p.hit && p.dna.texto && p.ratio !== null)
    .sort((a, b) => b.ratio! - a.ratio!)
    .slice(0, limit)
    .map((p) => ({ text: p.dna.texto!.trim(), ratio: p.ratio!, postId: p.id, p: pOf.get(norm(p.dna.texto)) ?? null }));
}
