import { macClaudeSummary, setMacMode, setMacEngines } from "@/server/claude-mac";
import { handle } from "@/server/http";

/**
 * Por dónde van las llamadas a Claude del dueño (`mode`: `mac_primero`, `solo_mac` o `api`) y lo
 * hecho este mes en su Mac (llamadas, ahorro frente a la API y veces que tuvo que ir a la API).
 * Solo el dueño.
 */
export async function GET() {
  return handle(async (owner) => Response.json(await macClaudeSummary(owner!), { headers: { "Cache-Control": "no-store" } }), { role: "dueno" });
}

/** Cambia el modo (`mode`). Solo el dueño. */
export async function PUT(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as { mode?: unknown; engines?: unknown } | null;
      if (body?.engines !== undefined) await setMacEngines(owner!, body.engines);
      else await setMacMode(owner!, body?.mode);
      return Response.json(await macClaudeSummary(owner!));
    },
    { role: "dueno" },
  );
}
