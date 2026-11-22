import { handle } from "@/server/http";
import { updateAvatar } from "@/server/avatars";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * Cambia un avatar (solo el dueño): `{ name?, group?, number?, ageYears?, tags?, description?,
 * retired? }` → `{ avatar }`. Lo que no se envía se queda igual.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ avatarId: string }> }) {
  return handle(
    async (user) => {
      const { avatarId } = await params;
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
      const { name, group, number, ageYears, tags, description, retired } = input;
      return Response.json({ avatar: await updateAvatar(user!, parseId(avatarId), { name, group, number, ageYears, tags, description, retired }) });
    },
    { role: "dueno" },
  );
}
