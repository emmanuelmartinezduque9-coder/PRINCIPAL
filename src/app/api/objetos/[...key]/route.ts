import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { getObjectStore, LocalStore } from "@/lib/object-store";

/**
 * Archivos del almacén local (solo en el propio ordenador, sin bucket). El enlace lo firma la web
 * (`LocalStore.signedUrl`) y caduca: sin firma válida, 404. Admite `Range` para que el vídeo se
 * pueda adelantar. En la nube los archivos se sirven directamente desde el bucket.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const store = getObjectStore();
  const notFound = () => new Response("No encontrado.", { status: 404 });
  if (!(store instanceof LocalStore)) return notFound();
  const key = (await params).key.join("/");
  const query = new URL(request.url).searchParams;
  const name = query.get("n");
  let file: string;
  try {
    if (!store.verify(key, query.get("e"), query.get("s"), name)) return notFound();
    file = store.pathOf(key);
  } catch {
    return notFound();
  }
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return notFound();
  const headers = new Headers({
    "Content-Type": await store.contentType(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (name) headers.set("Content-Disposition", `attachment; filename="${name.replace(/[^\w.\-]+/g, "_")}"`);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(stat.size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}
