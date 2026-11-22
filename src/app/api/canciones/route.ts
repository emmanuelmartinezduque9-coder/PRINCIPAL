import { badRequest, handle, HttpError } from "@/server/http";
import { listSongs, MAX_SONG_BYTES, uploadSong, type SongMetaInput } from "@/server/songs";

/** Todas las canciones (sin el audio), para cualquier persona con sesión. */
export async function GET() {
  return handle(async () => Response.json({ songs: await listSongs() }));
}

/** Un número entero de un campo del formulario; vacío o ausente: `undefined`; `"null"`: `null`. */
function intField(form: FormData, name: string): number | null | undefined | "bad" {
  const value = form.get(name);
  if (value === null || value === "") return undefined;
  if (value === "null") return null;
  return typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : "bad";
}

/**
 * Sube una canción (solo el dueño), multipart: `archivo` y, opcionales, `titulo`, `numero`,
 * `secciones` (una entrada por sección), `drop` e `inicio` (en ms). Si ya está (mismo sha256) solo
 * se cambian sus datos: 200 `{ song, created: false }`; nueva: 201 `{ song, created: true }`.
 */
export async function POST(request: Request) {
  return handle(
    async (user) => {
      // Se corta antes de leer el cuerpo si ya es evidente que no cabe (margen para el multipart).
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > MAX_SONG_BYTES + 256 * 1024) throw new HttpError(413, "La canción pesa demasiado (máximo 25 MB).");
      const form = await request.formData().catch(() => null);
      const file = form?.get("archivo");
      if (!form || !(file instanceof File)) return badRequest("Elige una canción para subir.");
      const meta: SongMetaInput = {};
      const title = form.get("titulo");
      if (typeof title === "string") meta.title = title;
      if (form.has("secciones")) meta.sections = form.getAll("secciones");
      for (const [field, key] of [["numero", "number"], ["drop", "dropMs"], ["inicio", "startMs"]] as const) {
        const value = intField(form, field);
        if (value === "bad") return badRequest("Valor no válido.");
        if (value !== undefined) meta[key] = value;
      }
      const { song, created } = await uploadSong(user!, Buffer.from(await file.arrayBuffer()), meta);
      return Response.json({ song, created }, { status: created ? 201 : 200 });
    },
    { role: "dueno" },
  );
}
