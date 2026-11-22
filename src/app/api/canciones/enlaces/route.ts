import { requestSongDownload } from "@/server/agent";
import { handle } from "@/server/http";
import { listSongLinks } from "@/server/song-downloads";

/** Los enlaces de canción del dueño: en cola, descargándose, y los terminados en las últimas 24 h. */
export async function GET() {
  return handle(async (user) => Response.json({ links: await listSongLinks(user!) }), { role: "dueno" });
}

/**
 * «Pegar enlace»: `{ url }` (YouTube, TikTok, Instagram, Facebook o SoundCloud). El Mac del dueño
 * descarga el audio como MP3 y la canción entra en la biblioteca, sin drop. 201 `{ taskId }`; si
 * ese enlace ya se está descargando, 200 con la tarea que hay. 409 si el Mac no está conectado.
 */
export async function POST(request: Request) {
  return handle(
    async (user) => {
      const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
      const { taskId, created } = await requestSongDownload(user!, body?.url);
      return Response.json({ taskId }, { status: created ? 201 : 200 });
    },
    { role: "dueno" },
  );
}
