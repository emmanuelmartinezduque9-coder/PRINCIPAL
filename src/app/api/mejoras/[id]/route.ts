import { handle, HttpError } from "@/server/http";
import { requeueReport } from "@/server/videos/mejoras/classify";
import { updateReport } from "@/server/videos/mejoras/reports";

type Context = { params: Promise<{ id: string }> };

const idOf = async (params: Context["params"]) => {
  const { id } = await params;
  if (!/^[1-9]\d{0,15}$/.test(id)) throw new HttpError(404, "No existe ese reporte.");
  return Number(id);
};

/**
 * Cambios del dueño en un reporte: `codeCommit` (el commit que lo arregla; también lo usa la sesión de
 * Claude que lo arregla), `codeNote`, `problemType`, `fixKind`, `status` (`sin_arreglo`/`clasificado`).
 */
export async function PATCH(request: Request, { params }: Context) {
  return handle(
    async (user) => {
      const input = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      const str = (value: unknown) => (typeof value === "string" ? value : value === null ? null : undefined);
      await updateReport(user!, await idOf(params), {
        codeCommit: str(input.codeCommit),
        codeNote: str(input.codeNote),
        problemType: typeof input.problemType === "string" ? input.problemType : undefined,
        fixKind: typeof input.fixKind === "string" ? input.fixKind : undefined,
        status: typeof input.status === "string" ? input.status : undefined,
      });
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}

/** Vuelve a clasificar el reporte con Claude. Solo el dueño. */
export async function POST(_request: Request, { params }: Context) {
  return handle(
    async () => {
      await requeueReport([await idOf(params)]);
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
