import type { ManifestItem } from "@/server/videos/manifest";

/**
 * Comprobación de los prompts antes de gastar: lo que las reglas de imagen y de vídeo dicen que
 * no debe llevar un prompt y que se puede ver leyendo el texto. Un `error` es algo que hay que
 * quitar; un `aviso` es una recomendación. No sustituye a mirar el resultado.
 */

export const PROMPT_BLACKLIST = [
  "cinematic",
  "studio lighting",
  "softbox",
  "golden hour",
  "color grading",
  "moody",
  "dramatic lighting",
  "professional photograph",
  "editorial",
  "hyperrealistic",
  "8K",
  "masterpiece",
  "octane render",
  "subsurface scattering",
  "bokeh",
  "shallow depth of field",
  "flawless skin",
  "dewy",
  "airbrushed",
  "glowing skin",
] as const;

export interface PromptIssue {
  level: "error" | "aviso";
  message: string;
}

const IMAGE_TARGET_CHARS = 4_900;
const IMAGE_MIN_CHARS = 4_000;
const IMAGE_MAX_CHARS = 5_500;
const VIDEO_MAX_CHARS = 4_000;
/** Una línea de al menos estos caracteres sin minúsculas es un título en mayúsculas. */
const HEADING_MIN_CHARS = 6;
/** Con tantos títulos en mayúsculas, el prompt está escrito en bloques. */
const HEADINGS_FOR_ERROR = 3;

const EMPTY = "El prompt está vacío.";
const HEADINGS = "Escribe el prompt en párrafos corridos, sin bloques con títulos en mayúsculas.";
const BAD_TAG = "Escribe las referencias exactamente como @Video1 y @Image1 (mayúscula inicial, sin espacio).";
const ADDRESS = "No pongas direcciones ni identificadores en el prompt.";
const VIDEO_TOO_LONG = "El prompt del clip es muy largo (más de 4.000 caracteres).";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** La palabra o expresión entera, sin distinguir mayúsculas, con cualquier espacio entre palabras. */
function wholeWord(term: string): RegExp {
  const body = term.split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "iu");
}

const BLACKLIST_PATTERNS = PROMPT_BLACKLIST.map((term) => ({ term, pattern: wholeWord(term) }));

/** Miles con punto, como se escriben en español (1.200). */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function commonIssues(prompt: string): PromptIssue[] {
  const issues: PromptIssue[] = [];
  for (const { term, pattern } of BLACKLIST_PATTERNS) {
    if (pattern.test(prompt)) issues.push({ level: "error", message: `Quita «${term}»: es una palabra vetada.` });
  }
  const headings = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= HEADING_MIN_CHARS && /\p{Lu}/u.test(line) && !/\p{Ll}/u.test(line));
  if (headings.length >= HEADINGS_FOR_ERROR) issues.push({ level: "error", message: HEADINGS });
  return issues;
}

export function checkImagePrompt(prompt: string, manifest: ManifestItem[]): PromptIssue[] {
  const text = prompt.trim();
  if (!text) return [{ level: "error", message: EMPTY }];
  const issues = commonIssues(text);
  if (text.length < IMAGE_MIN_CHARS || text.length > IMAGE_MAX_CHARS) {
    issues.push({
      level: "aviso",
      message: `El prompt de imagen suele ir mejor con unos ${thousands(IMAGE_TARGET_CHARS)} caracteres (ahora tiene ${thousands(text.length)}).`,
    });
  }
  for (const item of manifest) {
    if (!new RegExp(`(?<![\\p{L}\\p{N}_])image\\s+${item.index}(?!\\d)`, "iu").test(text)) {
      issues.push({ level: "aviso", message: `No dices para qué sirve la imagen ${item.index}.` });
    }
  }
  return issues;
}

/** Una `@` que empieza etiqueta (no la de una dirección de correo) y lo que la sigue, con espacios. */
const TAG = /(?<![\p{L}\p{N}_])@\s*[\p{L}\p{N}_]*/gu;
const CANONICAL = /^@(Video|Image)([1-9]\d*)$/;
const URL = /https?:\/\//i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function checkVideoPrompt(prompt: string, manifest: ManifestItem[]): PromptIssue[] {
  const text = prompt.trim();
  if (!text) return [{ level: "error", message: EMPTY }];
  const issues = commonIssues(text);

  const known = new Set(manifest.map((item) => item.tag));
  const images = manifest.filter((item) => item.tag.startsWith("@Image")).length;
  const used = new Set<string>();
  let malformed = false;
  const missingReported = new Set<string>();
  for (const [tag] of text.matchAll(TAG)) {
    const match = CANONICAL.exec(tag);
    if (!match) {
      malformed = true;
      continue;
    }
    used.add(tag);
    if (known.has(tag) || missingReported.has(tag)) continue;
    missingReported.add(tag);
    issues.push({
      level: "error",
      message:
        match[1] === "Video"
          ? `${tag} no existe: este clip lleva un solo vídeo.`
          : `${tag} no existe: este clip lleva ${images} ${images === 1 ? "imagen" : "imágenes"}.`,
    });
  }
  if (malformed) issues.push({ level: "error", message: BAD_TAG });
  for (const item of manifest) {
    if (!used.has(item.tag)) issues.push({ level: "error", message: `Falta decir para qué sirve ${item.tag}.` });
  }
  if (URL.test(text) || UUID.test(text)) issues.push({ level: "error", message: ADDRESS });
  if (text.length > VIDEO_MAX_CHARS) issues.push({ level: "aviso", message: VIDEO_TOO_LONG });
  return issues;
}
