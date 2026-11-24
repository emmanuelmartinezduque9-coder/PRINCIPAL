import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/server/auth";
import { setAssignments } from "@/server/access";
import { COUNTRIES, createProduct, getProductFor, LANGUAGES, listProductsFor, updateProduct } from "@/server/products";
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
    expect(LANGUAGES).toEqual(["de", "it", "en"]);
    expect(COUNTRIES).toEqual(["DE", "AT", "CH", "IT", "US"]);
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

describe("editar un producto", () => {
  it("el dueño cambia nombre, frase, idioma y países; los textos se guardan sin espacios sobrantes", async () => {
    const p = await makeProduct(dueno, { name: "Eismaschine", summary: "Hace helado" });
    const edited = await updateProduct(dueno, p.id, {
      name: "  Gelatiera ",
      summary: " Fa il gelato ",
      language: "it",
      countries: ["IT", "CH", "IT"],
    });
    expect(edited).toMatchObject({ id: p.id, name: "Gelatiera", summary: "Fa il gelato", language: "it", countries: ["IT", "CH"] });
    expect(await getProductFor(dueno, p.id)).toMatchObject({ name: "Gelatiera", language: "it" });
  });

  it("lo que no se envía se queda como estaba", async () => {
    const p = await createProduct(dueno, { name: "Eismaschine", summary: "Hace helado", language: "it", countries: ["IT"] });
    const edited = await updateProduct(dueno, p.id, { name: "Eismaschine Pro" });
    expect(edited).toMatchObject({ name: "Eismaschine Pro", summary: "Hace helado", language: "it", countries: ["IT"] });
    expect(edited.createdBy).toBe(dueno.id);
  });

  it("rechaza datos que no valen con un 400 y no cambia nada", async () => {
    const p = await makeProduct(dueno, { name: "Eismaschine", summary: "Hace helado" });
    await expect(updateProduct(dueno, p.id, { name: " " })).rejects.toMatchObject({ status: 400, message: "Escribe el nombre del producto." });
    await expect(updateProduct(dueno, p.id, { countries: [] })).rejects.toMatchObject({ status: 400, message: "Elige al menos un país." });
    await expect(updateProduct(dueno, p.id, { language: "fr" })).rejects.toMatchObject({ status: 400, message: "Idioma no disponible." });
    expect(await getProductFor(dueno, p.id)).toMatchObject({ name: "Eismaschine", summary: "Hace helado" });
  });

  it("un colaborador edita los suyos; uno ajeno responde 404 y no cambia", async () => {
    const suyo = await makeProduct(ana, { name: "Suyo" });
    const ajeno = await makeProduct(dueno, { name: "Ajeno" });
    expect((await updateProduct(ana, suyo.id, { name: "Suyo editado" })).name).toBe("Suyo editado");
    await expect(updateProduct(ana, ajeno.id, { name: "Hackeado" })).rejects.toMatchObject({
      status: 404,
      message: "Producto no encontrado.",
    });
    expect((await getProductFor(dueno, ajeno.id)).name).toBe("Ajeno");
  });

  it("al quitarle la asignación, ya no puede editarlo (404)", async () => {
    const p = await makeProduct(dueno, { name: "Asignado" });
    await setAssignments(dueno, ana.id, [p.id]);
    expect((await updateProduct(ana, p.id, { summary: "Nueva frase" })).summary).toBe("Nueva frase");
    await setAssignments(dueno, ana.id, []);
    await expect(updateProduct(ana, p.id, { summary: "Otra" })).rejects.toMatchObject({ status: 404 });
    expect((await getProductFor(dueno, p.id)).summary).toBe("Nueva frase");
  });

  it("un id que no existe o no es válido responde 404", async () => {
    for (const id of [0, -1, 999999, Number.NaN]) {
      await expect(updateProduct(dueno, id, { name: "x" })).rejects.toMatchObject({ status: 404 });
    }
  });
});
