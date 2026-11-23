// Agente del Mac de PRINCIPAL: datos de mercado reales para «Buscar nicho / ángulo / audiencia».
//
// La nube y la búsqueda web de Claude no ven las cifras que importan (Amazon bloquea a los
// servidores; la Biblioteca de anuncios de Meta y TikTok se pintan con JavaScript). Este Mac las ve
// como una persona: abre cada búsqueda en un Chrome (o Brave) SIN VENTANA, con una carpeta temporal
// (nunca el perfil de nadie) y, para TikTok, las cookies del archivo de sesión si las hay.
//
// Por cada consulta trae:
// - Amazon del país: número de resultados y los 10 primeros (título, valoraciones, «X Mal im letzten
//   Monat gekauft», precio, si es anuncio).
// - Biblioteca de anuncios de Meta: anuncios activos en el país y anunciantes.
// - TikTok: vídeos con sus vistas (solo si el archivo de sesión tiene la sesión de TikTok).
// - YouTube: vídeos con sus vistas (yt-dlp, sin navegador).
//
// Nunca escribe cookies en el registro ni inicia sesión en nada.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cdp, headlessBrowser, parseCount, siteCookies, START_TIMEOUT_MS, UA } from "./perfil.mjs";

/** Lo más que se consulta en una tarea. */
export const MAX_QUERIES = 10;
const AMAZON_WAIT_MS = 7_000;
const META_WAIT_MS = 11_000;
const TIKTOK_WAIT_MS = 10_000;

/** Amazon de cada país. */
export const AMAZON_BY_COUNTRY = { DE: "www.amazon.de", AT: "www.amazon.de", CH: "www.amazon.de", IT: "www.amazon.it", FR: "www.amazon.fr", ES: "www.amazon.es", US: "www.amazon.com", GB: "www.amazon.co.uk" };

export const amazonUrl = (country, query) => `https://${AMAZON_BY_COUNTRY[country] ?? "www.amazon.de"}/s?k=${encodeURIComponent(query)}`;
export const metaUrl = (country, query) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`;
export const tiktokUrl = (query) => `https://www.tiktok.com/search/video?q=${encodeURIComponent(query)}`;

/** «~1.100 resultados», «1.234 Ergebnisse», «0» → número; `null` si no se ve. */
export function metaTotal(text) {
  if (typeof text !== "string") return null;
  if (/(Keine Werbeanzeigen|keine Ergebnisse|No hay ningún anuncio|No ads match|Nessuna inserzione)/i.test(text)) return 0;
  const m = text.match(/~?\s?([\d.,]+)\s*(?:Tsd\.|mil|K)?\s+(Ergebnisse|resultados|results|risultati)/i);
  if (!m) return null;
  const k = /(Tsd\.|mil|K)\s+(Ergebnisse|resultados|results|risultati)/i.test(m[0]) ? 1000 : 1;
  return Math.round(Number.parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) * k);
}

/** «100+ Mal im letzten Monat gekauft» → 100; `null` si no aparece. */
export function boughtLastMonth(text) {
  const m = typeof text === "string" ? text.match(/([\d.,]+)\s*(Tsd\.|K)?\+?\s*Mal im letzten Monat gekauft|([\d.,]+)\s*(mila|K)?\+?\s*acquist/i) : null;
  if (!m) return null;
  const n = parseCount((m[1] ?? m[3]).replace(/\+/g, ""));
  return n === null ? null : n * (m[2] || m[4] ? 1000 : 1);
}

const READ_AMAZON = `(() => {
  const info = document.querySelector('[data-component-type="s-result-info-bar"], .s-desktop-toolbar')?.innerText?.replace(/\\s+/g, ' ') || '';
  const items = [...document.querySelectorAll('[data-component-type="s-search-result"]')].slice(0, 10).map(el => {
    const t = el.innerText || '';
    return {
      titulo: (el.querySelector('h2')?.innerText || '').slice(0, 160),
      url: el.querySelector('h2 a, a.a-link-normal[href*="/dp/"]')?.href?.split('?')[0] || null,
      valoraciones: (t.match(/\\(([\\d.,]+)\\)/) || [])[1] || null,
      estrellas: (t.match(/([\\d,]+) von 5 Sternen/) || [])[1] || null,
      compras: (t.match(/[^\\n]*Mal im letzten Monat gekauft[^\\n]*|[^\\n]*acquistat[^\\n]*/i) || [])[0] || null,
      precio: el.querySelector('.a-price .a-offscreen')?.innerText || null,
      anuncio: /Gesponsert|Sponsorizzato|Sponsored/.test(t),
    };
  });
  return JSON.stringify({ info: info.slice(0, 160), items, bloqueado: /captcha|Robot/i.test(document.title + document.body.innerText.slice(0, 500)) });
})()`;

const READ_META = `(() => {
  const body = document.body?.innerText || '';
  const total = (body.match(/~?\\s?[\\d.,]+\\s*(Tsd\\.|mil|K)?\\s+(Ergebnisse|resultados|results|risultati)/i) || [])[0] || (/(Keine Werbeanzeigen|keine Ergebnisse|No hay ningún anuncio|No ads match|Nessuna inserzione)/i.test(body) ? '0 results' : null);
  const anunciantes = [...new Set([...document.querySelectorAll('a[href^="https://www.facebook.com/"] span, a[href^="https://www.facebook.com/"]')].map(s => (s.innerText || '').trim()).filter(x => x && x.length < 60 && !/^(Shop Now|Learn More|Jetzt einkaufen|Mehr dazu|Comprar|Más información|Instalar|Installieren)$/i.test(x)))].slice(0, 12);
  return JSON.stringify({ total, anunciantes });
})()`;

const READ_TIKTOK = `(() => {
  const login = !!document.querySelector('[data-e2e="login-modal"], [data-e2e="top-login-button"]') && !document.querySelector('[data-e2e="search_video-item"], [data-e2e="search-common-link"]');
  const videos = [...document.querySelectorAll('a[href*="/video/"]')].map(a => ({
    url: a.href.split('?')[0],
    vistasTexto: a.querySelector('strong[data-e2e="video-views"], [data-e2e="video-views"]')?.innerText || (a.innerText.match(/[\\d.,]+[KMk]?/) || [])[0] || null,
    texto: (a.closest('[data-e2e="search_video-item"]')?.parentElement?.innerText || '').replace(/\\s+/g, ' ').slice(0, 160),
  }));
  return JSON.stringify({ login, videos: videos.slice(0, 15) });
})()`;

/**
 * Abre un navegador sin ventana y lo deja listo (con las cookies de `sites` del archivo de sesión,
 * si se pasa). Devuelve `{ goto, close }`; `goto(url, waitMs, expression, before?)` navega, espera,
 * ejecuta `before` (p. ej. rechazar cookies), y devuelve lo que devuelve `expression` (JSON).
 */
async function openBrowser({ browser = headlessBrowser(), sessionText = "", sites = [], sleep }) {
  if (!browser) throw new Error("No está Chrome ni Brave en /Applications.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "principal-datos-"));
  const child = spawn(browser, ["--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", `--user-agent=${UA}`, "--window-size=1280,2400", "--lang=de-DE", "about:blank"], { stdio: "ignore", detached: true });
  const close = async (page) => {
    page?.close();
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  };
  let port = null;
  for (let waited = 0; !port && waited < START_TIMEOUT_MS; waited += 250) {
    await sleep(250);
    port = (await fs.readFile(path.join(dir, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0] || null;
  }
  if (!port) {
    await close(null);
    throw new Error("El navegador no arrancó a tiempo.");
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = await cdp(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Network.enable");
  const cookies = sites.length > 0 ? siteCookies(sessionText, sites) : [];
  if (cookies.length > 0) await page.send("Network.setCookies", { cookies });
  const evaluate = async (expression) => (await page.send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
  return {
    async goto(url, waitMs, expression, before) {
      await page.send("Page.navigate", { url });
      await sleep(waitMs);
      if (before) {
        await evaluate(before);
        await sleep(3_000);
      }
      const value = await evaluate(expression);
      return typeof value === "string" ? JSON.parse(value) : null;
    },
    close: () => close(page),
  };
}

/**
 * Datos de mercado de cada consulta. `deps.sleep`; `deps.youtube(query)` devuelve vídeos con vistas
 * (yt-dlp), y `deps.openBrowser` permite sustituir el navegador en las pruebas.
 */
export async function collectMarketData({ country, queries }, { sessionFile, sleep, youtube, openBrowser: open = openBrowser }) {
  const sessionText = await fs.readFile(sessionFile, "utf8").catch(() => "");
  const hasTikTok = siteCookies(sessionText, ["tiktok.com"]).some((c) => c.name === "sessionid" || c.name === "sid_tt");
  const browser = await open({ sessionText, sites: hasTikTok ? ["tiktok.com"] : [], sleep });
  const results = [];
  try {
    for (const raw of queries.slice(0, MAX_QUERIES)) {
      // Cada consulta: texto para Amazon, TikTok y YouTube; `anuncios`, palabras cortas para Meta.
      const query = typeof raw === "string" ? raw : String(raw?.texto ?? "");
      const adsQuery = typeof raw === "string" ? raw : String(raw?.anuncios ?? raw?.texto ?? "");
      if (!query) continue;
      const entry = { consulta: query, anuncios: adsQuery, amazon: null, meta: null, tiktok: null, youtube: null };
      try {
        const url = amazonUrl(country, query);
        const page = await browser.goto(url, AMAZON_WAIT_MS, READ_AMAZON, "document.querySelector('#sp-cc-rejectall-link')?.click()");
        if (page && !page.bloqueado) {
          const total = page.info.match(/([\d.,]+)\s+(Ergebnisse|risultati|results|résultats|resultados)/i);
          entry.amazon = {
            url,
            resultados: total ? parseCount(total[1]) : null,
            productos: page.items.map((item) => ({
              titulo: item.titulo,
              url: item.url,
              valoraciones: parseCount(item.valoraciones ?? ""),
              estrellas: item.estrellas,
              compradosUltimoMes: boughtLastMonth(item.compras),
              precio: item.precio,
              anuncio: item.anuncio,
            })),
          };
        }
      } catch {
        // Una fuente que falla no impide las demás.
      }
      try {
        const url = metaUrl(country, adsQuery);
        const page = await browser.goto(url, META_WAIT_MS, READ_META);
        if (page) entry.meta = { url, anunciosActivos: metaTotal(page.total), anunciantes: page.anunciantes };
      } catch {
        // idem
      }
      if (hasTikTok) {
        try {
          const url = tiktokUrl(query);
          const page = await browser.goto(url, TIKTOK_WAIT_MS, READ_TIKTOK);
          if (page && !page.login) entry.tiktok = { url, videos: page.videos.map((v) => ({ url: v.url, vistas: parseCount(v.vistasTexto ?? ""), texto: v.texto })) };
        } catch {
          // idem
        }
      }
      try {
        entry.youtube = await youtube(query);
      } catch {
        entry.youtube = null;
      }
      results.push(entry);
    }
  } finally {
    await browser.close();
  }
  return { pais: country, tiktokConSesion: hasTikTok, consultas: results };
}

/** Argumentos de yt-dlp para buscar vídeos de YouTube (sin descargar nada). */
export function youtubeSearchArgs(query, count = 8) {
  return ["--ignore-config", "--flat-playlist", "-J", "--", `ytsearch${count}:${query}`];
}

/** Lo que interesa de la búsqueda de YouTube. */
export function youtubeFrom(json, query) {
  const entries = Array.isArray(json?.entries) ? json.entries : [];
  return {
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    videos: entries.slice(0, 8).map((e) => ({ url: e.url ?? null, titulo: (e.title ?? "").slice(0, 160), vistas: Number.isFinite(e.view_count) ? e.view_count : null })).filter((v) => v.url),
  };
}
