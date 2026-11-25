import { describe, expect, it } from "vitest";
import {
  betaCdf,
  inheritedFor,
  nextPillar,
  pAboveHalf,
  pieceStats,
  scorePosts,
  shareAt,
  splitCandidates,
  views72,
  windowReading,
  winningTexts,
  type ModelAccount,
  type ModelPost,
} from "@/server/videos/cerebro/modelo";

const NOW = new Date("2026-11-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000);

const accounts: ModelAccount[] = [
  { id: 1, handle: "eiswerrk", productId: 2, kind: "propia" },
  { id: 2, handle: "haarzauberr", productId: 12, kind: "propia" },
  { id: 3, handle: "itswollzauber", productId: 99, kind: "propia" },
];

let next = 1;
function post(accountId: number, productId: number, views72: number, dna: ModelPost["dna"], over: Partial<ModelPost> = {}): ModelPost {
  const id = next++;
  return { id, accountId, productId, shortcode: `c${id}`, url: null, videoId: null, publishedAt: daysAgo(5), excluded: false, dna, readings: [{ ageHours: 72, views: views72, comments: Math.round(views72 / 200) }], ...over };
}

describe("cerebro de cuentas: modelo", () => {
  it("la beta regularizada da los valores conocidos", () => {
    expect(betaCdf(0.5, 1, 1)).toBeCloseTo(0.5, 6);
    expect(betaCdf(0.3, 2, 5)).toBeCloseTo(0.579825, 5);
    expect(pAboveHalf(8, 2)).toBeGreaterThan(0.97);
    expect(pAboveHalf(2, 8)).toBeLessThan(0.03);
  });

  it("ventanas de 24/48/72 h solo con lecturas a ±8 h; sin 72 h, se corrige por la curva", () => {
    const readings = [
      { ageHours: 20, views: 1000, comments: 3 },
      { ageHours: 50, views: 1800, comments: 5 },
    ];
    expect(windowReading(readings, 24)?.views).toBe(1000);
    expect(windowReading(readings, 72)).toBeNull();
    const v = views72(readings)!;
    expect(v.exact).toBe(false);
    expect(v.views).toBe(Math.round(1800 / shareAt(50)));
    expect(views72([{ ageHours: 70, views: 5000, comments: null }])).toEqual({ views: 5000, exact: true });
  });

  it("un reel es éxito si supera la mediana de su cuenta; con pocos reels, la de su producto o la global", () => {
    const list = [1000, 2000, 3000, 4000, 20000].map((v) => post(1, 2, v, { angulo: "regalo" }));
    const lonely = post(3, 99, 5000, { angulo: "regalo" });
    const scored = scorePosts(accounts, [...list, lonely]);
    const top = scored.find((p) => p.id === list[4].id)!;
    expect(top).toMatchObject({ baseline: 3000, baselineFrom: "cuenta", hit: true });
    expect(top.ratio).toBeCloseTo(20000 / 3000);
    expect(scored.find((p) => p.id === lonely.id)).toMatchObject({ baselineFrom: "global", hit: true });
  });

  it("una cuenta pequeña con pocos reels no parece viral solo por compararse con la mediana global", () => {
    const big = [100000, 200000, 300000, 400000, 500000].map((v) => post(1, 2, v, {}));
    const small = [150, 200, 250].map((v) => post(3, 99, v, {}));
    const scored = scorePosts(accounts, [...big, ...small]);
    const mid = scored.find((p) => p.id === small[1].id)!;
    // Mezcla 3/5 de su mediana (200) con 2/5 de la global (≈250.000 en escala log): sigue cerca de su tamaño.
    expect(mid.baseline!).toBeLessThan(5000);
    expect(mid.baseline!).toBeGreaterThan(200);
    expect(scored.find((p) => p.id === small[2].id)!.hit).toBe(false);
  });

  it("ángulos: el que gana una y otra vez se recomienda; una cuenta nueva hereda de su producto o del global", () => {
    const posts = [
      ...[9000, 8000, 7000, 9500].map((v) => post(1, 2, v, { angulo: "Regalo de Navidad", fondo: "salón" })),
      ...[1000, 1200, 900, 1100].map((v) => post(1, 2, v, { angulo: "tutorial", fondo: "cocina" })),
      ...[5000, 600].map((v) => post(2, 12, v, { angulo: "regalo de navidad" })),
    ];
    const stats = pieceStats(scorePosts(accounts, posts));
    const regalo = stats.global.find((s) => s.key === "angulo" && s.value.toLowerCase() === "regalo de navidad")!;
    const tutorial = stats.global.find((s) => s.key === "angulo" && s.value === "tutorial")!;
    expect(regalo.n).toBe(6);
    expect(regalo.verdict).toBe("recomendado");
    expect(tutorial.verdict).toBe("evitar");
    expect(regalo.postIds).toHaveLength(6);
    // WollZauber (sin reels) hereda: no tiene su propia lista, así que usa la global.
    expect(inheritedFor(accounts[2], stats)).toBe(stats.global);
    // La cuenta de EisWerk se apoya en su producto: el regalo también se recomienda allí.
    expect(stats.byAccount.get(1)!.find((s) => s.key === "angulo" && s.value === "Regalo de Navidad")).toMatchObject({ verdict: "recomendado" });
  });

  it("regla de split test de Codex: primero solo el gancho; el texto solo si el gancho volvió a funcionar", () => {
    expect(nextPillar([])).toMatchObject({ pillar: "gancho", step: 1 });
    expect(nextPillar([{ basePostId: 1, pillar: "gancho", step: 1, won: null }]).pillar).toBeNull();
    expect(nextPillar([{ basePostId: 1, pillar: "gancho", step: 1, won: false }])).toMatchObject({ pillar: null });
    expect(nextPillar([{ basePostId: 1, pillar: "gancho", step: 1, won: true }])).toMatchObject({ pillar: "texto", step: 2 });
    expect(nextPillar([{ basePostId: 1, pillar: "gancho", step: 1, won: true }, { basePostId: 1, pillar: "texto", step: 2, won: true }])).toMatchObject({ pillar: "fondo", step: 3 });
  });

  it("candidatos: reels propios que superan 1,5× su mediana y tienen 48 h; textos ganadores ordenados", () => {
    const posts = [1000, 1100, 1200, 1300, 1400].map((v) => post(1, 2, v, { texto: "normal" }));
    const star = post(1, 2, 6000, { texto: "Mein Mann wollte es zuerst nicht 😅" });
    const fresh = post(1, 2, 9000, { texto: "nuevo" }, { publishedAt: new Date(NOW.getTime() - 10 * 3600 * 1000) });
    const scored = scorePosts(accounts, [...posts, star, fresh]);
    const cands = splitCandidates(accounts, scored, [], NOW);
    expect(cands.map((c) => c.post.id)).toEqual([star.id]);
    expect(cands[0]).toMatchObject({ pillar: "gancho", step: 1 });
    const texts = winningTexts(scored, pieceStats(scored).global);
    expect(texts[0]).toMatchObject({ text: "nuevo" });
    expect(texts.map((t) => t.text)).toContain("Mein Mann wollte es zuerst nicht 😅");
  });

  it("lo excluido (antes de count_from) no cuenta ni para la mediana ni como éxito", () => {
    const old = post(3, 99, 100000, { angulo: "otro producto" }, { excluded: true });
    const a = post(3, 99, 2000, { angulo: "x" });
    const scored = scorePosts(accounts, [old, a]);
    expect(scored.find((p) => p.id === old.id)!.hit).toBeNull();
    expect(pieceStats(scored).global.find((s) => s.value === "otro producto")).toBeUndefined();
  });
});
