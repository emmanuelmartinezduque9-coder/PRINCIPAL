import { MAX_SCREENSHOT_BYTES } from "@/lib/mejoras";
import { handle, HttpError } from "@/server/http";
import { createReport, mejorasView } from "@/server/videos/mejoras/reports";

/** La página «Mejoras»: el dueño ve todos los reportes y correcciones; cada persona, los suyos. */
export async function GET() {
  return handle(async (user) => Response.json(await mejorasView(user!)));
}

/** «Reportar un problema» (formulario con `stage`, `body`, ids opcionales y una captura opcional). Cualquiera con sesión. */
export async function POST(request: Request) {
  return handle(async (user) => {
    const form = await request.formData().catch(() => null);
    if (!form) throw new HttpError(400, "Formulario no válido.");
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : null;
    };
    const file = form.get("captura");
    let screenshot: { mime: string; data: Buffer } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_SCREENSHOT_BYTES) throw new HttpError(400, "La captura pesa demasiado (máx. 4 MB).");
      screenshot = { mime: file.type, data: Buffer.from(await file.arrayBuffer()) };
    }
    const created = await createReport(user!, {
      stage: text("stage") as never,
      body: text("body") ?? "",
      page: text("page"),
      videoId: text("videoId") as never,
      generationId: text("generationId") as never,
      resultId: text("resultId") as never,
      editId: text("editId") as never,
      batchId: text("batchId") as never,
      screenshot,
    });
    return Response.json(created, { status: 201 });
  });
}
