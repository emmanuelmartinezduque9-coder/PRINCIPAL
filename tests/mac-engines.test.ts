import { describe, expect, it } from "vitest";
import { DEFAULT_MAC_ENGINES, macStepOf } from "../src/llm/mac-engines";

// Claves de todas las llamadas encontradas con rg stepKey src/, también las ajenas al lote.
describe("el paso del motor del Mac", () => {
  it.each([
    ["video.desglose:7:desglose:hash", "desglose"],
    ["video.pinterest:7:banco:hash", "pinterest"],
    ["video.pinterest:7:consultas:hash", "pinterest"],
    ["video.pinterest:7:eleccion:hash", "pinterest"],
    ["video.pinterest:7:prompt-sala:hash", "sala"],
    ["montaje:24:edicion-referencia:hash", "rotulos"],
    ["montaje:24:cambio:67", "rotulos"],
    ["montaje:24:habla-o-canto:hash", "voz"],
    ["sistema.comprobar:-:comprobar:hash", "otros"],
    ["video.finalizar:7:comprobar-efecto:hash", "otros"],
    ["producto.investigar:nicho:1:candidatos", "otros"],
    ["producto.investigar:nicho:1:ranking", "otros"],
    ["producto.alta:1", "otros"],
    ["mejoras.barrido:reporte:1:0", "otros"],
    ["mejoras.barrido:rechazos:1:3", "otros"],
    ["video.referencia:7:referencia:hash", "otros"],
    ["futuro:7:desglose:hash", "otros"],
  ])("%s → %s", (key, expected) => expect(macStepOf(key)).toBe(expected));
  it("compara el próximo lote del dueño y conserva Claude en el resto", () => {
    expect(DEFAULT_MAC_ENGINES).toEqual({ desglose: "comparar", pinterest: "comparar", sala: "comparar", rotulos: "comparar", voz: "comparar", otros: "claude" });
  });
});
