import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Antes de borrar una canción: los vídeos que la llevaban vuelven a «Audio original». Así la regla
 * «con canción, siempre `cancion`» (`videos_audio_mode_song`) se cumple también después del borrado
 * (la clave ajena `on delete set null` solo vaciaría `song_id`). Se llama dentro de la transacción
 * del borrado, con la canción ya bloqueada.
 */
export async function releaseSongFromVideos(tx: Tx, songId: number): Promise<number> {
  const released = await tx
    .update(schema.videos)
    .set({ songId: null, audioMode: "original" })
    .where(eq(schema.videos.songId, songId))
    .returning({ id: schema.videos.id });
  return released.length;
}
