import { describe, expect, it } from "vitest";
import { placeChanges } from "@/server/videos/clip";

// Lote 10, vídeo 49 (FalterPfote): con un solo clip se perdían los cambios de cada sitio y salía el pomerania de la fuente.
describe("cambios de cada sitio en el clip único", () => {
  const prompt = "Use the source video as the authority for all actions. Image [1] is the approved opening frame: keep its composition. Replace the white gift box and cables of the source with the navy carton of image [4]. Replace the pomeranian by a fawn-and-white corgi, the flag blanket by a plain grey throw and remove any picture with people. Remove all captions, subtitles and emojis from the source. Make the street a Berlin residential street with German plates.";
  it("lleva las sustituciones del sitio con su tramo y su foto", () => {
    const out = placeChanges(prompt, 6, 1400, 2400);
    expect(out).toContain("Changes from 1.4s to 2.4s");
    expect(out).toContain("Replace the pomeranian by a fawn-and-white corgi");
    expect(out).toContain("Make the street a Berlin residential street");
    expect(out).not.toContain("captions");
    expect(out).not.toContain("approved opening frame");
  });
  it("image [1] del tramo pasa a la foto del sitio", () => {
    expect(placeChanges("Replace the dog of image [1] with a corgi.", 7, 0, 1000)).toContain("image [7]");
  });
  it("sin prompt del sitio, nada", () => {
    expect(placeChanges("", 6, 0, 1000)).toBe("");
    expect(placeChanges(undefined, 6, 0, 1000)).toBe("");
  });
});
