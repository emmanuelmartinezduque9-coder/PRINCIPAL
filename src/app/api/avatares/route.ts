import { badRequest, handle, HttpError } from "@/server/http";
import { listAvatars, MAX_AVATAR_BYTES, uploadAvatar, type AvatarMetaInput } from "@/server/avatars";

/** Todos los avatares de la biblioteca (sin la imagen), también los retirados, para cualquier persona con sesión. */
export async function GET() {
  return handle(async () => Response.json({ avatars: await listAvatars() }));
}

/** Un entero de un campo del formulario; vacío o ausente: `undefined`. */
function intField(form: FormData, name: string): number | undefined | "bad" {
  const value = form.get(name);
  if (value === null || value === "") return undefined;
  return typeof value === "string" && /^\d{1,5}$/.test(value) ? Number(value) : "bad";
}

/**
 * Sube un avatar (solo el dueño), multipart: `archivo` (JPG, PNG o WebP, ≤ 8 MB), `nombre`
 * («mujer 7»), `grupo` (`mujer` | `hombre` | `nina` | `nino` | `otro`) y, opcionales, `numero`,
 * `edad` (años), `rasgos` (uno por entrada), `descripcion` y `higgsfield` (su media id). Si esa
 * misma imagen ya está (mismo sha256), no cambia nada: 200 `{ avatar, created: false }`; nueva:
 * 201 `{ avatar, created: true }`. Otro avatar con ese nombre: 409.
 */
export async function POST(request: Request) {
  return handle(
    async (user) => {
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > MAX_AVATAR_BYTES + 64 * 1024) throw new HttpError(413, "La imagen pesa demasiado (máximo 8 MB).");
      const form = await request.formData().catch(() => null);
      const file = form?.get("archivo");
      if (!form || !(file instanceof File)) return badRequest("Elige una imagen para subir.");
      const text = (name: string) => {
        const value = form.get(name);
        return typeof value === "string" ? value : undefined;
      };
      const meta: AvatarMetaInput = { name: text("nombre"), group: text("grupo") };
      const description = text("descripcion");
      if (description !== undefined) meta.description = description;
      const higgsfield = text("higgsfield");
      if (higgsfield) meta.higgsfieldMediaId = higgsfield;
      if (form.has("rasgos")) meta.tags = form.getAll("rasgos").filter((tag) => tag !== "");
      for (const [field, key] of [["numero", "number"], ["edad", "ageYears"]] as const) {
        const value = intField(form, field);
        if (value === "bad") return badRequest("Valor no válido.");
        if (value !== undefined) meta[key] = value;
      }
      const { avatar, created } = await uploadAvatar(user!, Buffer.from(await file.arrayBuffer()), meta);
      return Response.json({ avatar, created }, { status: created ? 201 : 200 });
    },
    { role: "dueno" },
  );
}
