import { handle } from "@/server/http";
import { readAvatarImage } from "@/server/avatars";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** La imagen de un avatar, para cualquier persona con sesión. */
export async function GET(_request: Request, { params }: { params: Promise<{ avatarId: string }> }) {
  return handle(async () => {
    const { avatarId } = await params;
    const { mime, data, sha256 } = await readAvatarImage(parseId(avatarId));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        // Privada: nunca en cachés compartidas. La imagen de un avatar no cambia (va con su sha256).
        "Cache-Control": "private, max-age=86400",
        ETag: `"${sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
