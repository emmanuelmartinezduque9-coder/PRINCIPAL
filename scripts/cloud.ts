import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { checkCloudEnv } from "../src/lib/cloud-env";

/**
 * Arranque en la nube: comprueba la configuración, aplica migraciones, prepara los datos
 * iniciales y lanza la web (en todas las interfaces, con inicio de sesión) y el proceso en
 * segundo plano. Si una de las dos piezas se cae, se sale con error para que Railway
 * reinicie el servicio.
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
  const stop = (code: number) => {
    if (closing) return;
    closing = true;
    for (const child of children) child.kill("SIGTERM");
    setTimeout(() => process.exit(code), 1500);
  };
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
  // Cualquier salida de una pieza, aunque sea limpia, cuenta como fallo: sin ella el servicio no sirve.
  const names = ["la web", "el proceso en segundo plano"];
  children.forEach((child, i) =>
    child.on("error", (error) => {
      console.error(`[nube] No se pudo lanzar ${names[i]}: ${error.message}`);
      stop(1);
    }),
  );
  for (const child of children) child.on("exit", (code) => stop(code === 0 ? 1 : (code ?? 1)));
}
