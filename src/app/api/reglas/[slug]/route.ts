import { handle, HttpError } from "@/server/http";
import { getRule, getRuleVersion, saveRuleVersion } from "@/server/rules";

type Context = { params: Promise<{ slug: string }> };

/** La regla con su historial; con `?version=N`, además el texto de esa versión. Solo el dueño. */
export async function GET(request: Request, { params }: Context) {
  return handle(
    async () => {
      const { slug } = await params;
      const rule = await getRule(slug);
      const raw = new URL(request.url).searchParams.get("version");
      if (raw === null) return Response.json({ rule });
      // Solo dígitos: "1e3" o "2abc" no se convierten en otra versión.
      if (!/^[1-9]\d{0,8}$/.test(raw)) throw new HttpError(404, `No existe la versión «${raw}».`);
      return Response.json({ rule, version: await getRuleVersion(slug, Number(raw)) });
    },
    { role: "dueno" },
  );
}

/** Guarda el texto como versión nueva (también sirve para recuperar una versión antigua). Solo el dueño. */
export async function POST(request: Request, { params }: Context) {
  return handle(
    async (user) => {
      const { slug } = await params;
      const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      const saved = await saveRuleVersion(user!, slug, text(input?.body), text(input?.note));
      return Response.json({ rule: saved });
    },
    { role: "dueno" },
  );
}
