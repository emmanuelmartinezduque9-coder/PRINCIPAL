import { handle } from "@/server/http";
import { updateCorrection } from "@/server/videos/mejoras/reports";

type Context = { params: Promise<{ key: string }> };

/** El dueño retira o reactiva (`active`) una corrección, o la reescribe (`directive`: versión nueva). */
export async function PATCH(request: Request, { params }: Context) {
  return handle(
    async (user) => {
      const { key } = await params;
      const input = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      await updateCorrection(user!, key, {
        active: typeof input.active === "boolean" ? input.active : undefined,
        directive: typeof input.directive === "string" ? input.directive : undefined,
        note: typeof input.note === "string" ? input.note : undefined,
      });
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
