import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authRequired, login, resetLoginAttempts } from "@/server/auth";
import { HttpError, handle } from "@/server/http";
import { makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const ok = async () => Response.json({ secreto: "costes de EisWerk" });
const original = process.env.PRINCIPAL_AUTH;

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
});

afterEach(() => {
  if (original === undefined) delete process.env.PRINCIPAL_AUTH;
  else process.env.PRINCIPAL_AUTH = original;
});

async function sessionToken(role: "dueno" | "colaborador" = "colaborador") {
  const user = await makeUser(role);
  return (await login(user.email, TEST_PASSWORD))!.token;
}

describe("protección de la API", () => {
  it("sin sesión responde 401 y no ejecuta la consulta", async () => {
    let ran = false;
    const response = await handle(
      async () => {
        ran = true;
        return ok();
      },
      { token: async () => undefined },
    );
    expect(response.status).toBe(401);
    expect(ran).toBe(false);
    expect(await response.text()).not.toContain("EisWerk");
  });

  it("con una sesión inventada responde 401", async () => {
    const response = await handle(ok, { token: async () => "inventada" });
    expect(response.status).toBe(401);
  });

  it("con una sesión válida deja pasar", async () => {
    const token = await sessionToken();
    const response = await handle(ok, { token: async () => token });
    expect(response.status).toBe(200);
  });

  it("una ruta pública no pide sesión", async () => {
    const response = await handle(ok, { public: true, token: async () => undefined });
    expect(response.status).toBe(200);
  });

  it("en el propio ordenador (sin inicio de sesión) deja pasar", async () => {
    process.env.PRINCIPAL_AUTH = "off";
    const response = await handle(ok, { token: async () => undefined });
    expect(response.status).toBe(200);
  });

  it("exige sesión por defecto: solo se desactiva de forma explícita", async () => {
    process.env.PRINCIPAL_AUTH = "cualquier-otra-cosa";
    const response = await handle(ok, { token: async () => undefined });
    expect(response.status).toBe(401);
  });

  it("PRINCIPAL_AUTH=off no desactiva el inicio de sesión en la nube", async () => {
    process.env.PRINCIPAL_AUTH = "off";
    process.env.PRINCIPAL_CLOUD = "1";
    try {
      expect(authRequired()).toBe(true);
      expect((await handle(ok, { token: async () => undefined })).status).toBe(401);
    } finally {
      delete process.env.PRINCIPAL_CLOUD;
    }
  });

  it("un fallo interno sale como 500 genérico, sin filtrar el detalle, y queda en el registro", async () => {
    const token = await sessionToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handle(
      async () => {
        throw new Error("algo falló");
      },
      { token: async () => token },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Ha ocurrido un error inesperado." });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("una ruta solo para el dueño responde 403 a un colaborador y no ejecuta nada", async () => {
    const token = await sessionToken("colaborador");
    let ran = false;
    const response = await handle(
      async () => {
        ran = true;
        return ok();
      },
      { role: "dueno", token: async () => token },
    );
    expect(response.status).toBe(403);
    expect(ran).toBe(false);
    expect((await response.json()).error).toBe("Solo el dueño puede hacer esto.");
  });

  it("una ruta solo para el dueño deja pasar al dueño", async () => {
    const token = await sessionToken("dueno");
    expect((await handle(ok, { role: "dueno", token: async () => token })).status).toBe(200);
  });

  it("una ruta solo para el dueño sin sesión responde 401", async () => {
    expect((await handle(ok, { role: "dueno", token: async () => undefined })).status).toBe(401);
  });

  it("HttpError se convierte en su código y su mensaje", async () => {
    const token = await sessionToken("dueno");
    const response = await handle(
      async () => {
        throw new HttpError(404, "Producto no encontrado.");
      },
      { token: async () => token },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Producto no encontrado." });
  });
});
