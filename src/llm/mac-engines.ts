/** Los nombres son estables aunque cambie el texto de Ajustes. */
export const MAC_STEPS = ["desglose", "pinterest", "sala", "rotulos", "voz", "otros"] as const;
export type MacStep = typeof MAC_STEPS[number];
export type MacEngine = "claude" | "codex" | "comparar";
export type MacEngines = Record<MacStep, MacEngine>;
export const DEFAULT_MAC_ENGINES: MacEngines = { desglose: "comparar", pinterest: "comparar", sala: "comparar", rotulos: "comparar", voz: "comparar", otros: "claude" };
export const MAC_STEP_LABELS: Record<MacStep, string> = { desglose: "Desglose de la referencia", pinterest: "Fotos de Pinterest", sala: "Prompt de sala e imagen inicial", rotulos: "Lectura y cambios de rótulos", voz: "Habla, canto y doblaje", otros: "Resto de llamadas" };

/** Se mira el trabajo y el paso, nunca palabras sueltas del hash o del producto. */
export function macStepOf(stepKey: string): MacStep {
  const [job, , step] = stepKey.split(":");
  if (job === "video.desglose" && step === "desglose") return "desglose";
  if (job === "video.pinterest") {
    if (step === "prompt-sala") return "sala";
    if (["banco", "consultas", "eleccion"].includes(step)) return "pinterest";
  }
  if (job === "montaje") {
    if (["edicion-referencia", "cambio"].includes(step)) return "rotulos";
    if (step === "habla-o-canto") return "voz";
  }
  return "otros";
}
