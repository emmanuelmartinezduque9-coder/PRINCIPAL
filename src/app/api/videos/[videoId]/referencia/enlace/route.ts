import { requestLinkDownload } from "@/server/agent";
import { handle } from "@/server/http";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Pegar un enlace como referencia: `{ url }` → `{ taskId }`. Lo descarga el Mac de quien lo pide; sin Mac conectado, 409. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url : "";
    return Response.json(await requestLinkDownload(user!, parseId(videoId), url), { status: 201 });
  });
}
