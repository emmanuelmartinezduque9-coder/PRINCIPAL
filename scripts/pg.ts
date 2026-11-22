import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { dataDir } from "../src/lib/paths";

const PORT = Number(process.env.PRINCIPAL_PG_PORT ?? 54339);
const USER = "principal";
// Base de datos local que solo escucha en este ordenador; no es un secreto.
const PASSWORD = "principal";
const DATABASE = "principal";

const urlFor = (database: string) =>
  `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;

async function canConnect(database: string): Promise<boolean> {
  const client = new Client({ connectionString: urlFor(database), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Arranca un PostgreSQL local sin instalar nada en el sistema. Los datos persisten en
 * `dataDir()/pg`. Si ya hay uno en marcha (otra terminal), lo reutiliza.
 */
export async function startEmbeddedPg(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (await canConnect(DATABASE)) {
    return { url: urlFor(DATABASE), stop: async () => {} };
  }

  const dir = path.join(dataDir(), "pg");
  fs.mkdirSync(dataDir(), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: (error) => {
      const text = String(error ?? "");
      if (/FATAL|PANIC/.test(text)) console.error("[postgres]", text.trim());
    },
  });

  if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  if (!(await canConnect(DATABASE))) await pg.createDatabase(DATABASE);

  return { url: urlFor(DATABASE), stop: () => pg.stop() };
}
