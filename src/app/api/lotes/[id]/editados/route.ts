import { handle } from "@/server/http";
import { batchEditFiles, batchEditsZip } from "@/server/videos/batches";

const parseId = (value: string | null) => (value && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Los vídeos terminados (montados) de un lote, para descargarlos y pasarlos al iPhone.
 *
 * - `?formato=zip` (y opcional `&producto=<id>`): un ZIP sin comprimir, en flujo, con una carpeta
 *   por cuenta (o solo los de esa cuenta). Nombres «EisWerk - 03 - 2026-11-23.mp4».
 * - Sin formato: la lista `{ files: [{ videoId, number, productId, account, fileName, url }] }`, donde
 *   `url` descarga cada uno suelto con ese nombre (para «uno a uno»).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user) => {
    const batchId = parseId((await params).id);
    const query = new URL(request.url).searchParams;
    const productId = query.has("producto") ? parseId(query.get("producto")) : null;
    if (query.get("formato") === "zip") {
      const { stream, fileName } = await batchEditsZip(user!, batchId, productId);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const files = await batchEditFiles(user!, batchId, productId);
    return Response.json(
      {
        files: files.map((file) => ({
          videoId: file.videoId,
          number: file.number,
          productId: file.productId,
          account: file.account,
          fileName: file.fileName,
          size: file.size,
          url: `/api/videos/${file.videoId}/montaje/video?v=${file.version}&descargar=1`,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
