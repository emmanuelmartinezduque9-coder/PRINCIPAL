import { handle } from "@/server/http";
import { importVariants } from "@/server/variants";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Importa variantes por la huella de sus fotos ya subidas (solo el dueño):
 * `{ variants: [{ name, articleSha256: [hex…], packagingSha256?: hex | null }] }` →
 * `{ created: [{ id, name }], skipped: [{ name, reason }] }`. Se puede repetir: las que ya
 * están se saltan («ya existe»).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(
    async (user) => {
      const { id } = await params;
      const body = await request.json().catch(() => null);
      return Response.json(await importVariants(user!, parseId(id), body));
    },
    { role: "dueno" },
  );
}
