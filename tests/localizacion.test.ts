import { describe, expect, it } from "vitest";
import { analysisInstructions, analysisRuleSlugs } from "@/server/videos/analysis";
import { briefOf } from "@/server/videos/brief";
import { editTextsFor } from "@/server/videos/edits";
import { targetPlace } from "@/server/videos/edicion-referencia";
import { localizationGuide, localizeText, MARKETS, marketOf, storeEquivalent } from "@/server/videos/localization";

/**
 * Localización al país del producto (regla de Emmanuel, 24/11/2026): lo de la referencia que es de
 * otro país pasa solo a su equivalente más conocido en el país del producto; la tarjeta manda.
 */

const DE = MARKETS.DE;

describe("localización al país del producto", () => {
  it("el mercado es el del producto: su primer país o su idioma (Alemania por defecto)", () => {
    expect(marketOf({ countries: ["DE", "AT", "CH"], language: "de" }).city).toBe("Berlin");
    expect(marketOf({ countries: ["AT"], language: "de" }).city).toBe("Wien");
    expect(marketOf({ countries: [], language: "it" }).code).toBe("IT");
    expect(marketOf({}).code).toBe("DE");
  });

  it("tiendas de EE. UU. → la cadena equivalente en Alemania según el tipo", () => {
    expect(storeEquivalent("Target", DE)).toBe("Action");
    expect(["Lidl", "Action"]).toContain(storeEquivalent("Target", DE));
    expect(storeEquivalent("Walmart", DE)).toBe("Kaufland");
    expect(storeEquivalent("Costco", DE)).toBe("Kaufland");
    expect(storeEquivalent("Trader Joe's", DE)).toBe("Aldi");
    expect(storeEquivalent("Walgreens", DE)).toBe("dm");
    expect(storeEquivalent("Best Buy", DE)).toBe("MediaMarkt");
    // Una cadena del propio país no se toca; tampoco en EE. UU. las suyas.
    expect(storeEquivalent("Lidl", DE)).toBeNull();
    expect(storeEquivalent("Target", MARKETS.US)).toBeNull();
  });

  it("los textos: Target → Action, «in den USA» → «in Berlin» y $ → € con formato alemán", () => {
    expect(localizeText("Mein Fund bei Target 😱", DE)).toBe("Mein Fund bei Action 😱");
    expect(localizeText("Fremde in den USA 🙏", DE)).toBe("Fremde in Berlin 🙏");
    expect(localizeText("Nur $12.99!", DE)).toBe("Nur 12,99 €!");
    expect(localizeText("Kostet 1,299.99$", DE)).toBe("Kostet 1.299,99 €");
    expect(localizeText("Nur $5", DE)).toBe("Nur 5 €");
    // Lo que diga el desglose para este vídeo manda (p. ej. la tarjeta pidió Lidl).
    expect(localizeText("Target-Haul in New York", DE, [{ kind: "tienda", original: "Target", target: "Lidl" }])).toBe("Lidl-Haul in Berlin");
    // Sin nada de fuera, igual.
    expect(localizeText("EisWerk macht Eis in 5 Minuten 🍦", DE)).toBe("EisWerk macht Eis in 5 Minuten 🍦");
  });

  it("los rótulos que propone el desglose se localizan; los que escribió el dueño, no", () => {
    const product = { name: "EisWerk", language: "de", countries: ["DE"] };
    const analysis = { editTexts: { main: "Target-Fund aus den USA für $19.99 😳", cta: "Kommentiere „EisWerk“ 🍦" }, localization: [] };
    expect(editTextsFor({ editMainText: null, editCtaText: null, note: null }, product, analysis).main).toBe("Action-Fund aus Berlin für 19,99 € 😳");
    expect(editTextsFor({ editMainText: "Mein Target-Text", editCtaText: null, note: null }, product, analysis).main).toBe("Mein Target-Text");
  });

  it("en los rótulos de la edición, sin ciudad en la tarjeta, el lugar es la ciudad del país (Berlin)", () => {
    expect(targetPlace("", ["DE"], "de")).toBe("Berlin");
    expect(targetPlace("calles de Múnich", ["DE"], "de")).toBe("München");
  });

  it("el desglose recibe la regla y la guía del país y devuelve la localización", () => {
    expect(analysisRuleSlugs("replicar")).toContain("localizacion-por-pais");
    const guide = localizationGuide(DE);
    expect(guide).toContain("Alemania");
    expect(guide).toContain("Target → Action");
    expect(guide).toContain("Berlin");
    expect(guide).toContain("12,99 €");
    expect(guide).toMatch(/manda sobre esto/);
    const brief = briefOf({ kind: "replicar", avatarMode: "automatico", note: null, adaptation: null, hookSeconds: 4, productNotes: null, answers: null });
    const text = analysisInstructions(brief, null, [], DE);
    expect(text).toContain("localization:");
    expect(text).toContain(guide);
  });
});
