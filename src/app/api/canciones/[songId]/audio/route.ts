import { handle } from "@/server/http";
import { songAudioResponse } from "@/server/songs";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** El audio de la canción, con `Range` (206) para que el reproductor pueda saltar. Para cualquier persona con sesión. */
export async function GET(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  return handle(async (user) => {
    const { songId } = await params;
    return songAudioResponse(user!, parseId(songId), request.headers.get("range"));
  });
}
