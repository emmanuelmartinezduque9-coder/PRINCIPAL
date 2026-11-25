import { expect, it } from "vitest";
import { profileDataOf } from "@/server/link-profiles";

it("limpia contadores y fechas del Mac conservando cero y ausencia", () => {
  const data = profileDataOf({ red: "instagram", reels: [
    { url: "https://www.instagram.com/reel/A/", vistas: 36400, vistasTexto: "36,4 mil", fecha: "2026-11-24T12:00:00Z", comentarios: 0, megusta: null, descripcion: "Publicado" },
    { url: "https://www.instagram.com/reel/B/", vistas: -1, fecha: "inválida", comentarios: 1.2, megusta: -1 },
    { url: "javascript:alert(1)" },
  ] });
  expect(data?.reels).toHaveLength(2);
  expect(data?.reels[0]).toMatchObject({ fecha: "2026-11-24T12:00:00.000Z", comentarios: 0, megusta: null, descripcion: "Publicado", rounded: true });
  expect(data?.reels[1]).toMatchObject({ fecha: null, comentarios: null, megusta: null, vistas: null });
});
