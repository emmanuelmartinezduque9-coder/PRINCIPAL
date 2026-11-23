import { spawn as realSpawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireLock,
  allowedSongUrl,
  allowedUrl,
  BAD_TOKEN_MESSAGE,
  checkConfig,
  checkTools,
  chunkRanges,
  cleanLeftovers,
  LEASE_BEAT_MS,
  LEFTOVER_AGE_MS,
  LINK_HOSTS,
  MAX_BACKOFF_MS,
  nextWait,
  POLL_MS,
  readConfig,
  releaseLock,
  runOnce,
  SONG_LINK_HOSTS,
  TOOLS_RETRY_MS,
  VERSION,
  YT_DLP_EXTRACTORS,
  YT_DLP_SONG_EXTRACTORS,
  YT_DLP_TIMEOUT_MS,
  ytDlpArgs,
  ytDlpAudioArgs,
} from "../agente-mac/lib.mjs";
import { canonicalReel, CHROME, BRAVE, headlessBrowser, instagramCookies, parseCount, profileOf, tiktokProfileFrom } from "../agente-mac/perfil.mjs";
import { SONG_LINK_HOSTS as SERVER_SONG_HOSTS, songLinkOf } from "@/lib/links";
import { LINK_HOSTS as SERVER_HOSTS, linkOf } from "@/server/agent";

/** El programa del Mac, sin red ni yt-dlp: `fetch`, `spawn` y el reloj son de mentira; el disco, de verdad. */

const TOKEN = "pra_" + "k".repeat(43);
const WEB = "https://principal.test";
const REEL = "https://www.instagram.com/reel/abc/";
const CHUNK = 5 * 1024 * 1024;
const TASK = { taskId: 7, url: REEL, uploadId: "u".repeat(32), chunkBytes: CHUNK, maxBytes: 100 * 1024 * 1024 };

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  redirect: unknown;
}

let tmp: string;
let calls: Call[];
let logs: string[];
let spawned: Array<{ command: string; args: string[]; options: { detached?: boolean } | undefined; killed: string | null }>;
let sleeps: number[];

beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "prueba-agente-mac-"));
  calls = [];
  logs = [];
  spawned = [];
  sleeps = [];
});

afterEach(() => {
  fsSync.rmSync(tmp, { recursive: true, force: true });
});

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

/** Una web de mentira: responde por ruta; lo que no esté en `routes` da 200. */
function fakeFetch(routes: Record<string, (call: Call) => Response | Promise<Response>> = {}) {
  return async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    const body = init.body instanceof Uint8Array ? Buffer.from(init.body) : typeof init.body === "string" ? JSON.parse(init.body) : null;
    const call: Call = { method: init.method ?? "GET", path: parsed.pathname + parsed.search, headers: init.headers as Record<string, string>, body, redirect: init.redirect };
    calls.push(call);
    const route = Object.keys(routes).find((key) => call.path.startsWith(key));
    return route ? routes[route](call) : json(200, { ok: true });
  };
}

/**
 * Un yt-dlp de mentira. `write`: los bytes que deja en el archivo de salida. `code`: con qué
 * termina. `afterSleeps`: cuántas esperas de un minuto tarda (`Infinity`: no termina nunca solo).
 */
function fakeSpawn(options: { write?: Buffer; code?: number; afterSleeps?: number; stderr?: string } = {}) {
  const children: EventEmitter[] = [];
  const spawn = (command: string, args: string[], spawnOptions?: { detached?: boolean }) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: (signal: string) => void };
    child.stderr = new EventEmitter();
    const record = { command, args, options: spawnOptions, killed: null as string | null };
    spawned.push(record);
    const finish = () => {
      if (options.write) fsSync.writeFileSync(args[args.indexOf("-o") + 1], options.write);
      if (options.stderr) child.stderr.emit("data", options.stderr);
      child.emit("close", options.code ?? 0);
    };
    child.kill = (signal: string) => {
      record.killed = signal;
      queueMicrotask(() => child.emit("close", null));
    };
    (child as unknown as { finish: () => void }).finish = finish;
    children.push(child);
    if ((options.afterSleeps ?? 0) === 0) queueMicrotask(finish);
    return child;
  };
  /** El reloj de mentira: cada espera de un minuto acerca el final de la descarga. */
  const sleep = async (ms: number) => {
    sleeps.push(ms);
    if (ms !== LEASE_BEAT_MS) return;
    const beats = sleeps.filter((value) => value === LEASE_BEAT_MS).length;
    if (beats === options.afterSleeps) (children.at(-1) as unknown as { finish: () => void }).finish();
    // Deja pasar una vuelta para que el final de la descarga gane a la espera.
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { spawn, sleep };
}

function depsWith(fetch: ReturnType<typeof fakeFetch>, child: ReturnType<typeof fakeSpawn>) {
  return { fetch, spawn: child.spawn, sleep: child.sleep, fs, log: (text: string) => logs.push(text) };
}
const config = () => ({ url: WEB, token: TOKEN, tmpDir: tmp });
const claimed = (task: unknown = TASK) => ({ "/api/agente/tareas/reclamar": () => json(200, task) });
const paths = () => calls.map((call) => `${call.method} ${call.path}`);
const leftovers = () => fsSync.readdirSync(tmp);

describe("enlaces y argumentos", () => {
  it("lanza yt-dlp con una lista de argumentos fija y el enlace detrás de `--`", () => {
    expect(ytDlpArgs("https://www.instagram.com/reel/abc/", "/tmp/x.mp4", ["--cookies-from-browser", "brave"])).toEqual([
      "--ignore-config", "--use-extractors", "Instagram,TikTok,vm.tiktok,youtube,facebook,facebook:reel",
      "--cookies-from-browser", "brave", "--no-playlist", "--playlist-items", "1", "--max-filesize", "100M",
      "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
      "-o", "/tmp/x.mp4", "--", "https://www.instagram.com/reel/abc/"]);
  });

  it("yt-dlp solo usa los extractores de vídeo suelto: ni el genérico ni los que siguen redirecciones", () => {
    const args = ytDlpArgs("https://www.instagram.com/reel/abc/", "/tmp/x.mp4", ["--cookies-from-browser", "brave"]);
    expect(args[0]).toBe("--ignore-config");
    expect(args[args.indexOf("--use-extractors") + 1]).toBe(YT_DLP_EXTRACTORS);
    expect(args[args.indexOf("--playlist-items") + 1]).toBe("1");
    const allowed = YT_DLP_EXTRACTORS.split(",");
    expect(allowed).toEqual(["Instagram", "TikTok", "vm.tiktok", "youtube", "facebook", "facebook:reel"]);
    // Ni comodines ni «todo»: una lista cerrada, sin el genérico ni el de redirecciones de Facebook.
    for (const name of allowed) expect(name).toMatch(/^[A-Za-z][A-Za-z.:]*$/);
    for (const banned of ["generic", "default", "all", "FacebookRedirectURL", "FacebookPluginsVideo", "youtube:tab"]) {
      expect(allowed.map((name) => name.toLowerCase())).not.toContain(banned.toLowerCase());
    }
    // El enlace va siempre el último y detrás de `--`.
    expect(args.at(-2)).toBe("--");
  });

  it("solo admite enlaces https de los sitios de la lista", () => {
    expect(allowedUrl("https://vm.tiktok.com/abc")).toBe(true);
    expect(allowedUrl("https://www.instagram.com/reel/abc/?igsh=x")).toBe(true);
    expect(allowedUrl("https://youtu.be/abc")).toBe(true);
    expect(allowedUrl("https://www.facebook.com/reel/1234567890")).toBe(true);
    expect(allowedUrl("https://www.facebook.com/watch/?v=1234567890")).toBe(true);
    expect(allowedUrl("https://evil.test/?u=instagram.com")).toBe(false);
    expect(allowedUrl("--exec=rm -rf ~")).toBe(false);
    expect(allowedUrl("http://www.instagram.com/reel/a")).toBe(false);
    expect(allowedUrl("https://instagram.com.evil.test/x")).toBe(false);
    expect(allowedUrl("https://user:pw@tiktok.com/x")).toBe(false);
    expect(allowedUrl("https://www.instagram.com:8443/reel/a")).toBe(false);
    expect(allowedUrl("file:///etc/passwd")).toBe(false);
    expect(allowedUrl(undefined)).toBe(false);
  });

  it.each([
    "https://www.facebook.com/flx/warn/?u=http%3A%2F%2F192.168.1.1%2Fadmin",
    "https://m.facebook.com/flx/warn?u=https%3A%2F%2Fevil.test%2Fx",
    "https://www.facebook.com//flx/warn/?u=https%3A%2F%2Fevil.test",
    "https://www.facebook.com/FLX/WARN/?u=https%3A%2F%2Fevil.test",
    "https://l.facebook.com/l.php?u=http%3A%2F%2F192.168.1.1%2Fadmin",
    "https://lm.facebook.com/l.php?u=https%3A%2F%2Fevil.test",
    "https://www.facebook.com/l.php?u=http%3A%2F%2F10.0.0.1",
    "https://l.instagram.com/?u=https%3A%2F%2Fevil.test",
    "https://www.youtube.com/redirect?q=http%3A%2F%2F192.168.1.1",
    "https://www.facebook.com/plugins/video.php?href=http%3A%2F%2F192.168.1.1",
  ])("un salto a otra dirección (%s) se rechaza, en el Mac y en el servidor", (url) => {
    expect(allowedUrl(url)).toBe(false);
    expect(linkOf(url)).toBeNull();
  });

  it("la lista de sitios es la misma que la del servidor, y los dos deciden igual", () => {
    expect(LINK_HOSTS).toEqual([...SERVER_HOSTS]);
    for (const url of [
      REEL,
      "https://vm.tiktok.com/abc",
      "https://evil.test/x",
      "http://youtu.be/x",
      "https://fb.watch/a/",
      "https://notinstagram.com/a",
      "https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fevil.test",
      "https://www.facebook.com/reel/123",
      "https://www.facebook.com/l.php?u=x",
      "https://www.instagram.com/redirecto/",
      "https://www.youtube.com/redirect?q=x",
      "https://www.youtube.com/shorts/abc",
    ]) {
      expect(allowedUrl(url), url).toBe(linkOf(url) !== null);
    }
  });

  it("parte el archivo en trozos de 5 MB", () => {
    expect(chunkRanges(12 * 1024 * 1024, 5 * 1024 * 1024).map((c) => c.index)).toEqual([0, 1, 2]);
    expect(chunkRanges(12 * 1024 * 1024, CHUNK)).toEqual([
      { index: 0, start: 0, end: CHUNK },
      { index: 1, start: CHUNK, end: 2 * CHUNK },
      { index: 2, start: 2 * CHUNK, end: 12 * 1024 * 1024 },
    ]);
    expect(chunkRanges(CHUNK, CHUNK)).toEqual([{ index: 0, start: 0, end: CHUNK }]);
    expect(chunkRanges(0, CHUNK)).toEqual([]);
  });
});

describe("una vuelta", () => {
  it("sin tarea no hace nada", async () => {
    const child = fakeSpawn();
    const outcome = await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(204) }), child));
    expect(outcome).toBe("idle");
    expect(spawned).toEqual([]);
    expect(paths()).toEqual(["POST /api/agente/tareas/reclamar"]);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(leftovers()).toEqual([]);
  });

  it("descarga, sube por trozos, termina y borra el archivo", async () => {
    const file = Buffer.concat([Buffer.alloc(CHUNK, 1), Buffer.alloc(CHUNK, 2), Buffer.alloc(300, 3)]);
    const child = fakeSpawn({ write: file });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed()), child));
    expect(outcome).toBe("done");

    // yt-dlp, sin consola y con el enlace detrás de `--`, a una carpeta temporal propia.
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe("yt-dlp");
    const out = spawned[0].args[spawned[0].args.indexOf("-o") + 1];
    expect(spawned[0].args).toEqual(ytDlpArgs(REEL, out));
    expect(path.dirname(path.dirname(out))).toBe(tmp);
    // En su propio grupo de procesos, para poder cortarlo con lo que lance.
    expect(spawned[0].options).toMatchObject({ detached: true });

    const sub = `subida=${TASK.uploadId}`;
    expect(paths()).toEqual([
      "POST /api/agente/tareas/reclamar",
      `PUT /api/agente/tareas/7/trozo?indice=0&${sub}`,
      `PUT /api/agente/tareas/7/trozo?indice=1&${sub}`,
      `PUT /api/agente/tareas/7/trozo?indice=2&${sub}`,
      "POST /api/agente/tareas/7/terminar",
    ]);
    // Los trozos, en orden, son el archivo entero.
    const sent = calls.filter((call) => call.method === "PUT").map((call) => call.body as Buffer);
    expect(Buffer.concat(sent).equals(file)).toBe(true);
    expect(sent.map((bytes) => bytes.length)).toEqual([CHUNK, CHUNK, 300]);
    expect(calls.at(-1)!.body).toEqual({ ok: true, uploadId: TASK.uploadId, totalBytes: file.length });
    // Todas las peticiones llevan la ficha y ninguna sigue una redirección; la carpeta temporal se borra.
    expect(calls.every((call) => call.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls.every((call) => call.redirect === "error")).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it("mantiene la reserva con un latido cada 60 s mientras descarga", async () => {
    const child = fakeSpawn({ write: Buffer.alloc(100, 1), afterSleeps: 3 });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed()), child));
    expect(outcome).toBe("done");
    expect(LEASE_BEAT_MS).toBe(60_000);
    expect(sleeps.filter((ms) => ms === LEASE_BEAT_MS)).toHaveLength(3);
    // Dos minutos cumplidos descargando: dos latidos; al tercero ya había terminado.
    expect(paths().filter((p) => p === "POST /api/agente/tareas/7/latido")).toHaveLength(2);
    expect(paths().indexOf("POST /api/agente/tareas/7/latido")).toBeLessThan(paths().findIndex((p) => p.startsWith("PUT ")));
    expect(spawned[0].killed).toBeNull();
  });

  it("corta yt-dlp a los 4 minutos y comunica el fallo", async () => {
    expect(YT_DLP_TIMEOUT_MS).toBe(4 * 60_000);
    const child = fakeSpawn({ afterSleeps: Infinity });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed()), child));
    expect(outcome).toBe("failed");
    expect(spawned[0].killed).toBe("SIGKILL");
    expect(sleeps.filter((ms) => ms === LEASE_BEAT_MS)).toHaveLength(4);
    expect(paths().filter((p) => p === "POST /api/agente/tareas/7/latido")).toHaveLength(3);
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      path: "/api/agente/tareas/7/terminar",
      body: { ok: false, uploadId: TASK.uploadId, error: "yt-dlp tardó más de 4 minutos y se cortó" },
    });
    expect(leftovers()).toEqual([]);
  });

  it("si yt-dlp falla lo comunica y no sube nada", async () => {
    const child = fakeSpawn({ code: 1 });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed()), child));
    expect(outcome).toBe("failed");
    expect(paths()).toEqual(["POST /api/agente/tareas/reclamar", "POST /api/agente/tareas/7/terminar"]);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: TASK.uploadId, error: "yt-dlp no pudo descargar el enlace" });
    expect(leftovers()).toEqual([]);
  });

  it("el motivo que da yt-dlp viaja con el fallo, recortado", async () => {
    const child = fakeSpawn({ code: 1, stderr: `WARNING: algo\nERROR: [Instagram] abc: Requested content is not available ${"x".repeat(900)}\n` });
    await runOnce(config(), depsWith(fakeFetch(claimed()), child));
    const { error } = calls.at(-1)!.body as { error: string };
    expect(error.startsWith("yt-dlp no pudo descargar el enlace: ERROR: [Instagram] abc: Requested content is not available")).toBe(true);
    expect(error.length).toBeLessThanOrEqual(500);
  });

  it("si yt-dlp no deja archivo (más de 100 MB), lo comunica", async () => {
    // Termina bien pero sin archivo: `--max-filesize` se lo saltó.
    expect(await runOnce(config(), depsWith(fakeFetch(claimed()), fakeSpawn()))).toBe("failed");
    expect((calls.at(-1)!.body as { error: string }).error).toContain("no dejó ningún archivo");
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  it("si yt-dlp no se puede ni lanzar, es cosa de este Mac: no da el enlace por fallido", async () => {
    // No está instalado (el error llega después de lanzar) o no hay permiso (falla al lanzar).
    const child = fakeSpawn({ afterSleeps: Infinity });
    const missing = (command: string, args: string[]) => {
      const emitter = child.spawn(command, args);
      queueMicrotask(() => emitter.emit("error", Object.assign(new Error("spawn yt-dlp ENOENT"), { code: "ENOENT" })));
      return emitter;
    };
    expect(await runOnce(config(), { ...depsWith(fakeFetch(claimed()), child), spawn: missing })).toBe("blocked");
    const denied = () => {
      throw Object.assign(new Error("spawn yt-dlp EACCES"), { code: "EACCES" });
    };
    expect(await runOnce(config(), { ...depsWith(fakeFetch(claimed()), child), spawn: denied })).toBe("blocked");
    // Ni «terminar» ni trozos: la reserva caduca sola y la tarea vuelve a la cola.
    expect(paths()).toEqual(["POST /api/agente/tareas/reclamar", "POST /api/agente/tareas/reclamar"]);
    expect(logs).toEqual([
      `Descargando ${REEL}`,
      "No se pudo lanzar yt-dlp (spawn yt-dlp ENOENT). La tarea se deja para más tarde.",
      `Descargando ${REEL}`,
      "No se pudo lanzar yt-dlp (spawn yt-dlp EACCES). La tarea se deja para más tarde.",
    ]);
    expect(leftovers()).toEqual([]);
  });

  it("al cortar a los 4 minutos mueren yt-dlp y lo que haya lanzado (el grupo de procesos entero)", async () => {
    // Un «yt-dlp» de verdad que lanza un hijo (como hace con ffmpeg) y no termina.
    const script = path.join(tmp, "yt-dlp-colgado.sh");
    const pids = path.join(tmp, "pids");
    fsSync.writeFileSync(script, `#!/bin/bash\nsleep 300 &\necho "$$ $!" > "${pids}"\nwait\n`, { mode: 0o755 });
    const work = path.join(tmp, "trabajo");
    fsSync.mkdirSync(work);
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      if (ms === LEASE_BEAT_MS) {
        // Da tiempo a que el «yt-dlp» arranque y apunte sus procesos (con el ordenador cargado tarda más).
        for (let i = 0; i < 100 && !fsSync.existsSync(pids); i++) await new Promise((resolve) => setTimeout(resolve, 50));
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    };
    const deps = { fetch: fakeFetch(claimed()), spawn: realSpawn, sleep, fs, log: (text: string) => logs.push(text) };
    expect(await runOnce({ url: WEB, token: TOKEN, tmpDir: work, ytDlp: script }, deps)).toBe("failed");
    expect(calls.at(-1)!.body).toMatchObject({ ok: false, error: "yt-dlp tardó más de 4 minutos y se cortó" });
    const [parent, child] = fsSync.readFileSync(pids, "utf8").trim().split(" ").map(Number);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && (alive(parent) || alive(child)); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    expect([alive(parent), alive(child)]).toEqual([false, false]);
    expect(fsSync.readdirSync(work)).toEqual([]);
  });

  it("una tarea con un enlace fuera de la lista se rechaza sin lanzar yt-dlp", async () => {
    for (const url of ["https://evil.test/x", "--exec=rm -rf ~", "http://www.instagram.com/reel/a", 7]) {
      calls = [];
      const outcome = await runOnce(config(), depsWith(fakeFetch(claimed({ ...TASK, url })), fakeSpawn()));
      expect(outcome).toBe("failed");
      expect(paths()).toEqual(["POST /api/agente/tareas/reclamar", "POST /api/agente/tareas/7/terminar"]);
      expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: TASK.uploadId, error: "El enlace no es de un sitio admitido" });
    }
    expect(spawned).toEqual([]);
    expect(leftovers()).toEqual([]);
  });

  it("si la web retira la tarea (409), la suelta: corta la descarga y no sube ni comunica nada más", async () => {
    // Durante la descarga.
    let child = fakeSpawn({ afterSleeps: Infinity });
    let fetch = fakeFetch({ ...claimed(), "/api/agente/tareas/7/latido": () => json(409, { error: "Esta tarea ya no es tuya." }) });
    expect(await runOnce(config(), depsWith(fetch, child))).toBe("failed");
    expect(spawned[0].killed).toBe("SIGKILL");
    expect(paths()).toEqual(["POST /api/agente/tareas/reclamar", "POST /api/agente/tareas/7/latido"]);
    // Subiendo un trozo.
    calls = [];
    child = fakeSpawn({ write: Buffer.alloc(CHUNK + 10, 1) });
    fetch = fakeFetch({ ...claimed(), "/api/agente/tareas/7/trozo": () => json(409, { error: "Esta tarea ya no es tuya." }) });
    expect(await runOnce(config(), depsWith(fetch, child))).toBe("failed");
    expect(paths()).toEqual(["POST /api/agente/tareas/reclamar", `PUT /api/agente/tareas/7/trozo?indice=0&subida=${TASK.uploadId}`]);
    // Al terminar.
    calls = [];
    child = fakeSpawn({ write: Buffer.alloc(10, 1) });
    fetch = fakeFetch({ ...claimed(), "/api/agente/tareas/7/terminar": () => json(409, { error: "Esta tarea ya no es tuya." }) });
    expect(await runOnce(config(), depsWith(fetch, child))).toBe("failed");
    expect(paths().filter((p) => p.endsWith("/terminar"))).toHaveLength(1);
    expect(leftovers()).toEqual([]);
  });

  it("un trozo que no llega se reintenta; uno que la web rechaza, no", async () => {
    // La red falla dos veces y a la tercera va.
    let attempts = 0;
    let fetch = fakeFetch({
      ...claimed(),
      "/api/agente/tareas/7/trozo": () => {
        attempts += 1;
        if (attempts < 3) throw new Error("fetch failed");
        return json(200, { received: 1 });
      },
    });
    expect(await runOnce(config(), depsWith(fetch, fakeSpawn({ write: Buffer.alloc(10, 1) })))).toBe("done");
    expect(attempts).toBe(3);
    // La web dice que el archivo no vale (no es un vídeo): se comunica y no se insiste.
    calls = [];
    fetch = fakeFetch({ ...claimed(), "/api/agente/tareas/7/trozo": () => json(400, { error: "Formato de vídeo no admitido." }) });
    expect(await runOnce(config(), depsWith(fetch, fakeSpawn({ write: Buffer.alloc(10, 1) })))).toBe("failed");
    expect(paths().filter((p) => p.startsWith("PUT "))).toHaveLength(1);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: TASK.uploadId, error: "La web rechazó el archivo (400)" });
    expect(leftovers()).toEqual([]);
  });

  it("sin red, con la ficha rechazada o con una respuesta rara, no hace nada y lo dice", async () => {
    const broken = async () => {
      throw new Error("fetch failed");
    };
    expect(await runOnce(config(), { ...depsWith(fakeFetch(), fakeSpawn()), fetch: broken })).toBe("offline");
    expect(await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(401, { error: "Ficha del Mac no válida." }) }), fakeSpawn()))).toBe("unauthorized");
    expect(await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(500, {}) }), fakeSpawn()))).toBe("offline");
    expect(await runOnce(config(), depsWith(fakeFetch(claimed({ taskId: "x" })), fakeSpawn()))).toBe("offline");
    expect(spawned).toEqual([]);
    expect(BAD_TOKEN_MESSAGE).toContain("Ficha revocada o incorrecta");
    expect(logs).toEqual([
      "No se pudo preguntar a la web: fetch failed",
      BAD_TOKEN_MESSAGE,
      "La web respondió 500 al preguntar por tareas.",
      "La web mandó una tarea que no se entiende.",
    ]);
  });

  it("cuando la web no responde o no reconoce la ficha, pregunta cada vez más despacio, hasta un minuto", () => {
    expect([POLL_MS, MAX_BACKOFF_MS, TOOLS_RETRY_MS]).toEqual([5_000, 60_000, 60_000]);
    // Sin nada que hacer, cada 5 s; con trabajo hecho, enseguida.
    expect(nextWait("idle", 0)).toBe(5_000);
    expect(nextWait("idle", 60_000)).toBe(5_000);
    expect(nextWait("done", 5_000)).toBe(0);
    expect(nextWait("failed", 5_000)).toBe(0);
    // Sin red o con la ficha revocada: 10 s, 20 s, 40 s, 60 s, 60 s…
    for (const outcome of ["offline", "unauthorized"]) {
      const waits: number[] = [];
      let wait = 5_000;
      for (let i = 0; i < 6; i++) waits.push((wait = nextWait(outcome, wait)));
      expect(waits).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
      expect(nextWait(outcome, 0)).toBe(10_000);
    }
    // En cuanto vuelve, otra vez cada 5 s.
    expect(nextWait("idle", nextWait("offline", 60_000))).toBe(5_000);
    expect(nextWait("blocked", 5_000)).toBe(60_000);
  });

  it("la ficha nunca aparece en lo que escribe por pantalla", async () => {
    // Ni aunque un error la traiga dentro, ni en lo que le cuenta a la web.
    const leaky = async (url: string, init: RequestInit) => {
      if (url.endsWith("/reclamar")) throw new Error(`connect failed with header Bearer ${TOKEN}`);
      return fakeFetch()(url, init);
    };
    await runOnce(config(), { ...depsWith(fakeFetch(), fakeSpawn()), fetch: leaky });
    await runOnce(config(), depsWith(fakeFetch(claimed()), fakeSpawn({ write: Buffer.alloc(10, 1) })));
    await runOnce(config(), depsWith(fakeFetch(claimed()), fakeSpawn({ code: 1, stderr: `ERROR: cookie ${TOKEN} rejected` })));
    await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(401) }), fakeSpawn()));
    expect(logs.length).toBeGreaterThan(4);
    expect(logs.join("\n")).not.toContain(TOKEN);
    expect(logs.join("\n")).not.toContain("pra_");
    const reported = calls.filter((call) => call.path.endsWith("/terminar")).map((call) => JSON.stringify(call.body));
    expect(reported.join("\n")).not.toContain(TOKEN);
  });
});

describe("canciones", () => {
  const SONG = "https://soundcloud.com/artista/cancion";
  const SONG_TASK = { taskId: 9, kind: "cancion", url: SONG, uploadId: "s".repeat(32), chunkBytes: CHUNK, maxBytes: 25 * 1024 * 1024 };
  /** Una trama MP3 (sincronía MPEG-1 capa III) y relleno. */
  const mp3 = (size: number) => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(size - 4, 9)]);

  /** Un yt-dlp de mentira para el audio: deja `cancion.mp3` y, si se da, el título en su archivo. */
  function audioSpawn(options: { write?: Buffer; title?: string; code?: number; stderr?: string } = {}) {
    return {
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      spawn: (command: string, args: string[], spawnOptions?: { detached?: boolean }) => {
        const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: (signal: string) => void };
        child.stderr = new EventEmitter();
        const record = { command, args, options: spawnOptions, killed: null as string | null };
        spawned.push(record);
        child.kill = (signal: string) => {
          record.killed = signal;
        };
        queueMicrotask(() => {
          const out = args[args.indexOf("-o") + 1];
          if (options.write) fsSync.writeFileSync(out.replace("%(ext)s", "mp3"), options.write);
          if (options.title !== undefined) fsSync.writeFileSync(args[args.indexOf("--print-to-file") + 2], options.title);
          if (options.stderr) child.stderr.emit("data", options.stderr);
          child.emit("close", options.code ?? 0);
        });
        return child;
      },
    };
  }

  it("el Mac es de la versión 1.6.0 (trae enlaces, lee perfiles y busca en Pinterest)", () => {
    expect(VERSION).toBe("1.6.0");
  });

  it("saca el audio como MP3 con una lista de argumentos fija y el enlace detrás de `--`", () => {
    expect(ytDlpAudioArgs(SONG, "/tmp/d", ["--cookies-from-browser", "brave"])).toEqual([
      "--ignore-config", "--use-extractors", "Instagram,TikTok,vm.tiktok,youtube,facebook,facebook:reel,soundcloud",
      "--cookies-from-browser", "brave", "--no-playlist", "--playlist-items", "1", "--max-filesize", "25M",
      "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0",
      "--print-to-file", "after_move:%(title)s", "/tmp/d/titulo.txt",
      "-o", "/tmp/d/cancion.%(ext)s", "--", SONG]);
  });

  it("para canciones solo añade el extractor de una pista de SoundCloud: ni el genérico ni listas", () => {
    const allowed = YT_DLP_SONG_EXTRACTORS.split(",");
    expect(allowed).toEqual([...YT_DLP_EXTRACTORS.split(","), "soundcloud"]);
    for (const banned of ["generic", "default", "all", "soundcloud:set", "soundcloud:user", "soundcloud:playlist", "youtube:tab", "youtube:music:search_url"]) {
      expect(allowed.map((name) => name.toLowerCase())).not.toContain(banned.toLowerCase());
    }
    const args = ytDlpAudioArgs("--exec=x", "/tmp/d");
    expect(args[0]).toBe("--ignore-config");
    expect(args.slice(-2)).toEqual(["--", "--exec=x"]);
  });

  it("SoundCloud vale para una canción y no para un vídeo; la lista es la misma que la del servidor", () => {
    expect(SONG_LINK_HOSTS).toEqual([...SERVER_SONG_HOSTS]);
    expect(allowedSongUrl(SONG)).toBe(true);
    expect(allowedUrl(SONG)).toBe(false);
    expect(linkOf(SONG)).toBeNull();
    for (const url of [
      SONG,
      "https://m.soundcloud.com/a/b",
      "https://music.youtube.com/watch?v=abc",
      REEL,
      "http://soundcloud.com/a/b",
      "https://soundcloud.com.evil.test/a",
      "https://user:pw@soundcloud.com/a",
      "https://evil.test/?u=soundcloud.com",
      "https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fevil.test",
    ]) {
      expect(allowedSongUrl(url), url).toBe(songLinkOf(url) !== null);
    }
  });

  it("descarga el audio en su carpeta temporal, lo sube por trozos y manda el título", async () => {
    const file = mp3(CHUNK + 1000);
    const child = audioSpawn({ write: file, title: "  Mi   canción (remix)\nsegunda línea" });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed(SONG_TASK)), child as unknown as ReturnType<typeof fakeSpawn>));
    expect(outcome).toBe("done");
    expect(spawned).toHaveLength(1);
    const dir = path.dirname(spawned[0].args[spawned[0].args.indexOf("-o") + 1]);
    expect(path.dirname(dir)).toBe(tmp);
    expect(spawned[0].args).toEqual(ytDlpAudioArgs(SONG, dir));
    expect(spawned[0].options).toMatchObject({ detached: true });
    const sub = `subida=${SONG_TASK.uploadId}`;
    expect(paths()).toEqual([
      "POST /api/agente/tareas/reclamar",
      `PUT /api/agente/tareas/9/trozo?indice=0&${sub}`,
      `PUT /api/agente/tareas/9/trozo?indice=1&${sub}`,
      "POST /api/agente/tareas/9/terminar",
    ]);
    expect(Buffer.concat(calls.filter((call) => call.method === "PUT").map((call) => call.body as Buffer)).equals(file)).toBe(true);
    expect(calls.at(-1)!.body).toEqual({ ok: true, uploadId: SONG_TASK.uploadId, totalBytes: file.length, title: "Mi canción (remix)" });
    expect(leftovers()).toEqual([]);
  });

  it("sin título termina igual (la web pone uno); con más de 25 MB no sube nada", async () => {
    await runOnce(config(), depsWith(fakeFetch(claimed(SONG_TASK)), audioSpawn({ write: mp3(100) }) as unknown as ReturnType<typeof fakeSpawn>));
    expect(calls.at(-1)!.body).toEqual({ ok: true, uploadId: SONG_TASK.uploadId, totalBytes: 100 });

    calls = [];
    const outcome = await runOnce(
      config(),
      depsWith(fakeFetch(claimed({ ...SONG_TASK, maxBytes: 50 })), audioSpawn({ write: mp3(100), title: "x" }) as unknown as ReturnType<typeof fakeSpawn>),
    );
    expect(outcome).toBe("failed");
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: SONG_TASK.uploadId, error: "La canción descargada pesa más de 25 MB" });
    expect(leftovers()).toEqual([]);
  });

  it("una canción con un enlace fuera de su lista se rechaza sin lanzar yt-dlp", async () => {
    for (const url of ["https://evil.test/x", "--exec=rm -rf ~", "http://soundcloud.com/a/b", "https://soundcloud.com.evil.test/a"]) {
      calls = [];
      const outcome = await runOnce(config(), depsWith(fakeFetch(claimed({ ...SONG_TASK, url })), fakeSpawn()));
      expect(outcome).toBe("failed");
      expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: SONG_TASK.uploadId, error: "El enlace no es de un sitio admitido" });
    }
    expect(spawned).toEqual([]);
  });

  it("un vídeo (sin `kind` o `referencia`) no admite SoundCloud", async () => {
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed({ ...TASK, kind: "referencia", url: SONG })), fakeSpawn()));
    expect(outcome).toBe("failed");
    expect(spawned).toEqual([]);
  });

  it("la ficha no aparece en lo que se escribe ni se envía aunque yt-dlp la repita", async () => {
    const child = audioSpawn({ code: 1, stderr: `ERROR: algo con ${TOKEN}\n` });
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed(SONG_TASK)), child as unknown as ReturnType<typeof fakeSpawn>));
    expect(outcome).toBe("failed");
    expect(logs.join("\n")).not.toContain(TOKEN);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: SONG_TASK.uploadId, error: "yt-dlp no pudo descargar el enlace: ERROR: algo con ***" });
  });
});

describe("enlaces del montaje en la nube", () => {
  const EDIT_REF = "https://www.instagram.com/reel/edicion/";
  const MEDIO = { taskId: 11, kind: "enlace_medio", url: EDIT_REF, uploadId: "e".repeat(32), chunkBytes: CHUNK, maxBytes: 300 * 1024 * 1024 };

  it("al pedir trabajo dice que sabe traer los enlaces del montaje (`puede`); sin `puede` no manda nada", async () => {
    await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(204) }), fakeSpawn()));
    await runOnce({ ...config(), puede: ["enlace_medio"] }, depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(204) }), fakeSpawn()));
    expect(calls.map((call) => call.body)).toEqual([null, { puede: ["enlace_medio"] }]);
    expect(calls[1].headers["Content-Type"]).toBe("application/json");
  });

  it("el programa del Mac pide siempre `enlace_medio` y ya no monta", () => {
    const source = fsSync.readFileSync(path.resolve(__dirname, "..", "agente-mac", "agente.mjs"), "utf8");
    expect(source).toContain('config.puede = ["enlace_medio", "perfil", "pinterest"]');
    expect(source).not.toMatch(/montaje"|checkMontaje|montar_auto/);
  });

  it("un `enlace_medio` se trae como una referencia: yt-dlp, trozos y terminar sin título", async () => {
    const file = Buffer.concat([Buffer.alloc(CHUNK, 4), Buffer.alloc(1000, 5)]);
    const child = fakeSpawn({ write: file });
    const outcome = await runOnce({ ...config(), puede: ["enlace_medio"] }, depsWith(fakeFetch(claimed(MEDIO)), child));
    expect(outcome).toBe("done");
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe("yt-dlp");
    const out = spawned[0].args[spawned[0].args.indexOf("-o") + 1];
    expect(spawned[0].args).toEqual(ytDlpArgs(EDIT_REF, out));
    expect(path.dirname(path.dirname(out))).toBe(tmp);
    const sub = `subida=${MEDIO.uploadId}`;
    expect(paths()).toEqual([
      "POST /api/agente/tareas/reclamar",
      `PUT /api/agente/tareas/11/trozo?indice=0&${sub}`,
      `PUT /api/agente/tareas/11/trozo?indice=1&${sub}`,
      "POST /api/agente/tareas/11/terminar",
    ]);
    expect(Buffer.concat(calls.filter((call) => call.method === "PUT").map((call) => call.body as Buffer)).equals(file)).toBe(true);
    expect(calls.at(-1)!.body).toEqual({ ok: true, uploadId: MEDIO.uploadId, totalBytes: file.length });
    expect(logs.join("\n")).not.toMatch(/mont/i);
    expect(leftovers()).toEqual([]);
  });

  it("un `enlace_medio` fuera de la lista de sitios (ni SoundCloud) se rechaza sin lanzar yt-dlp", async () => {
    for (const url of ["https://evil.test/x", "https://soundcloud.com/a/b", "https://d1abc.cloudfront.net/clip.mp4"]) {
      calls = [];
      const outcome = await runOnce(config(), depsWith(fakeFetch(claimed({ ...MEDIO, url })), fakeSpawn()));
      expect(outcome).toBe("failed");
      expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: MEDIO.uploadId, error: "El enlace no es de un sitio admitido" });
    }
    expect(spawned).toEqual([]);
  });

  it("si yt-dlp falla, lo comunica a la web y no sube nada", async () => {
    const outcome = await runOnce(config(), depsWith(fakeFetch(claimed(MEDIO)), fakeSpawn({ code: 1, stderr: "ERROR: privado\n" })));
    expect(outcome).toBe("failed");
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: MEDIO.uploadId, error: "yt-dlp no pudo descargar el enlace: ERROR: privado" });
    expect(leftovers()).toEqual([]);
  });
});

describe("perfiles de cuentas (1.5.0)", () => {
  const PERFIL = { taskId: 12, kind: "perfil", url: "https://www.instagram.com/frozenglow.us/", uploadId: "p".repeat(32), chunkBytes: CHUNK, maxBytes: 2 * 1024 * 1024 };
  const DATA = { red: "instagram", usuario: "frozenglow.us", cabecera: "Frozen Glow", descripcion: null, enlaces: ["https://tienda.example"], reels: [{ url: "https://www.instagram.com/reel/AAA/", vistas: 12300, texto: "x", miniatura: null }] };

  it("lee el perfil de Instagram (sin yt-dlp), lo sube en JSON y termina", async () => {
    const read = async (usuario: string) => ({ ok: true, perfil: { ...DATA, usuario } });
    const deps = { ...depsWith(fakeFetch(claimed(PERFIL)), fakeSpawn()), readInstagramProfile: read };
    const outcome = await runOnce({ ...config(), puede: ["enlace_medio", "perfil"] }, deps);
    expect(outcome).toBe("done");
    expect(spawned).toEqual([]);
    const sent = Buffer.concat(calls.filter((call) => call.method === "PUT").map((call) => call.body as Buffer));
    expect(JSON.parse(sent.toString())).toEqual(DATA);
    expect(calls.at(-1)!.body).toEqual({ ok: true, uploadId: PERFIL.uploadId, totalBytes: sent.length });
    expect(leftovers()).toEqual([]);
  });

  it("si Instagram enseña un aviso, lo comunica con su código y no sube nada", async () => {
    const read = async () => ({ ok: false, codigo: "aviso", error: "Instagram enseña un aviso" });
    const deps = { ...depsWith(fakeFetch(claimed(PERFIL)), fakeSpawn()), readInstagramProfile: read };
    expect(await runOnce(config(), deps)).toBe("failed");
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    expect(calls.at(-1)!.body).toEqual({ ok: false, uploadId: PERFIL.uploadId, error: "[aviso] Instagram enseña un aviso" });
  });

  it("los reels con la cuenta en la ruta quedan en la forma estándar; Chrome antes que Brave", () => {
    expect(canonicalReel("https://www.instagram.com/frozenglow.us/reel/DgD4Rb6IArA/")).toBe("https://www.instagram.com/reel/DgD4Rb6IArA/");
    expect(canonicalReel("https://www.instagram.com/p/ABC/")).toBe("https://www.instagram.com/p/ABC/");
    expect(headlessBrowser(() => true)).toBe(CHROME);
    expect(headlessBrowser((b) => b === BRAVE)).toBe(BRAVE);
    expect(headlessBrowser(() => false)).toBeNull();
  });

  it("entiende enlaces de perfil, cookies y vistas abreviadas", () => {
    expect(profileOf("https://www.instagram.com/frozenglow.us/")).toEqual({ red: "instagram", usuario: "frozenglow.us" });
    expect(profileOf("https://www.instagram.com/reel/ABC/")).toBeNull();
    expect(profileOf("https://www.tiktok.com/@tienda")).toEqual({ red: "tiktok", usuario: "tienda" });
    expect(profileOf("https://www.tiktok.com/@tienda/video/1")).toBeNull();
    expect(instagramCookies("# Netscape\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tabc\n#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t0\tcsrftoken\tdef\n.otra.com\tTRUE\t/\tTRUE\t0\tx\ty\n").map((c) => c.name)).toEqual(["sessionid", "csrftoken"]);
    expect([parseCount("12,3K"), parseCount("1,2 Mio."), parseCount("4.512"), parseCount("1.2M"), parseCount("830"), parseCount("hola")]).toEqual([12300, 1200000, 4512, 1200000, 830, null]);
    expect(tiktokProfileFrom({ title: "Tienda", entries: [{ url: "https://www.tiktok.com/@t/video/1", view_count: 5000, title: "Hola" }] }, "t").reels).toEqual([
      { url: "https://www.tiktok.com/@t/video/1", vistas: 5000, texto: "Hola", miniatura: null },
    ]);
  });
});

describe("configuración", () => {
  it("lee la dirección y la ficha del archivo o de las variables, y las comprueba", async () => {
    const home = path.join(tmp, "casa");
    fsSync.mkdirSync(home);
    expect(await readConfig({}, fs, home)).toBeNull();
    fsSync.writeFileSync(path.join(home, ".principal-agente.json"), JSON.stringify({ url: `${WEB}/`, token: ` ${TOKEN} ` }), { mode: 0o600 });
    expect(await readConfig({}, fs, home)).toEqual({ url: WEB, token: TOKEN });
    // Las variables mandan si están las dos.
    expect(await readConfig({ PRINCIPAL_URL: "https://otra.test", PRINCIPAL_AGENTE_TOKEN: TOKEN }, fs, home)).toEqual({ url: "https://otra.test", token: TOKEN });
    fsSync.writeFileSync(path.join(home, ".principal-agente.json"), "{ esto no es json");
    await expect(readConfig({}, fs, home)).rejects.toThrow("no es un JSON válido");
  });

  it("la ficha solo viaja por https (o a este mismo ordenador), y los errores no la enseñan", () => {
    expect(checkConfig({ url: "http://localhost:3000", token: TOKEN })).toEqual({ url: "http://localhost:3000", token: TOKEN });
    for (const bad of [
      { url: "http://principal.test", token: TOKEN },
      { url: "", token: TOKEN },
      { url: WEB, token: "" },
      { url: WEB, token: `${TOKEN}x` },
      { url: WEB },
      null,
    ]) {
      let message = "";
      try {
        checkConfig(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(bad)).not.toBe("");
      expect(message).not.toContain(TOKEN);
    }
  });

  it("si el archivo de la ficha lo pueden leer otras personas del Mac, le cierra los permisos antes de usarlo", async () => {
    const home = path.join(tmp, "casa");
    fsSync.mkdirSync(home);
    const file = path.join(home, ".principal-agente.json");
    fsSync.writeFileSync(file, JSON.stringify({ url: WEB, token: TOKEN }), { mode: 0o644 });
    fsSync.chmodSync(file, 0o644);
    expect(await readConfig({}, fs, home)).toEqual({ url: WEB, token: TOKEN, tightened: true });
    expect(fsSync.statSync(file).mode & 0o777).toBe(0o600);
    // Ya cerrado, no hay nada que avisar.
    expect(await readConfig({}, fs, home)).toEqual({ url: WEB, token: TOKEN });
    // Si no se puede cerrar, no arranca con la ficha a la vista de otros.
    fsSync.chmodSync(file, 0o640);
    const stuck = { ...fs, readFile: fs.readFile, stat: fs.stat, chmod: async () => Promise.reject(new Error("EPERM")) };
    await expect(readConfig({}, stuck, home)).rejects.toThrow("chmod 600");
  });

  it("al arrancar borra las carpetas temporales viejas, no las de la última hora", async () => {
    const old = path.join(tmp, "principal-agente-vieja");
    const recent = path.join(tmp, "principal-agente-reciente");
    for (const dir of [old, recent, path.join(tmp, "otra-cosa")]) fsSync.mkdirSync(dir);
    fsSync.writeFileSync(path.join(old, "video.mp4"), "x");
    const now = Date.now();
    const longAgo = new Date(now - LEFTOVER_AGE_MS - 60_000);
    fsSync.utimesSync(old, longAgo, longAgo);
    fsSync.utimesSync(path.join(tmp, "otra-cosa"), longAgo, longAgo);
    await cleanLeftovers(fs, tmp, now);
    // La reciente puede ser de otra copia del agente que está descargando ahora mismo.
    expect(leftovers().sort()).toEqual(["otra-cosa", "principal-agente-reciente"]);
  });

  it("solo un agente a la vez: el segundo no entra, y un apunte de un proceso muerto se sustituye", async () => {
    const lock = path.join(tmp, "agente.lock");
    const alive = (pid: number) => pid === 111;
    expect(await acquireLock(fs, lock, 111, alive)).toBe(true);
    expect(fsSync.readFileSync(lock, "utf8")).toBe("111\n");
    expect(fsSync.statSync(lock).mode & 0o777).toBe(0o600);
    // Otro proceso, con el primero vivo: fuera, y el apunte sigue siendo del primero.
    expect(await acquireLock(fs, lock, 222, alive)).toBe(false);
    expect(fsSync.readFileSync(lock, "utf8")).toBe("111\n");
    // Soltar el de otro no hace nada.
    await releaseLock(fs, lock, 222);
    expect(fsSync.existsSync(lock)).toBe(true);
    // El primero murió sin soltarlo: el siguiente lo sustituye.
    expect(await acquireLock(fs, lock, 333, () => false)).toBe(true);
    expect(fsSync.readFileSync(lock, "utf8")).toBe("333\n");
    await releaseLock(fs, lock, 333);
    expect(fsSync.existsSync(lock)).toBe(false);
    // Un apunte con basura tampoco bloquea para siempre.
    fsSync.writeFileSync(lock, "no es un número");
    expect(await acquireLock(fs, lock, 444, () => true)).toBe(true);
  });

  it("antes de recoger nada mira si yt-dlp y ffmpeg se pueden lanzar", async () => {
    /** Un `spawn` de mentira para las comprobaciones: cada programa responde, falla o no existe. */
    const tools = (answers: Record<string, { out?: string; code?: number; error?: string; throws?: boolean }>) => (command: string, args: string[]) => {
      const answer = answers[command] ?? { error: "ENOENT" };
      if (answer.throws) throw new Error("EACCES");
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void };
      child.stdout = new EventEmitter();
      child.kill = () => {};
      spawned.push({ command, args, options: undefined, killed: null });
      queueMicrotask(() => {
        if (answer.error) return child.emit("error", new Error(answer.error));
        if (answer.out) child.stdout.emit("data", answer.out);
        child.emit("close", answer.code ?? 0);
      });
      return child;
    };
    expect(await checkTools({ spawn: tools({ "yt-dlp": { out: "2026.11.01\n" }, ffmpeg: { out: "ffmpeg version 7.1\n" } }) })).toEqual({ missing: [], ytDlp: "2026.11.01" });
    expect(spawned.map((call) => [call.command, ...call.args])).toEqual([
      ["yt-dlp", "--version"],
      ["ffmpeg", "-version"],
    ]);
    expect(await checkTools({ spawn: tools({ ffmpeg: {} }) })).toEqual({ missing: ["yt-dlp"], ytDlp: null });
    expect(await checkTools({ spawn: tools({ "yt-dlp": { out: "2026.11.01" } }) })).toEqual({ missing: ["ffmpeg"], ytDlp: "2026.11.01" });
    expect(await checkTools({ spawn: tools({ "yt-dlp": { code: 1 }, ffmpeg: { throws: true } }) })).toEqual({ missing: ["yt-dlp", "ffmpeg"], ytDlp: null });
  });
});

describe("instalar.sh", () => {
  const ROOT = path.resolve(__dirname, "..");

  /**
   * Una casa de mentira con un `node` de verdad en ~/.local/node/bin, `yt-dlp` y `ffmpeg` en
   * ~/.local/bin (salvo los que se digan en `without`) y un `launchctl` que apunta lo que le piden.
   */
  function fakeMac(without: string[] = []) {
    const home = path.join(tmp, "Users", "emma nuel");
    const bin = path.join(tmp, "bin");
    fsSync.mkdirSync(path.join(home, ".local", "node", "bin"), { recursive: true });
    fsSync.mkdirSync(path.join(home, ".local", "bin"), { recursive: true });
    fsSync.mkdirSync(bin, { recursive: true });
    fsSync.symlinkSync(process.execPath, path.join(home, ".local", "node", "bin", "node"));
    for (const tool of ["yt-dlp", "ffmpeg"]) {
      if (!without.includes(tool)) fsSync.writeFileSync(path.join(home, ".local", "bin", tool), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    }
    const record = path.join(tmp, "launchctl.log");
    fsSync.writeFileSync(
      path.join(bin, "launchctl"),
      `#!/bin/bash\necho "$@" >> "${record}"\nif [ "$1" = "print" ]; then [ -f "${tmp}/cargado" ] && exit 0 || exit 113; fi\nif [ "$1" = "bootstrap" ]; then touch "${tmp}/cargado"; fi\nif [ "$1" = "bootout" ]; then rm -f "${tmp}/cargado"; fi\nexit 0\n`,
      { mode: 0o755 },
    );
    const run = (env: Record<string, string> = {}, input = "") =>
      spawnSync("bash", [path.join(ROOT, "agente-mac", "instalar.sh")], {
        env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, ...env } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        input,
      });
    const launchctl = () => (fsSync.existsSync(record) ? fsSync.readFileSync(record, "utf8").trim().split("\n") : []);
    return { home, run, launchctl };
  }

  it("copia el programa, escribe el plist con las rutas de ese Mac y lo carga; repetirlo no rompe nada", () => {
    const { home, run, launchctl } = fakeMac();
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    const dest = path.join(home, ".principal-tools", "agente-mac");
    expect(fsSync.readdirSync(dest).sort()).toEqual(["README.md", "agente.mjs", "lib.mjs", "perfil.mjs"]);
    expect(fsSync.readFileSync(path.join(dest, "lib.mjs"), "utf8")).toBe(fsSync.readFileSync(path.join(ROOT, "agente-mac", "lib.mjs"), "utf8"));

    const plistPath = path.join(home, "Library", "LaunchAgents", "com.principal.agente.plist");
    const plist = fsSync.readFileSync(plistPath, "utf8");
    // Rutas completas de esa casa (con su espacio), sin marcas ni `~`.
    expect(plist).not.toMatch(/__HOME__|__NODE__|__PATH__/);
    expect(plist).not.toMatch(/<string>[^<]*~/);
    expect(plist).toContain(`<string>${home}/.local/node/bin/node</string>`);
    expect(plist).toContain(`<string>${home}/.principal-tools/agente-mac/agente.mjs</string>`);
    expect(plist).toContain(`<string>${home}/.local/bin:${home}/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>`);
    expect(plist).toContain(`<string>${home}/Library/Logs/principal-agente.log</string>`);
    expect(plist).toContain("<key>KeepAlive</key>");

    const uid = process.getuid!();
    // Cargarlo basta (arranca solo con RunAtLoad): sin `kickstart`.
    expect(launchctl()).toEqual([`print gui/${uid}/com.principal.agente`, `bootstrap gui/${uid} ${plistPath}`]);
    // Sin configuración todavía, lo dice y no falla.
    expect(first.stdout).toContain(".principal-agente.json");
    expect(fsSync.existsSync(path.join(home, ".principal-agente.json"))).toBe(false);

    // Segunda vez: descarga el anterior antes de cargar el nuevo, y deja lo mismo.
    const second = run();
    expect(second.status, second.stderr).toBe(0);
    expect(launchctl().slice(2)).toEqual([
      `print gui/${uid}/com.principal.agente`,
      `bootout gui/${uid}/com.principal.agente`,
      `print gui/${uid}/com.principal.agente`,
      `bootstrap gui/${uid} ${plistPath}`,
    ]);
    expect(fsSync.readFileSync(plistPath, "utf8")).toBe(plist);
  });

  it("pide la ficha sin enseñarla, la guarda cerrada y no toca la que ya había", () => {
    const { home, run } = fakeMac();
    const configPath = path.join(home, ".principal-agente.json");
    // La ficha llega por la entrada (lo que se pega al pedirla): ni en el comando ni en pantalla.
    const asked = run({}, `${TOKEN}\n`);
    expect(asked.status, asked.stderr).toBe(0);
    expect(JSON.parse(fsSync.readFileSync(configPath, "utf8"))).toEqual({ url: "https://principal-production-6265bcf2.up.railway.app", token: TOKEN });
    expect(fsSync.statSync(configPath).mode & 0o777).toBe(0o600);
    expect(asked.stdout + asked.stderr).not.toContain(TOKEN);
    expect(asked.stdout + asked.stderr).not.toContain("pra_");
    // Con la configuración ya hecha no vuelve a pedir nada ni la cambia (aunque llegue otra), y la cierra si estaba abierta.
    fsSync.chmodSync(configPath, 0o644);
    const other = "pra_" + "z".repeat(43);
    const again = run({ PRINCIPAL_URL: "https://otra.test", PRINCIPAL_AGENTE_TOKEN: other }, `${other}\n`);
    expect(again.status, again.stderr).toBe(0);
    expect(JSON.parse(fsSync.readFileSync(configPath, "utf8"))).toEqual({ url: "https://principal-production-6265bcf2.up.railway.app", token: TOKEN });
    expect(fsSync.statSync(configPath).mode & 0o777).toBe(0o600);
    expect(again.stdout + again.stderr).not.toContain("pra_");
  });

  it("una ficha mal pegada no se guarda, y el aviso no la repite", () => {
    const { home, run } = fakeMac();
    const configPath = path.join(home, ".principal-agente.json");
    for (const bad of ["hola", `${TOKEN}sobra`, TOKEN.slice(0, 30), `x${TOKEN}`]) {
      const result = run({}, `${bad}\n`);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(bad);
      expect(fsSync.existsSync(configPath)).toBe(false);
      expect(fsSync.existsSync(path.join(home, ".principal-tools"))).toBe(false);
    }
    // Por variables también vale (para quien lo lanza desde otro programa), y tampoco se enseña.
    const viaEnv = run({ PRINCIPAL_URL: WEB, PRINCIPAL_AGENTE_TOKEN: TOKEN });
    expect(viaEnv.status, viaEnv.stderr).toBe(0);
    expect(JSON.parse(fsSync.readFileSync(configPath, "utf8"))).toEqual({ url: WEB, token: TOKEN });
    expect(viaEnv.stdout + viaEnv.stderr).not.toContain("pra_");
  });

  it("si falta yt-dlp o ffmpeg donde el arranque automático los busca, lo dice y no instala nada", () => {
    const { home, run, launchctl } = fakeMac(["yt-dlp"]);
    const result = run({}, `${TOKEN}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No se encuentra: yt-dlp");
    // Dice dónde ha mirado: las mismas carpetas que irán en el plist.
    expect(result.stderr).toContain(`${home}/.local/bin:${home}/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`);
    expect(fsSync.existsSync(path.join(home, ".principal-tools"))).toBe(false);
    expect(fsSync.existsSync(path.join(home, ".principal-agente.json"))).toBe(false);
    expect(fsSync.existsSync(path.join(home, "Library", "LaunchAgents", "com.principal.agente.plist"))).toBe(false);
    expect(launchctl()).toEqual([]);
  });

  it("con un node viejo se para sin instalar nada", () => {
    const { home, run } = fakeMac();
    fsSync.rmSync(path.join(home, ".local", "node", "bin", "node"));
    fsSync.writeFileSync(path.join(home, ".local", "node", "bin", "node"), '#!/bin/bash\necho 18\n', { mode: 0o755 });
    const old = run();
    expect(old.status).toBe(1);
    expect(old.stderr).toContain("Node 22");
    expect(fsSync.existsSync(path.join(home, ".principal-tools"))).toBe(false);
  });
});

describe("cookies", () => {
  it("usa el archivo de cookies si existe y si no la sesión de Brave", async () => {
    const { cookieArgs } = await import("../agente-mac/lib.mjs");
    expect(cookieArgs("/x/c.txt", () => true)).toEqual(["--cookies", "/x/c.txt"]);
    expect(cookieArgs("/x/c.txt", () => false)).toEqual(["--cookies-from-browser", "brave"]);
  });
});
