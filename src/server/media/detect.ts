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

export type AudioMime = "audio/mpeg" | "audio/mp4" | "audio/wav";

/** Marcas `ftyp` de audio MP4 (M4A/M4B y las genéricas con las que se guardan muchos M4A). */
const AUDIO_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "mp42", "mp41", "isom", "iso2", "dash"]);

/**
 * Detecta MP3, M4A o WAV por los primeros bytes, nunca por el nombre ni por lo que diga el
 * navegador. Un MP4 «de audio» y uno de vídeo comparten contenedor: `probeAudio` rechaza después
 * los que llevan vídeo de verdad.
 */
export function detectAudioType(head: Buffer): AudioMime | null {
  if (head.length >= 3 && head.toString("latin1", 0, 3) === "ID3") return "audio/mpeg";
  // Cabecera de trama MPEG: 11 bits de sincronía, versión válida (no 01) y capa válida (no 00).
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && ((head[1] >> 3) & 0x03) !== 0x01 && ((head[1] >> 1) & 0x03) !== 0x00) {
    return "audio/mpeg";
  }
  if (head.length >= 12 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WAVE") return "audio/wav";
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp" && AUDIO_BRANDS.has(head.toString("latin1", 8, 12))) return "audio/mp4";
  return null;
}
