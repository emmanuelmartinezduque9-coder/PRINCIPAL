import { handle, HttpError } from "@/server/http";
import { createSplitTest } from "@/server/videos/cerebro/vista";

/** «Crear split test» de un reel candidato (`{ postId }`): crea el lote con el pilar que toca y lo envía. Solo el dueño. */
export async function POST(request: Request) {
  return handle(
    async (user) => {
      const body = (await request.json().catch(() => null)) as { postId?: unknown } | null;
      const postId = Number(body?.postId);
      if (!Number.isSafeInteger(postId) || postId <= 0) throw new HttpError(400, "Falta el reel.");
      return Response.json(await createSplitTest(user!, postId));
    },
    { role: "dueno" },
  );
}
