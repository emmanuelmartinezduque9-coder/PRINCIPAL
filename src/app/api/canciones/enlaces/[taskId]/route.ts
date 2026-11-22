import { handle } from "@/server/http";
import { dismissSongLink } from "@/server/song-downloads";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Quita de la lista un enlace de canción que ya terminó (fallido o hecho). Solo el dueño. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async (user) => {
      await dismissSongLink(user!, parseId((await params).taskId));
      return new Response(null, { status: 204 });
    },
    { role: "dueno" },
  );
}
