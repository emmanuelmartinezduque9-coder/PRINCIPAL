import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/server/auth";
import { addProductPhoto, listProductPhotos, MAX_PHOTOS_PER_PRODUCT, readProductPhoto } from "@/server/photos";
import { listProductsFor } from "@/server/products";
import { checkPrincipalDatabase, main, parseArgs, redact } from "../scripts/importar-productos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/** Paquete de importación de prueba: un `productos.json` y unas fotos generadas en una carpeta temporal. */

const OWNER_EMAIL = "dueno.importa@example.com";
/** `host:puerto/base` de la base embebida de las pruebas. */
const TARGET = (() => {
  const url = new URL(process.env.DATABASE_URL!);
  return `${url.hostname}:${url.port}${url.pathname}`;
})();

let seq = 0;
/** Una imagen distinta cada vez: cabecera real de PNG o JPEG y relleno único (la app detecta por contenido). */
function image(kind: "png" | "jpg"): Buffer {
  seq += 1;
  const head =
    kind === "png" ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
  return Buffer.concat([Buffer.from(head), Buffer.from(`imagen-de-prueba-${seq}-`), crypto.randomBytes(48)]);
}
const sha = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

interface PhotoSpec {
  role: string;
  label: string;
  primary?: boolean;
  bytes?: Buffer; // sin bytes: foto sin archivo local
  missing?: string;
  file?: string; // ruta tal cual en productos.json (para probar rutas que salen del paquete)
  shaOverride?: string;
}

let dir: string;
let owner: AuthUser;
const out: string[] = [];

function photo(slug: string, spec: PhotoSpec) {
  if (!spec.bytes) {
    const missing = spec.missing ?? "sin archivo local";
    return { role: spec.role, label: spec.label, file: null, sha256: null, primary: !!spec.primary, missing };
  }
  if (spec.file) {
    return { role: spec.role, label: spec.label, file: spec.file, sha256: sha(spec.bytes), primary: !!spec.primary };
  }
  const ext = spec.bytes[0] === 0x89 ? "png" : "jpg";
  const file = `fotos/${slug}/${spec.label}.${ext}`;
  fs.mkdirSync(path.join(dir, "fotos", slug), { recursive: true });
  fs.writeFileSync(path.join(dir, file), spec.bytes);
  return {
    role: spec.role,
    label: spec.label,
    file,
    sha256: spec.shaOverride ?? sha(spec.bytes),
    primary: !!spec.primary,
    bytes: spec.bytes.length,
  };
}

function product(over: {
  slug: string;
  name: string;
  status?: string;
  statusBasis?: string;
  language?: string | null;
  countries?: string[];
  summary?: string | null;
  photos?: PhotoSpec[];
}) {
  return {
    slug: over.slug,
    origin: "cuenta",
    name: over.name,
    status: over.status ?? "active",
    statusBasis: over.statusBasis ?? "explicito",
    language: over.language === undefined ? "de" : over.language,
    countries: over.countries ?? ["DE"],
    summary: over.summary === undefined ? `Frase de ${over.name}` : over.summary,
    variants: [],
    photos: (over.photos ?? []).map((p) => photo(over.slug, p)),
  };
}

function writePackage(products: ReturnType<typeof product>[]) {
  fs.writeFileSync(path.join(dir, "productos.json"), JSON.stringify(products));
}

// Fotos de Alfa, guardadas para comprobar contenido y orden.
let alfa: { articulo: Buffer; embalaje: Buffer; avatar: Buffer; otro: Buffer; repetida: Buffer };

/** Paquete estándar: Alfa (activa, con fotos buenas y malas), Beta (activa por defecto), Gamma (oculta), Delta (sin fotos). */
function standardPackage() {
  alfa = { articulo: image("png"), embalaje: image("jpg"), avatar: image("jpg"), otro: image("png"), repetida: image("jpg") };
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), crypto.randomBytes(32)]);
  writePackage([
    product({
      slug: "alfa",
      name: "Alfa",
      countries: [],
      photos: [
        { role: "otro", label: "logo", bytes: alfa.otro },
        { role: "avatar", label: "cara", bytes: alfa.avatar },
        { role: "articulo", label: "articulo_base" }, // sin archivo
        { role: "avatar", label: "cara_grande", missing: "archivo > 8 MB, omitido" },
        { role: "embalaje", label: "embalaje", primary: true, bytes: alfa.embalaje },
        { role: "articulo", label: "articulo", primary: true, bytes: alfa.articulo },
        { role: "articulo", label: "sha_malo", bytes: image("png"), shaOverride: "0".repeat(64) },
        { role: "otro", label: "es_pdf", bytes: pdf },
        { role: "otro", label: "misma_imagen", bytes: alfa.articulo }, // misma imagen con otro papel
      ],
    }),
    product({
      slug: "beta",
      name: "Beta",
      statusBasis: "implicito", // «active*» del inventario
      language: "it",
      countries: ["IT"],
      photos: [{ role: "articulo", label: "articulo", primary: true, bytes: image("jpg") }],
    }),
    product({
      slug: "gamma",
      name: "Gamma",
      status: "hidden",
      photos: [{ role: "articulo", label: "articulo", primary: true, bytes: image("png") }],
    }),
    product({ slug: "delta", name: "Delta", photos: [{ role: "articulo", label: "articulo" }] }),
  ]);
}

const run = (...extra: string[]) =>
  main(["--paquete", dir, "--dueno", OWNER_EMAIL, ...extra], { out: (line) => out.push(line) });
const apply = (...extra: string[]) => run("--aplicar", "--confirmo-base", TARGET, ...extra);

const byName = async () => new Map((await listProductsFor(owner)).map((p) => [p.name, p]));
const rolesOf = async (productId: number) => (await listProductPhotos(owner, productId)).map((p) => p.role);
const allPhotos = async () => {
  let total = 0;
  for (const p of await listProductsFor(owner)) total += (await listProductPhotos(owner, p.id)).length;
  return total;
};

beforeEach(async () => {
  await truncateAll();
  out.length = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "principal-importar-"));
  owner = await makeUser("dueno", { email: OWNER_EMAIL, name: "Dueño" });
  standardPackage();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("importar productos: argumentos", () => {
  it("por defecto es una prueba y elige active y active*", () => {
    const options = parseArgs(["--paquete", "/x", "--dueno", "a@b.c"]);
    expect(options).toMatchObject({ paquete: "/x", dueno: "a@b.c", aplicar: false });
    expect([...options.estados].sort()).toEqual(["active", "active*"]);
    expect(parseArgs(["--paquete=/y", "--dueno=a@b.c", "--estados=hidden", "--aplicar", "--confirmo-base=h"])).toMatchObject({
      paquete: "/y",
      aplicar: true,
      confirmoBase: "h",
      estados: new Set(["hidden"]),
    });
  });

  it("rechaza estados desconocidos, opciones desconocidas y que falten las obligatorias", () => {
    expect(() => parseArgs(["--paquete", "/x", "--dueno", "a@b.c", "--estados", "activo"])).toThrow(/activo/);
    expect(() => parseArgs(["--paquete", "/x", "--dueno", "a@b.c", "--borrar"])).toThrow(/--borrar/);
    expect(() => parseArgs(["--dueno", "a@b.c"])).toThrow(/--paquete/);
    expect(() => parseArgs(["--paquete", "/x"])).toThrow(/--dueno/);
  });
});

describe("importar productos", () => {
  it("la prueba (sin --aplicar) no escribe nada y cuenta lo que haría", async () => {
    const code = await run();
    expect(code).toBe(0);
    expect(await listProductsFor(owner)).toHaveLength(0);
    const text = out.join("\n");
    expect(text).toMatch(/PRUEBA/);
    expect(text).toMatch(/CREARÍA\s+Alfa/);
    expect(text).toMatch(/CREARÍA\s+Beta/);
    expect(text).toMatch(/CREARÍA\s+Delta/);
    expect(text).not.toMatch(/Gamma/);
    expect(text).toMatch(/sin fotos/i); // la regla para productos sin fotos se dice en el informe
    expect(text).toContain(`base ${TARGET}`);
    expect(text).toContain(`--confirmo-base ${TARGET}`);
    expect(text).not.toContain(process.env.DATABASE_URL!);
    expect(text).not.toContain("principal:principal");
  });

  it("--aplicar crea los productos con sus datos y las fotos con su papel, la principal primero", async () => {
    expect(await apply()).toBe(0);
    const products = await byName();
    expect([...products.keys()].sort()).toEqual(["Alfa", "Beta", "Delta"]);

    const a = products.get("Alfa")!;
    expect(a).toMatchObject({ summary: "Frase de Alfa", language: "de", countries: ["DE", "AT", "CH"], createdBy: owner.id });
    expect(products.get("Beta")).toMatchObject({ language: "it", countries: ["IT"] });

    // Principales primero (artículo, embalaje), luego el resto por papel; la misma imagen solo una vez.
    expect(await rolesOf(a.id)).toEqual(["articulo", "embalaje", "avatar", "otro"]);
    const photos = await listProductPhotos(owner, a.id);
    expect((await readProductPhoto(owner, photos[0].id)).data.equals(alfa.articulo)).toBe(true);
    expect((await readProductPhoto(owner, photos[3].id)).data.equals(alfa.otro)).toBe(true);
    expect(photos[0].mime).toBe("image/png");

    expect(await rolesOf(products.get("Beta")!.id)).toEqual(["articulo"]);
    // Sin ninguna foto con archivo pero con frase: se crea igualmente, sin fotos.
    expect(await rolesOf(products.get("Delta")!.id)).toEqual([]);
    expect(out.join("\n")).toMatch(/CREADO\s+Delta/);
  });

  it("una segunda ejecución no crea nada ni repite fotos", async () => {
    await apply();
    const before = await allPhotos();
    out.length = 0;
    expect(await apply()).toBe(0);
    expect(await listProductsFor(owner)).toHaveLength(3);
    expect(await allPhotos()).toBe(before);
    const text = out.join("\n");
    expect(text).not.toMatch(/CREADO/);
    expect(text).toMatch(/EXISTE\s+Alfa/);
    expect(text).toMatch(/0 creados/);
  });

  it("una foto con el sha256 equivocado o que no es una imagen se omite y se dice por qué", async () => {
    await apply();
    const text = out.join("\n");
    expect(text).toMatch(/sha_malo.*sha256/);
    expect(text).toMatch(/es_pdf.*Formato de foto no admitido/);
    expect(text).toMatch(/articulo_base.*sin archivo/);
    expect(text).toMatch(/cara_grande: archivo > 8 MB, omitido/);
  });

  it("un producto que ya existe (mismo nombre, otras mayúsculas) solo recibe las fotos que le faltan", async () => {
    const existing = await makeProduct(owner, { name: "ALFA", summary: "Frase puesta a mano", language: "it", countries: ["IT"] });
    await addProductPhoto(owner, existing.id, alfa.avatar, "avatar");

    expect(await apply()).toBe(0);
    const products = await listProductsFor(owner);
    expect(products.filter((p) => p.name.toLowerCase() === "alfa")).toHaveLength(1);
    const kept = products.find((p) => p.id === existing.id)!;
    expect(kept).toMatchObject({ name: "ALFA", summary: "Frase puesta a mano", language: "it", countries: ["IT"] });
    // La foto que ya tenía se queda; se añaden las otras tres, sin repetir el avatar.
    expect(await rolesOf(existing.id)).toEqual(["avatar", "articulo", "embalaje", "otro"]);
    expect(out.join("\n")).toMatch(/EXISTE\s+ALFA|EXISTE\s+Alfa/);
  });

  it("filtra por estado: active no incluye las activas por defecto (active*), y se puede pedir otro estado", async () => {
    expect(await apply("--estados", "active")).toBe(0);
    expect([...(await byName()).keys()].sort()).toEqual(["Alfa", "Delta"]);

    expect(await apply("--estados", "hidden")).toBe(0);
    expect([...(await byName()).keys()].sort()).toEqual(["Alfa", "Delta", "Gamma"]);

    expect(await apply("--estados", "active*")).toBe(0);
    expect([...(await byName()).keys()].sort()).toEqual(["Alfa", "Beta", "Delta", "Gamma"]);
  });

  it("no escribe sin --confirmo-base o si no coincide con el host de DATABASE_URL", async () => {
    expect(await run("--aplicar")).not.toBe(0);
    expect(out.join("\n")).toMatch(/--confirmo-base/);
    out.length = 0;
    expect(await run("--aplicar", "--confirmo-base", "otra-base.example.com")).not.toBe(0);
    expect(out.join("\n")).toMatch(/no coincide/);
    // Mismo host y misma base, otro puerto (en Railway, otra base): tampoco.
    const url = new URL(process.env.DATABASE_URL!);
    out.length = 0;
    expect(await run("--aplicar", "--confirmo-base", `${url.hostname}:1${url.port}${url.pathname}`)).toBe(2);
    expect(out.join("\n")).toMatch(/no coincide/);
    // Solo el host (lo que valía antes): tampoco.
    out.length = 0;
    expect(await run("--aplicar", "--confirmo-base", url.hostname)).toBe(2);
    expect(out.join("\n")).not.toContain(process.env.DATABASE_URL!);
    expect(await listProductsFor(owner)).toHaveLength(0);
  });

  it("falla con un mensaje claro si el correo no es de una cuenta activa del dueño", async () => {
    const code = await main(["--paquete", dir, "--dueno", "nadie@example.com"], { out: (line) => out.push(line) });
    expect(code).not.toBe(0);
    expect(out.join("\n")).toMatch(/nadie@example\.com/);

    out.length = 0;
    const colaborador = await makeUser("colaborador", { email: "ana.importa@example.com" });
    const code2 = await main(["--paquete", dir, "--dueno", colaborador.email], { out: (line) => out.push(line) });
    expect(code2).not.toBe(0);
    expect(out.join("\n")).toMatch(/dueño/);
  });

  it("omite el producto que la app no admite (idioma o país) y el que no tiene frase", async () => {
    writePackage([
      product({ slug: "frances", name: "Français", language: "fr", countries: ["FR"], photos: [{ role: "articulo", label: "a", bytes: image("png") }] }),
      product({ slug: "francia", name: "Frankreich", countries: ["DE", "FR"] }),
      product({ slug: "muda", name: "Muda", summary: null, photos: [{ role: "articulo", label: "a", bytes: image("png") }] }),
      product({ slug: "sinidioma", name: "Ohne Sprache", language: null }),
    ]);
    expect(await apply()).toBe(0);
    expect([...(await byName()).keys()]).toEqual(["Ohne Sprache"]);
    expect((await byName()).get("Ohne Sprache")!.language).toBe("de");
    const text = out.join("\n");
    expect(text).toMatch(/OMITIDO\s+Français.*Idioma no disponible/);
    expect(text).toMatch(/OMITIDO\s+Frankreich.*País no disponible/);
    expect(text).toMatch(/OMITIDO\s+Muda.*frase/);
  });

  it("una ruta de foto que sale de la carpeta del paquete se rechaza aunque el archivo exista", async () => {
    const outside = image("png");
    const outsideFile = path.join(path.dirname(dir), `fuera-${path.basename(dir)}.png`);
    fs.writeFileSync(outsideFile, outside);
    try {
      writePackage([
        product({
          slug: "escapa",
          name: "Escapa",
          photos: [
            { role: "articulo", label: "relativa", bytes: outside, file: `../${path.basename(outsideFile)}` },
            { role: "otro", label: "absoluta", bytes: outside, file: outsideFile },
          ],
        }),
      ]);
      expect(await apply()).toBe(0);
      expect(await rolesOf((await byName()).get("Escapa")!.id)).toEqual([]);
      const text = out.join("\n");
      expect(text).toMatch(/relativa: la ruta sale de la carpeta del paquete/);
      expect(text).toMatch(/absoluta: la ruta sale de la carpeta del paquete/);
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });

  it(`respeta el máximo de ${MAX_PHOTOS_PER_PRODUCT} fotos por producto, con la principal dentro`, async () => {
    const extra: PhotoSpec[] = Array.from({ length: MAX_PHOTOS_PER_PRODUCT + 2 }, (_, i) => ({
      role: "otro",
      label: `otro_${i}`,
      bytes: image("jpg"),
    }));
    const principal = image("png");
    writePackage([
      product({ slug: "muchas", name: "Muchas", photos: [...extra, { role: "articulo", label: "principal", primary: true, bytes: principal }] }),
    ]);
    expect(await apply()).toBe(0);
    const p = (await byName()).get("Muchas")!;
    const photos = await listProductPhotos(owner, p.id);
    expect(photos).toHaveLength(MAX_PHOTOS_PER_PRODUCT);
    expect(photos[0].role).toBe("articulo");
    expect((await readProductPhoto(owner, photos[0].id)).data.equals(principal)).toBe(true);
    expect(out.join("\n")).toMatch(/3 fuera del máximo/);
  });
});

describe("importar productos: la base tiene que ser la de PRINCIPAL", () => {
  /** Crea (o vacía) una base aparte en el mismo servidor embebido y devuelve su dirección. */
  async function scratchDatabase(name: string, setup: string[] = []): Promise<string> {
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    try {
      await admin.query(`drop database if exists ${name}`);
      await admin.query(`create database ${name}`);
    } finally {
      await admin.end();
    }
    const url = process.env.DATABASE_URL!.replace(/\/[^/]+$/, `/${name}`);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      for (const statement of setup) await client.query(statement);
    } finally {
      await client.end();
    }
    return url;
  }

  /** Lanza el importador con `DATABASE_URL` apuntando a otra base (solo durante la llamada). */
  async function runAgainst(url: string, ...extra: string[]) {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    try {
      const target = new URL(url);
      return await main(
        ["--paquete", dir, "--dueno", OWNER_EMAIL, "--aplicar", "--confirmo-base", `${target.hostname}:${target.port}${target.pathname}`, ...extra],
        { out: (line) => out.push(line) },
      );
    } finally {
      process.env.DATABASE_URL = saved;
    }
  }

  it("se niega con una base que parece la de Finanzas, aunque el host:puerto/base coincida", async () => {
    const url = await scratchDatabase("importar_falsa_finanzas", [
      "create table stores (id text)",
      "create table products (id text)",
    ]);
    expect(await runAgainst(url)).toBe(2);
    expect(out.join("\n")).toMatch(/Finanzas/);
    expect(await listProductsFor(owner)).toHaveLength(0);
  });

  it("se niega con una base vacía o sin las tablas propias de PRINCIPAL", async () => {
    const url = await scratchDatabase("importar_vacia", ["create table users (id text)"]);
    expect(await runAgainst(url)).toBe(2);
    expect(out.join("\n")).toMatch(/no es la de PRINCIPAL.*product_photos/);
  });

  it("se niega si faltan el registro de migraciones o la última migración del código", async () => {
    const { runMigrations } = await import("@/db/migrate");
    const url = await scratchDatabase("importar_atrasada");
    await runMigrations(url);
    await expect(checkPrincipalDatabase(url)).resolves.toBeUndefined();

    const { Client } = await import("pg");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query("delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)");
      await expect(checkPrincipalDatabase(url)).rejects.toThrow(/última migración/);
      await client.query("drop schema drizzle cascade");
      await expect(checkPrincipalDatabase(url)).rejects.toThrow(/registro de migraciones/);
    } finally {
      await client.end();
    }
    expect(await runAgainst(url)).toBe(2);
    expect(out.join("\n")).toMatch(/registro de migraciones/);
  });

  it("la base de las pruebas (con sus migraciones) se acepta", async () => {
    await expect(checkPrincipalDatabase(process.env.DATABASE_URL!)).resolves.toBeUndefined();
  });
});

describe("importar productos: nada de secretos en los mensajes", () => {
  it("redact quita la dirección completa de la base y su contraseña", () => {
    const saved = process.env.DATABASE_URL;
    const url = "postgres://usuario:s3cr%40to@ejemplo.proxy.rlwy.net:41234/railway";
    process.env.DATABASE_URL = url;
    try {
      const clean = redact(`no conecta con ${url}; la clave s3cr@to fue rechazada`);
      expect(clean).not.toContain(url);
      expect(clean).not.toContain("s3cr@to");
      expect(clean).toContain("<DATABASE_URL>");
      expect(clean).toContain("<contraseña>");
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
