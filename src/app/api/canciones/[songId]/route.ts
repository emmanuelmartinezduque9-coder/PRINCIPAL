import { handle } from "@/server/http";
import { deleteSong, updateSong } from "@/server/songs";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Cambia `title`, `number`, `sections`, `dropMs` (ms o `null`) o `startMs` (ms). Solo el dueño. */
export async function PATCH(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  return handle(
    async (user) => {
      const { songId } = await params;
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const { title, number, sections, dropMs, startMs } = body && typeof body === "object" && !Array.isArray(body) ? body : {};
      return Response.json({ song: await updateSong(user!, parseId(songId), { title, number, sections, dropMs, startMs }) });
    },
    { role: "dueno" },
  );
}

/** Borra la canción; los vídeos que la llevaban vuelven a «Audio original». Solo el dueño. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ songId: string }> }) {
  return handle(
    async (user) => {
      const { songId } = await params;
      return Response.json(await deleteSong(user!, parseId(songId)));
    },
    { role: "dueno" },
  );
}
