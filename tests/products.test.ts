import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/server/auth";
import { COUNTRIES, createProduct, getProductFor, LANGUAGES, listProductsFor } from "@/server/products";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let dueno: AuthUser;
let ana: AuthUser;

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
});

describe("productos", () => {
  it("idiomas y países disponibles", () => {
    expect(LANGUAGES).toEqual(["de", "it"]);
    expect(COUNTRIES).toEqual(["DE", "AT", "CH", "IT"]);
  });

  it("un producto nuevo nace en alemán para DE, AT y CH", async () => {
    const p = await createProduct(dueno, { name: "Eismaschine", summary: "Hace helado en 2 minutos" });
    expect(p.language).toBe("de");
    expect(p.countries).toEqual(["DE", "AT", "CH"]);
    expect(p.createdBy).toBe(dueno.id);
  });

  it("guarda el nombre y la frase sin espacios sobrantes, y el idioma y los países elegidos", async () => {
    const p = await createProduct(dueno, {
      name: "  Gelatiera  ",
      summary: " Fa il gelato ",
      language: "it",
      countries: ["IT", "CH", "IT"],
    });
    expect(p).toMatchObject({ name: "Gelatiera", summary: "Fa il gelato", language: "it", countries: ["IT", "CH"] });
  });

  it("el producto que crea un colaborador queda asignado a él", async () => {
    const p = await createProduct(ana, { name: "Eismaschine", summary: "Hace helado" });
    expect((await getProductFor(ana, p.id)).id).toBe(p.id);
    const otra = await makeUser("colaborador");
    await expect(getProductFor(otra, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza nombre vacío, idioma desconocido y lista de países vacía con mensaje en español", async () => {
    await expect(createProduct(dueno, { name: " ", summary: "x" })).rejects.toThrow("Escribe el nombre del producto.");
    await expect(createProduct(dueno, { name: "x", summary: "x", language: "fr" })).rejects.toThrow(
      "Idioma no disponible.",
    );
    await expect(createProduct(dueno, { name: "x", summary: "x", countries: [] })).rejects.toThrow(
      "Elige al menos un país.",
    );
    expect(await listProductsFor(dueno)).toEqual([]);
  });

  it("rechaza frase vacía, país desconocido y textos demasiado largos con un 400", async () => {
    await expect(createProduct(dueno, { name: "x", summary: "  " })).rejects.toMatchObject({
      status: 400,
      message: "Escribe en una frase qué hace el producto.",
    });
    await expect(createProduct(dueno, { name: "x", summary: "x", countries: ["FR"] })).rejects.toMatchObject({
      status: 400,
      message: "País no disponible.",
    });
    await expect(createProduct(dueno, { name: "x".repeat(201), summary: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(createProduct(dueno, { name: "x", summary: "x".repeat(1001) })).rejects.toMatchObject({ status: 400 });
  });

  it("lista los más recientes primero", async () => {
    const first = await makeProduct(dueno, { name: "Primero" });
    const second = await makeProduct(dueno, { name: "Segundo" });
    expect((await listProductsFor(dueno)).map((p) => p.id)).toEqual([second.id, first.id]);
  });
});
