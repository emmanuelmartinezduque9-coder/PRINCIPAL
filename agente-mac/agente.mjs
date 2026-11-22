#!/usr/bin/env node
// Agente del Mac de PRINCIPAL: descarga con yt-dlp los enlaces que se pegan en la web (Instagram,
// TikTok…) y entrega el archivo. Todas las conexiones salen de este Mac, por HTTPS.
//
//   node agente.mjs
//
// Configuración: ~/.principal-agente.json  { "url": "https://…", "token": "pra_…" }
// (o las variables PRINCIPAL_URL y PRINCIPAL_AGENTE_TOKEN). Ver README.md.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { cleanLeftovers, heartbeat, HEARTBEAT_MS, POLL_MS, readConfig, runOnce, VERSION } from "./lib.mjs";

const CONFIG_RETRY_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Un mismo aviso repetido (sin red, ficha revocada…) se escribe una vez, no cada 5 segundos.
let lastLine = "";
const log = (text) => {
  if (text === lastLine) return;
  lastLine = text;
  console.log(`${new Date().toLocaleString("es-ES")}  ${text}`);
};

/** La versión de yt-dlp instalada, o `null` si no se encuentra. */
function ytDlpVersion() {
  return new Promise((resolve) => {
    execFile("yt-dlp", ["--version"], { timeout: 15_000 }, (error, stdout) => resolve(error ? null : stdout.trim().slice(0, 40) || null));
  });
}

/** Espera a que exista una configuración válida; avisa una vez y vuelve a mirar cada 30 segundos. */
async function waitForConfig() {
  let warned = "";
  for (;;) {
    let problem;
    try {
      const config = await readConfig(process.env, fs);
      if (config) return config;
      problem = "Falta ~/.principal-agente.json con la dirección de la web y la ficha (ver README.md).";
    } catch (error) {
      problem = error instanceof Error ? error.message : "La configuración no vale.";
    }
    if (problem !== warned) log(problem);
    warned = problem;
    await sleep(CONFIG_RETRY_MS);
  }
}

// El yt-dlp en marcha, para cortarlo si el programa se para.
let running = null;
function spawnTracked(command, args, options) {
  const child = spawn(command, args, options);
  running = child;
  child.once("close", () => {
    if (running === child) running = null;
  });
  return child;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    running?.kill("SIGKILL");
    process.exit(0);
  });
}

log(`Agente del Mac de PRINCIPAL ${VERSION}`);
await cleanLeftovers(fs);
const config = await waitForConfig();
const ytDlp = await ytDlpVersion();
if (!ytDlp) log("No se encuentra yt-dlp: sin él no se puede descargar nada. Instálalo y vuelve a arrancar.");
const deps = { fetch, spawn: spawnTracked, fs, sleep, log };

let connected = null;
async function beat() {
  let state;
  try {
    const response = await heartbeat(config, deps, { ytDlp });
    state = response.ok ? "conectado" : response.status === 401 ? "ficha" : "error";
  } catch {
    state = "error";
  }
  if (state !== connected) {
    if (state === "conectado") log(`Conectado con ${config.url}`);
    else if (state === "ficha") log("La web no reconoce la ficha de este Mac. Crea otra en Ajustes → Mac.");
    else log("Sin conexión con la web; se sigue intentando.");
  }
  connected = state;
}
await beat();
setInterval(beat, HEARTBEAT_MS);

for (;;) {
  let outcome = "idle";
  try {
    outcome = await runOnce(config, deps);
  } catch (error) {
    log(`Algo falló con una tarea: ${error instanceof Error ? error.message.split(config.token).join("***") : "error desconocido"}`);
  }
  // Con trabajo hecho se pregunta enseguida por el siguiente; sin nada, se espera un poco.
  if (outcome === "idle") await sleep(POLL_MS);
}
