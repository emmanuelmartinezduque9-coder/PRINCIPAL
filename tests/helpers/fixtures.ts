import { acceptInvite, createInvite, type AuthUser, type Role } from "@/server/auth";
import { createProduct, type Product } from "@/server/products";

export const TEST_PASSWORD = "una-clave-larga-de-prueba";

let counter = 0;

/** Crea una cuenta activa con el papel indicado, por el mismo camino que la real (invitación). */
export async function makeUser(role: Role, over: { email?: string; name?: string } = {}): Promise<AuthUser> {
  counter += 1;
  const email = over.email ?? `${role}${counter}@example.com`;
  const { token } = await createInvite(email, over.name ?? `Persona ${counter}`, { role });
  return acceptInvite(token, TEST_PASSWORD);
}

let productCounter = 0;

/** Crea un producto por el camino real (si lo crea un colaborador, queda asignado a él). */
export async function makeProduct(
  creator: AuthUser,
  over: { name?: string; summary?: string; language?: string; countries?: string[] } = {},
): Promise<Product> {
  productCounter += 1;
  return createProduct(creator, {
    name: over.name ?? `Producto ${productCounter}`,
    summary: over.summary ?? "Hace algo útil",
    language: over.language,
    countries: over.countries,
  });
}
