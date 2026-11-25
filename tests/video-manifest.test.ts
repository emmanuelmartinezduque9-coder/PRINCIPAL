import { describe, expect, it } from "vitest";
import type { PhotoInfo, PhotoRole } from "@/server/photos";
import { clipManifest, imageManifest, MAX_ARTICLE_REFS, MAX_PACKAGING_REFS, START_IMAGE_IS_IMAGE1 } from "@/server/videos/manifest";
import type { Video } from "@/server/videos/videos";

const photo = (id: number, role: PhotoRole): PhotoInfo => ({ id, role, mime: "image/jpeg", size: 100 });

const videoWith = (over: Partial<Video>): Video =>
  ({ id: 1, avatarPhotoId: null, environmentPhotoId: null, avatarMode: "elegido", frameUse: "start_image", ...over }) as Video;

const photos = [
  photo(20, "articulo"),
  photo(10, "avatar"),
  photo(21, "articulo"),
  photo(30, "embalaje"),
  photo(40, "entorno"),
  photo(50, "otro"),
];
const video = videoWith({ avatarPhotoId: 10, environmentPhotoId: 40 });

describe("orden de las referencias", () => {
  it("límites fijados", () => {
    expect([MAX_ARTICLE_REFS, MAX_PACKAGING_REFS, START_IMAGE_IS_IMAGE1]).toEqual([4, 2, true]);
  });

  it("imagen: composición, avatar, hasta 4 de artículo, hasta 2 de embalaje y entorno, numeradas desde 1", () => {
    const manifest = imageManifest(video, photos);
    expect(manifest.map((m) => [m.tag, m.role])).toEqual([
      ["image 1", "composicion"],
      ["image 2", "avatar"],
      ["image 3", "articulo"],
      ["image 4", "articulo"],
      ["image 5", "embalaje"],
      ["image 6", "entorno"],
    ]);
    expect(manifest.map((m) => m.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(manifest.map((m) => m.source)).toEqual([
      { kind: "reference_frame" },
      { kind: "photo", photoId: 10 },
      { kind: "photo", photoId: 20 },
      { kind: "photo", photoId: 21 },
      { kind: "photo", photoId: 30 },
      { kind: "photo", photoId: 40 },
    ]);
  });

  it("clip: @Video1 es la referencia y @Image1 la imagen aprobada", () => {
    const manifest = clipManifest(video, photos);
    expect(manifest.map((m) => m.tag)).toEqual(["@Video1", "@Image1", "@Image2", "@Image3", "@Image4", "@Image5"]);
    expect(manifest.map((m) => [m.index, m.role])).toEqual([
      [1, "video_referencia"],
      [1, "imagen_aprobada"],
      [2, "avatar"],
      [3, "articulo"],
      [4, "articulo"],
      [5, "embalaje"],
    ]);
    expect(manifest[0].source).toEqual({ kind: "reference_video" });
    expect(manifest[1].source).toEqual({ kind: "approved_frame" });
    // El entorno ya está en la imagen aprobada: el clip no lo lleva aparte.
    expect(manifest.some((m) => m.role === "entorno")).toBe(false);
  });

  it("con «sin personas» no hay avatar; con 6 fotos de artículo solo entran 4", () => {
    const many = [
      ...[1, 2, 3, 4, 5, 6].map((id) => photo(id, "articulo")),
      ...[7, 8, 9].map((id) => photo(id, "embalaje")),
      photo(10, "avatar"),
    ];
    const noPerson = videoWith({ avatarMode: "nadie" });
    expect(imageManifest(noPerson, many).map((m) => [m.tag, m.role])).toEqual([
      ["image 1", "composicion"],
      ["image 2", "articulo"],
      ["image 3", "articulo"],
      ["image 4", "articulo"],
      ["image 5", "articulo"],
      ["image 6", "embalaje"],
      ["image 7", "embalaje"],
    ]);
    expect(imageManifest(noPerson, many).slice(1, 5).map((m) => m.source)).toEqual(
      [1, 2, 3, 4].map((photoId) => ({ kind: "photo", photoId })),
    );
    expect(clipManifest(noPerson, many).map((m) => m.tag)).toEqual([
      "@Video1",
      "@Image1",
      "@Image2",
      "@Image3",
      "@Image4",
      "@Image5",
      "@Image6",
      "@Image7",
    ]);
  });

  it("con «sin sustitución» no va ninguna foto de avatar en ningún manifiesto, aunque quede una elegida", () => {
    // Por si acaso: la base de datos ya no deja guardar un avatar con otro modo.
    const keep = videoWith({ avatarMode: "sin_sustitucion", avatarPhotoId: 10, environmentPhotoId: 40 });
    expect(imageManifest(keep, photos).map((m) => [m.tag, m.role])).toEqual([
      ["image 1", "composicion"],
      ["image 2", "articulo"],
      ["image 3", "articulo"],
      ["image 4", "embalaje"],
      ["image 5", "entorno"],
    ]);
    expect(clipManifest(keep, photos).map((m) => m.role)).toEqual(["video_referencia", "imagen_aprobada", "articulo", "articulo", "embalaje"]);
  });

  it("si el primer fotograma no contara como @Image1, con «start_image» las fotos empiezan en @Image1", () => {
    const start = videoWith({ avatarPhotoId: 10, frameUse: "start_image" });
    expect(clipManifest(start, photos, false).map((m) => [m.tag, m.index, m.role])).toEqual([
      ["@Video1", 1, "video_referencia"],
      ["start_image", 0, "imagen_aprobada"],
      ["@Image1", 1, "avatar"],
      ["@Image2", 2, "articulo"],
      ["@Image3", 3, "articulo"],
      ["@Image4", 4, "embalaje"],
    ]);
    // Como referencia de contexto sí se numera, igual que con `true`.
    const contextual = videoWith({ avatarPhotoId: 10, frameUse: "contextual_reference" });
    expect(clipManifest(contextual, photos, false)).toEqual(clipManifest(contextual, photos, true));
    expect(clipManifest(start, photos)).toEqual(clipManifest(start, photos, true));
  });

  it("un avatar o un entorno elegidos que ya no existen, o que cambiaron de papel, no entran", () => {
    const changed = [photo(10, "articulo"), photo(40, "otro")];
    const manifest = imageManifest(videoWith({ avatarPhotoId: 10, environmentPhotoId: 99 }), changed);
    expect(manifest.map((m) => [m.tag, m.role])).toEqual([
      ["image 1", "composicion"],
      ["image 2", "articulo"],
    ]);
  });
});

describe("un único frame y fotos por entorno (orden expresa de Emmanuel, 25/11/2026)", () => {
  it("Motion Transfer adjunta las fotos del tramo después del frame y del producto", () => {
    const refs = { photos, variant: null, avatar: null, pinterest: ["calle-1", "calle-2"], clipSetting: true };
    const manifest = clipManifest(videoWith({ avatarPhotoId: 10 }), refs, undefined, "hf_mult_motion_control");
    expect(manifest[1]).toMatchObject({ index: 1, source: { kind: "approved_frame" } });
    expect(manifest.slice(-2).map((m) => [m.index, m.source])).toEqual([
      [6, { kind: "pinterest", sha256: "calle-1" }],
      [7, { kind: "pinterest", sha256: "calle-2" }],
    ]);
    expect(clipManifest(video, { ...refs, clipSetting: false }, undefined, "hf_mult_motion_control").some((m) => m.role === "entorno" || m.role === "pinterest")).toBe(false);
  });

  it("la foto elegida del dueño tiene prioridad sobre Pinterest en su tramo", () => {
    const manifest = clipManifest(video, { photos, variant: null, avatar: null, pinterest: ["otra-sala"], clipSetting: true }, undefined, "hf_mult_motion_control");
    expect(manifest.at(-1)).toMatchObject({ source: { kind: "photo", photoId: 40 }, role: "entorno", ownerSelected: true });
    expect(manifest.some((m) => m.role === "pinterest")).toBe(false);
  });

  it("marca el fondo manual en el manifiesto sin cambiar sus números", () => {
    const manifest = imageManifest(videoWith({ avatarPhotoId: 10 }), { photos, variant: null, avatar: null, pinterest: ["foto-del-dueno"], manualEnvironmentRefs: ["foto-del-dueno"], approvedMethod: true });
    expect(manifest.find((m) => m.source.kind === "pinterest")).toMatchObject({ index: 5, ownerSelected: true });
  });
});
