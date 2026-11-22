import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "./schema";

// Los importes son enteros de 64 bits en la base de datos (micro-dólares) y caben de sobra
// en un número de JavaScript: se leen como número también en las consultas SQL directas.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export type Db = NodePgDatabase<typeof schema>;

// Una sola conexión compartida por proceso, también entre recargas en caliente de desarrollo.
const globalForDb = globalThis as unknown as { __principalPool?: Pool; __principalDb?: Db };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL. Arranca la aplicación con `npm run dev`.");
  }
  return url;
}

export function getPool(): Pool {
  if (!globalForDb.__principalPool) {
    globalForDb.__principalPool = new Pool({ connectionString: databaseUrl(), max: 10 });
  }
  return globalForDb.__principalPool;
}

export function getDb(): Db {
  if (!globalForDb.__principalDb) {
    globalForDb.__principalDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__principalDb;
}

/** Valor guardado bajo `key`, o `null` si no existe. */
export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select().from(schema.settings).where(eq(schema.settings.key, key));
  return row ? (row.value as T) : null;
}

/** Guarda (o sustituye) el valor de `key`. */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

export { schema };
