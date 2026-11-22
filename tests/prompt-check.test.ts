import { describe, expect, it } from "vitest";
import type { PhotoInfo, PhotoRole } from "@/server/photos";
import { clipManifest, imageManifest } from "@/server/videos/manifest";
import { checkImagePrompt, checkVideoPrompt, PROMPT_BLACKLIST } from "@/server/videos/prompt-check";
import type { Video } from "@/server/videos/videos";

const photo = (id: number, role: PhotoRole): PhotoInfo => ({ id, role, mime: "image/jpeg", size: 100 });
const video = { id: 1, avatarPhotoId: 10, environmentPhotoId: 40, noPerson: false } as Video;

/** image 1 composición, 2 avatar, 3 y 4 artículo, 5 embalaje, 6 entorno. */
const manifest = imageManifest(video, [photo(10, "avatar"), photo(20, "articulo"), photo(21, "articulo"), photo(30, "embalaje"), photo(40, "entorno")]);
/** @Video1, @Image1 aprobada, @Image2 avatar, @Image3 artículo, @Image4 embalaje: 4 imágenes. */
const clip = clipManifest(video, [photo(10, "avatar"), photo(20, "articulo"), photo(30, "embalaje")]);

const FILLER =
  "The light comes from the shop window on her left and falls softly across the wooden counter, leaving the far shelves in a mild shadow. ";

function padTo(text: string, length: number): string {
  let out = text;
  while (out.length + FILLER.length <= length) out += FILLER;
  return out + "x".repeat(length - out.length);
}

const IMAGE_CORE = [
  "Image 1 supplies the composition and camera distance of the opening moment, not the identity of the person in it.",
  "The woman is the person from image 2: keep her face, hair and build exactly, with natural skin texture seen from a normal phone distance.",
  "She holds the bottle from image 3 in her right hand at chest height, label facing the camera; image 4 shows the same bottle from the side and fixes its exact proportions against her fingers.",
  "The cardboard box from image 5 rests closed on the counter beside her, its printed side towards us.",
  "The setting is the kitchen from image 6, with its tiled wall and the window on the left as the only light source.",
].join(" ");
const GOOD_IMAGE = padTo(IMAGE_CORE + " ", 4_900);

const GOOD_VIDEO = [
  "@Video1 defines only the order of the shots, the rhythm of the cuts, the camera and the type of action.",
  "Do not use the person, the product, the clothes, the space, the colours, the text or the logos of @Video1.",
  "@Image1 is a contextual reference of the woman with the bottle in her kitchen; it is not an exact first frame. The opening scene is her standing at the counter holding the bottle.",
  "@Image2 defines the woman: same face, hair and clothes in every shot.",
  "@Image3 defines the product: exact shape, proportions, colours and label placement. The bottle is rigid and never bends or changes size.",
  "@Image4 defines the packaging, a closed cardboard box that stays on the counter.",
  "Shot 1, 0.0 to 2.0 s: medium shot at chest height, slow push in; she lifts the bottle. End state: bottle at chest height.",
  "Shot 2, 2.0 to 6.0 s: close-up; her hand turns the bottle so the label faces us. End state: product centred and still.",
  "Pure video. No on-screen text, no subtitles, no logos except the product's own label, no watermark, no music.",
].join("\n");

describe("lista negra", () => {
  it("tiene las 20 palabras vetadas", () => {
    expect(PROMPT_BLACKLIST).toHaveLength(20);
  });
});

describe("prompt de imagen", () => {
  it("uno bueno no da avisos", () => {
    expect(GOOD_IMAGE.length).toBe(4_900);
    expect(checkImagePrompt(GOOD_IMAGE, manifest)).toEqual([]);
  });

  it("una palabra vetada es un error, sin distinguir mayúsculas y por palabra completa", () => {
    expect(checkImagePrompt(GOOD_IMAGE + " Golden Hour light.", manifest)).toContainEqual({
      level: "error",
      message: "Quita «golden hour»: es una palabra vetada.",
    });
    expect(checkImagePrompt(GOOD_IMAGE + " Shot in 8K.", manifest)).toContainEqual({ level: "error", message: "Quita «8K»: es una palabra vetada." });
    // Dentro de otra palabra no cuenta.
    expect(checkImagePrompt(GOOD_IMAGE.slice(0, 4_800) + " editorially 18K moodyish", manifest)).toEqual([]);
  });

  it("tres títulos en mayúsculas son un error; dos no", () => {
    expect(checkImagePrompt("CRITICAL —\n…\nNEGATIVE:\n…\nSTRICT REQUIREMENTS:\n…", manifest)).toContainEqual({
      level: "error",
      message: "Escribe el prompt en párrafos corridos, sin bloques con títulos en mayúsculas.",
    });
    const two = "CRITICAL —\n" + GOOD_IMAGE.slice(0, 4_800) + "\nNEGATIVE:\nnothing";
    expect(checkImagePrompt(two, manifest)).toEqual([]);
  });

  it("avisa de la longitud fuera de 4.000–5.500 caracteres", () => {
    const short = padTo(IMAGE_CORE + " ", 1_200);
    expect(short.length).toBe(1_200);
    expect(checkImagePrompt(short, manifest)).toContainEqual({
      level: "aviso",
      message: "El prompt de imagen suele ir mejor con unos 4.900 caracteres (ahora tiene 1.200).",
    });
    expect(checkImagePrompt(padTo(IMAGE_CORE + " ", 4_000), manifest)).toEqual([]);
    expect(checkImagePrompt(padTo(IMAGE_CORE + " ", 5_500), manifest)).toEqual([]);
    expect(checkImagePrompt(padTo(IMAGE_CORE + " ", 5_501), manifest)).toEqual([
      { level: "aviso", message: "El prompt de imagen suele ir mejor con unos 4.900 caracteres (ahora tiene 5.501)." },
    ]);
  });

  it("avisa de cada imagen del manifiesto que no se cita", () => {
    const withoutImage3 = GOOD_IMAGE.replace("image 3", "the first product photo");
    expect(checkImagePrompt(withoutImage3, manifest)).toContainEqual({ level: "aviso", message: "No dices para qué sirve la imagen 3." });
    // «image 10» no cuenta como «image 1».
    const onlyTen = GOOD_IMAGE.replace("Image 1 supplies", "Image 10 supplies");
    expect(checkImagePrompt(onlyTen, manifest)).toContainEqual({ level: "aviso", message: "No dices para qué sirve la imagen 1." });
  });

  it("vacío", () => {
    expect(checkImagePrompt("   ", manifest)).toEqual([{ level: "error", message: "El prompt está vacío." }]);
  });
});

describe("prompt del clip", () => {
  it("uno bueno no da avisos", () => {
    expect(checkVideoPrompt(GOOD_VIDEO, clip)).toEqual([]);
  });

  it("las etiquetas se escriben exactamente como @Video1 y @ImageN", () => {
    const message = "Escribe las referencias exactamente como @Video1 y @Image1 (mayúscula inicial, sin espacio).";
    expect(checkVideoPrompt(GOOD_VIDEO.replace("@Video1", "@video1"), clip)).toContainEqual({ level: "error", message });
    expect(checkVideoPrompt(GOOD_VIDEO + " @ Image2", clip)).toContainEqual({ level: "error", message });
    expect(checkVideoPrompt(GOOD_VIDEO + " @IMAGE2", clip)).toContainEqual({ level: "error", message });
    // Una dirección de correo no es una etiqueta.
    expect(checkVideoPrompt(GOOD_VIDEO + " ana@example", clip)).toEqual([]);
  });

  it("una etiqueta que el clip no lleva es un error", () => {
    expect(checkVideoPrompt(GOOD_VIDEO + " @Image7", clip)).toContainEqual({ level: "error", message: "@Image7 no existe: este clip lleva 4 imágenes." });
    expect(checkVideoPrompt(GOOD_VIDEO + " @Video2", clip)).toContainEqual({ level: "error", message: "@Video2 no existe: este clip lleva un solo vídeo." });
  });

  it("cada etiqueta del manifiesto tiene que citarse", () => {
    const withoutImage3 = GOOD_VIDEO.replace("@Image3", "The product photo");
    expect(checkVideoPrompt(withoutImage3, clip)).toContainEqual({ level: "error", message: "Falta decir para qué sirve @Image3." });
    const withoutVideo = GOOD_VIDEO.replaceAll("@Video1", "the reference");
    expect(checkVideoPrompt(withoutVideo, clip)).toContainEqual({ level: "error", message: "Falta decir para qué sirve @Video1." });
  });

  it("la imagen aprobada sin numerar no se cita", () => {
    const unnumbered = clipManifest({ ...video, frameUse: "start_image" } as Video, [photo(10, "avatar"), photo(20, "articulo"), photo(30, "embalaje")], false);
    expect(unnumbered.map((m) => m.tag)).toEqual(["@Video1", "start_image", "@Image1", "@Image2", "@Image3"]);
    const prompt = GOOD_VIDEO.split("\n")
      .filter((line) => !line.startsWith("@Image1 "))
      .join("\n")
      .replace("@Image2", "@Image1")
      .replace("@Image3", "@Image2")
      .replace("@Image4", "@Image3");
    expect(checkVideoPrompt(prompt, unnumbered)).toEqual([]);
  });

  it("ni direcciones ni identificadores", () => {
    const message = "No pongas direcciones ni identificadores en el prompt.";
    expect(checkVideoPrompt(GOOD_VIDEO + " https://x.test/a.mp4", clip)).toContainEqual({ level: "error", message });
    expect(checkVideoPrompt(GOOD_VIDEO + " 3f2b8c1e-9a4d-4e2f-b1c3-0d5e6f7a8b9c", clip)).toContainEqual({ level: "error", message });
  });

  it("palabras vetadas, vacío y demasiado largo", () => {
    expect(checkVideoPrompt(GOOD_VIDEO + " bokeh", clip)).toContainEqual({ level: "error", message: "Quita «bokeh»: es una palabra vetada." });
    expect(checkVideoPrompt("", clip)).toContainEqual({ level: "error", message: "El prompt está vacío." });
    const long = padTo(GOOD_VIDEO + "\n", 4_001);
    expect(checkVideoPrompt(long, clip)).toEqual([{ level: "aviso", message: "El prompt del clip es muy largo (más de 4.000 caracteres)." }]);
    expect(checkVideoPrompt(padTo(GOOD_VIDEO + "\n", 4_000), clip)).toEqual([]);
  });
});
