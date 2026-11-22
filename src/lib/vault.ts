import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isCloud } from "./cloud-env";
import { dataDir } from "./paths";

/**
 * Bóveda de credenciales con cifrado en sobre.
 *
 * Cada secreto lleva su propia clave de datos aleatoria (32 bytes) que cifra el cuerpo con
 * AES-256-GCM. La clave maestra (`VAULT_KEY`, o un archivo local fuera del proyecto) solo
 * envuelve esa clave de datos. El `context` (p. ej. `7:higgsfield`) es dato autenticado tanto
 * del cuerpo como de la clave envuelta: un texto cifrado movido a otra persona o a otro tipo
 * de credencial no se descifra.
 *
 * Formato: `v1.<claveDeDatosEnvuelta>.<iv>.<etiqueta>.<cuerpo>`, todo en base64.
 * La clave envuelta es `iv(12) + etiqueta(16) + clave cifrada(32)`.
 */

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

const KEY_ERROR = "VAULT_KEY debe ser una clave de 32 bytes en base64";

/** Base64 estricto de 32 bytes: rechaza caracteres ajenos y relleno incorrecto. */
function parseKey(text: string, error: string): Buffer {
  const key = Buffer.from(text, "base64");
  if (key.length !== KEY_BYTES || key.toString("base64") !== text) throw new Error(error);
  return key;
}

function loadKey(): Buffer {
  const fromEnv = process.env.VAULT_KEY;
  // Definida (aunque vacía) o inválida: error, nunca se recurre al archivo.
  if (fromEnv !== undefined) return parseKey(fromEnv.trim(), KEY_ERROR);
  if (isCloud()) {
    throw new Error("Falta VAULT_KEY: en la nube la clave de la bóveda debe venir de la variable de entorno (32 bytes en base64)");
  }
  // Solo en local: archivo fuera del proyecto, creado de forma atómica.
  const file = path.join(dataDir(), "vault.key");
  const readFile = () => parseKey(fs.readFileSync(file, "utf8").trim(), `La clave de ${file} no es válida`);
  if (fs.existsSync(file)) return readFile();
  fs.mkdirSync(dataDir(), { recursive: true });
  const key = crypto.randomBytes(KEY_BYTES);
  try {
    fs.writeFileSync(file, key.toString("base64"), { flag: "wx", mode: 0o600 });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return readFile();
    throw error;
  }
}

function seal(key: Buffer, plain: Buffer, aad: Buffer): { iv: Buffer; tag: Buffer; body: Buffer } {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), body };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, body: Buffer, aad: Buffer): Buffer {
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Formato de secreto no reconocido");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function encryptSecret(plain: object, context: string): string {
  const aad = Buffer.from(context, "utf8");
  const dataKey = crypto.randomBytes(KEY_BYTES);
  try {
    const wrapped = seal(loadKey(), dataKey, aad);
    const sealed = seal(dataKey, Buffer.from(JSON.stringify(plain), "utf8"), aad);
    const wrappedKey = Buffer.concat([wrapped.iv, wrapped.tag, wrapped.body]);
    return [
      VERSION,
      wrappedKey.toString("base64"),
      sealed.iv.toString("base64"),
      sealed.tag.toString("base64"),
      sealed.body.toString("base64"),
    ].join(".");
  } finally {
    dataKey.fill(0);
  }
}

export function decryptSecret<T = unknown>(encrypted: string, context: string): T {
  const parts = encrypted.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION || parts.slice(1).some((p) => !p)) {
    throw new Error("Formato de secreto no reconocido");
  }
  const [, wrappedB64, ivB64, tagB64, bodyB64] = parts;
  const aad = Buffer.from(context, "utf8");
  const wrappedKey = Buffer.from(wrappedB64, "base64");
  if (wrappedKey.length !== IV_BYTES + TAG_BYTES + KEY_BYTES) throw new Error("Formato de secreto no reconocido");
  const dataKey = open(
    loadKey(),
    wrappedKey.subarray(0, IV_BYTES),
    wrappedKey.subarray(IV_BYTES, IV_BYTES + TAG_BYTES),
    wrappedKey.subarray(IV_BYTES + TAG_BYTES),
    aad,
  );
  try {
    const plain = open(dataKey, Buffer.from(ivB64, "base64"), Buffer.from(tagB64, "base64"), Buffer.from(bodyB64, "base64"), aad);
    return JSON.parse(plain.toString("utf8")) as T;
  } finally {
    dataKey.fill(0);
  }
}
