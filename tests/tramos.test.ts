import { describe, expect, it } from "vitest";
import type { AnalysisPlace } from "@/server/videos/analysis";
import { clipPlaces, shortPlacePrompt, videoForKind } from "@/server/videos/tramos";
import type { Video } from "@/server/videos/videos";

const place = (startS: number, endS: number, name: string): AnalysisPlace => ({
  startS, endS, place: name, action: "take food out", keepObjects: ["fridge door"],
  ownerEnvironment: false, imagePrompt: "", videoPrompt: "",
});

describe("un frame, un clip y un Topaz por vídeo", () => {
  it("conserva índices y tiempos absolutos: ≥ 2 tomas o ≥ 3 s llevan referencias", () => {
    const sites = clipPlaces([place(0, 3, "room"), place(3, 5, "street"), place(5, 6, "fridge")], 6000,
      [{ startS: 0 }, { startS: 3 }, { startS: 4 }, { startS: 5 }])!;
    expect(sites.map((p) => [p.index, p.startMs, p.endMs, p.shortPlaces?.length])).toEqual([
      [0, 0, 3000, 0], [1, 3000, 5000, 0], [2, 5000, 6000, 1],
    ]);
    expect(shortPlacePrompt(sites[2])).toContain("From 5s to 6s the shot cuts to fridge: keep fridge door and the action (take food out) exactly there");
  });
  it("una toma de menos de 3 s es corta y no necesita prompts de frame", () => {
    const sites = clipPlaces([place(0, 1, "room"), place(1, 3.999, "street"), place(3.999, 7, "kitchen")], 7000)!;
    expect(sites[1].shortPlaces).toHaveLength(1);
    expect(sites[2].shortPlaces).toHaveLength(0);
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
