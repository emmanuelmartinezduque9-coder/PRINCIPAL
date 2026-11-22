import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { checkCloudEnv } from "../src/lib/cloud-env";
import { shutdownBudget, stopChildren } from "../src/lib/shutdown";

/**
 * Arranque en la nube: comprueba la configuración, aplica migraciones, prepara los datos
 * iniciales y lanza la web (en todas las interfaces, con inicio de sesión) y el proceso en
 * segundo plano. Si una de las dos piezas se cae, se sale con error para que Railway
 * reinicie el servicio. Al parar (cada despliegue), espera a que las dos piezas terminen.
 */
export async function startCloud(): Promise<void> {
  const { problems, warnings } = checkCloudEnv(process.env);
  for (const warning of warnings) console.warn(`[nube] Aviso: ${warning}`);
  if (problems.length) {
    for (const problem of problems) console.error(`[nube] ${problem}`);
    console.error("[nube] No se arranca. Corrige las variables del servicio en Railway (Variables) y vuelve a desplegar.");
    process.exit(1);
  }

  const url = (process.env.DATABASE_URL as string).trim();
  try {
    await runMigrations(url);
    await seed(url);
  } catch (error) {
    console.error(`[nube] No se pudo preparar la base de datos: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log("[nube] base de datos lista");

  const port = process.env.PORT ?? "3000";
  const bin = (name: string) => path.join(process.cwd(), "node_modules", ".bin", name);
  const children: ChildProcess[] = [
    spawn(bin("next"), ["start", "--port", port, "--hostname", "0.0.0.0"], { stdio: "inherit" }),
    spawn(bin("tsx"), ["src/worker/main.ts"], { stdio: "inherit" }),
  ];

  let closing = false;
  const stop = async (code: number) => {
    if (closing) return;
    closing = true;
    // Se espera a que las dos piezas salgan (el proceso en segundo plano termina antes el paso
    // que tenga a medias), como mucho lo que el despliegue da para parar.
    const clean = await stopChildren(children, shutdownBudget(process.env).parentMs);
    if (!clean) console.error("[nube] Alguna pieza no terminó a tiempo: se cierra a la fuerza.");
    process.exit(code);
  };
  process.on("SIGTERM", () => void stop(0));
  process.on("SIGINT", () => void stop(0));
  // Cualquier salida de una pieza, aunque sea limpia, cuenta como fallo: sin ella el servicio no sirve.
  const names = ["la web", "el proceso en segundo plano"];
  children.forEach((child, i) =>
    child.on("error", (error) => {
      console.error(`[nube] No se pudo lanzar ${names[i]}: ${error.message}`);
      void stop(1);
    }),
  );
  for (const child of children) child.on("exit", (code) => void stop(code === 0 ? 1 : (code ?? 1)));
}
