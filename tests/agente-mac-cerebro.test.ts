import { expect, it } from "vitest";

import { enrichInstagramReels, gridViewsText, parseCount } from "../agente-mac/perfil.mjs";

it("lee en serie con pausas, solo los 12 más recientes, y continúa cuando falla un reel", async () => {
  const reels = Array.from({ length: 32 }, (_, i) => ({ url: `https://www.instagram.com/reel/REEL${i}/` }));
  const calls: string[] = [], pauses: number[] = [];
  let active = 0;
  await enrichInstagramReels(reels, {
    cookiesFile: "/sesion-fuera-del-repo",
    sleep: async (ms: number) => { pauses.push(ms); },
    readReel: async (url: string, options: { cookiesFile: string }) => {
      expect(active++).toBe(0);
      calls.push(url);
      expect(options.cookiesFile).toBe("/sesion-fuera-del-repo");
      await Promise.resolve();
      active--;
      if (url.includes("REEL1/")) throw new Error("No disponible");
      return { timestamp: 1795521600, comment_count: 0, like_count: 12, description: "Publicado" };
    },
  });
  expect(calls).toHaveLength(12);
  expect(pauses).toHaveLength(11);
  expect(reels[0]).toMatchObject({ comentarios: 0, megusta: 12, descripcion: "Publicado", fecha: expect.stringContaining("2026-") });
  expect(reels[1]).not.toHaveProperty("fecha");
  expect(reels[2]).toHaveProperty("fecha");
  expect(reels[12]).not.toHaveProperty("fecha");
});

it("conserva el sufijo de vistas separado por espacios", () => {
  expect(gridViewsText("36,4 mil")).toBe("36,4 mil");
  expect(parseCount(gridViewsText("36,4 mil"))).toBe(36400);
  expect(parseCount(gridViewsText("1,2 Mio."))).toBe(1200000);
});
