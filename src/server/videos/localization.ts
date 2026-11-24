/**
 * Localización al país del producto (regla de Emmanuel, 24/11/2026): «la automatización tiene siempre
 * muy presentes el producto con el que trabaja y el país al que va dirigido». Todo lo del vídeo de
 * referencia que sea de otro país se adapta solo a su equivalente más conocido en el país de destino,
 * aunque la tarjeta no lo pida; lo que ponga la tarjeta manda sobre esto.
 *
 * Es el paso central: el desglose saca la lista `localization` (origen → destino) con estas tablas como
 * guía, y la usan el prompt de la imagen, la búsqueda de Pinterest (la cadena del país), el prompt del
 * clip, los rótulos y el doblaje. `localizeText` es la red de seguridad para los textos (rótulos y
 * doblaje): tiendas, lugares y moneda que se colaran sin adaptar.
 *
 * Las tiendas de Alemania vienen de Codex (`nanobanana-pro-imagenes` y `fondos-pinterest-por-toma`): sin
 * tienda indicada, Lidl, Action, Aldi o MediaMarkt según el producto, con el logo auténtico en la
 * cartelería física; nunca se afirma que el producto se venda allí. Sin dependencias de servidor.
 */

export type LocalizationKind = "lugar" | "tienda" | "moneda" | "bandera" | "calle" | "matricula" | "rotulo" | "marca" | "otro";

export interface LocalizationItem {
  kind: LocalizationKind;
  /** Lo que se ve u oye en la referencia («Target», «in den USA», «$12.99»). */
  original: string;
  /** Su equivalente en el país de destino («Lidl», «in Berlin», «12,99 €»). */
  target: string;
}

export interface Market {
  code: string;
  /** País, en español (para las explicaciones) y en el idioma del anuncio. */
  countryEs: string;
  countryLocal: string;
  /** La ciudad más reconocible del país. */
  city: string;
  /** Formato de la moneda: «12,99 €». */
  currency: (amount: string) => string;
  currencySymbol: string;
  /** Cadenas reales del país por tipo de tienda. */
  stores: Record<StoreType, string>;
  /** Bandera del país (emoji). */
  flag: string;
}

export type StoreType = "supermercado" | "descuento" | "bazar" | "drogueria" | "electronica" | "hipermercado" | "mascotas" | "bricolaje" | "ropa";

const euro = (amount: string) => `${amount} €`;

export const MARKETS: Record<string, Market> = {
  DE: {
    code: "DE",
    countryEs: "Alemania",
    countryLocal: "Deutschland",
    city: "Berlin",
    currency: euro,
    currencySymbol: "€",
    flag: "🇩🇪",
    stores: {
      supermercado: "Lidl",
      descuento: "Aldi",
      bazar: "Action",
      drogueria: "dm",
      electronica: "MediaMarkt",
      hipermercado: "Kaufland",
      mascotas: "Fressnapf",
      bricolaje: "OBI",
      ropa: "Primark",
    },
  },
  AT: {
    code: "AT",
    countryEs: "Austria",
    countryLocal: "Österreich",
    city: "Wien",
    currency: euro,
    currencySymbol: "€",
    flag: "🇦🇹",
    stores: { supermercado: "Billa", descuento: "Hofer", bazar: "Action", drogueria: "dm", electronica: "MediaMarkt", hipermercado: "Interspar", mascotas: "Fressnapf", bricolaje: "OBI", ropa: "Primark" },
  },
  CH: {
    code: "CH",
    countryEs: "Suiza",
    countryLocal: "Schweiz",
    city: "Zürich",
    currency: (amount) => `CHF ${amount}`,
    currencySymbol: "CHF",
    flag: "🇨🇭",
    stores: { supermercado: "Migros", descuento: "Lidl", bazar: "Action", drogueria: "Müller", electronica: "MediaMarkt", hipermercado: "Coop", mascotas: "Fressnapf", bricolaje: "Jumbo", ropa: "H&M" },
  },
  IT: {
    code: "IT",
    countryEs: "Italia",
    countryLocal: "Italia",
    city: "Roma",
    currency: euro,
    currencySymbol: "€",
    flag: "🇮🇹",
    stores: { supermercado: "Esselunga", descuento: "Lidl", bazar: "Action", drogueria: "Acqua & Sapone", electronica: "MediaWorld", hipermercado: "Carrefour", mascotas: "Arcaplanet", bricolaje: "Leroy Merlin", ropa: "OVS" },
  },
  FR: {
    code: "FR",
    countryEs: "Francia",
    countryLocal: "France",
    city: "Paris",
    currency: euro,
    currencySymbol: "€",
    flag: "🇫🇷",
    stores: { supermercado: "Carrefour", descuento: "Lidl", bazar: "Action", drogueria: "Sephora", electronica: "Fnac", hipermercado: "Leclerc", mascotas: "Maxi Zoo", bricolaje: "Leroy Merlin", ropa: "Kiabi" },
  },
  ES: {
    code: "ES",
    countryEs: "España",
    countryLocal: "España",
    city: "Madrid",
    currency: euro,
    currencySymbol: "€",
    flag: "🇪🇸",
    stores: { supermercado: "Mercadona", descuento: "Lidl", bazar: "Action", drogueria: "Primor", electronica: "MediaMarkt", hipermercado: "Carrefour", mascotas: "Tiendanimal", bricolaje: "Leroy Merlin", ropa: "Primark" },
  },
  US: {
    code: "US",
    countryEs: "Estados Unidos",
    countryLocal: "USA",
    city: "New York",
    currency: (amount) => `$${amount.replace(",", ".")}`,
    currencySymbol: "$",
    flag: "🇺🇸",
    stores: { supermercado: "Walmart", descuento: "Aldi", bazar: "Target", drogueria: "CVS", electronica: "Best Buy", hipermercado: "Costco", mascotas: "Petco", bricolaje: "Home Depot", ropa: "Old Navy" },
  },
};

/** Cadenas de otros países que se reconocen en las referencias, con su tipo (para buscar el equivalente). */
export const FOREIGN_STORES: Array<{ name: string; type: StoreType; home: string }> = [
  { name: "Walmart", type: "hipermercado", home: "US" },
  { name: "Target", type: "bazar", home: "US" },
  { name: "Costco", type: "hipermercado", home: "US" },
  { name: "Sam's Club", type: "hipermercado", home: "US" },
  { name: "Trader Joe's", type: "descuento", home: "US" },
  { name: "Whole Foods", type: "supermercado", home: "US" },
  { name: "Kroger", type: "supermercado", home: "US" },
  { name: "Safeway", type: "supermercado", home: "US" },
  { name: "Publix", type: "supermercado", home: "US" },
  { name: "Dollar Tree", type: "bazar", home: "US" },
  { name: "Dollar General", type: "bazar", home: "US" },
  { name: "Five Below", type: "bazar", home: "US" },
  { name: "HomeGoods", type: "bazar", home: "US" },
  { name: "TJ Maxx", type: "ropa", home: "US" },
  { name: "Marshalls", type: "ropa", home: "US" },
  { name: "Walgreens", type: "drogueria", home: "US" },
  { name: "CVS", type: "drogueria", home: "US" },
  { name: "Ulta", type: "drogueria", home: "US" },
  { name: "Best Buy", type: "electronica", home: "US" },
  { name: "Home Depot", type: "bricolaje", home: "US" },
  { name: "Lowe's", type: "bricolaje", home: "US" },
  { name: "Petco", type: "mascotas", home: "US" },
  { name: "PetSmart", type: "mascotas", home: "US" },
  { name: "Tesco", type: "supermercado", home: "GB" },
  { name: "Sainsbury's", type: "supermercado", home: "GB" },
  { name: "Asda", type: "supermercado", home: "GB" },
  { name: "Boots", type: "drogueria", home: "GB" },
  { name: "Argos", type: "electronica", home: "GB" },
  { name: "Mercadona", type: "supermercado", home: "ES" },
  { name: "Esselunga", type: "supermercado", home: "IT" },
];

/** El mercado del producto: su primer país; si no se conoce, por su idioma (Alemania por defecto). */
export function marketOf(product: { countries?: string[] | null; language?: string | null }): Market {
  const first = (product.countries?.[0] ?? "").toUpperCase();
  if (MARKETS[first]) return MARKETS[first];
  if (product.language === "it") return MARKETS.IT;
  if (product.language === "fr") return MARKETS.FR;
  if (product.language === "es") return MARKETS.ES;
  if (product.language === "en") return MARKETS.US;
  return MARKETS.DE;
}

/** La cadena equivalente en el mercado para una cadena extranjera (o `null` si no es extranjera). */
export function storeEquivalent(name: string, market: Market): string | null {
  const found = FOREIGN_STORES.find((store) => store.name.toLowerCase() === name.trim().toLowerCase());
  if (!found || found.home === market.code) return null;
  return market.stores[found.type];
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lugares de otros países que más salen en las referencias (en los idiomas de los mercados). */
const FOREIGN_PLACES = [
  "Vereinigten Staaten", "Vereinigte Staaten", "United States", "Estados Unidos", "Stati Uniti", "Amerika", "America", "the States",
  "New York", "Los Angeles", "Las Vegas", "Miami", "Chicago", "San Francisco", "Texas", "Florida", "Kalifornien", "California",
  "USA", "U.S.A.", "NYC", "EE. UU.", "EE.UU.", "EEUU",
];

/** «$12.99», «12.99$», «USD 12.99» → «12,99 €» (o el formato del mercado). */
function localizePrices(text: string, market: Market): string {
  if (market.code === "US") return text;
  const toLocal = (raw: string) => {
    const [whole, cents] = raw.split(/[.,](?=\d{1,2}$)/);
    const amount = cents !== undefined ? `${whole.replace(/[.,]/g, ".")},${cents.padEnd(2, "0")}` : whole.replace(/,/g, ".");
    return market.currency(amount);
  };
  return text
    .replace(/(?:US)?\$\s?(\d[\d.,]*\d|\d)/g, (_, n: string) => toLocal(n))
    .replace(/(\d[\d.,]*\d|\d)\s?(?:\$|USD|dollars?|Dollar)(?![\p{L}])/giu, (_, n: string) => toLocal(n));
}

/**
 * Red de seguridad para los textos (rótulos y doblaje): aplica la localización del desglose y, además,
 * cambia las cadenas extranjeras por la equivalente del mercado, los lugares de fuera por su ciudad y
 * los precios en dólares a su moneda. La gramática de «in den USA» → «in Berlin» la conserva.
 */
export function localizeText(text: string, market: Market, items: readonly LocalizationItem[] = []): string {
  let out = text;
  for (const item of [...items].sort((a, b) => b.original.length - a.original.length)) {
    if (!item.original.trim() || !item.target.trim() || item.kind === "moneda") continue;
    out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(item.original.trim())}(?![\\p{L}])`, "giu"), item.target.trim());
  }
  for (const store of FOREIGN_STORES) {
    const target = storeEquivalent(store.name, market);
    if (target) out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(store.name)}(?![\\p{L}])`, "gu"), target);
  }
  if (market.code !== "US") {
    const art = "(?:(?:den|die|der|dem|the)\\s+)?";
    for (const place of [...FOREIGN_PLACES].sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(`(?<![\\p{L}])${art}${escapeRe(place)}(?![\\p{L}])`, "gu"), market.city);
    }
  }
  return localizePrices(out, market);
}

/** Las equivalencias por defecto del mercado, como texto para las instrucciones de Claude. */
export function localizationGuide(market: Market): string {
  const stores = FOREIGN_STORES.filter((store) => store.home !== market.code)
    .map((store) => `${store.name} → ${market.stores[store.type]}`)
    .join(", ");
  return [
    `País de destino del anuncio: ${market.countryEs} (${market.countryLocal}). La automatización tiene siempre presentes el producto y este país: todo lo de la referencia que sea de otro país se adapta solo a su equivalente más conocido aquí, aunque el encargo no lo pida. Lo que digan las indicaciones del encargo (cambios, adaptación, indicaciones del lote) manda sobre esto.`,
    `- Lugares: una ciudad, estado o país de fuera → ${market.city} (o el sitio de ${market.countryEs} que pida el encargo); en los rótulos con su gramática («in den USA» → «in ${market.city}»).`,
    `- Tiendas y cadenas: la equivalente conocida en ${market.countryEs} según el tipo de tienda (${stores}). Sin tienda indicada y si la escena es de tienda: ${market.stores.supermercado}, ${market.stores.bazar}, ${market.stores.descuento} o ${market.stores.electronica} según el producto. Logo auténtico en la cartelería física; nunca se afirma que el producto se venda allí.`,
    `- Moneda y precios: ${market.currencySymbol}, con el formato de ${market.countryEs} (${market.currency("12,99")}).`,
    `- Calles, rótulos de calle, matrículas, señales y carteles: en el idioma y el estilo de ${market.countryEs}.`,
    `- Banderas: solo las del país de origen → ${market.flag} (la de ${market.countryEs}).`,
    `- Marcas o productos locales que se vean y no sean el del encargo: equivalentes locales o neutros; nunca marcas de terceros en primer plano.`,
  ].join("\n");
}
