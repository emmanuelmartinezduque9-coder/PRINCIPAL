import { beforeEach, describe, expect, it } from "vitest";
import { createFakeHiggsfield, SAMPLE_IMAGE_URL, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import type { AuthUser } from "@/server/auth";
import { addProductPhoto, listProductPhotos } from "@/server/photos";
import { advanceBrandAssets, brandAssetsOf, brandAssetsSweep, cajaPrompt, marcaPrompt, requestBrandAssets } from "@/server/product-brand-assets";
import { createVariant, listVariants } from "@/server/variants";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const PNG = Buffer.from(SAMPLE_IMAGE_URL.split(",")[1], "base64");

describe("recursos de marca al crear un producto (logo, logo web y una caja por variante)", () => {
  let dueno: AuthUser;
  let hf: FakeHiggsfield;
  beforeEach(async () => {
    await truncateAll();
    dueno = await makeUser("dueno");
    hf = createFakeHiggsfield();
  });

  const deps = () => ({
    higgsfield: hf.port,
    download: async () => PNG,
    brief: async () => ({ idea: "A dark hood silhouette with a gold cross; midnight blue and gold", descriptor: "Hoodie mit integrierter Gesichtsmaske" }),
  });
  const finishAll = () => {
    for (const id of Object.keys(hf.state.jobs)) if (hf.state.jobs[id].status === "pending") hf.state.jobs[id] = { ...hf.state.jobs[id], status: "done", urls: [`https://cdn.example/${id}.png`] };
  };
  const submits = () => hf.calls.filter((c) => c.method === "submitImages").map((c) => (c.args as { request: { prompt: string; aspectRatio: string; medias: unknown[] } }).request);

  it("primero la marca; después el logo vertical y una caja por variante con sus fotos", async () => {
    const product = await makeProduct(dueno, { name: "KreuzKapuze", summary: "Sudadera con capucha" });
    const negro = await addProductPhoto(dueno, product.id, PNG, "articulo");
    const blanco = await addProductPhoto(dueno, product.id, Buffer.concat([PNG, Buffer.from([0])]), "articulo");
    const vNegro = await createVariant(dueno, product.id, { name: "Negro", articlePhotoIds: [negro.id] });
    const vBlanco = await createVariant(dueno, product.id, { name: "Blanco", articlePhotoIds: [blanco.id] });

    await requestBrandAssets(product.id, dueno.id);
    await requestBrandAssets(product.id, dueno.id); // repetirlo no duplica
    expect((await brandAssetsOf(product.id)).map((r) => [r.kind, r.variantId]).sort()).toEqual(
      [["caja", vBlanco.id], ["caja", vNegro.id], ["logo_web", null], ["marca", null]].sort(),
    );

    await advanceBrandAssets(product.id, deps());
    expect(submits()).toHaveLength(1);
    expect(submits()[0]).toMatchObject({ aspectRatio: "1:1", medias: [] });
    expect(submits()[0].prompt).toContain("circular brand emblem for KreuzKapuze");

    finishAll();
    await advanceBrandAssets(product.id, deps());
    expect(submits()).toHaveLength(4);
    const [, logoWeb, ...cajas] = submits();
    expect(logoWeb).toMatchObject({ aspectRatio: "3:4" });
    expect(logoWeb.medias).toHaveLength(1);
    for (const caja of cajas) {
      expect(caja.medias).toHaveLength(2);
      expect(caja.prompt).toContain("«Hoodie mit integrierter Gesichtsmaske»");
      expect(caja.prompt).toContain("no ghost figures");
    }
    expect(cajas.map((c) => /version of the product/.test(c.prompt))).toEqual([true, true]);

    finishAll();
    await advanceBrandAssets(product.id, deps());
    const rows = await brandAssetsOf(product.id);
    expect(rows.every((r) => r.status === "hecho" && r.photoId)).toBe(true);
    const roles = (await listProductPhotos(dueno, product.id)).map((p) => p.role).sort();
    expect(roles).toEqual(["articulo", "articulo", "embalaje", "embalaje", "logo_web", "marca"]);
    const variants = await listVariants(dueno, product.id);
    for (const v of variants) expect(v.packagingPhotoId).toBe(rows.find((r) => r.kind === "caja" && r.variantId === v.id)!.photoId);
  });

  it("una variante nueva recibe su caja sola", async () => {
    const product = await makeProduct(dueno);
    const foto = await addProductPhoto(dueno, product.id, PNG, "articulo");
    await requestBrandAssets(product.id, dueno.id);
    expect((await brandAssetsOf(product.id)).filter((r) => r.kind === "caja").map((r) => r.variantId)).toEqual([null]);
    const v = await createVariant(dueno, product.id, { name: "Rojo", articlePhotoIds: [foto.id] });
    await brandAssetsSweep(deps());
    expect((await brandAssetsOf(product.id)).filter((r) => r.kind === "caja").map((r) => r.variantId)).toEqual([v.id]);
  });

  it("los prompts son los de Codex: solo el nombre en el logo; la caja con el texto en el idioma del país", () => {
    const product = { name: "KreuzKapuze", summary: "Sudadera", niche: "Streetwear cristiano", language: "de" };
    expect(marcaPrompt(product, {})).toContain("Exactly one text: KreuzKapuze. No slogan, no descriptor");
    expect(cajaPrompt(product, { descriptor: "Hoodie" }, "Blanco")).toContain("small German descriptor «Hoodie»");
    expect(cajaPrompt(product, {}, null)).not.toContain("descriptor «");
  });
});
