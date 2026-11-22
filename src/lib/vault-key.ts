export const VAULT_KEY_BYTES = 32;

/** Base64 estricto de 32 bytes: rechaza caracteres ajenos y relleno incorrecto. */
export function parseVaultKey(text: string, error = "Clave de 32 bytes en base64 no válida"): Buffer {
  const key = Buffer.from(text, "base64");
  if (key.length !== VAULT_KEY_BYTES || key.toString("base64") !== text) throw new Error(error);
  return key;
}
