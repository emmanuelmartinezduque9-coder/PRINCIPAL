import { handle } from "@/server/http";
import { generationDetails } from "@/server/videos/details";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** «Detalles técnicos»: las generaciones del vídeo con sus respuestas en crudo de Higgsfield, sin claves. Solo el dueño. */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(
    async (user) => {
      const { videoId } = await params;
      return Response.json({ generations: await generationDetails(user!, parseId(videoId)) }, { headers: { "Cache-Control": "no-store" } });
    },
    { role: "dueno" },
  );
}
