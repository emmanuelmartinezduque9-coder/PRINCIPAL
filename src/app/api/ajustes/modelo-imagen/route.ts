import { handle } from "@/server/http";
import { getImageModel, IMAGE_MODEL_NAMES, IMAGE_MODELS, setImageModel } from "@/server/videos/frame";

/** El modelo de la imagen inicial y los que se pueden elegir. */
export async function GET() {
  return handle(async () =>
    Response.json(
      { model: await getImageModel(), models: IMAGE_MODELS.map((id) => ({ id, name: IMAGE_MODEL_NAMES[id] })) },
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
}

/** Cambia el modelo de la imagen inicial (`model`). Solo el dueño. */
export async function PUT(request: Request) {
  return handle(async (owner) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const model = typeof body?.model === "string" ? body.model : "";
    await setImageModel(owner!, model);
    return Response.json({ model: await getImageModel() });
  });
}
