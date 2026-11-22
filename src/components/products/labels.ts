import type { Product } from "@/server/products";
import type { Serialized } from "@/lib/api";

/** Textos para mostrar de los idiomas y países que admite el servidor. */
export const LANGUAGE_LABELS: Record<string, string> = { de: "Alemán", it: "Italiano" };
export const COUNTRY_LABELS: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia" };

export const languageLabel = (code: string) => LANGUAGE_LABELS[code] ?? code;
export const countryLabels = (codes: string[]) => codes.map((code) => COUNTRY_LABELS[code] ?? code);

/** Producto tal como llega por JSON, con la portada si tiene fotos. */
export type ProductView = Serialized<Product> & { coverPhotoId?: number | null };
