import { describe, expect, it } from "vitest";
import { avatarBody, libraryIdOf } from "@/components/batches/batch-fields";
import { parseDraft, serializeDraft, newGroup, type Draft } from "@/components/batches/draft";
import { avatarForm, findAvatarManifest, inferAge, planAvatarImport } from "@/components/avatars/labels";

/** «Importar carpeta» de avatares (con `avatares.json`) y las elecciones de avatar de las tarjetas. */

const file = (path: string, body = "x") => {
  const f = new File([body], path.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
};

describe("importar la carpeta de avatares", () => {
  it("empareja cada avatar con su archivo y prepara nombre, grupo, número, descripción, media id y la edad si es evidente", () => {
    const manifest = file("paquete/avatares.json");
    const files = [manifest, file("paquete/avatares/hombre-1.png"), file("paquete/avatares/mujer-14.jpg"), file("otra/avatares/mujer-8.png")];
    expect(findAvatarManifest(files)).toBe(manifest);
    const plan = planAvatarImport(files, manifest, {
      items: [
        { id: "hombre-1", group: "hombre", number: 1, selector: "hombre 1", description: "Pelo corto y barba canosa", higgsfieldMediaId: "2bf8", file: "avatares/hombre-1.png" },
        { id: "mujer-8", group: "mujer", number: 8, selector: "mujer 8", description: "Pelo ondulado", file: null },
        { id: "mujer-14", group: "mujer", number: 14, selector: "mujer 14", description: "cc48489a2e19 (1).jpg", file: "avatares/mujer-14.jpg" },
      ],
    });
    expect(plan.missing).toEqual(["mujer 8"]);
    expect(plan.items.map((item) => item.fields)).toEqual([
      { nombre: "hombre 1", grupo: "hombre", numero: "1", descripcion: "Pelo corto y barba canosa", edad: "55", higgsfield: "2bf8" },
      // Una descripción que es un nombre de archivo no se importa; sin edad evidente, sin edad.
      { nombre: "mujer 14", grupo: "mujer", numero: "14" },
    ]);
    const form = avatarForm(plan.items[0]);
    expect(form.get("archivo")).toBeInstanceOf(File);
    expect(form.get("edad")).toBe("55");
  });

  it("la edad solo cuando la descripción la deja clara", () => {
    expect(inferAge("Blusa azul marino, pelo rubio")).toBeNull();
    expect(inferAge("Abuela con delantal")).toBe(70);
    expect(inferAge("Niño con gorra")).toBe(8);
    expect(inferAge(null)).toBeNull();
  });
});

describe("elección de avatar en las tarjetas", () => {
  it("cada elección se manda con su modo, su foto y su avatar de la biblioteca", () => {
    expect(avatarBody(7)).toEqual({ avatarMode: "elegido", avatarPhotoId: 7, avatarLibraryId: null });
    expect(avatarBody("bib-12")).toEqual({ avatarMode: "biblioteca", avatarPhotoId: null, avatarLibraryId: 12 });
    expect(avatarBody("automatico")).toEqual({ avatarMode: "automatico", avatarPhotoId: null, avatarLibraryId: null });
    expect(libraryIdOf("nadie")).toBeNull();
  });

  it("el borrador guarda el avatar de la biblioteca, «Automático» y la variante", () => {
    const group = { ...newGroup(3) };
    const row = (avatar: unknown, variant: unknown) => ({ key: "r", source: { type: "link", url: "https://www.tiktok.com/@a/video/1" }, avatar, variant, kind: "replicar", note: "" });
    const draft = { name: "x", autoAnalyze: true, batchId: null, groups: [{ ...group, rows: [row("bib-12", 4), row("automatico", null), row("bib-x", "nope")] }] };
    const parsed = parseDraft(serializeDraft(draft as unknown as Draft))!;
    expect(parsed.groups[0].rows.map((r) => [r.avatar, r.variant])).toEqual([
      ["bib-12", 4],
      ["automatico", null],
      [null, null],
    ]);
  });
});
