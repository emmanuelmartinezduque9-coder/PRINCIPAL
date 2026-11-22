import { describe, expect, it } from "vitest";
import { findManifest, formatTime, groupSongs, importForm, planImport, searchSongs } from "@/components/songs/labels";

/** «Importar carpeta»: cómo se empareja `canciones.json` con los archivos de la carpeta elegida. */

const file = (relativePath: string, content = "x") => {
  const f = new File([content], relativePath.split("/").at(-1)!);
  Object.defineProperty(f, "webkitRelativePath", { value: relativePath });
  return f;
};

describe("importar la carpeta del paquete", () => {
  it("encuentra canciones.json, empareja por ruta relativa y lista las que no tienen archivo", () => {
    const files = [
      file("importacion/canciones.json"),
      file("importacion/canciones/cancion-01__EisWerk.mp3"),
      file("importacion/canciones/cancion-22__yshi.mp3"),
      file("importacion/otros/canciones.json"),
    ];
    const manifest = findManifest(files)!;
    expect((manifest as File & { webkitRelativePath: string }).webkitRelativePath).toBe("importacion/canciones.json");
    const plan = planImport(files, manifest, {
      songs: [
        { id: "cancion-01", title: "EisWerk C1 · recetas", numbers: [1], sections: ["Todas las canciones", "eiswerk"], dropSeconds: 32.57, suggestedStartS: 1.77, file: "canciones/cancion-01__EisWerk.mp3" },
        { id: "cancion-22", title: "original sound - yshi", numbers: [22], sections: [], dropSeconds: null, suggestedStartS: null, file: "canciones/cancion-22__yshi.mp3" },
        { id: "cancion-99", title: "Perdida", numbers: [99], sections: [], file: "canciones/no-esta.mp3" },
        { id: "cancion-98", title: "Sin ruta", numbers: [98], file: null },
      ],
    });
    expect(plan.missing).toEqual(["99 · Perdida", "98 · Sin ruta"]);
    expect(plan.items.map((item) => item.label)).toEqual(["1 · EisWerk C1 · recetas", "22 · original sound - yshi"]);
    expect(plan.items[0].fields).toEqual({ titulo: "EisWerk C1 · recetas", numero: "1", secciones: ["eiswerk"], drop: "32570", inicio: "1770" });
    expect(plan.items[1].fields).toEqual({ titulo: "original sound - yshi", numero: "22", secciones: [] });

    const form = importForm(plan.items[0]);
    expect(form.get("archivo")).toBeInstanceOf(File);
    expect(form.getAll("secciones")).toEqual(["eiswerk"]);
    expect(importForm(plan.items[1]).getAll("secciones")).toEqual([""]);
  });

  it("sin canciones.json no hay paquete", () => {
    expect(findManifest([file("x/a.mp3")])).toBeNull();
  });
});

describe("buscar y agrupar", () => {
  const songs = [
    { id: 1, number: 1, title: "EisWerk C1", sections: ["eiswerk"] },
    { id: 2, number: 12, title: "CHANEL", sections: [] },
    { id: 3, number: 21, title: "Navideña 1", sections: ["navideñas"] },
    { id: 4, number: null, title: "Sin número 12", sections: ["navideñas"] },
  ];

  it("por número exacto primero, o por título sin tildes", () => {
    expect(searchSongs(songs, "12").map((s) => s.id)).toEqual([2, 4]);
    expect(searchSongs(songs, "#1").map((s) => s.id)).toEqual([1, 3, 4]);
    expect(searchSongs(songs, "navidena").map((s) => s.id)).toEqual([3, 4]);
    expect(searchSongs(songs, "  ").length).toBe(4);
  });

  it("agrupa por sección, con las que no tienen al final", () => {
    expect(groupSongs(songs).map((g) => [g.section, g.songs.length])).toEqual([["eiswerk", 1], ["navideñas", 2], ["Sin sección", 1]]);
  });

  it("formatea los tiempos con décimas", () => {
    expect(formatTime(32_570)).toBe("0:32.6");
    expect(formatTime(180_663, false)).toBe("3:00");
  });
});
