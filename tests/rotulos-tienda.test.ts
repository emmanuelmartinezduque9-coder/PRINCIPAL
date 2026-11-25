import { describe, expect, it } from "vitest";
import { shopOfLocalization } from "@/server/videos/localization";
import { REFERENCE_EDIT_INSTRUCTIONS } from "@/server/videos/edicion-referencia";
import { EDIT_CHANGE_INSTRUCTIONS } from "@/server/videos/cambio-montaje";

// Lote 10 (25/11/2026): «RENNT zu ALDI!» salió «RENNT zu EisWerk!» y un Lidl salió como Aldi.
describe("tienda en los rótulos", () => {
  it("saca la tienda de la escena de la localización del desglose", () => {
    expect(shopOfLocalization([{ kind: "tienda", original: "ALDI", target: "Lidl" }])).toBe("Lidl");
    expect(shopOfLocalization([{ kind: "tienda", original: "Aldi (ya es la cadena alemana)", target: "Aldi, con logo auténtico en la cartelería física" }])).toBe("Aldi");
    expect(shopOfLocalization([{ kind: "marca", original: "Target", target: "Lidl" }])).toBeNull();
    expect(shopOfLocalization(null)).toBeNull();
  });
  it("la tienda va en el rótulo y nunca se cambia por el producto", () => {
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("{TIENDA}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("Una tienda NUNCA se cambia por {PRODUCTO}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("las marcas, tiendas, películas, personajes y famosos de terceros que nombre la referencia SE CONSERVAN");
    expect(REFERENCE_EDIT_INSTRUCTIONS).not.toContain("Conserva la tienda que nombre la referencia si existe en Alemania");
  });
  it("un cambio que pide una tienda la pone", () => {
    expect(EDIT_CHANGE_INSTRUCTIONS).toContain("Las marcas, tiendas y personajes de terceros se pueden nombrar");
    expect(EDIT_CHANGE_INSTRUCTIONS).not.toContain("Nunca nombres marcas");
  });
});

// Lote 10 (26/11/2026): «Jede Haar-MAMA» con la tarjeta «busy mom en vez de hair mom», «Kiosk-Verkäuferin» en una
// escena de dm, el 🎯 de Target en un anuncio de Aldi y emojis de verano con canción de Navidad.
describe("rótulos con la lógica de nuestro vídeo", () => {
  it("las indicaciones del dueño, la escena y la canción llegan y mandan", () => {
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("{INDICACIONES}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("{ESCENA}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("{CANCION}");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("se cumplen siempre");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("el texto nunca contradice lo que se ve");
  });
  it("los emojis se adaptan al producto, la escena y la temporada", () => {
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("🎯 de Target en un anuncio de Aldi");
    expect(REFERENCE_EDIT_INSTRUCTIONS).toContain("pasan a emojis de Navidad");
  });
});
