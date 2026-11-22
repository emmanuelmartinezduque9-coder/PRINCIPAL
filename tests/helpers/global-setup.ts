import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { runMigrations } from "../../src/db/migrate";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Base de datos real para las pruebas: PostgreSQL embebido en una carpeta temporal fuera
 * del disco exFAT y en un puerto libre, para que varias ejecuciones no choquen entre sí.
 * Se arranca una vez por ejecución y se borra al terminar.
 */
export default async function setup() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "principal-pg-test-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "principal",
    password: "principal",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("principal_test");

  const url = `postgres://principal:principal@127.0.0.1:${port}/principal_test`;
  await runMigrations(url);

  // Los procesos de prueba heredan estas variables.
  process.env.DATABASE_URL = url;
  process.env.VAULT_KEY = Buffer.alloc(32, 7).toString("base64");

  return async () => {
    await pg.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

/** Vacía todas las tablas. Úsalo en `beforeEach` de las pruebas con base de datos. */
export async function truncateAll(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length) {
      const names = rows.map((r) => `"${r.tablename}"`).join(", ");
      await client.query(`truncate ${names} restart identity cascade`);
    }
  } finally {
    await client.end();
  }
}
