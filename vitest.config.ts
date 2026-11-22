import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // El disco es exFAT: macOS crea un archivo `._nombre` junto a cada archivo.
    exclude: ["**/._*", "node_modules/**", ".next/**"],
    // Las pruebas con base de datos comparten un PostgreSQL embebido: de una en una.
    globalSetup: ["tests/helpers/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
