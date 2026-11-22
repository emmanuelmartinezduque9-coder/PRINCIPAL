/**
 * Grupos y rasgos de los avatares de la biblioteca. Sin base de datos: lo usan el servidor, la
 * elección automática y las pantallas.
 */

export const AVATAR_GROUPS = ["mujer", "hombre", "nina", "nino", "otro"] as const;
export type AvatarGroup = (typeof AVATAR_GROUPS)[number];

export const isAvatarGroup = (value: unknown): value is AvatarGroup => AVATAR_GROUPS.includes(value as AvatarGroup);

/** Sin tildes y en minúsculas: «Alemán» → «aleman». */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Un rasgo como se guarda: minúsculas, sin tildes, palabras unidas con `_`. Vacío si no queda nada. */
export const normalizeTag = (tag: string) =>
  fold(tag)
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Rasgos del país del anuncio: lo que se prefiere al elegir un avatar solo. */
export const COUNTRY_TRAITS: Record<string, string[]> = {
  DE: ["aleman"],
  AT: ["aleman"],
  CH: ["aleman"],
  IT: ["italiano"],
};

export function countryTraits(countries: readonly string[]): string[] {
  return [...new Set(countries.flatMap((country) => COUNTRY_TRAITS[country] ?? []))];
}
