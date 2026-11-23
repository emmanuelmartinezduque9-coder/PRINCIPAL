import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { LocalStore } from "@/lib/object-store";
import { ensureLinkMedia } from "@/server/link-media";
import { linkThumbState, linkThumbSweep, makeLinkThumb, previewImageUrl, readLinkThumb } from "@/server/link-thumbs";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * Portadas de los enlaces de referencia: en cuanto se pega el enlace, su miniatura (de la nube, o
 * del primer fotograma del vídeo traído); mientras no hay, «pendiente», y nunca un error.
 */

const TIKTOK = "https://www.tiktok.com/@cuenta/video/7300000000000000001";
const INSTAGRAM = "https://www.instagram.com/reel/ABCdef123/";

let dir: string;
let jpeg: Buffer;
let mp4: Buffer;
let store: LocalStore;

function ffmpeg(args: string[]): void {
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-portadas-"));
  ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=720x1280", "-frames:v", "1", path.join(dir, "portada.jpg")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "video.mp4")]);
  jpeg = fs.readFileSync(path.join(dir, "portada.jpg"));
  mp4 = fs.readFileSync(path.join(dir, "video.mp4"));
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  store = new LocalStore(path.join(dir, `objetos-${Date.now()}`), Buffer.alloc(32, 7));
});

/** Un `fetch` falso: oEmbed de TikTok, la página de Instagram con su `og:image` y la imagen. */
function fakeFetch(options: { instagramImage?: boolean } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://www.tiktok.com/oembed")) return Response.json({ thumbnail_url: "https://cdn.test/tiktok.jpg" });
    if (url.startsWith("https://www.instagram.com/")) {
      const meta = options.instagramImage ? '<meta property="og:image" content="https://cdn.test/insta.jpg?a=1&amp;b=2" />' : "";
      return new Response(`<html><head>${meta}</head></html>`, { status: 200 });
    }
    if (url.startsWith("https://cdn.test/")) return new Response(new Uint8Array(jpeg), { status: 200 });
    return new Response("no", { status: 404 });
  }) as typeof fetch;
}

const thumbRow = async (url: string) =>
  (await getPool().query("select thumb_status as status, thumb_key as key, thumb_error as error from link_media where url = $1", [url])).rows[0];

describe("portadas de los enlaces", () => {
  it("la portada que da el sitio: oEmbed de TikTok y og:image de Instagram", async () => {
    expect(await previewImageUrl(TIKTOK, fakeFetch())).toBe("https://cdn.test/tiktok.jpg");
    expect(await previewImageUrl(INSTAGRAM, fakeFetch({ instagramImage: true }))).toBe("https://cdn.test/insta.jpg?a=1&b=2");
    expect(await previewImageUrl(INSTAGRAM, fakeFetch())).toBeNull();
  });

  it("al pegarlo queda pendiente; hecha, es un JPEG pequeño guardado también en el almacén", async () => {
    const user = await makeUser("dueno");
    const state = await linkThumbState(TIKTOK, user.id);
    expect(state).toMatchObject({ status: "pending" });
    // Pedirla otra vez no encola otra.
    expect(await linkThumbState(TIKTOK, user.id)).toEqual(state);

    await makeLinkThumb(state!.id, { fetch: fakeFetch(), store });
    expect(await thumbRow(TIKTOK)).toMatchObject({ status: "ready", key: `portadas/${state!.id}.jpg`, error: null });
    const thumb = await readLinkThumb(state!.id);
    expect(thumb.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(thumb.length).toBeLessThan(jpeg.length);
    expect(await store.head(`portadas/${state!.id}.jpg`)).toBe(thumb.length);
    expect(await linkThumbState(TIKTOK, user.id)).toEqual({ status: "ready", id: state!.id });
  });

  it("sin portada del sitio: el primer fotograma del vídeo del enlace traído por la nube", async () => {
    const row = (await ensureLinkMedia(INSTAGRAM))!;
    await getPool().query("update link_media set thumb_status = 'pending' where id = $1", [row.id]);
    const runYtDlp = async (args: string[]) => {
      fs.writeFileSync(args[args.indexOf("-o") + 1], mp4);
      return { ok: true, error: null };
    };
    await makeLinkThumb(row.id, { fetch: fakeFetch(), store, runYtDlp });
    expect(await thumbRow(INSTAGRAM)).toMatchObject({ status: "ready" });
    // El vídeo queda en el almacén para la referencia.
    expect((await getPool().query("select status from link_media where id = $1", [row.id])).rows[0].status).toBe("ready");
  });

  it("si ni la nube ni el Mac pueden, queda sin portada (el icono), sin errores", async () => {
    const row = (await ensureLinkMedia(INSTAGRAM))!;
    await getPool().query("update link_media set thumb_status = 'pending' where id = $1", [row.id]);
    await makeLinkThumb(row.id, { fetch: fakeFetch(), store, runYtDlp: async () => ({ ok: false, error: "bloqueado" }) });
    expect(await thumbRow(INSTAGRAM)).toMatchObject({ status: "failed" });
    await expect(readLinkThumb(row.id)).rejects.toMatchObject({ status: 404 });
    // El seguimiento no la vuelve a tocar.
    await linkThumbSweep(new Date(), { fetch: fakeFetch(), store });
    expect(await thumbRow(INSTAGRAM)).toMatchObject({ status: "failed" });
  });

  it("un enlace de un sitio no admitido no tiene portada", async () => {
    const user = await makeUser("dueno");
    expect(await linkThumbState("https://example.com/video", user.id)).toBeNull();
  });
});
