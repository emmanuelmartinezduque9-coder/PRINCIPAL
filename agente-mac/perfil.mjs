// Agente del Mac de PRINCIPAL: leer el PERFIL de una cuenta (Instagram o TikTok) para el alta de
// productos. La nube no puede: Instagram no deja leer perfiles sin sesión y bloquea a los servidores.
//
// - Instagram: abre el perfil en un Brave SIN VENTANA, con una carpeta de perfil temporal (nunca la
//   de la persona) y las cookies de Instagram del archivo de sesión (`~/.principal-agente-instagram.txt`).
//   Lee la cabecera (nombre, biografía, enlace de la tienda) y la cuadrícula de reels (enlace, vistas,
//   texto de la miniatura). Si Instagram enseña un aviso o pide iniciar sesión, lo dice con un código.
// - TikTok: yt-dlp con la lista del perfil (`--flat-playlist`, como mucho 15), que trae vistas y textos.
//
// Devuelve siempre un objeto `{ ok: true, perfil }` o `{ ok: false, codigo, error }`. Nunca escribe
// las cookies en el registro.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** El navegador sin ventana: Chrome si está; si no, Brave. Las cookies se le dan aparte. */
export const headlessBrowser = (exists = existsSync) => [CHROME, BRAVE].find((b) => exists(b)) ?? null;
/** Cuántos reels se leen de un perfil. */
export const MAX_REELS = 15;
const PAGE_WAIT_MS = 12_000;
export const START_TIMEOUT_MS = 20_000;
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** ¿Es un perfil (no un vídeo suelto)? Devuelve `{ red, usuario }` o `null`. */
export function profileOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    if (parts.length === 0 || ["reel", "reels", "p", "tv", "stories", "explore", "accounts"].includes(parts[0])) return null;
    return /^[A-Za-z0-9._]{1,30}$/.test(parts[0]) ? { red: "instagram", usuario: parts[0] } : null;
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    if (parts.length !== 1 || !parts[0].startsWith("@")) return null;
    return /^@[A-Za-z0-9._]{1,40}$/.test(parts[0]) ? { red: "tiktok", usuario: parts[0].slice(1) } : null;
  }
  return null;
}

/** Cookies de Instagram del archivo Netscape, listas para el navegador. */
export function instagramCookies(text) {
  return siteCookies(text, ["instagram.com"]);
}

/** Cookies de esos sitios (y sus subdominios) del archivo Netscape, listas para el navegador. */
export function siteCookies(text, sites) {
  const cookies = [];
  for (const raw of text.split("\n")) {
    const line = raw.startsWith("#HttpOnly_") ? raw.slice(10) : raw;
    if (!line || line.startsWith("#")) continue;
    const p = line.split("\t");
    if (p.length < 7 || !sites.some((site) => p[0].replace(/^\./, "").endsWith(site))) continue;
    cookies.push({ name: p[5], value: p[6].trim(), domain: p[0], path: p[2] || "/", secure: p[3] === "TRUE" });
  }
  return cookies;
}

/** «12,3K», «1,2 Mio.», «4.512», «1.2M» → número; `null` si no se entiende. */
export function parseCount(text) {
  if (typeof text !== "string") return null;
  const m = text.replace(/\s/g, "").match(/^([\d.,]+)(k|tsd\.?|mio\.?|m|mil|mill\.?|b)?$/i);
  if (!m) return null;
  let digits = m[1];
  const unit = (m[2] ?? "").toLowerCase();
  if (unit) digits = digits.replace(",", ".");
  else digits = digits.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const value = Number.parseFloat(digits.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const factor = unit.startsWith("k") || unit.startsWith("tsd") || unit === "mil" ? 1e3 : unit.startsWith("m") ? 1e6 : unit === "b" ? 1e9 : 1;
  return Math.round(value * factor);
}

/** `instagram.com/<cuenta>/reel/<código>/` → `https://www.instagram.com/reel/<código>/` (la forma que entiende yt-dlp). */
export function canonicalReel(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/${m[1] === "tv" ? "reel" : m[1]}/${m[2]}/` : url;
}

// ───────────────────────── Instagram con Brave sin ventana ─────────────────────────

/** Lo que se evalúa dentro de la página del perfil (sin depender de clases internas de Instagram). */
const READ_PAGE = `(() => {
  const text = (el) => (el?.innerText || '').replace(/\\s+/g, ' ').trim();
  const body = document.body?.innerText || '';
  const login = !!document.querySelector('input[name="username"]') || /\\/accounts\\/login/.test(location.pathname);
  const aviso = !document.querySelector('header') && document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]').length === 0 && body.length < 1500 ? body.slice(0, 300) : null;
  const header = document.querySelector('header');
  const unwrap = (h) => { try { const u = new URL(h); if (/^l\\.instagram\\.com$/.test(u.hostname)) return u.searchParams.get('u'); return h; } catch { return null; } };
  const enlaces = [...(header?.querySelectorAll('a[href^="http"]') || [])].map(a => unwrap(a.href)).filter(h => h && !/(^|\\.)instagram\\.com/.test(new URL(h).hostname));
  for (const m of text(header).matchAll(/\\b((?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)+(?:com|de|shop|store|net|co|io|us|eu|it|fr|es|at|ch)(?:\\/[^\\s]*)?)/gi)) {
    const raw = m[1].startsWith('http') ? m[1] : 'https://' + m[1];
    if (!/instagram\\.com/i.test(raw) && !enlaces.includes(raw)) enlaces.push(raw);
  }
  const meta = (n) => document.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]')?.content || null;
  const reels = [...document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')].map(a => ({
    url: a.href.split('?')[0],
    vistasTexto: text(a).split(' ').find(t => /^[\\d.,]+\\s*(k|K|M|Mio\\.?|Tsd\\.?|mil)?$/.test(t)) || null,
    miniatura: a.querySelector('img')?.src || ([...a.querySelectorAll('*')].map(el => getComputedStyle(el).backgroundImage).find(b => b && b.startsWith('url('))?.slice(5, -2)) || null,
    texto: a.querySelector('img')?.alt || null,
  }));
  return JSON.stringify({ login, aviso, texto: body.slice(0, 300), titulo: document.title, cabecera: text(header).slice(0, 1500), enlaces, descripcion: meta('og:description') || meta('description'), reels });
})()`;

export async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** Lee un perfil de Instagram con Brave sin ventana. `deps.sleep` para esperar. */
export async function readInstagramProfile(usuario, { cookiesFile, brave = headlessBrowser(), sleep }) {
  if (!brave) return { ok: false, codigo: "sin_brave", error: "No está Chrome ni Brave en /Applications: hace falta uno para leer perfiles de Instagram." };
  let cookiesText = "";
  try {
    cookiesText = await fs.readFile(cookiesFile, "utf8");
  } catch {
    return { ok: false, codigo: "sin_sesion", error: "No hay archivo de sesión de Instagram en este Mac." };
  }
  const cookies = instagramCookies(cookiesText);
  if (!cookies.some((c) => c.name === "sessionid")) {
    return { ok: false, codigo: "sin_sesion", error: "El archivo de sesión no tiene la sesión de Instagram iniciada: ejecuta agente-mac/exportar-sesion.sh." };
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "principal-perfil-"));
  const child = spawn(brave, ["--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", `--user-agent=${UA}`, "--window-size=1280,2600", "--lang=de-DE", "about:blank"], { stdio: "ignore", detached: true });
  let browser = null;
  try {
    let port = null;
    for (let waited = 0; !port && waited < START_TIMEOUT_MS; waited += 250) {
      await sleep(250);
      port = (await fs.readFile(path.join(dir, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0] || null;
    }
    if (!port) return { ok: false, codigo: "brave", error: "Brave no arrancó a tiempo." };
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find((t) => t.type === "page");
    browser = await cdp(page.webSocketDebuggerUrl);
    await browser.send("Network.enable");
    await browser.send("Network.setCookies", { cookies });
    await browser.send("Page.navigate", { url: `https://www.instagram.com/${usuario}/reels/` });
    await sleep(PAGE_WAIT_MS);
    const read = async () => JSON.parse((await browser.send("Runtime.evaluate", { expression: READ_PAGE, returnByValue: true })).result?.result?.value ?? "{}");
    let reelsPage = await read();
    // La pestaña de reels trae las vistas; la cabecera, la biografía y el enlace.
    if (reelsPage.reels?.length === 0 && !reelsPage.login) {
      await browser.send("Runtime.evaluate", { expression: "window.scrollBy(0, 1200)" });
      await sleep(4_000);
      reelsPage = await read();
    }
    if (reelsPage.login) return { ok: false, codigo: "sin_sesion", error: "Instagram pide iniciar sesión: la sesión guardada ya no vale." };
    if (reelsPage.aviso && (reelsPage.reels ?? []).length === 0) {
      return { ok: false, codigo: "aviso", error: `Instagram enseña un aviso en la cuenta y no deja ver el perfil: «${reelsPage.aviso.slice(0, 200)}»` };
    }
    if ((reelsPage.reels ?? []).length === 0) {
      // Sin reels no hay nada que mirar: mejor reintentar que seguir a ciegas.
      return { ok: false, codigo: "sin_reels", error: `Instagram no enseñó ningún reel de la cuenta. Se veía: «${(reelsPage.texto ?? "").replace(/\s+/g, " ").slice(0, 200)}»` };
    }
    const reels = [];
    for (const reel of reelsPage.reels ?? []) {
      if (reels.some((r) => r.url === canonicalReel(reel.url))) continue;
      reels.push({ url: canonicalReel(reel.url), vistas: parseCount(reel.vistasTexto), texto: reel.texto, miniatura: reel.miniatura });
      if (reels.length >= MAX_REELS) break;
    }
    return {
      ok: true,
      perfil: {
        red: "instagram",
        usuario,
        cabecera: reelsPage.cabecera ?? "",
        descripcion: reelsPage.descripcion ?? null,
        // Sin el propio nombre de la cuenta (`frozenglow.us` parece una web, pero no lo es).
        enlaces: [...new Set(reelsPage.enlaces ?? [])].filter((h) => { try { return new URL(h).hostname.replace(/^www\./, "") !== usuario.toLowerCase(); } catch { return false; } }).slice(0, 5),
        reels,
      },
    };
  } catch (error) {
    return { ok: false, codigo: "brave", error: `No se pudo leer el perfil con Brave: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    browser?.close();
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ───────────────────────── TikTok con yt-dlp ─────────────────────────

/** Argumentos de yt-dlp para la lista de un perfil de TikTok (sin descargar nada). */
export function tiktokProfileArgs(url, cookies) {
  return ["--ignore-config", "--use-extractors", "tiktok:user", ...cookies, "--flat-playlist", "--playlist-items", `1-${MAX_REELS}`, "-J", "--", url];
}

/** Lo que interesa de la salida `-J` de yt-dlp para un perfil de TikTok. */
export function tiktokProfileFrom(json, usuario) {
  const entries = Array.isArray(json?.entries) ? json.entries : [];
  return {
    red: "tiktok",
    usuario,
    cabecera: [json?.title, json?.description].filter(Boolean).join(" — ").slice(0, 1500),
    descripcion: json?.description ?? null,
    enlaces: [],
    reels: entries.slice(0, MAX_REELS).map((e) => ({
      url: e.url ?? e.webpage_url ?? null,
      vistas: Number.isFinite(e.view_count) ? e.view_count : null,
      texto: (e.title ?? e.description ?? null)?.slice(0, 500) ?? null,
      miniatura: e.thumbnails?.at?.(-1)?.url ?? e.thumbnail ?? null,
    })).filter((r) => r.url),
  };
}
