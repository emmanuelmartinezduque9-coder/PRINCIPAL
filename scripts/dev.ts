import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { startEmbeddedPg } from "./pg";

/** `--prod`: compila y sirve la versión optimizada (uso diario). Sin él, modo desarrollo. */
const production = process.argv.includes("--prod");
/** `--no-worker`: solo la web, sin trabajos en segundo plano. */
const withWorker = !process.argv.includes("--no-worker");

function runToEnd(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} terminó con código ${code}`))));
  });
}

async function isRunning(port: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Hay algo escuchando en el puerto (aunque no responda bien): no se puede arrancar otra copia. */
function portInUse(port: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Arranque local completo: base de datos, migraciones, web y proceso en segundo plano.
 * En la nube cada pieza se lanza por separado con DATABASE_URL ya definida.
 */
async function main() {
  const port = process.env.PORT ?? "3000";

  // Si ya está en marcha, no se vuelve a compilar (eso pisaría la versión que se está
  // sirviendo): basta con abrirla.
  if (await isRunning(port)) {
    console.log(`\nLa aplicación ya está abierta: http://localhost:${port}\n`);
    return;
  }
  if (await portInUse(port)) {
    console.log(
      `\nYa hay algo en marcha en http://localhost:${port} y no responde como la aplicación.` +
        `\nCierra la otra ventana donde se abrió (o reinicia el ordenador) y vuelve a intentarlo.\n`,
    );
    process.exitCode = 1;
    return;
  }

  let stopDatabase = async () => {};
  let url = process.env.DATABASE_URL;
  if (!url) {
    const pg = await startEmbeddedPg();
    url = pg.url;
    stopDatabase = pg.stop;
  }

  await runMigrations(url);
  await seed(url);
  console.log("[dev] base de datos lista");

  // En este ordenador la web solo escucha en 127.0.0.1, así que no pide inicio de sesión.
  // En la nube no se usa este script y el inicio de sesión queda activado por defecto.
  const env = { ...process.env, DATABASE_URL: url, PRINCIPAL_AUTH: process.env.PRINCIPAL_AUTH ?? "off" };
  const bin = (name: string) => path.join(process.cwd(), "node_modules", ".bin", name);

  if (production) {
    console.log("[start] compilando la aplicación…");
    await runToEnd(bin("next"), ["build"], env);
  }

  const children: ChildProcess[] = [
    // Solo accesible desde este ordenador: todavía no hay inicio de sesión.
    spawn(bin("next"), [production ? "start" : "dev", "--port", port, "--hostname", "127.0.0.1"], {
      stdio: "inherit",
      env,
    }),
  ];
  if (withWorker) {
    children.push(
      spawn(bin("tsx"), production ? ["src/worker/main.ts"] : ["watch", "--clear-screen=false", "src/worker/main.ts"], {
        stdio: "inherit",
        env,
      }),
    );
  }

  if (production) {
    // Cuando la web responde, avisa de que está lista.
    void (async () => {
      for (let i = 0; i < 60 && !(await isRunning(port)); i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log(`\nAplicación lista: http://localhost:${port}  (para cerrarla, Ctrl+C en esta ventana)\n`);
      })();
  }

  let closing = false;
  const shutdown = async (code: number) => {
    if (closing) return;
    closing = true;
    for (const child of children) child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await stopDatabase().catch(() => {});
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  for (const child of children) {
    child.on("exit", (code) => {
      if (!closing) void shutdown(code ?? 1);
    });
  }
}

main().catch((error) => {
  console.error("[dev] no se pudo arrancar:", error);
  process.exit(1);
});
