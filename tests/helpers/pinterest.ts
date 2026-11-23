import { markPinterestReadyForTests, setPinterestForTests, storePinterestImage } from "@/server/videos/pinterest";

/**
 * Para las pruebas que piden imágenes: la búsqueda de Pinterest (regla fija: siempre) se resuelve al
 * momento con una foto (`jpeg`), sin red ni Claude. La imagen lleva entonces una referencia más al final.
 */
export function instantPinterest(jpeg: () => Buffer): void {
  setPinterestForTests(async (run) => {
    const sha256 = await storePinterestImage(jpeg(), { url: "https://i.pinimg.com/originals/prueba.jpg", pinId: "prueba", width: null, height: null });
    await markPinterestReadyForTests(run.id, [{ sha256, query: "prueba", pinId: "prueba", sourceUrl: "https://i.pinimg.com/originals/prueba.jpg", reason: "prueba" }]);
  });
}
