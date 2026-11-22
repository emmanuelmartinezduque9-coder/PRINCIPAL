import { describe, expect, it } from "vitest";
import { navFor } from "@/components/shell/app-shell";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.label);

describe("menú lateral según el papel", () => {
  it("el dueño ve Productos, Reglas y Personas, en ese orden", () => {
    expect(labels("dueno")).toEqual(["Productos", "Reglas", "Personas"]);
  });

  it("el colaborador solo ve Productos", () => {
    expect(labels("colaborador")).toEqual(["Productos"]);
  });

  it("mientras no se sabe quién es, solo se ofrece Productos", () => {
    expect(labels(undefined)).toEqual(["Productos"]);
  });
});
