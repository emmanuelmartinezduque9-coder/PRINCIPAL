import { setAssignments } from "@/server/access";
import { HttpError, handle } from "@/server/http";
import { parsePersonId } from "@/server/people";

/** Sustituye los productos asignados a una persona. Un producto que no existe: 400 y no cambia nada. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(
    async (owner) => {
      const userId = parsePersonId((await params).id);
      const body = (await request.json().catch(() => null)) as { productIds?: unknown } | null;
      const ids = body?.productIds;
      if (!Array.isArray(ids) || !ids.every((v) => typeof v === "number")) {
        throw new HttpError(400, "Alguno de los productos elegidos no existe.");
      }
      await setAssignments(owner!, userId, ids as number[]);
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
