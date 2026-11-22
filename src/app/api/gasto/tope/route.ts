import { parseUsd } from "@/lib/money";
import { HttpError, handle } from "@/server/http";
import { setGlobalCap } from "@/server/spend";

/** Cambia el tope mensual global (`capUsd`, texto como "45" o "12,50") y reanuda los trabajos que ya tengan saldo. Solo el dueño. */
export async function PUT(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const micros = typeof body?.capUsd === "string" ? parseUsd(body.capUsd) : null;
      if (micros === null) throw new HttpError(400, "Escribe un importe, por ejemplo 45 o 12,50.");
      await setGlobalCap(owner!, micros);
      return Response.json({ ok: true, capMicros: micros });
    },
    { role: "dueno" },
  );
}
