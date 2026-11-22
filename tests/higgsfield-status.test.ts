import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";
import { createFakeHiggsfield } from "@/connectors/higgsfield/fake";
import { resetOAuthCache, startAuth } from "@/connectors/higgsfield/oauth";
import { HiggsfieldUnavailableError } from "@/connectors/higgsfield/port";
import { login, type AuthUser } from "@/server/auth";
import { credentialStatus, saveCredential } from "@/server/credentials";
import { higgsfieldStatus, probeConnections, stripSecrets } from "@/server/higgsfield";
import { makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { createFakeHiggsfieldAuth } from "./helpers/fake-higgsfield";
import { truncateAll } from "./helpers/global-setup";

let cookieToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "pr_sesion" && cookieToken ? { value: cookieToken } : undefined) }),
}));

const ORIGIN = "https://x.up.railway.app";
let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;

const connected = (user: AuthUser, meta: Record<string, unknown> = {}) =>
  saveCredential(
    user.id,
    "higgsfield",
    { accessToken: "hf-acc-9", refreshToken: "hf-ref-9", clientId: "cli-1" },
    { email: "ana@hf.test", connectedAt: new Date().toISOString(), expiresAt: null, hasRefreshToken: true, scope: "openid", needsReconnect: false, ...meta },
  );

const signIn = async (user: AuthUser) => {
  cookieToken = (await login(user.email, TEST_PASSWORD))!.token;
};

beforeEach(async () => {
  await truncateAll();
  resetOAuthCache();
  cookieToken = undefined;
  process.env.PUBLIC_URL = ORIGIN;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUBLIC_URL;
  delete process.env.PRINCIPAL_HIGGSFIELD_FAKE;
});

describe("estado de la conexión", () => {
  it("el estado nunca contiene los permisos y cada persona ve solo el suyo", async () => {
    const fake = createFakeHiggsfield();
    await connected(ana);
    const status = await higgsfieldStatus(ana, { higgsfield: fake.port });
    expect(JSON.stringify(status)).not.toMatch(/hf-acc|hf-ref|cli-1/);
    expect(status).toMatchObject({ connected: true, email: "ana@hf.test", credits: 1000, plan: "plus", error: null, needsReconnect: false });
    expect(await higgsfieldStatus(luis, { higgsfield: fake.port })).toMatchObject({ connected: false, credits: null });
    expect(fake.calls).toEqual([{ method: "balance", userId: ana.id, args: {} }]);
  });

  it("con Higgsfield caído el estado dice conectado y explica el error, sin créditos", async () => {
    const fake = createFakeHiggsfield();
    fake.failNext("balance", new HiggsfieldUnavailableError());
    await connected(ana);
    expect(await higgsfieldStatus(ana, { higgsfield: fake.port })).toMatchObject({
      connected: true,
      credits: null,
      plan: null,
      needsReconnect: false,
      error: "Higgsfield no responde. Inténtalo dentro de unos minutos.",
    });
  });

  it("con la conexión caducada pide reconectar sin llamar a Higgsfield", async () => {
    const fake = createFakeHiggsfield();
    await connected(ana, { needsReconnect: true });
    expect(await higgsfieldStatus(ana, { higgsfield: fake.port })).toMatchObject({ connected: true, needsReconnect: true, credits: null });
    expect(fake.calls).toEqual([]);
  });
});

describe("datos sin secretos para la bitácora", () => {
  it("oculta claves sensibles, JWT y la consulta de las URL firmadas", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4eHh4eHh4eCJ9.c2lnbmF0dXJlLWxhcmdh";
    expect(
      stripSecrets({
        access_token: "abc",
        nested: { download_token: "t", hasRefreshToken: true, url: "https://cdn.hf.test/a.mp4?X-Amz-Signature=zzz&e=1" },
        list: [jwt, "texto normal"],
        credits: 5,
      }),
    ).toEqual({
      access_token: "[oculto]",
      nested: { download_token: "[oculto]", hasRefreshToken: true, url: "https://cdn.hf.test/a.mp4?[oculto]" },
      list: ["[oculto]", "texto normal"],
      credits: 5,
    });
  });
});

describe("sonda", () => {
  it("deja una fila por persona conectada, sin permisos y sin gastar", async () => {
    const fake = createFakeHiggsfield();
    await connected(ana);
    await connected(luis, { needsReconnect: true });
    await probeConnections({ higgsfield: fake.port });
    const { rows } = await getPool().query("select user_id, ok, refreshed, detail from higgsfield_probe_log order by user_id");
    expect(rows).toEqual([
      { user_id: ana.id, ok: true, refreshed: false, detail: "1000 créditos" },
      { user_id: luis.id, ok: false, refreshed: false, detail: "Necesita volver a conectar." },
    ]);
    expect(fake.calls.map((c) => c.method)).toEqual(["balance"]);
    expect(JSON.stringify(rows)).not.toMatch(/hf-acc|hf-ref/);
  });
});

describe("rutas", () => {
  const routes = {
    estado: () => import("@/app/api/higgsfield/estado/route"),
    conectar: () => import("@/app/api/higgsfield/conectar/route"),
    callback: () => import("@/app/api/higgsfield/callback/route"),
    desconectar: () => import("@/app/api/higgsfield/desconectar/route"),
    cliente: () => import("@/app/api/higgsfield/cliente/route"),
    diagnostico: () => import("@/app/api/higgsfield/diagnostico/route"),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const route = (name: keyof typeof routes): Promise<any> => routes[name]();
  const post = (url: string) => new Request(url, { method: "POST" });

  it("sin sesión, las rutas privadas responden 401", async () => {
    expect((await (await route("estado")).GET()).status).toBe(401);
    expect((await (await route("conectar")).POST(post(`${ORIGIN}/api/higgsfield/conectar`))).status).toBe(401);
    expect((await (await route("desconectar")).POST()).status).toBe(401);
  });

  it("el diagnóstico es solo del dueño", async () => {
    process.env.PRINCIPAL_HIGGSFIELD_FAKE = "1";
    await signIn(ana);
    expect((await (await route("diagnostico")).POST()).status).toBe(403);
    await signIn(dueno);
    await connected(dueno);
    const response = await (await route("diagnostico")).POST();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ balance: { credits: 1000, plan: "plus" } });
    expect(JSON.stringify(body)).not.toMatch(/hf-acc|hf-ref/);
    // Se guarda en la bitácora de la sonda para fijar las formas reales, sin permisos.
    const { rows } = await getPool().query("select user_id, ok, detail from higgsfield_probe_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: dueno.id, ok: true });
    expect(JSON.parse(rows[0].detail)).toMatchObject({ tipo: "diagnostico", balance: { credits: 1000 } });
    expect(rows[0].detail).not.toMatch(/hf-acc|hf-ref/);
  });

  it("el documento de cliente solo existe con el interruptor CIMD, y usa PUBLIC_URL", async () => {
    const get = async () => (await route("cliente")).GET(new Request("http://0.0.0.0:3000/api/higgsfield/cliente"));
    expect((await get()).status).toBe(404);
    process.env.PRINCIPAL_HIGGSFIELD_CLIENT = "cimd";
    try {
      const body = await (await get()).json();
      expect(body.client_id).toBe(`${ORIGIN}/api/higgsfield/cliente`);
      expect(body.redirect_uris).toEqual([`${ORIGIN}/api/higgsfield/callback`]);
    } finally {
      delete process.env.PRINCIPAL_HIGGSFIELD_CLIENT;
    }
  });

  describe("en la nube sin PUBLIC_URL", () => {
    beforeEach(() => {
      process.env.PRINCIPAL_CLOUD = "1";
      delete process.env.PUBLIC_URL;
    });
    afterEach(() => {
      delete process.env.PRINCIPAL_CLOUD;
    });

    it("conectar con Host: evil.example se niega (503) y no registra nada en Higgsfield", async () => {
      const hf = createFakeHiggsfieldAuth();
      vi.stubGlobal("fetch", hf.fetch);
      await signIn(ana);
      const request = new Request("https://evil.example/api/higgsfield/conectar", {
        method: "POST",
        headers: { Host: "evil.example" },
      });
      const response = await (await route("conectar")).POST(request);
      expect(response.status).toBe(503);
      expect((await response.json()).error).toMatch(/Configuración incompleta/);
      expect(hf.requests).toHaveLength(0);
      expect((await getPool().query("select * from oauth_pending")).rows).toHaveLength(0);
    });

    it("la vuelta no completa nada ni redirige a la cabecera Host", async () => {
      await signIn(ana);
      const response = await (await route("callback")).GET(
        new Request("https://evil.example/api/higgsfield/callback?code=c&state=s", { headers: { Host: "evil.example" } }),
      );
      expect(response.headers.get("location")).toBe("/ajustes?higgsfield=error");
    });

    it("el documento CIMD tampoco se sirve con la dirección de la petición", async () => {
      process.env.PRINCIPAL_HIGGSFIELD_CLIENT = "cimd";
      try {
        const response = await (await route("cliente")).GET(new Request("https://evil.example/api/higgsfield/cliente"));
        expect(response.status).toBe(503);
      } finally {
        delete process.env.PRINCIPAL_HIGGSFIELD_CLIENT;
      }
    });
  });

  it("conectar devuelve la dirección de permiso con la vuelta construida desde PUBLIC_URL", async () => {
    const hf = createFakeHiggsfieldAuth();
    vi.stubGlobal("fetch", hf.fetch);
    await signIn(ana);
    const response = await (await route("conectar")).POST(post("http://0.0.0.0:3000/api/higgsfield/conectar"));
    const { authorizeUrl } = await response.json();
    expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/higgsfield/callback`);
  });

  it("la vuelta con el state de otra persona redirige con error y no conecta a nadie", async () => {
    const hf = createFakeHiggsfieldAuth();
    vi.stubGlobal("fetch", hf.fetch);
    const back = hf.approve((await startAuth(ana.id, ORIGIN, { fetch: hf.fetch })).authorizeUrl);
    await signIn(luis);
    const callback = await route("callback");
    const url = `${ORIGIN}/api/higgsfield/callback?code=${back.code}&state=${back.state}`;
    const response = await callback.GET(new Request(url));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/ajustes?higgsfield=error`);
    expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(false);
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(false);
    // Ana sí puede terminar con su propio state.
    await signIn(ana);
    const ok = await callback.GET(new Request(url));
    expect(ok.headers.get("location")).toBe(`${ORIGIN}/ajustes?higgsfield=conectado`);
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(true);
  });

  it("si la persona cancela en Higgsfield, vuelve con «cancelado»; un error del servidor, con su código", async () => {
    await signIn(ana);
    const callback = await route("callback");
    const cancel = await callback.GET(new Request(`${ORIGIN}/api/higgsfield/callback?error=access_denied&state=x`));
    expect(cancel.headers.get("location")).toBe(`${ORIGIN}/ajustes?higgsfield=cancelado`);
    const fail = await callback.GET(new Request(`${ORIGIN}/api/higgsfield/callback?error=invalid_scope&state=x`));
    expect(fail.headers.get("location")).toBe(`${ORIGIN}/ajustes?higgsfield=error&motivo=invalid_scope`);
    const weird = await callback.GET(new Request(`${ORIGIN}/api/higgsfield/callback?error=%3Cscript%3E`));
    expect(weird.headers.get("location")).toBe(`${ORIGIN}/ajustes?higgsfield=error`);
  });

  it("la vuelta sin sesión lleva a entrar y luego a Ajustes, sin tocar nada", async () => {
    const response = await (await route("callback")).GET(new Request(`${ORIGIN}/api/higgsfield/callback?code=c&state=s`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?volver=%2Fajustes`);
  });

  it("desconectar borra solo la conexión de quien lo pide", async () => {
    vi.stubGlobal("fetch", createFakeHiggsfieldAuth().fetch);
    await connected(ana);
    await connected(luis);
    await signIn(ana);
    expect((await (await route("desconectar")).POST()).status).toBe(200);
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(false);
    expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(true);
  });
});
