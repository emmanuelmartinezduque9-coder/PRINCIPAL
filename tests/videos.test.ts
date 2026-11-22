import { beforeEach, describe, expect, it } from "vitest";
import { setAssignments } from "@/server/access";
import type { AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import {
  createVideo,
  getVideoFor,
  listVideosFor,
  readVideoFrame,
  requireVideoOwner,
  updateVideoChoices,
  videoView,
  type Video,
} from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;
let videoDeAna: Video;

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
  videoDeAna = await createVideo(ana, producto.id);
});

describe("vídeos de un producto", () => {
  it("se numeran por producto y empiezan sin referencia", async () => {
    expect(videoDeAna).toMatchObject({ title: "Vídeo 1", createdBy: ana.id, productId: producto.id, referenceStatus: "none", kind: "replicar", adaptation: null, note: null });
    // Sin avatar habitual ni fotos de avatar, empieza con «No aparece nadie».
    expect(videoDeAna).toMatchObject({ avatarMode: "nadie", avatarPhotoId: null });
    const segundo = await createVideo(dueno, producto.id);
    expect(segundo.title).toBe("Vídeo 2");
    const otro = await createVideo(ana, (await makeProduct(ana)).id);
    expect(otro.title).toBe("Vídeo 1");
  });

  it("la lista dice cuáles son míos, los más recientes primero", async () => {
    const delDueno = await createVideo(dueno, producto.id);
    const lista = await listVideosFor(ana, producto.id);
    expect(lista.map((v) => [v.id, v.mine])).toEqual([
      [delDueno.id, false],
      [videoDeAna.id, true],
    ]);
    expect(lista[1]).toMatchObject({ title: "Vídeo 1", createdBy: ana.id, referenceStatus: "none" });
    expect(lista.map((v) => v.creatorName)).toEqual([dueno.name, ana.name]);
    await expect(listVideosFor(luis, producto.id)).rejects.toMatchObject({ status: 404 });
  });

  it("un vídeo de un producto que no tienes da el mismo 404 que uno que no existe", async () => {
    for (const id of [videoDeAna.id, 999_999, Number.NaN, -1, 1.5]) {
      await expect(getVideoFor(luis, id)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    }
    await expect(createVideo(luis, producto.id)).rejects.toMatchObject({ status: 404 });
  });

  it("el dueño ve el vídeo de un colaborador pero no puede continuarlo", async () => {
    expect((await videoView(dueno, videoDeAna.id)).mine).toBe(false);
    expect((await videoView(dueno, videoDeAna.id)).creatorName).toBe(ana.name);
    expect((await videoView(ana, videoDeAna.id)).mine).toBe(true);
    expect(() => requireVideoOwner(dueno, videoDeAna)).toThrow("Solo quien creó este vídeo puede continuarlo: se paga con su Higgsfield.");
    expect(() => requireVideoOwner(ana, videoDeAna)).not.toThrow();
    await expect(updateVideoChoices(dueno, videoDeAna.id, { title: "Mío" })).rejects.toMatchObject({ status: 403 });
    expect((await getVideoFor(ana, videoDeAna.id)).title).toBe("Vídeo 1");
  });

  it("al quitarle el producto, Ana deja de ver sus vídeos", async () => {
    expect((await getVideoFor(ana, videoDeAna.id)).id).toBe(videoDeAna.id);
    await setAssignments(dueno, ana.id, []);
    await expect(getVideoFor(ana, videoDeAna.id)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    await expect(videoView(ana, videoDeAna.id)).rejects.toMatchObject({ status: 404 });
  });

  it("el avatar tiene que ser una foto de ese producto con papel avatar", async () => {
    const articulo = await addProductPhoto(ana, producto.id, JPEG, "articulo");
    const avatar = await addProductPhoto(ana, producto.id, JPEG, "avatar");
    const entorno = await addProductPhoto(ana, producto.id, JPEG, "entorno");
    const otroProducto = await makeProduct(ana);
    const avatarAjeno = await addProductPhoto(ana, otroProducto.id, JPEG, "avatar");

    for (const id of [articulo.id, avatarAjeno.id, 999_999]) {
      await expect(updateVideoChoices(ana, videoDeAna.id, { avatarPhotoId: id })).rejects.toMatchObject({
        status: 400,
        message: "Elige una foto con papel «Avatar» de este producto.",
      });
    }
    await expect(updateVideoChoices(ana, videoDeAna.id, { environmentPhotoId: avatar.id })).rejects.toMatchObject({
      status: 400,
      message: "Elige una foto con papel «Entorno» de este producto.",
    });

    const listo = await updateVideoChoices(ana, videoDeAna.id, { title: "  Gancho  ", avatarPhotoId: avatar.id, environmentPhotoId: entorno.id });
    expect(listo).toMatchObject({ title: "Gancho", avatarPhotoId: avatar.id, environmentPhotoId: entorno.id, avatarMode: "elegido" });

    // «Sin sustitución» y «nadie» quitan el avatar; elegir un avatar vuelve a «elegido».
    for (const mode of ["sin_sustitucion", "nadie"]) {
      expect(await updateVideoChoices(ana, videoDeAna.id, { avatarMode: mode })).toMatchObject({ avatarMode: mode, avatarPhotoId: null });
      expect(await updateVideoChoices(ana, videoDeAna.id, { avatarPhotoId: avatar.id })).toMatchObject({ avatarMode: "elegido", avatarPhotoId: avatar.id });
      await expect(updateVideoChoices(ana, videoDeAna.id, { avatarMode: mode, avatarPhotoId: avatar.id })).rejects.toMatchObject({ status: 400 });
    }
    for (const bad of ["no_person", true, null]) {
      await expect(updateVideoChoices(ana, videoDeAna.id, { avatarMode: bad })).rejects.toMatchObject({ status: 400, message: "Valor no válido." });
    }
    expect(await getVideoFor(ana, videoDeAna.id)).toMatchObject({ avatarMode: "elegido", avatarPhotoId: avatar.id });
    expect(await updateVideoChoices(ana, videoDeAna.id, { environmentPhotoId: null })).toMatchObject({ environmentPhotoId: null });
  });

  it("tipo, «Qué adaptación quieres» y «Cambios específicos»: se guardan y se comprueban", async () => {
    // Una adaptación con un tipo que no es adaptación es un 400 y no se guarda nada.
    await expect(updateVideoChoices(ana, videoDeAna.id, { adaptation: "Otra idea" })).rejects.toMatchObject({
      status: 400,
      message: "«Qué adaptación quieres» solo va con «Adaptación de concepto».",
    });
    const adaptado = await updateVideoChoices(ana, videoDeAna.id, { kind: "adaptacion_concepto", adaptation: "  Que el pelo salga liso  ", note: " Más\nluz " });
    expect(adaptado).toMatchObject({ kind: "adaptacion_concepto", adaptation: "Que el pelo salga liso", note: "Más\nluz" });
    // Al pasar a «Replicar» la adaptación se conserva (no se usa) y vuelve al cambiar de nuevo.
    expect(await updateVideoChoices(ana, videoDeAna.id, { kind: "replicar" })).toMatchObject({ kind: "replicar", adaptation: "Que el pelo salga liso" });
    expect(await updateVideoChoices(ana, videoDeAna.id, { kind: "adaptacion_concepto", adaptation: "" })).toMatchObject({ adaptation: null });
    expect(await updateVideoChoices(ana, videoDeAna.id, { note: "  " })).toMatchObject({ note: null });

    const bad: Array<[Record<string, unknown>, string]> = [
      [{ kind: "solo_gancho" }, "Valor no válido."],
      [{ kind: 1 }, "Valor no válido."],
      [{ adaptation: 5 }, "Valor no válido."],
      [{ adaptation: "x".repeat(12_001) }, "«Qué adaptación quieres» no puede tener más de 12.000 caracteres."],
      [{ note: "x".repeat(6_001) }, "«Cambios específicos» no puede tener más de 6.000 caracteres."],
      [{ note: ["x"] }, "Valor no válido."],
      [{ kind: "replicar", adaptation: "x" }, "«Qué adaptación quieres» solo va con «Adaptación de concepto»."],
    ];
    for (const [input, message] of bad) {
      await expect(updateVideoChoices(ana, videoDeAna.id, { title: "No se guarda", ...input })).rejects.toMatchObject({ status: 400, message });
    }
    expect(await updateVideoChoices(ana, videoDeAna.id, { adaptation: "x".repeat(12_000) })).toMatchObject({ kind: "adaptacion_concepto" });
    expect((await getVideoFor(ana, videoDeAna.id)).title).toBe("Vídeo 1");
    // Solo quien lo creó.
    await expect(updateVideoChoices(dueno, videoDeAna.id, { note: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("el título no puede quedar vacío ni ser larguísimo", async () => {
    await expect(updateVideoChoices(ana, videoDeAna.id, { title: "   " })).rejects.toMatchObject({ status: 400, message: "Escribe el título del vídeo." });
    await expect(updateVideoChoices(ana, videoDeAna.id, { title: "x".repeat(101) })).rejects.toMatchObject({ status: 400 });
  });

  it("sin fotogramas, pedir uno da 404 y la vista no tiene ninguno", async () => {
    expect((await videoView(ana, videoDeAna.id)).frames).toEqual([]);
    await expect(readVideoFrame(ana, videoDeAna.id, 0)).rejects.toMatchObject({ status: 404, message: "Fotograma no encontrado." });
    await expect(readVideoFrame(luis, videoDeAna.id, 0)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
  });
});
