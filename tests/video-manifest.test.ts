import { describe, expect, it } from "vitest";
import type { PhotoInfo, PhotoRole } from "@/server/photos";
import { clipManifest, imageManifest, MAX_ARTICLE_REFS, MAX_PACKAGING_REFS, START_IMAGE_IS_IMAGE1 } from "@/server/videos/manifest";
import type { Video } from "@/server/videos/videos";

const photo = (id: number, role: PhotoRole): PhotoInfo => ({ id, role, mime: "image/jpeg", size: 100 });

const videoWith = (over: Partial<Video>): Video =>
  ({ id: 1, avatarPhotoId: null, environmentPhotoId: null, noPerson: false, frameUse: "start_image", ...over }) as Video;

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
    const noPerson = videoWith({ noPerson: true });
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

  it("un avatar o un entorno elegidos que ya no existen, o que cambiaron de papel, no entran", () => {
    const changed = [photo(10, "articulo"), photo(40, "otro")];
    const manifest = imageManifest(videoWith({ avatarPhotoId: 10, environmentPhotoId: 99 }), changed);
    expect(manifest.map((m) => [m.tag, m.role])).toEqual([
      ["image 1", "composicion"],
      ["image 2", "articulo"],
    ]);
  });
});
