import { describe, expect, it } from "vitest";
import { CHRISTMAS_TV_ON, CHRISTMAS_TV_ON_GENERIC, christmasTvLine, isChristmasLivingRoomWithTv } from "@/server/videos/tele-navidad";

/**
 * Regla del dueño (26/11/2026, «sí, para todos»): salón navideño con tele → encendida con una película
 * de Navidad reconocible y su luz fría; si Higgsfield bloqueó el intento, escena navideña genérica;
 * la imagen del dueño manda.
 */
const SALON = "Reference image 2 is the EXACT requested background: a Christmas living room with a sofa on the LEFT, a lit tree and a television above the fireplace.";

describe("la tele del salón navideño", () => {
  it("encendida con una película de Navidad reconocible y su luz fría", () => {
    expect(isChristmasLivingRoomWithTv(SALON)).toBe(true);
    const line = christmasTvLine(SALON, { ownerRoom: false, blockedBefore: false });
    expect(line).toBe(CHRISTMAS_TV_ON);
    expect(line).toContain("switched ON, never off");
    expect(line).toContain("Kevin – Allein zu Haus");
    expect(line).toContain("cool bluish screen light");
  });

  it("si Higgsfield bloqueó el intento anterior, una escena navideña genérica en la pantalla (sin pararse)", () => {
    const line = christmasTvLine(SALON, { ownerRoom: false, blockedBefore: true });
    expect(line).toBe(CHRISTMAS_TV_ON_GENERIC);
    expect(line).not.toMatch(/Home Alone|Grinch|Kevin/);
    expect(line).toContain("switched ON");
  });

  it("si Claude vio la tele en la referencia o en la sala, se aplica aunque el prompt no la nombre", () => {
    const plain = "Reference image 2 is the EXACT requested background. Preserve its sofa on the LEFT.";
    expect(christmasTvLine(plain, { ownerRoom: false, blockedBefore: false })).toBe("");
    expect(christmasTvLine(plain, { ownerRoom: false, blockedBefore: false, seen: true })).toBe(CHRISTMAS_TV_ON);
    expect(christmasTvLine(plain, { ownerRoom: true, blockedBefore: false, seen: true })).toBe("");
  });

  it("la imagen del dueño manda: no se toca su pantalla", () => {
    expect(christmasTvLine(SALON, { ownerRoom: true, blockedBefore: false })).toBe("");
  });

  it("sin tele, sin Navidad o fuera del salón, nada", () => {
    expect(christmasTvLine("A Christmas living room with a sofa and a lit tree.", { ownerRoom: false, blockedBefore: false })).toBe("");
    expect(christmasTvLine("A living room with a sofa and a television.", { ownerRoom: false, blockedBefore: false })).toBe("");
    expect(christmasTvLine("A Christmas kitchen island; no living area.", { ownerRoom: false, blockedBefore: false })).toBe("");
    expect(isChristmasLivingRoomWithTv("Weihnachtliches Wohnzimmer mit Fernseher")).toBe(true);
  });
});
