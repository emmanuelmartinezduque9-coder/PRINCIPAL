// Agente del Mac de PRINCIPAL: la parte que se puede probar sin red ni yt-dlp.
// Sin dependencias: solo Node 22 o más. Todo lo que toca el mundo (red, procesos, disco, reloj)
// llega en `deps`, así las pruebas lo sustituyen.

import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { profileOf, readInstagramProfile, tiktokProfileArgs, tiktokProfileFrom } from "./perfil.mjs";
import { collectMarketData, youtubeFrom, youtubeSearchArgs } from "./datos.mjs";

/**
 * Archivo de cookies exportado de Brave (formato Netscape, modo 600). El programa corre con launchd y
 * macOS no le deja leer la base de cookies de Brave sin «Acceso total al disco»; si existe este
 * archivo, se usa en su lugar.
 */
export const COOKIES_FILE = path.join(os.homedir(), ".principal-agente-cookies.txt");

/**
 * Sesión de Instagram (copiada de Brave con `exportar-sesion.sh`) solo para leer perfiles. Va aparte
 * del archivo de yt-dlp: los reels sueltos se bajan bien sin sesión, y con una sesión que Instagram
 * tiene bajo aviso fallaban.
 */
export const INSTAGRAM_SESSION_FILE = path.join(os.homedir(), ".principal-agente-instagram.txt");

/** Cómo le pasa la sesión de Instagram a yt-dlp: el archivo si existe; si no, Brave directamente. */
export function cookieArgs(file = COOKIES_FILE, exists = existsSync) {
  return exists(file) ? ["--cookies", file] : ["--cookies-from-browser", "brave"];
}

export const VERSION = "1.9.0";

/** Sitios de los que se descarga, con sus subdominios. La misma lista que el servidor. */
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"];
/** Sitios de los que se descarga una canción: los mismos y SoundCloud. La misma lista que el servidor. */
export const SONG_LINK_HOSTS = [...LINK_HOSTS, "soundcloud.com"];

/**
 * Los únicos extractores de yt-dlp que se usan: el vídeo suelto de cada sitio (un reel o una
 * publicación de Instagram, un vídeo de TikTok o su enlace corto, un vídeo o un short de YouTube,
 * un vídeo o un reel de Facebook). Quedan fuera, a propósito, el extractor genérico (que descarga
 * cualquier dirección) y los que siguen redirecciones (`FacebookRedirectURL`…), además de perfiles,
 * listas y directos. Sin esto, un enlace de un sitio admitido que redirige a otra parte haría que
 * este Mac pidiera cualquier dirección —también de la red de casa— con sus cookies.
 * Los nombres están comprobados con yt-dlp 2026.10.26 (`yt-dlp --list-extractors`).
 */
export const YT_DLP_EXTRACTORS = "Instagram,TikTok,vm.tiktok,youtube,facebook,facebook:reel";
/**
 * Los extractores para una canción: los mismos y el de una pista suelta de SoundCloud (`soundcloud`;
 * no sus listas, usuarios ni búsquedas). YouTube Music (`music.youtube.com/watch?v=…`) ya lo lleva
 * `youtube`. Comprobados con yt-dlp 2026.10.26.
 */
export const YT_DLP_SONG_EXTRACTORS = `${YT_DLP_EXTRACTORS},soundcloud`;

/** Cada cuánto dice el programa «sigo vivo». */
export const HEARTBEAT_MS = 30_000;
/** Cada cuánto pregunta si hay algo que descargar, cuando no hay nada. */
export const POLL_MS = 5_000;
/** Lo más que espera entre preguntas cuando la web no responde o no reconoce la ficha. */
export const MAX_BACKOFF_MS = 60_000;
/** Cada cuánto vuelve a mirar si ya están yt-dlp y ffmpeg, cuando falta alguno. */
export const TOOLS_RETRY_MS = 60_000;
/** Cada cuánto renueva la reserva de la tarea mientras yt-dlp descarga. */
export const LEASE_BEAT_MS = 60_000;
/** Nombres de los archivos de una canción dentro de su carpeta temporal. */
export const SONG_FILE = "cancion.mp3";
export const TITLE_FILE = "titulo.txt";
/** Lo más largo que se manda del título de una canción. */
const MAX_TITLE = 200;
/** Lo más que se deja trabajar a yt-dlp con un enlace antes de cortarlo. */
export const YT_DLP_TIMEOUT_MS = 4 * 60_000;
/** Una carpeta temporal de otra ejecución solo se borra si lleva este tiempo sin tocarse. */
export const LEFTOVER_AGE_MS = 60 * 60_000;
/** Lo que se escribe cuando la web no reconoce la ficha (una vez, no en cada pregunta). */
export const BAD_TOKEN_MESSAGE = "Ficha revocada o incorrecta: la web no reconoce la de este Mac. Crea otra en Ajustes → Mac.";

const REQUEST_TIMEOUT_MS = 30_000;
const CHUNK_TIMEOUT_MS = 5 * 60_000;
const CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_MS = 5_000;
const KILL_WAIT_MS = 5_000;
// yt-dlp «onefile» tarda 9-10 s en arrancar en frío: con 15 s fallaba a ratos («No se puede lanzar yt-dlp»).
export const PROBE_TIMEOUT_MS = 60_000;
const TOKEN = /^pra_[A-Za-z0-9_-]{43}$/;
const TMP_PREFIX = "principal-agente-";

/** Direcciones de un sitio admitido que no son un vídeo sino un salto a otra dirección cualquiera. */
function isRedirector(url) {
  const host = url.hostname.toLowerCase();
  // l.facebook.com, lm.facebook.com, l.instagram.com: los «enlaces de salida» de Facebook e Instagram.
  if (/^lm?\.(facebook|instagram)\.com$/.test(host)) return true;
  return /^\/+(flx\/warn|l\.php|redirect|linkshim|plugins)(\/|$)/i.test(url.pathname);
}

/**
 * Si el enlace es de uno de los sitios admitidos (`hosts`, por defecto los de los vídeos): solo
 * `https`, sin usuario ni puerto, y que no sea una de sus direcciones de salto (`/flx/warn`,
 * `/l.php`, `l.facebook.com`, `l.instagram.com`…).
 */
export function allowedUrl(url, hosts = LINK_HOSTS) {
  if (typeof url !== "string" || url.length > 2000) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  if (!hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return false;
  return !isRedirector(parsed);
}

/** Como `allowedUrl`, para el enlace de una canción (admite además SoundCloud). */
export function allowedSongUrl(url) {
  return allowedUrl(url, SONG_LINK_HOSTS);
}

/**
 * Argumentos de yt-dlp para descargar `url` en `outPath`. Siempre como lista (nunca por una
 * consola) y con `--` delante del enlace: nada de lo que venga en el enlace se lee como opción.
 * Sin archivos de configuración (`--ignore-config`), solo con los extractores de
 * `YT_DLP_EXTRACTORS` y un único vídeo. Usa la sesión de Brave de este Mac.
 */
export function ytDlpArgs(url, outPath, cookies = cookieArgs()) {
  return [
    "--ignore-config", "--use-extractors", YT_DLP_EXTRACTORS,
    ...cookies, "--no-playlist", "--playlist-items", "1", "--max-filesize", "100M",
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
    "-o", outPath, "--", url,
  ];
}

/**
 * Argumentos de yt-dlp para sacar el audio de `url` como MP3 (la mejor calidad) en la carpeta
 * `dir`: el archivo queda en `dir/cancion.mp3` y el título en `dir/titulo.txt`. Las mismas
 * garantías que `ytDlpArgs`: lista de argumentos, `--` delante del enlace, sin configuración, solo
 * los extractores de `YT_DLP_SONG_EXTRACTORS` y una sola pista, como mucho 25 MB.
 */
export function ytDlpAudioArgs(url, dir, cookies = cookieArgs()) {
  return [
    "--ignore-config", "--use-extractors", YT_DLP_SONG_EXTRACTORS,
    ...cookies, "--no-playlist", "--playlist-items", "1", "--max-filesize", "25M",
    "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--print-to-file", "after_move:%(title)s", path.join(dir, TITLE_FILE),
    "-o", path.join(dir, "cancion.%(ext)s"), "--", url,
  ];
}

/** Los trozos de un archivo de `size` bytes: `[{ index, start, end }]`, con `end` sin incluir. */
export function chunkRanges(size, chunkBytes) {
  const ranges = [];
  for (let start = 0, index = 0; start < size; start += chunkBytes, index++) {
    ranges.push({ index, start, end: Math.min(start + chunkBytes, size) });
  }
  return ranges;
}

/**
 * Comprueba la configuración (`{ url, token }`) y la devuelve limpia. La ficha solo viaja por
 * HTTPS (o a este mismo ordenador, para pruebas). Los mensajes de error nunca incluyen la ficha.
 */
export function checkConfig(raw) {
  const url = typeof raw?.url === "string" ? raw.url.trim().replace(/\/+$/, "") : "";
  const token = typeof raw?.token === "string" ? raw.token.trim() : "";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Falta la dirección de la web (\"url\").");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) throw new Error("La dirección de la web tiene que empezar por https://");
  if (!TOKEN.test(token)) throw new Error("La ficha (\"token\") no tiene la forma de una ficha de PRINCIPAL. Crea una en Ajustes → Mac.");
  return { url: parsed.origin, token };
}

/**
 * La configuración: las variables `PRINCIPAL_URL` y `PRINCIPAL_AGENTE_TOKEN` si están las dos, o
 * el archivo `~/.principal-agente.json`. `null` si el archivo no existe todavía. El archivo
 * guarda la ficha: si lo puede leer alguien más que su dueño, se le cierran los permisos (600)
 * antes de usarlo (`tightened: true`).
 */
export async function readConfig(env, fs, home = os.homedir()) {
  if (env.PRINCIPAL_URL && env.PRINCIPAL_AGENTE_TOKEN) return checkConfig({ url: env.PRINCIPAL_URL, token: env.PRINCIPAL_AGENTE_TOKEN });
  const file = path.join(home, ".principal-agente.json");
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("No se pudo leer ~/.principal-agente.json.");
  }
  let tightened = false;
  if (((await fs.stat(file)).mode & 0o077) !== 0) {
    try {
      await fs.chmod(file, 0o600);
    } catch {
      throw new Error("~/.principal-agente.json lo pueden leer otras personas de este Mac y no se ha podido cerrar. Ejecuta: chmod 600 ~/.principal-agente.json");
    }
    tightened = true;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("~/.principal-agente.json no es un JSON válido.");
  }
  return tightened ? { ...checkConfig(raw), tightened } : checkConfig(raw);
}

/** Quita la ficha de cualquier texto antes de escribirlo o enviarlo. */
export function scrub(config, text) {
  return String(text).split(config.token).join("***");
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Una petición a la web con la ficha. Todas las conexiones salen de este Mac, y a ninguna otra
 * parte: si la web contestara con una redirección, la petición falla en vez de seguirla (la ficha
 * no viaja a otra dirección).
 */
export function call(config, deps, method, route, { json, body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { Authorization: `Bearer ${config.token}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  return deps.fetch(`${config.url}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
}

/** Latido del programa: está vivo, y con qué versiones. Devuelve la respuesta de la web. */
export function heartbeat(config, deps, info) {
  // `claude`: la versión de Claude Code si tiene sesión y puede hacer las llamadas del dueño; si no, `null`.
  return call(config, deps, "POST", "/api/agente/latido", { json: { version: VERSION, ytDlp: info?.ytDlp ?? null, claude: info?.claude ?? null, codex: info?.codex ?? null, claudeMotivo: info?.claudeMotivo ?? null } });
}

/**
 * Borra las carpetas temporales que dejó una ejecución anterior que se cortó a medias: solo las
 * que llevan más de una hora sin tocarse (una más reciente puede ser de otra copia en marcha).
 */
export async function cleanLeftovers(fs, tmpDir = os.tmpdir(), now = Date.now()) {
  const names = await fs.readdir(tmpDir).catch(() => []);
  for (const name of names) {
    if (!name.startsWith(TMP_PREFIX)) continue;
    const dir = path.join(tmpDir, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && now - stat.mtimeMs > LEFTOVER_AGE_MS) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Un solo agente a la vez: apunta este proceso en `lockFile`. Devuelve `true` si lo consigue, o
 * `false` si ya hay otro en marcha (y entonces no se toca nada). Un apunte de un proceso que ya
 * no existe se sustituye.
 */
export async function acquireLock(fs, lockFile, pid = process.pid, isAlive = processAlive) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(lockFile, `${pid}\n`, { flag: "wx", mode: 0o600 });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const other = Number((await fs.readFile(lockFile, "utf8").catch(() => "")).trim());
    if (Number.isSafeInteger(other) && other > 0 && other !== pid && isAlive(other)) return false;
    await fs.rm(lockFile, { force: true });
  }
  return false;
}

/** Suelta el apunte si es el de este proceso. */
export async function releaseLock(fs, lockFile, pid = process.pid) {
  const owner = Number((await fs.readFile(lockFile, "utf8").catch(() => "")).trim());
  if (owner === pid) await fs.rm(lockFile, { force: true }).catch(() => {});
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe, pero es de otra persona.
    return error?.code === "EPERM";
  }
}

/** Lanza un programa y espera: `{ ok, out }`. Si no se puede lanzar (no está, sin permiso), `ok: false`. */
function probe(deps, command, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = deps.spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve({ ok: false, out: "" });
      return;
    }
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, out });
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => {
      out = (out + chunk).slice(0, 200);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, out });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out });
    });
  });
}

/**
 * Si este Mac puede descargar: `yt-dlp` y `ffmpeg` se pueden lanzar. Devuelve qué falta (vacío si
 * nada) y la versión de yt-dlp. Mientras falte algo, el agente no se lleva tareas: llevárselas
 * para fallarlas vaciaría la cola sin traer nada.
 */
export async function checkTools(deps, config = {}) {
  const ytDlp = await probe(deps, config.ytDlp ?? "yt-dlp", ["--version"]);
  const ffmpeg = await probe(deps, config.ffmpeg ?? "ffmpeg", ["-version"]);
  const missing = [];
  if (!ytDlp.ok) missing.push("yt-dlp");
  if (!ffmpeg.ok) missing.push("ffmpeg");
  return { missing, ytDlp: ytDlp.ok ? ytDlp.out.trim().split("\n")[0].slice(0, 40) || null : null };
}


/** Corta yt-dlp y todo lo que haya lanzado (ffmpeg): el grupo de procesos entero. */
function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Lanza un programa (en su propio grupo de procesos) y espera a que termine, renovando la reserva
 * cada minuto. Pasado `timeoutMs` lo corta (a él y a sus hijos). Devuelve `{ ok: true }`,
 * `{ ok: false, error }` (con `messages.failed(detalle)` o `messages.timedOut`), `{ lost: true }`
 * (la web retiró la tarea) o `{ local: true, error }` (no se pudo ni lanzar: es cosa de este Mac).
 */
async function runTool(config, deps, task, command, args, { timeoutMs, messages, capture = false }) {
  let child;
  try {
    child = deps.spawn(command, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"], detached: true });
  } catch (error) {
    return { local: true, error: messageOf(error) };
  }
  let stdout = "";
  if (capture) {
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk;
    });
  }
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  const stop = async () => {
    (deps.kill ?? killGroup)(child);
    await Promise.race([exited, deps.sleep(KILL_WAIT_MS)]);
  };

  for (let waited = 0; ; ) {
    const result = await Promise.race([exited, deps.sleep(LEASE_BEAT_MS).then(() => null)]);
    if (result) {
      if (result.error) return { local: true, error: messageOf(result.error) };
      if (result.code === 0) return { ok: true, stdout };
      return { ok: false, error: messages.failed(stderr.trim().split("\n").pop()?.trim() ?? "") };
    }
    waited += LEASE_BEAT_MS;
    if (waited >= timeoutMs) {
      await stop();
      return { ok: false, error: messages.timedOut };
    }
    const beat = await call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).catch(() => null);
    if (beat?.status === 409) {
      await stop();
      return { lost: true };
    }
  }
}

/** yt-dlp con `args` (ver `runTool`): a los 4 minutos se corta. */
function download(config, deps, task, args) {
  return runTool(config, deps, task, config.ytDlp ?? "yt-dlp", args, {
    timeoutMs: YT_DLP_TIMEOUT_MS,
    messages: {
      failed: (detail) => (detail ? `yt-dlp no pudo descargar el enlace: ${detail}` : "yt-dlp no pudo descargar el enlace"),
      timedOut: "yt-dlp tardó más de 4 minutos y se cortó",
    },
  });
}

/** Lo más que se guarda de lo que escribe un programa por su salida (la lista de un perfil). */
const MAX_CAPTURE = 8 * 1024 * 1024;

/**
 * Lee un perfil (`perfil`): Instagram con Brave sin ventana (`perfil.mjs`), TikTok con yt-dlp.
 * Deja `perfil.json` en `file`. Devuelve lo mismo que `runTool` (`ok`, `lost`, `local`, `error`).
 */
async function readProfile(config, deps, task, file) {
  const who = profileOf(task.url);
  if (!who) return { ok: false, error: "El enlace no es un perfil de Instagram ni de TikTok" };
  let result;
  if (who.red === "instagram") {
    const read = deps.readInstagramProfile ?? readInstagramProfile;
    result = await read(who.usuario, { cookiesFile: config.instagramSession ?? INSTAGRAM_SESSION_FILE, sleep: deps.sleep });
  } else {
    const ran = await runTool(config, deps, task, config.ytDlp ?? "yt-dlp", tiktokProfileArgs(task.url, cookieArgs()), {
      timeoutMs: YT_DLP_TIMEOUT_MS,
      capture: true,
      messages: { failed: (d) => `yt-dlp no pudo leer el perfil de TikTok${d ? `: ${d}` : ""}`, timedOut: "yt-dlp tardó demasiado con el perfil" },
    });
    if (!ran.ok) return ran;
    try {
      result = { ok: true, perfil: tiktokProfileFrom(JSON.parse(ran.stdout), who.usuario) };
    } catch {
      result = { ok: false, error: "yt-dlp no devolvió la lista del perfil" };
    }
  }
  if (!result.ok) return { ok: false, error: result.codigo ? `[${result.codigo}] ${result.error}` : result.error };
  await deps.fs.writeFile(file, JSON.stringify(result.perfil));
  return { ok: true };
}

/**
 * Datos de mercado (`datos`): Amazon, anuncios de Meta, TikTok (con sesión) y YouTube de cada
 * consulta (`datos.mjs`). Deja el JSON en `file`. Mientras trabaja, renueva la reserva cada minuto.
 */
async function marketData(config, deps, task, file) {
  const spec = task.datos && typeof task.datos === "object" ? task.datos : null;
  if (!spec || !Array.isArray(spec.consultas) || typeof spec.pais !== "string") return { ok: false, error: "La tarea de datos no trae consultas" };
  const youtube = async (query) => {
    const ran = await runTool(config, deps, task, config.ytDlp ?? "yt-dlp", youtubeSearchArgs(query), {
      timeoutMs: YT_DLP_TIMEOUT_MS,
      capture: true,
      messages: { failed: (d) => `yt-dlp no pudo buscar en YouTube${d ? `: ${d}` : ""}`, timedOut: "yt-dlp tardó demasiado buscando en YouTube" },
    });
    return ran.ok ? youtubeFrom(JSON.parse(ran.stdout), query) : null;
  };
  let lost = false;
  const beat = setInterval(() => {
    call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`)
      .then((r) => {
        if (r?.status === 409) lost = true;
      })
      .catch(() => {});
  }, LEASE_BEAT_MS);
  try {
    const collect = deps.collectMarketData ?? collectMarketData;
    const data = await collect({ country: spec.pais, queries: spec.consultas }, { sessionFile: config.instagramSession ?? INSTAGRAM_SESSION_FILE, sleep: deps.sleep, youtube });
    if (lost) return { lost: true };
    await deps.fs.writeFile(file, JSON.stringify(data));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `No se pudieron buscar los datos: ${messageOf(error)}` };
  } finally {
    clearInterval(beat);
  }
}

/** Solo se pide el buscador de pines de Pinterest (lo que manda la web para `pinterest`). */
export function allowedPinterestUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.pinterest.com" && url.pathname === "/resource/BaseSearchResource/get/";
  } catch {
    return false;
  }
}

/**
 * Busca en Pinterest desde este Mac (`pinterest`): la misma petición que hace la web de Pinterest,
 * con las cabeceras que manda la web de PRINCIPAL, cuando Pinterest no deja buscar a la nube. Deja
 * la respuesta tal cual (JSON) en `file`; la web saca de ella los pines.
 */
async function searchPinterest(deps, task, file) {
  const headers = task.headers && typeof task.headers === "object" ? task.headers : {};
  let response;
  try {
    response = await deps.fetch(task.url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    return { ok: false, error: `Pinterest no respondió: ${error instanceof Error ? error.message : "error"}` };
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) return { ok: false, error: `Pinterest respondió ${response.status}` };
  if (!text.startsWith("{")) return { ok: false, error: "Pinterest no devolvió datos de búsqueda" };
  await deps.fs.writeFile(file, text);
  return { ok: true };
}

/** El título que dejó yt-dlp: la primera línea, sin espacios de más y recortada; `null` si no hay. */
export async function readTitle(fs, file) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  const title = text.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, MAX_TITLE).trim();
  return title || null;
}

async function sizeOf(fs, file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

async function readRange(fs, file, range) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(range.end - range.start);
    await handle.read(buffer, 0, buffer.length, range.start);
    return buffer;
  } finally {
    await handle.close();
  }
}

/** Sube el archivo por trozos. Devuelve `"ok"`, `"lost"` (la tarea ya no es de este Mac) o `{ error }`. */
async function upload(config, deps, task, file, size) {
  for (const range of chunkRanges(size, task.chunkBytes)) {
    const bytes = await readRange(deps.fs, file, range);
    const route = `/api/agente/tareas/${task.taskId}/trozo?indice=${range.index}&subida=${encodeURIComponent(task.uploadId)}`;
    for (let attempt = 1; ; attempt++) {
      const response = await call(config, deps, "PUT", route, { body: bytes, timeout: CHUNK_TIMEOUT_MS }).catch(() => null);
      if (response?.ok) break;
      if (response?.status === 409) return "lost";
      // Un rechazo de la web (formato, tamaño…) no mejora repitiendo.
      if (response && response.status >= 400 && response.status < 500) return { error: `La web rechazó el archivo (${response.status})` };
      if (attempt >= CHUNK_ATTEMPTS) return { error: "No se pudo subir el archivo a la web" };
      await deps.sleep(CHUNK_RETRY_MS);
    }
  }
  return "ok";
}

/**
 * Una vuelta: pregunta si hay un enlace que traer y, si lo hay, lo descarga con yt-dlp, lo sube
 * por trozos y lo da por terminado. El archivo va a una carpeta temporal propia que se borra
 * siempre al acabar.
 *
 * `config`: `{ url, token }` (ya comprobados). `deps`: `{ fetch, spawn, fs, sleep, log }`.
 * Devuelve:
 * - `"idle"`: no había nada.
 * - `"done"`: entregado.
 * - `"failed"`: no se pudo traer (y se le dijo a la web), o la web retiró la tarea.
 * - `"offline"`: la web no responde (o responde mal): conviene esperar más antes de volver a preguntar.
 * - `"unauthorized"`: la web no reconoce la ficha.
 * - `"blocked"`: este Mac no pudo ni lanzar yt-dlp. No se le dice a la web que el enlace falló:
 *   la reserva caduca sola y la tarea vuelve a la cola.
 * Nunca escribe la ficha.
 */
export async function runOnce(config, deps) {
  const log = (text) => deps.log(scrub(config, text));
  let response;
  try {
    // Lo que este Mac sabe hacer además de las referencias y las canciones: `["enlace_medio"]`, traer
    // los vídeos de enlaces que necesita el montaje en la nube y que la nube no puede descargar.
    const can = Array.isArray(config.puede) && config.puede.length > 0 ? { json: { puede: config.puede } } : {};
    response = await call(config, deps, "POST", "/api/agente/tareas/reclamar", can);
  } catch (error) {
    log(`No se pudo preguntar a la web: ${messageOf(error)}`);
    return "offline";
  }
  if (response.status === 204) return "idle";
  if (response.status === 401) {
    log(BAD_TOKEN_MESSAGE);
    return "unauthorized";
  }
  if (!response.ok) {
    log(`La web respondió ${response.status} al preguntar por tareas.`);
    return "offline";
  }
  const task = await response.json().catch(() => null);
  if (!task || !Number.isSafeInteger(task.taskId) || typeof task.uploadId !== "string" || !(task.chunkBytes > 0)) {
    log("La web mandó una tarea que no se entiende.");
    return "offline";
  }

  const finish = (result) => call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/terminar`, { json: { ...result, uploadId: task.uploadId } });
  /** Comunica el fallo (el detalle solo lo ve el dueño) y sigue con otra cosa. */
  const giveUp = async (error) => {
    log(`No se pudo traer el enlace: ${error}`);
    await finish({ ok: false, error: scrub(config, error).slice(0, 500) }).catch(() => {});
    return "failed";
  };
  const lost = () => {
    log("La web ha retirado esta tarea; se deja.");
    return "failed";
  };

  // Una canción trae el audio (MP3); un perfil, sus datos (JSON); lo demás (`referencia`, `enlace_medio`), el vídeo.
  const song = task.kind === "cancion";
  const profile = task.kind === "perfil";
  const pinterest = task.kind === "pinterest";
  const datos = task.kind === "datos";
  // Aunque la web ya lo comprobó, este Mac no lanza yt-dlp con un enlace de fuera de la lista.
  if (!datos && !(pinterest ? allowedPinterestUrl(task.url) : song ? allowedSongUrl(task.url) : allowedUrl(task.url))) return giveUp("El enlace no es de un sitio admitido");

  // Carpeta temporal propia (solo la puede leer este usuario: `mkdtemp` la crea con 700).
  const dir = await deps.fs.mkdtemp(path.join(config.tmpDir ?? os.tmpdir(), TMP_PREFIX));
  const file = path.join(dir, song ? SONG_FILE : profile ? "perfil.json" : pinterest ? "pinterest.json" : datos ? "datos.json" : "video.mp4");
  const url = new URL(task.url).href;
  const maxMb = song ? 25 : 100;
  try {
    log(datos ? "Buscando datos de mercado (Amazon, anuncios de Meta, TikTok, YouTube)" : pinterest ? "Buscando referencias en Pinterest" : profile ? `Leyendo el perfil ${task.url}` : `Descargando ${task.url}`);
    const downloaded = datos
      ? await marketData(config, deps, task, file)
      : pinterest
      ? await searchPinterest(deps, task, file)
      : profile
        ? await readProfile(config, deps, task, file)
        : await download(config, deps, task, song ? ytDlpAudioArgs(url, dir) : ytDlpArgs(url, file));
    if (downloaded.lost) return lost();
    if (downloaded.local) {
      // Cosa de este Mac, no del enlace: no se da por fallido.
      log(`No se pudo lanzar yt-dlp (${downloaded.error}). La tarea se deja para más tarde.`);
      return "blocked";
    }
    if (!downloaded.ok) return await giveUp(downloaded.error);

    const size = await sizeOf(deps.fs, file);
    const what = song ? "La canción" : profile ? "El perfil" : pinterest ? "La búsqueda" : "El vídeo";
    if (!size) return await giveUp(`yt-dlp no dejó ningún archivo (puede que ${what.toLowerCase()} pese más de ${maxMb} MB)`);
    if (task.maxBytes > 0 && size > task.maxBytes) return await giveUp(`${what} descargad${song ? "a" : "o"} pesa más de ${maxMb} MB`);

    const sent = await upload(config, deps, task, file, size);
    if (sent === "lost") return lost();
    if (sent !== "ok") return await giveUp(sent.error);

    const title = song ? await readTitle(deps.fs, path.join(dir, TITLE_FILE)) : null;
    const done = await finish(title ? { ok: true, totalBytes: size, title } : { ok: true, totalBytes: size }).catch(() => null);
    if (done?.status === 409) return lost();
    if (!done?.ok) return await giveUp(`La web no dio por entregado el archivo (${done?.status ?? "sin respuesta"})`);
    log("Entregado.");
    return "done";
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Cuánto esperar antes de la siguiente vuelta, según cómo fue la última y lo que ya se esperaba:
 * con trabajo hecho, nada; sin nada, 5 s; si la web no responde o no reconoce la ficha, cada vez
 * el doble, hasta un minuto.
 */
export function nextWait(outcome, previous = 0) {
  if (outcome === "done" || outcome === "failed") return 0;
  if (outcome === "offline" || outcome === "unauthorized") return Math.min(MAX_BACKOFF_MS, Math.max(POLL_MS, previous) * 2);
  if (outcome === "blocked") return TOOLS_RETRY_MS;
  return POLL_MS;
}
