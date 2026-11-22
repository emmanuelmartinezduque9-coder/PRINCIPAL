import { parseUsd } from "@/lib/money";
import { HttpError, handle } from "@/server/http";
import { parsePersonId, setPersonDisabled } from "@/server/people";
import { setUserCap } from "@/server/spend";

/** Cambia el tope mensual (`capUsd`, texto como "12,50") y/o activa o desactiva a la persona. Solo el dueño. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(
    async (owner) => {
      const userId = parsePersonId((await params).id);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") throw new HttpError(400, "Petición no válida.");
      const { capUsd, disabled } = body;
      if (capUsd === undefined && disabled === undefined) throw new HttpError(400, "No hay nada que cambiar.");
      if (disabled !== undefined && typeof disabled !== "boolean") throw new HttpError(400, "Petición no válida.");
      let micros: number | undefined;
      if (capUsd !== undefined) {
        const parsed = typeof capUsd === "string" ? parseUsd(capUsd) : null;
        if (parsed === null) throw new HttpError(400, "Escribe un importe, por ejemplo 10 o 12,50.");
        micros = parsed;
      }
      if (micros !== undefined) await setUserCap(owner!, userId, micros);
      if (disabled !== undefined) await setPersonDisabled(owner!, userId, disabled);
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
