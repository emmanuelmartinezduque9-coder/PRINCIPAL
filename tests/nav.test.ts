import { describe, expect, it } from "vitest";
import { navFor } from "@/components/shell/app-shell";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.label);

describe("menú lateral según el papel", () => {
  it("el dueño ve Productos, Lotes, Gasto, Reglas, Personas y Ajustes, en ese orden", () => {
    expect(labels("dueno")).toEqual(["Productos", "Lotes", "Gasto", "Reglas", "Personas", "Ajustes"]);
  });

  it("el colaborador ve Productos, Lotes y Ajustes (su propia conexión de Higgsfield)", () => {
    expect(labels("colaborador")).toEqual(["Productos", "Lotes", "Ajustes"]);
  });

  it("mientras no se sabe quién es, solo se ofrece lo que es de todos", () => {
    expect(labels(undefined)).toEqual(["Productos", "Lotes", "Ajustes"]);
  });
});
