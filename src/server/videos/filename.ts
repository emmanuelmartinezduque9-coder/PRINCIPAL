/** Trozo de nombre de archivo: el texto en minúsculas, sin acentos ni signos (máx. 60 caracteres). */
export function fileSlug(text: string, fallback: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || fallback;
}
