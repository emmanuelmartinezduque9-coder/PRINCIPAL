/** Convierte los tipos del servidor a lo que llega por JSON: las fechas viajan como texto. */
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  // Sesión caducada o sin iniciar: a la página de entrada, y de vuelta aquí después.
  if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const back = window.location.pathname + window.location.search;
    window.location.assign(`/login?volver=${encodeURIComponent(back)}`);
  }
  if (!response.ok) {
    throw new ApiError(body?.error ?? "No se pudo completar la operación", response.status);
  }
  return body as T;
}
