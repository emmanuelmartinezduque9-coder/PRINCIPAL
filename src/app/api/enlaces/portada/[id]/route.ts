import { handle } from "@/server/http";
import { readLinkThumb } from "@/server/link-thumbs";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** La portada (JPEG) de un enlace ya hecha. No cambia: se guarda en caché un día. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const data = await readLinkThumb(parseId(id));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  });
}
