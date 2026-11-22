import { describe, expect, it } from "vitest";
import { navFor } from "@/components/shell/app-shell";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.label);

describe("menú lateral según el papel", () => {
  it("el dueño ve Productos, Lotes, Biblioteca, Canciones, Gasto, Reglas, Personas y Ajustes, en ese orden", () => {
    expect(labels("dueno")).toEqual(["Productos", "Lotes", "Biblioteca", "Canciones", "Gasto", "Reglas", "Personas", "Ajustes"]);
  });

  it("el colaborador ve Productos, Lotes, Biblioteca (sus clips de Higgsfield), Canciones (comunes) y Ajustes (su propia conexión)", () => {
    expect(labels("colaborador")).toEqual(["Productos", "Lotes", "Biblioteca", "Canciones", "Ajustes"]);
  });

  it("mientras no se sabe quién es, solo se ofrece lo que es de todos", () => {
    expect(labels(undefined)).toEqual(["Productos", "Lotes", "Biblioteca", "Canciones", "Ajustes"]);
  });
});
