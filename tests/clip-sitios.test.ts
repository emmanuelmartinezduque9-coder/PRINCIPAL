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

// EisWerk, lote 10 (26/11/2026): eligió la variante amarilla y en parte del vídeo salía la rosa de la referencia.
import { productEverywhere, wholeVideoPreamble } from "@/server/videos/clip";
describe("la variante elegida en todo el vídeo", () => {
  const manifest = [
    { index: 1, tag: "image [1]", source: { kind: "approved_frame" }, role: "imagen_aprobada" },
    { index: 3, tag: "image [3]", source: { kind: "photo", photoId: 9 }, role: "articulo" },
  ] as never;
  it("la variante manda en todas las tomas hasta el final", () => {
    const out = productEverywhere("hf_mult_motion_control", manifest, true);
    expect(out).toContain("exact chosen variant in image [3]");
    expect(out).toContain("never appears, not even for a single frame");
  });
  it("el vídeo entero manda sobre los tramos viejos", () => {
    expect(wholeVideoPreamble("hf_mult_motion_control", 12700)).toContain("WHOLE reference (0 s to 12.7 s)");
  });
});
