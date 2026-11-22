export type VideoMime = "video/mp4" | "video/quicktime" | "video/webm";

/** Marcas `ftyp` de imágenes (HEIC, AVIF…): comparten contenedor con el vídeo pero no lo son. */
const IMAGE_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif", "avis"]);

/** Detecta el tipo de vídeo por los primeros bytes, nunca por el nombre ni por lo que diga el navegador. */
export function detectVideoType(head: Buffer): VideoMime | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return "video/webm";
  }
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") {
    const brand = head.toString("latin1", 8, 12);
    if (IMAGE_BRANDS.has(brand)) return null;
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}
