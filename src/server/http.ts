import { authRequired, getSessionUser, LOCAL_USER, SESSION_COOKIE, type AuthUser } from "@/server/auth";

/** Error con código HTTP y mensaje apto para mostrar a la persona. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Opcional: un código estable para que la pantalla decida sin leer el mensaje (p. ej. `higgsfield_connect`). */
    public code?: string,
  ) {
    super(message);
  }
}

export interface HandleOptions {
  /** Ruta que no pide sesión (entrar, activar la cuenta, comprobación de salud). */
  public?: boolean;
  /** Solo el dueño puede usar la ruta; un colaborador recibe 403. */
  role?: "dueno";
  /** De dónde sale el identificador de sesión. Por defecto, de la cookie de la petición. */
  token?: () => Promise<string | undefined>;
}

async function cookieToken(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Persona que hace la petición, o null si hace falta sesión y no la hay. */
export async function currentUser(options: HandleOptions = {}): Promise<AuthUser | null> {
  if (!authRequired()) return LOCAL_USER;
  const token = await (options.token ?? cookieToken)();
  return token ? getSessionUser(token) : null;
}

/**
 * Envuelve una ruta de la API: exige sesión (salvo rutas públicas o cuando la aplicación
 * corre sin inicio de sesión en el propio ordenador) y convierte cualquier fallo en un
 * JSON con un mensaje legible.
 */
export async function handle(
  fn: (user: AuthUser | null) => Promise<Response>,
  options: HandleOptions = {},
): Promise<Response> {
  try {
    let user: AuthUser | null = null;
    if (!options.public) {
      user = await currentUser(options);
      if (!user) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }
    if (options.role === "dueno" && user?.role !== "dueno") {
      return Response.json({ error: "Solo el dueño puede hacer esto." }, { status: 403 });
    }
    return await fn(user);
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json(error.code ? { error: error.message, code: error.code } : { error: error.message }, { status: error.status });
    }
    console.error("[api]", error);
    // El detalle se queda en el registro del servidor: nunca se enseña a quien llama.
    return Response.json({ error: "Ha ocurrido un error inesperado." }, { status: 500 });
  }
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message: string): Response {
  return Response.json({ error: message }, { status: 404 });
}
