import "@/jobs/product-jobs"; // define `producto.alta`
import { enqueueJob } from "@/jobs/boss";
import { handle } from "@/server/http";
import { createProductFromLink, INTAKE_JOB } from "@/server/product-intake";

/**
 * «Nuevo producto» pegando solo un enlace y eligiendo el país: crea el producto con un nombre
 * provisional y empieza el alta automática (vídeo, ficha, marca y mockup sobre gris).
 */
export async function POST(request: Request) {
  return handle(async (user) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    // Con `esperarFotos`, la pantalla sube antes las fotos y después llama a `/alta/empezar`.
    const waitForPhotos = body?.esperarFotos === true;
    const { product, intake } = await createProductFromLink(user!, { url: body?.url, country: body?.country, waitForPhotos });
    if (!waitForPhotos) await enqueueJob(INTAKE_JOB, { userId: user!.id, productId: product.id }, { intakeId: intake.id });
    return Response.json({ product }, { status: 201 });
  });
}
