import { describe, expect, it } from "vitest";
import type { AnalysisPlace } from "@/server/videos/analysis";
import { clipPlaces, shortPlacePrompt, videoForKind } from "@/server/videos/tramos";
import type { Video } from "@/server/videos/videos";

const place = (startS: number, endS: number, name: string): AnalysisPlace => ({
  startS, endS, place: name, action: "take food out", keepObjects: ["fridge door"],
  ownerEnvironment: false, imagePrompt: "", videoPrompt: "",
});

describe("un frame, un clip y un Topaz por vídeo", () => {
  it.each([
    { video: 40, ms: 16650, sites: [place(0, 4.7, "apertura"), place(4.7, 8.2, "cocina"), place(8.2, 16.7, "salón")], shots: [0, 4.7, 5.5, 7, 8.2, 10, 13], short: [false, true, false] },
    { video: 45, ms: 15100, sites: [place(0, 4, "apertura"), place(4, 9, "cocina"), place(9, 15.1, "calle")], shots: [0, 4, 9], short: [false, true, true] },
    { video: 47, ms: 13800, sites: [place(0, 8.9, "apertura"), place(8.9, 13.8, "oficina")], shots: [0, 8.9, 11], short: [false, false] },
    { video: 38, ms: 15400, sites: [place(0, 5, "apertura"), place(5, 7.1, "cocina"), place(7.1, 8.2, "nevera")], shots: [0, 5, 7.1], short: [false, true, true] },
  ])("lote 10, vídeo $video: solo entornos de ≥2 tomas, ≥4 s y ≥25 %", ({ ms, sites, shots, short }) => {
    const found = clipPlaces(sites, ms, shots.map((startS) => ({ startS })))!;
    expect(found.map((p) => !!p.shortPlaces?.length)).toEqual(short);
    expect(found.map((p) => p.index)).toEqual(sites.map((_, index) => index));
    for (const p of found.filter((p) => p.shortPlaces?.length)) expect(shortPlacePrompt(p)).toContain(`the shot cuts to ${p.place}`);
  });
  it("incluye el límite exacto y excluye un sitio por debajo del 25 %", () => {
    const sites = [place(0, 1, "opening"), place(1, 5, "room")];
    const shots = [{ startS: 1 }, { startS: 3 }];
    expect(clipPlaces(sites, 16000, shots)![1].shortPlaces).toHaveLength(0);
    expect(clipPlaces(sites, 16001, shots)![1].shortPlaces).toHaveLength(1);
    expect(clipPlaces(sites, 16000, [{ startS: 1 }])![1].shortPlaces).toHaveLength(1);
  });
  it("clip y Topaz usan el vídeo original entero y rechazan todos los sufijos", async () => {
    const video = { id: 1, referenceMediaId: "whole-source", segmentDurationMs: 6000 } as Video;
    expect(await videoForKind(video, "clip")).toBe(video);
    expect(await videoForKind(video, "upscale")).toBe(video);
    for (const kind of ["frame:1", "clip:1", "upscale:1"] as const) {
      await expect(videoForKind(video, kind)).rejects.toMatchObject({ status: 409 });
    }
  });
});
