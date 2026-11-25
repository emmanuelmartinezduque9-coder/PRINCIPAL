import { handle } from "@/server/http";
import { learningView } from "@/server/videos/aprendizaje/medicion";

/** La evidencia se filtra por los vídeos visibles para la sesión. */
export async function GET() {
  return handle(async (user) => Response.json(await learningView(user!)));
}
