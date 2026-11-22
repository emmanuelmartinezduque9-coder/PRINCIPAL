/**
 * Lo que la aplicación puede pedirle al Higgsfield de una persona. Sin importar el SDK de MCP:
 * las pruebas y el modo local usan un simulado (`fake.ts`) con esta misma interfaz.
 */

export const HIGGSFIELD_KIND = "higgsfield";

export interface HfBalance {
  /** Créditos enteros de Higgsfield (no se convierten a dólares). */
  credits: number;
  plan: string | null;
}

export interface HiggsfieldPort {
  balance(userId: number): Promise<HfBalance>;
  /** Respuestas en crudo de las herramientas gratuitas, para el informe. Sin secretos. */
  diagnostics(userId: number): Promise<Record<string, unknown>>;
}

/** La persona no tiene su Higgsfield conectado. */
export class HiggsfieldNotConnectedError extends Error {
  constructor() {
    super("Conecta tu Higgsfield en Ajustes.");
    this.name = "HiggsfieldNotConnectedError";
  }
}

/** El permiso caducó o Higgsfield lo rechazó: hay que volver a conectar (no se reintenta solo). */
export class HiggsfieldAuthError extends Error {
  constructor() {
    super("Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.");
    this.name = "HiggsfieldAuthError";
  }
}

/** Higgsfield no respondió o respondió algo que no se entiende. */
export class HiggsfieldUnavailableError extends Error {
  constructor() {
    super("Higgsfield no responde. Inténtalo dentro de unos minutos.");
    this.name = "HiggsfieldUnavailableError";
  }
}

export const isHiggsfieldError = (error: unknown): error is Error =>
  error instanceof HiggsfieldNotConnectedError ||
  error instanceof HiggsfieldAuthError ||
  error instanceof HiggsfieldUnavailableError;
