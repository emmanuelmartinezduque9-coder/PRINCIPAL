import type { PhotoRole } from "@/lib/photo-roles";
import type { Product } from "@/server/products";
import type { Serialized } from "@/lib/api";

/** Textos para mostrar de los idiomas y países que admite el servidor. */
export const LANGUAGE_LABELS: Record<string, string> = { de: "Alemán", it: "Italiano" };
export const COUNTRY_LABELS: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia" };

export const languageLabel = (code: string) => LANGUAGE_LABELS[code] ?? code;
export const countryLabels = (codes: string[]) => codes.map((code) => COUNTRY_LABELS[code] ?? code);

/** Papel de cada foto del producto, y la pista de para qué sirve (se ve al pasar el ratón). */
export const PHOTO_ROLE_LABELS: Record<PhotoRole, string> = {
  articulo: "Artículo",
  embalaje: "Embalaje",
  avatar: "Avatar",
  entorno: "Entorno",
  funcionamiento: "Funcionando",
  marca: "Logo",
  logo_web: "Logo web",
  otro: "Otra",
};
export const PHOTO_ROLE_HINTS: Record<PhotoRole, string> = {
  articulo: "Artículo: el producto",
  embalaje: "Embalaje: la caja o el envase",
  avatar: "Avatar: la persona que saldrá en los vídeos",
  entorno: "Entorno: el sitio o el estilo que quieres",
  funcionamiento: "Funcionando: el producto en uso o su efecto (se adjunta con el artículo)",
  marca: "Logo: el emblema de la cuenta",
  logo_web: "Logo web: el logo en vertical, para la web",
  otro: "Otra",
};

/** Producto tal como llega por JSON, con la portada si tiene fotos. */
export type ProductView = Serialized<Product> & { coverPhotoId?: number | null };

/** Pestañas del detalle de un producto; la elegida va en la dirección (`?pestana=videos`). */
export const PRODUCT_TABS = ["fotos", "videos", "nicho"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];
export const isProductTab = (value: unknown): value is ProductTab => PRODUCT_TABS.includes(value as ProductTab);

/** Dirección de una pestaña del producto. */
export const productTabHref = (productId: number | string, tab: ProductTab) => `/productos/${productId}?pestana=${tab}`;

/** Nombre del producto con su emoji delante, si tiene. */
export const productLabel = (product: { name: string; emoji?: string | null }) =>
  product.emoji ? `${product.emoji} ${product.name}` : product.name;

/** Emoji habituales para productos de las tiendas. */
export const PRODUCT_EMOJIS = [
  "🍦", "💇‍♀️", "🏷️", "🐶", "🐱", "🎄", "🧣", "☂️",
  "💅", "✨", "🎀", "🔥", "⭐", "💄", "👗", "👟",
  "👜", "💍", "🧴", "🧼", "🪥", "🛁", "🕯️", "🌸",
  "🌿", "☕", "🍫", "🍷", "🧸", "🎁", "🎮", "📱",
  "🎧", "💡", "🧹", "🍳", "🏋️", "⚽", "🚗", "💤",
];
