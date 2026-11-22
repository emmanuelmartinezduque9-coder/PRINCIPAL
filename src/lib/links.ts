/**
 * Enlaces pegados (Instagram, TikTok…): qué se admite y cómo se enseñan. Sin dependencias: lo usan
 * el servidor (que decide) y las pantallas (para avisar antes de enviar). El programa del Mac
 * lleva su propia copia de la lista (`agente-mac/lib.mjs`), y una prueba comprueba que coinciden.
 */

/** Sitios de los que se admite un enlace, con sus subdominios. */
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"] as const;

const MAX_LINK_LENGTH = 2000;

/**
 * Direcciones de un sitio admitido que no son un vídeo sino un salto a otra dirección cualquiera
 * (`facebook.com/flx/warn/?u=…`, `/l.php?u=…`, `l.facebook.com`, `l.instagram.com`,
 * `youtube.com/redirect?q=…`…). Con ellas, el Mac acabaría pidiendo cualquier dirección.
 */
function isRedirector(url: URL): boolean {
  if (/^lm?\.(facebook|instagram)\.com$/.test(url.hostname.toLowerCase())) return true;
  return /^\/+(flx\/warn|l\.php|redirect|linkshim|plugins)(\/|$)/i.test(url.pathname);
}

/**
 * El enlace tal como se guarda y se le da al Mac, o `null` si no se admite: solo `https`, sin
 * usuario ni puerto, de uno de los sitios de `LINK_HOSTS` o un subdominio suyo, y que no sea una
 * de sus direcciones de salto.
 */
export function linkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!LINK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
  if (isRedirector(url)) return null;
  return url.href.length <= MAX_LINK_LENGTH ? url.href : null;
}

/**
 * Cómo se enseña un enlace en una tarjeta o una fila: el sitio (sin `www.`) y lo que lo distingue
 * (el código del reel, del vídeo…), sin parámetros de seguimiento.
 */
export function linkLabel(link: string): { host: string; code: string } {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { host: link, code: "" };
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const video = url.searchParams.get("v");
  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  const code = video && /(^|\.)youtube\.com$/.test(host) ? video : path;
  return { host, code: code.length > 48 ? `${code.slice(0, 47)}…` : code };
}

/**
 * Lo que se pega en «Pegar enlaces»: un enlace por línea (o separados por espacios). Devuelve los
 * que valen, ya normalizados y sin repetir, y las líneas que no valen tal como se escribieron.
 */
export function parsePastedLinks(text: string): { links: string[]; invalid: string[] } {
  const links: string[] = [];
  const invalid: string[] = [];
  for (const piece of text.split(/\s+/)) {
    if (!piece) continue;
    const link = linkOf(piece);
    if (link === null) {
      if (!invalid.includes(piece)) invalid.push(piece);
    } else if (!links.includes(link)) {
      links.push(link);
    }
  }
  return { links, invalid };
}
