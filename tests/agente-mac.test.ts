import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allowedUrl,
  checkConfig,
  chunkRanges,
  cleanLeftovers,
  LEASE_BEAT_MS,
  LINK_HOSTS,
  readConfig,
  runOnce,
  YT_DLP_TIMEOUT_MS,
  ytDlpArgs,
} from "../agente-mac/lib.mjs";
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
}

let tmp: string;
let calls: Call[];
let logs: string[];
let spawned: Array<{ command: string; args: string[]; killed: string | null }>;
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
    const call: Call = { method: init.method ?? "GET", path: parsed.pathname + parsed.search, headers: init.headers as Record<string, string>, body };
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
  const spawn = (command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: (signal: string) => void };
    child.stderr = new EventEmitter();
    const record = { command, args, killed: null as string | null };
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
    expect(ytDlpArgs("https://www.instagram.com/reel/abc/", "/tmp/x.mp4")).toEqual([
      "--cookies-from-browser", "brave", "--no-playlist", "--max-filesize", "100M",
      "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
      "-o", "/tmp/x.mp4", "--", "https://www.instagram.com/reel/abc/"]);
  });

  it("solo admite enlaces https de los sitios de la lista", () => {
    expect(allowedUrl("https://vm.tiktok.com/abc")).toBe(true);
    expect(allowedUrl("https://www.instagram.com/reel/abc/?igsh=x")).toBe(true);
    expect(allowedUrl("https://youtu.be/abc")).toBe(true);
    expect(allowedUrl("https://evil.test/?u=instagram.com")).toBe(false);
    expect(allowedUrl("--exec=rm -rf ~")).toBe(false);
    expect(allowedUrl("http://www.instagram.com/reel/a")).toBe(false);
    expect(allowedUrl("https://instagram.com.evil.test/x")).toBe(false);
    expect(allowedUrl("https://user:pw@tiktok.com/x")).toBe(false);
    expect(allowedUrl("https://www.instagram.com:8443/reel/a")).toBe(false);
    expect(allowedUrl("file:///etc/passwd")).toBe(false);
    expect(allowedUrl(undefined)).toBe(false);
  });

  it("la lista de sitios es la misma que la del servidor, y los dos deciden igual", () => {
    expect(LINK_HOSTS).toEqual([...SERVER_HOSTS]);
    for (const url of [REEL, "https://vm.tiktok.com/abc", "https://evil.test/x", "http://youtu.be/x", "https://fb.watch/a/", "https://notinstagram.com/a"]) {
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
    // Todas las peticiones llevan la ficha, y la carpeta temporal se borra.
    expect(calls.every((call) => call.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
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

  it("si yt-dlp no deja archivo (más de 100 MB) o no se puede lanzar, lo comunica", async () => {
    // Termina bien pero sin archivo: `--max-filesize` se lo saltó.
    expect(await runOnce(config(), depsWith(fakeFetch(claimed()), fakeSpawn()))).toBe("failed");
    expect((calls.at(-1)!.body as { error: string }).error).toContain("no dejó ningún archivo");
    expect(paths().some((p) => p.startsWith("PUT "))).toBe(false);
    // No está instalado.
    calls = [];
    const child = fakeSpawn({ afterSleeps: Infinity });
    const missing = (command: string, args: string[]) => {
      const emitter = child.spawn(command, args);
      queueMicrotask(() => emitter.emit("error", new Error("spawn yt-dlp ENOENT")));
      return emitter;
    };
    expect(await runOnce(config(), { ...depsWith(fakeFetch(claimed()), child), spawn: missing })).toBe("failed");
    expect(calls.at(-1)!.body).toMatchObject({ ok: false, error: "No se pudo lanzar yt-dlp: spawn yt-dlp ENOENT" });
    expect(leftovers()).toEqual([]);
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
    expect(await runOnce(config(), { ...depsWith(fakeFetch(), fakeSpawn()), fetch: broken })).toBe("idle");
    expect(await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(401, { error: "Ficha del Mac no válida." }) }), fakeSpawn()))).toBe("idle");
    expect(await runOnce(config(), depsWith(fakeFetch({ "/api/agente/tareas/reclamar": () => json(500, {}) }), fakeSpawn()))).toBe("idle");
    expect(await runOnce(config(), depsWith(fakeFetch(claimed({ taskId: "x" })), fakeSpawn()))).toBe("idle");
    expect(spawned).toEqual([]);
    expect(logs).toEqual([
      "No se pudo preguntar a la web: fetch failed",
      "La web no reconoce la ficha de este Mac. Crea otra en Ajustes → Mac.",
      "La web respondió 500 al preguntar por tareas.",
      "La web mandó una tarea que no se entiende.",
    ]);
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

describe("configuración", () => {
  it("lee la dirección y la ficha del archivo o de las variables, y las comprueba", async () => {
    const home = path.join(tmp, "casa");
    fsSync.mkdirSync(home);
    expect(await readConfig({}, fs, home)).toBeNull();
    fsSync.writeFileSync(path.join(home, ".principal-agente.json"), JSON.stringify({ url: `${WEB}/`, token: ` ${TOKEN} ` }));
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

  it("al arrancar borra las carpetas temporales que dejó una ejecución cortada", async () => {
    fsSync.mkdirSync(path.join(tmp, "principal-agente-abc"));
    fsSync.writeFileSync(path.join(tmp, "principal-agente-abc", "video.mp4"), "x");
    fsSync.mkdirSync(path.join(tmp, "otra-cosa"));
    await cleanLeftovers(fs, tmp);
    expect(leftovers()).toEqual(["otra-cosa"]);
  });
});

describe("instalar.sh", () => {
  const ROOT = path.resolve(__dirname, "..");

  /** Una casa de mentira con un `node` de verdad en ~/.local/node/bin y un `launchctl` que apunta lo que le piden. */
  function fakeMac() {
    const home = path.join(tmp, "Users", "emma nuel");
    const bin = path.join(tmp, "bin");
    fsSync.mkdirSync(path.join(home, ".local", "node", "bin"), { recursive: true });
    fsSync.mkdirSync(bin, { recursive: true });
    fsSync.symlinkSync(process.execPath, path.join(home, ".local", "node", "bin", "node"));
    const record = path.join(tmp, "launchctl.log");
    fsSync.writeFileSync(
      path.join(bin, "launchctl"),
      `#!/bin/bash\necho "$@" >> "${record}"\nif [ "$1" = "print" ]; then [ -f "${tmp}/cargado" ] && exit 0 || exit 113; fi\nif [ "$1" = "bootstrap" ]; then touch "${tmp}/cargado"; fi\nif [ "$1" = "bootout" ]; then rm -f "${tmp}/cargado"; fi\nexit 0\n`,
      { mode: 0o755 },
    );
    const run = (env: Record<string, string> = {}) =>
      spawnSync("bash", [path.join(ROOT, "agente-mac", "instalar.sh")], {
        env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, ...env } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
      });
    const launchctl = () => (fsSync.existsSync(record) ? fsSync.readFileSync(record, "utf8").trim().split("\n") : []);
    return { home, run, launchctl };
  }

  it("copia el programa, escribe el plist con las rutas de ese Mac y lo carga; repetirlo no rompe nada", () => {
    const { home, run, launchctl } = fakeMac();
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    const dest = path.join(home, ".principal-tools", "agente-mac");
    expect(fsSync.readdirSync(dest).sort()).toEqual(["README.md", "agente.mjs", "lib.mjs"]);
    expect(fsSync.readFileSync(path.join(dest, "lib.mjs"), "utf8")).toBe(fsSync.readFileSync(path.join(ROOT, "agente-mac", "lib.mjs"), "utf8"));

    const plistPath = path.join(home, "Library", "LaunchAgents", "com.principal.agente.plist");
    const plist = fsSync.readFileSync(plistPath, "utf8");
    // Rutas completas de esa casa (con su espacio), sin marcas ni `~`.
    expect(plist).not.toMatch(/__HOME__|__NODE__/);
    expect(plist).not.toMatch(/<string>[^<]*~/);
    expect(plist).toContain(`<string>${home}/.local/node/bin/node</string>`);
    expect(plist).toContain(`<string>${home}/.principal-tools/agente-mac/agente.mjs</string>`);
    expect(plist).toContain(`<string>${home}/.local/bin:${home}/.local/node/bin:/opt/homebrew/bin:/usr/bin:/bin</string>`);
    expect(plist).toContain(`<string>${home}/Library/Logs/principal-agente.log</string>`);
    expect(plist).toContain("<key>KeepAlive</key>");

    const uid = process.getuid!();
    expect(launchctl()).toEqual([
      `print gui/${uid}/com.principal.agente`,
      `bootstrap gui/${uid} ${plistPath}`,
      `kickstart -k gui/${uid}/com.principal.agente`,
    ]);
    // Sin configuración todavía, lo dice y no falla.
    expect(first.stdout).toContain(".principal-agente.json");
    expect(fsSync.existsSync(path.join(home, ".principal-agente.json"))).toBe(false);

    // Segunda vez: descarga el anterior antes de cargar el nuevo, y deja lo mismo.
    const second = run();
    expect(second.status, second.stderr).toBe(0);
    expect(launchctl().slice(3)).toEqual([
      `print gui/${uid}/com.principal.agente`,
      `bootout gui/${uid}/com.principal.agente`,
      `print gui/${uid}/com.principal.agente`,
      `bootstrap gui/${uid} ${plistPath}`,
      `kickstart -k gui/${uid}/com.principal.agente`,
    ]);
    expect(fsSync.readFileSync(plistPath, "utf8")).toBe(plist);
  });

  it("guarda la ficha que le pasan sin enseñarla, y no toca la que ya había", () => {
    const { home, run } = fakeMac();
    const configPath = path.join(home, ".principal-agente.json");
    const withToken = run({ PRINCIPAL_URL: WEB, PRINCIPAL_AGENTE_TOKEN: TOKEN });
    expect(withToken.status, withToken.stderr).toBe(0);
    expect(JSON.parse(fsSync.readFileSync(configPath, "utf8"))).toEqual({ url: WEB, token: TOKEN });
    expect(fsSync.statSync(configPath).mode & 0o777).toBe(0o600);
    expect(withToken.stdout + withToken.stderr).not.toContain(TOKEN);
    expect(withToken.stdout + withToken.stderr).not.toContain("pra_");
    // Sin variables, la configuración que había se conserva (y se cierra si estaba abierta).
    fsSync.chmodSync(configPath, 0o644);
    const again = run();
    expect(again.status, again.stderr).toBe(0);
    expect(JSON.parse(fsSync.readFileSync(configPath, "utf8"))).toEqual({ url: WEB, token: TOKEN });
    expect(fsSync.statSync(configPath).mode & 0o777).toBe(0o600);
    expect(again.stdout + again.stderr).not.toContain(TOKEN);
  });

  it("sin node, o con uno viejo, se para sin instalar nada", () => {
    const { home, run } = fakeMac();
    fsSync.rmSync(path.join(home, ".local", "node", "bin", "node"));
    fsSync.writeFileSync(path.join(home, ".local", "node", "bin", "node"), '#!/bin/bash\necho 18\n', { mode: 0o755 });
    const old = run();
    expect(old.status).toBe(1);
    expect(old.stderr).toContain("Node 22");
    expect(fsSync.existsSync(path.join(home, ".principal-tools"))).toBe(false);
  });
});
