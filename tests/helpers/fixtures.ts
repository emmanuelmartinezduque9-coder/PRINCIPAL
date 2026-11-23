import { afterAll, beforeAll } from "vitest";
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

/**
 * Para las pruebas escritas para el flujo de Seedance (antes de poder elegir el modelo del clip,
 * 23/11/2026): mientras dura el archivo, los vídeos nuevos nacen con Seedance en vez de «Automático»
 * (Genjutsu Motion Transfer), como los vídeos de antes. Al terminar vuelve el valor de verdad.
 */
export function seedanceByDefault(): void {
  beforeAll(async () => {
    const { getPool } = await import("@/db/client");
    await getPool().query("alter table videos alter column clip_model set default 'seedance_2_5'");
  });
  afterAll(async () => {
    const { getPool } = await import("@/db/client");
    await getPool().query("alter table videos alter column clip_model set default 'hf_mult_motion_control'");
  });
}
