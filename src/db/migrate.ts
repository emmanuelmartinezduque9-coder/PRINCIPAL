import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Tablas que solo existen en la base de datos de Finanzas. */
const FINANZAS_MARKERS = ["supplier_orders", "stores", "balance_transactions"];

/** ¿Estas tablas son las de la base de datos de Finanzas? */
export function looksLikeFinanzas(tableNames: string[]): boolean {
  return FINANZAS_MARKERS.some((marker) => tableNames.includes(marker));
}

/** Aplica las migraciones pendientes. Seguro de repetir. Nunca migra sobre la base de Finanzas. */
export async function runMigrations(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (looksLikeFinanzas(rows.map((r) => r.tablename))) {
      throw new Error("Esta base de datos es la de Finanzas: PRINCIPAL necesita la suya propia.");
    }
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await pool.end();
  }
}
