import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AwsClient } from "aws4fetch";
import { dataDir } from "@/lib/paths";

/**
 * Almacén de objetos: donde quedan los vídeos, imágenes, miniaturas y montajes (no en la base de
 * datos ni en enlaces de Higgsfield que caducan).
 *
 * - **En la nube**: un bucket compatible con S3 (Railway Buckets). Variables `BUCKET_ENDPOINT`,
 *   `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` y, opcional,
 *   `BUCKET_REGION` (por defecto `auto`) y `BUCKET_PATH_STYLE=1`. El bucket es privado: el
 *   navegador lee cada archivo con un enlace firmado que caduca.
 * - **En el propio ordenador** (sin esas variables y fuera de la nube): una carpeta
 *   (`<datos>/objetos`) y enlaces firmados por la propia web (`/api/objetos/...`).
 * - **En la nube sin bucket**: no hay almacén (`getObjectStore()` → `null`) y todo sigue como
 *   antes (enlaces de Higgsfield).
 *
 * Las claves son siempre texto propio (`medios/<trabajo>/original.mp4`), nunca de fuera.
 */

export interface PutOptions {
  contentType: string;
  /** `Cache-Control` que se guarda con el objeto (todo lo que se guarda aquí no cambia nunca). */
  cacheControl?: string;
}

export interface SignOptions {
  /** Segundos que vale el enlace. */
  expiresIn?: number;
  /** Nombre con el que se descarga (`Content-Disposition: attachment`). */
  downloadName?: string;
}

export interface ObjectStore {
  readonly kind: "s3" | "local";
  /** Sube un archivo del disco. Volver a subir la misma clave la sustituye (idempotente). */
  putFile(key: string, filePath: string, options: PutOptions): Promise<void>;
  putBuffer(key: string, data: Buffer, options: PutOptions): Promise<void>;
  /** Tamaño si existe; `null` si no. */
  head(key: string): Promise<number | null>;
  /** Descarga el objeto a un archivo del disco. */
  download(key: string, filePath: string): Promise<void>;
  /** Enlace temporal de lectura para el navegador (o el montador). */
  signedUrl(key: string, options?: SignOptions): Promise<string>;
  delete(key: string): Promise<void>;
}

/** 6 horas: una pantalla abierta toda la mañana sigue viendo sus vídeos. */
export const DEFAULT_SIGN_SECONDS = 6 * 60 * 60;
const KEY = /^[a-z0-9][a-z0-9._\-/]{0,400}$/i;

export function assertKey(key: string): void {
  if (!KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`Clave de objeto no válida: «${key}».`);
}

/** Nombre de descarga seguro para la cabecera (sin comillas ni saltos). */
function dispositionOf(name: string): string {
  const ascii = name.replace(/[^\w.\-]+/g, "_").slice(0, 150) || "archivo";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name.slice(0, 150))}`;
}

// ───────────────────────── S3 ─────────────────────────

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  pathStyle: boolean;
}

export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config | null {
  const endpoint = env.BUCKET_ENDPOINT?.trim();
  const bucket = env.BUCKET_NAME?.trim();
  const accessKeyId = env.BUCKET_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.BUCKET_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    region: env.BUCKET_REGION?.trim() || "auto",
    pathStyle: env.BUCKET_PATH_STYLE === "1",
  };
}

/** Cuántas variables del bucket hay puestas (para avisar si faltan algunas). */
export function bucketEnvState(env: Record<string, string | undefined> = process.env): "none" | "partial" | "complete" {
  const names = ["BUCKET_ENDPOINT", "BUCKET_NAME", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY"];
  const set = names.filter((name) => env[name]?.trim()).length;
  return set === 0 ? "none" : set === names.length ? "complete" : "partial";
}

const S3_TIMEOUT_MS = 10 * 60 * 1000;

export class S3Store implements ObjectStore {
  readonly kind = "s3" as const;
  private readonly client: AwsClient;

  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
    });
  }

  private urlOf(key: string): string {
    assertKey(key);
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    if (this.config.pathStyle) return `${this.config.endpoint}/${this.config.bucket}/${encoded}`;
    const base = new URL(this.config.endpoint);
    return `${base.protocol}//${this.config.bucket}.${base.host}/${encoded}`;
  }

  private async send(url: string, init: RequestInit & { duplex?: "half" }): Promise<Response> {
    const signed = await this.client.sign(url, init);
    return this.fetchImpl(signed, { signal: AbortSignal.timeout(S3_TIMEOUT_MS), ...(init.duplex ? { duplex: init.duplex } : {}) } as RequestInit);
  }

  async putFile(key: string, filePath: string, options: PutOptions): Promise<void> {
    const { size } = await fs.stat(filePath);
    const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    await this.put(key, body, size, options);
  }

  async putBuffer(key: string, data: Buffer, options: PutOptions): Promise<void> {
    await this.put(key, new Uint8Array(data), data.length, options);
  }

  private async put(key: string, body: BodyInit, size: number, options: PutOptions): Promise<void> {
    const response = await this.send(this.urlOf(key), {
      method: "PUT",
      body,
      duplex: "half",
      headers: {
        "Content-Type": options.contentType,
        "Content-Length": String(size),
        "Cache-Control": options.cacheControl ?? "private, max-age=31536000, immutable",
        // El cuerpo va en flujo: no se firma su contenido (sí todo lo demás).
        "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
      },
    });
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new Error(`El almacén rechazó la subida de ${key} (HTTP ${response.status}).`);
  }

  async head(key: string): Promise<number | null> {
    const response = await this.send(this.urlOf(key), { method: "HEAD" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`El almacén no respondió por ${key} (HTTP ${response.status}).`);
    return Number(response.headers.get("content-length") ?? 0);
  }

  async download(key: string, filePath: string): Promise<void> {
    const response = await this.send(this.urlOf(key), { method: "GET" });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`No se pudo leer ${key} del almacén (HTTP ${response.status}).`);
    }
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(filePath));
  }

  async signedUrl(key: string, options: SignOptions = {}): Promise<string> {
    const url = new URL(this.urlOf(key));
    url.searchParams.set("X-Amz-Expires", String(Math.min(options.expiresIn ?? DEFAULT_SIGN_SECONDS, 7 * 24 * 3600)));
    if (options.downloadName) url.searchParams.set("response-content-disposition", dispositionOf(options.downloadName));
    const signed = await this.client.sign(url.toString(), { method: "GET", aws: { signQuery: true, allHeaders: false } });
    return signed.url;
  }

  async delete(key: string): Promise<void> {
    const response = await this.send(this.urlOf(key), { method: "DELETE" });
    await response.body?.cancel().catch(() => {});
    if (!response.ok && response.status !== 404) throw new Error(`No se pudo borrar ${key} (HTTP ${response.status}).`);
  }
}

// ───────────────────────── Carpeta local ─────────────────────────

/** Ruta de la web que sirve los objetos locales (`src/app/api/objetos/[...key]/route.ts`). */
export const LOCAL_OBJECT_ROUTE = "/api/objetos";

export class LocalStore implements ObjectStore {
  readonly kind = "local" as const;
  constructor(
    readonly root: string,
    private readonly secret: Buffer,
  ) {}

  pathOf(key: string): string {
    assertKey(key);
    return path.join(this.root, ...key.split("/"));
  }

  async putFile(key: string, filePath: string, options: PutOptions): Promise<void> {
    const target = this.pathOf(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.copyFile(filePath, temp);
    await fs.rename(temp, target);
    await fs.writeFile(`${target}.type`, options.contentType);
  }

  async putBuffer(key: string, data: Buffer, options: PutOptions): Promise<void> {
    const target = this.pathOf(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
    await fs.writeFile(`${target}.type`, options.contentType);
  }

  async head(key: string): Promise<number | null> {
    try {
      return (await fs.stat(this.pathOf(key))).size;
    } catch {
      return null;
    }
  }

  async download(key: string, filePath: string): Promise<void> {
    await fs.copyFile(this.pathOf(key), filePath);
  }

  async contentType(key: string): Promise<string> {
    return (await fs.readFile(`${this.pathOf(key)}.type`, "utf8").catch(() => "application/octet-stream")).trim();
  }

  private signature(key: string, expires: number, name: string): string {
    return createHmac("sha256", this.secret).update(`${key}\n${expires}\n${name}`).digest("base64url");
  }

  async signedUrl(key: string, options: SignOptions = {}): Promise<string> {
    assertKey(key);
    const expires = Math.floor(Date.now() / 1000) + (options.expiresIn ?? DEFAULT_SIGN_SECONDS);
    const name = options.downloadName ?? "";
    const query = new URLSearchParams({ e: String(expires), s: this.signature(key, expires, name) });
    if (name) query.set("n", name);
    return `${LOCAL_OBJECT_ROUTE}/${key}?${query}`;
  }

  /** Comprueba un enlace firmado por `signedUrl`. */
  verify(key: string, expires: string | null, signature: string | null, name: string | null): boolean {
    if (!expires || !signature || !/^\d{1,12}$/.test(expires) || Number(expires) < Date.now() / 1000) return false;
    const expected = Buffer.from(this.signature(key, Number(expires), name ?? ""));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.pathOf(key), { force: true });
    await fs.rm(`${this.pathOf(key)}.type`, { force: true });
  }
}

// ───────────────────────── Cuál se usa ─────────────────────────

const holder = globalThis as unknown as { __principalStore?: ObjectStore | null };

function isCloudEnv(): boolean {
  return process.env.PRINCIPAL_CLOUD === "1" || !!process.env.RAILWAY_PROJECT_ID;
}

/** El almacén de este proceso, o `null` en la nube sin bucket. */
export function getObjectStore(): ObjectStore | null {
  if (holder.__principalStore !== undefined) return holder.__principalStore;
  const config = s3ConfigFromEnv();
  if (config) holder.__principalStore = new S3Store(config);
  else if (isCloudEnv()) holder.__principalStore = null;
  else {
    // En el ordenador: una carpeta. La clave de firma es de este proceso (los enlaces caducan al reiniciar).
    holder.__principalStore = new LocalStore(path.join(dataDir(), "objetos"), randomBytes(32));
  }
  return holder.__principalStore;
}

/** Solo para pruebas: fija el almacén (o lo quita con `undefined`). */
export function setObjectStoreForTests(store: ObjectStore | null | undefined): void {
  holder.__principalStore = store;
}
