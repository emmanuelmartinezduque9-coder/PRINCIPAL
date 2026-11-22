/**
 * `npm start`: en la nube arranca la versión pública con inicio de sesión; en este
 * ordenador, la versión local (compila, arranca y abre la aplicación).
 */
import { isCloud } from "../src/lib/cloud-env";

async function main() {
  if (isCloud()) {
    const { startCloud } = await import("./cloud");
    await startCloud();
    return;
  }
  if (!process.argv.includes("--prod")) process.argv.push("--prod");
  await import("./dev");
}

main().catch((error) => {
  console.error("[start] no se pudo arrancar:", error);
  process.exit(1);
});
