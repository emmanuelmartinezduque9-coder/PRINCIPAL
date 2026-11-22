import { getPool } from "@/db/client";
import { appVersion } from "@/lib/version";

/** Comprobación de salud para el alojamiento: la web responde, la base de datos también, y qué versión corre. */
export async function GET() {
  try {
    await getPool().query("select 1");
    return Response.json({ ok: true, version: appVersion() });
  } catch {
    return Response.json({ ok: false, version: appVersion() }, { status: 503 });
  }
}
