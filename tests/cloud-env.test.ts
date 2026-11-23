import { describe, expect, it } from "vitest";
import { checkCloudEnv, isCloud, oauthOrigin, publicOrigin } from "@/lib/cloud-env";

const ok = {
  DATABASE_URL: "postgres://x",
  VAULT_KEY: Buffer.alloc(32, 1).toString("base64"),
  ANTHROPIC_API_KEY: "k",
  PUBLIC_URL: "https://web.up.railway.app",
  BUCKET_ENDPOINT: "https://t3.storageapi.dev",
  BUCKET_NAME: "cubo",
  BUCKET_ACCESS_KEY_ID: "k",
  BUCKET_SECRET_ACCESS_KEY: "s",
};

describe("checkCloudEnv", () => {
  it("una configuración completa no da avisos", () => {
    expect(checkCloudEnv(ok)).toEqual({ problems: [], warnings: [] });
  });

  it("detecta cada problema con su mensaje", () => {
    expect(checkCloudEnv({ ...ok, DATABASE_URL: undefined }).problems).toContain("Falta DATABASE_URL (la base de datos).");
    expect(checkCloudEnv({ ...ok, VAULT_KEY: undefined }).problems).toEqual([
      "Falta VAULT_KEY (la clave que protege las conexiones guardadas).",
    ]);
    expect(checkCloudEnv({ ...ok, VAULT_KEY: "corta" }).problems).toContain("VAULT_KEY debe ser una clave de 32 bytes en base64.");
    expect(checkCloudEnv({ ...ok, PRINCIPAL_AUTH: "off" }).problems).toContain(
      "En la nube no se puede desactivar el inicio de sesión (PRINCIPAL_AUTH=off).",
    );
    expect(checkCloudEnv({ ...ok, PUBLIC_URL: "http://x" }).problems).toContain("PUBLIC_URL debe empezar por https://.");
    expect(checkCloudEnv({ ...ok, PUBLIC_URL: undefined }).problems).toContain(
      "Falta PUBLIC_URL (la dirección pública de la web, https://…).",
    );
    expect(checkCloudEnv({ ...ok, PUBLIC_URL: "  " }).problems).toContain(
      "Falta PUBLIC_URL (la dirección pública de la web, https://…).",
    );
    expect(checkCloudEnv({ ...ok, PUBLIC_URL: "https://" }).problems).toContain("PUBLIC_URL no es una dirección válida.");
    expect(checkCloudEnv({ ...ok, PRINCIPAL_HIGGSFIELD_FAKE: "1" }).problems).toContain(
      "En la nube no se puede usar el Higgsfield simulado (PRINCIPAL_HIGGSFIELD_FAKE).",
    );
  });

  it("VAULT_KEY usa la misma validación estricta que la bóveda", () => {
    const valid = Buffer.alloc(32, 1).toString("base64");
    // Sin relleno "=" (no canónico), con caracteres ajenos y de otro tamaño: no valen.
    for (const bad of [valid.replace(/=+$/, ""), `${valid}!`, Buffer.alloc(31, 1).toString("base64"), Buffer.alloc(33, 1).toString("base64")]) {
      expect(checkCloudEnv({ ...ok, VAULT_KEY: bad }).problems).toContain("VAULT_KEY debe ser una clave de 32 bytes en base64.");
    }
    expect(checkCloudEnv({ ...ok, VAULT_KEY: `  ${valid}\n` }).problems).toEqual([]);
  });

  it("sin clave de Claude arranca, pero avisa", () => {
    expect(checkCloudEnv({ ...ok, ANTHROPIC_API_KEY: undefined })).toEqual({
      problems: [],
      warnings: ["Falta ANTHROPIC_API_KEY: la IA no funcionará hasta añadirla."],
    });
  });
});

describe("isCloud", () => {
  it("reconoce PRINCIPAL_CLOUD=1 y Railway, y acepta un entorno explícito", () => {
    expect(isCloud({ PRINCIPAL_CLOUD: "1" })).toBe(true);
    expect(isCloud({ RAILWAY_PROJECT_ID: "abc" })).toBe(true);
    expect(isCloud({})).toBe(false);
    expect(isCloud({ PRINCIPAL_CLOUD: "0" })).toBe(false);
  });
});

describe("publicOrigin", () => {
  const request = new Request("http://0.0.0.0:3000/api/x");
  it("prefiere PUBLIC_URL (sin ruta ni barra final)", () => {
    expect(publicOrigin(request, { PUBLIC_URL: "https://web.up.railway.app/" })).toBe("https://web.up.railway.app");
  });
  it("sin PUBLIC_URL, o con una inválida, usa la de la petición", () => {
    expect(publicOrigin(request, {})).toBe("http://0.0.0.0:3000");
    expect(publicOrigin(request, { PUBLIC_URL: "no es una url" })).toBe("http://0.0.0.0:3000");
  });
});

describe("oauthOrigin", () => {
  const request = new Request("https://evil.example/api/higgsfield/conectar", { headers: { Host: "evil.example" } });
  it("en la nube sale solo de una PUBLIC_URL https válida, nunca de la petición", () => {
    expect(oauthOrigin(request, { PRINCIPAL_CLOUD: "1", PUBLIC_URL: "https://web.up.railway.app/x" })).toBe("https://web.up.railway.app");
    expect(oauthOrigin(request, { PRINCIPAL_CLOUD: "1" })).toBeNull();
    expect(oauthOrigin(request, { RAILWAY_PROJECT_ID: "p", PUBLIC_URL: "no es una url" })).toBeNull();
    expect(oauthOrigin(request, { PRINCIPAL_CLOUD: "1", PUBLIC_URL: "http://web.up.railway.app" })).toBeNull();
  });
  it("en el propio ordenador se comporta como publicOrigin", () => {
    expect(oauthOrigin(new Request("http://127.0.0.1:3000/x"), {})).toBe("http://127.0.0.1:3000");
  });
});
