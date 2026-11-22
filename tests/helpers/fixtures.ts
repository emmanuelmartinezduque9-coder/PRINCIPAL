import { acceptInvite, createInvite, type AuthUser, type Role } from "@/server/auth";

export const TEST_PASSWORD = "una-clave-larga-de-prueba";

let counter = 0;

/** Crea una cuenta activa con el papel indicado, por el mismo camino que la real (invitación). */
export async function makeUser(role: Role, over: { email?: string; name?: string } = {}): Promise<AuthUser> {
  counter += 1;
  const email = over.email ?? `${role}${counter}@example.com`;
  const { token } = await createInvite(email, over.name ?? `Persona ${counter}`, { role });
  return acceptInvite(token, TEST_PASSWORD);
}
