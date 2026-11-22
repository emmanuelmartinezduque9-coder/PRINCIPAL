import os from "node:os";
import path from "node:path";

/** Carpeta de datos locales (base de datos embebida). Se puede cambiar con PRINCIPAL_DATA_DIR. */
export function dataDir(): string {
  return process.env.PRINCIPAL_DATA_DIR ?? path.join(os.homedir(), ".principal");
}
