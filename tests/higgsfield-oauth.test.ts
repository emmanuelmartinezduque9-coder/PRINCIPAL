import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, getSetting } from "@/db/client";
import {
  accessTokenFor,
  clientMetadata,
  completeAuth,
  disconnect,
  refreshNow,
  resetOAuthCache,
  startAuth,
} from "@/connectors/higgsfield/oauth";
import { HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "@/connectors/higgsfield/port";
import type { AuthUser } from "@/server/auth";
import { credentialStatus, readCredential } from "@/server/credentials";
import { makeUser } from "./helpers/fixtures";
import { createFakeHiggsfieldAuth } from "./helpers/fake-higgsfield";
import { truncateAll } from "./helpers/global-setup";

const ORIGIN = "https://x.up.railway.app";
const INVALID = "La conexión ha caducado o no es válida. Vuelve a pulsar «Conectar».";
const REGISTER = "https://higgsfield.ai/_clerk/oauth/register";

let ana: AuthUser;
let luis: AuthUser;
let hf: ReturnType<typeof createFakeHiggsfieldAuth>;
let deps: { fetch: typeof fetch };

async function connect(user: AuthUser, email = "ana@hf.test") {
  const { authorizeUrl } = await startAuth(user.id, ORIGIN, deps);
  const back = hf.approve(authorizeUrl, email);
  await completeAuth(user.id, ORIGIN, back, deps);
}

beforeEach(async () => {
  await truncateAll();
  resetOAuthCache();
  delete process.env.PRINCIPAL_HIGGSFIELD_CLIENT;
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  hf = createFakeHiggsfieldAuth();
  deps = { fetch: hf.fetch };
});

afterEach(() => {
  delete process.env.PRINCIPAL_HIGGSFIELD_CLIENT;
});

describe("conectar", () => {
  it("conectar registra la web una sola vez y devuelve la dirección de permiso con PKCE", async () => {
    const url = new URL((await startAuth(ana.id, ORIGIN, deps)).authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://higgsfield.ai/_clerk/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cli-1");
    expect(url.searchParams.get("scope")).toBe("openid email offline_access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.up.railway.app/api/higgsfield/callback");
    expect(url.searchParams.get("resource")).toBe("https://mcp.higgsfield.ai/mcp");
    await startAuth(luis.id, ORIGIN, deps);
    expect(hf.requestsTo(REGISTER)).toHaveLength(1);
    const reg = JSON.parse(hf.requestsTo(REGISTER)[0].body);
    expect(reg).toMatchObject({
      client_name: "PRINCIPAL",
      redirect_uris: ["https://x.up.railway.app/api/higgsfield/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("el cliente registrado se guarda cifrado y se registra otra vez si cambia la dirección pública", async () => {
    await startAuth(ana.id, ORIGIN, deps);
    const stored = await getSetting<{ enc: string; redirectUri: string }>("higgsfield.oauthClient");
    expect(stored!.redirectUri).toBe(`${ORIGIN}/api/higgsfield/callback`);
    expect(JSON.stringify(stored)).not.toContain("cli-1");
    resetOAuthCache(); // otro proceso: lo lee de la base de datos, no vuelve a registrar
    await startAuth(ana.id, ORIGIN, deps);
    expect(hf.requestsTo(REGISTER)).toHaveLength(1);
    const url = new URL((await startAuth(ana.id, "https://otra.example", deps)).authorizeUrl);
    expect(hf.requestsTo(REGISTER)).toHaveLength(2);
    expect(url.searchParams.get("client_id")).toBe("cli-2");
  });

  it("con PRINCIPAL_HIGGSFIELD_CLIENT=cimd no se registra: el cliente es el documento de la web", async () => {
    process.env.PRINCIPAL_HIGGSFIELD_CLIENT = "cimd";
    const url = new URL((await startAuth(ana.id, ORIGIN, deps)).authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe(`${ORIGIN}/api/higgsfield/cliente`);
    expect(hf.requestsTo(REGISTER)).toHaveLength(0);
    expect(clientMetadata(ORIGIN)).toMatchObject({
      client_id: `${ORIGIN}/api/higgsfield/cliente`,
      redirect_uris: [`${ORIGIN}/api/higgsfield/callback`],
      token_endpoint_auth_method: "none",
    });
  });

  it("al volver guarda los permisos cifrados en la bóveda de esa persona y de nadie más", async () => {
    await connect(ana);
    expect(JSON.stringify((await getPool().query("select * from credentials")).rows)).not.toMatch(/hf-acc-1|hf-ref-1/);
    const status = await credentialStatus(ana.id, "higgsfield");
    expect(status.meta).toMatchObject({ email: "ana@hf.test", hasRefreshToken: true, needsReconnect: false });
    expect(JSON.stringify(status)).not.toMatch(/hf-acc|hf-ref|cli-/);
    expect(await readCredential(luis.id, "higgsfield")).toBeNull();
    // El intercambio llevó el verificador PKCE, el recurso y la misma dirección de vuelta.
    const [exchange] = hf.tokenRequests("authorization_code");
    expect(exchange.form.get("resource")).toBe("https://mcp.higgsfield.ai/mcp");
    expect(exchange.form.get("client_id")).toBe("cli-1");
    expect((await getPool().query("select * from oauth_pending")).rows).toHaveLength(0);
  });

  it.each(["desconocido", "caducado (11 min)", "ya usado", "de otra persona"])(
    "un state %s se rechaza y no guarda nada",
    async (kind) => {
      let state = "estado-inventado";
      let code = "c";
      if (kind === "caducado (11 min)") {
        const past = { ...deps, now: () => new Date(Date.now() - 11 * 60_000) };
        ({ code, state } = hf.approve((await startAuth(luis.id, ORIGIN, past)).authorizeUrl));
      } else if (kind === "ya usado") {
        ({ code, state } = hf.approve((await startAuth(luis.id, ORIGIN, deps)).authorizeUrl));
        await completeAuth(luis.id, ORIGIN, { code, state }, deps);
        await disconnect(luis.id, deps);
      } else if (kind === "de otra persona") {
        ({ code, state } = hf.approve((await startAuth(ana.id, ORIGIN, deps)).authorizeUrl));
      }
      await expect(completeAuth(luis.id, ORIGIN, { code, state }, deps)).rejects.toThrow(INVALID);
      expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(false);
      if (kind === "de otra persona") {
        // El intento ajeno no gasta el state de Ana: ella todavía puede terminar su conexión.
        await completeAuth(ana.id, ORIGIN, { code, state }, deps);
        expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(true);
      }
    },
  );

  it("si la vuelta llega con otra dirección pública, se rechaza", async () => {
    const back = hf.approve((await startAuth(ana.id, ORIGIN, deps)).authorizeUrl);
    await expect(completeAuth(ana.id, "https://otra.example", back, deps)).rejects.toThrow(INVALID);
  });
});

describe("token de acceso", () => {
  it("sin conexión lanza HiggsfieldNotConnectedError", async () => {
    await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldNotConnectedError);
    await expect(accessTokenFor(ana.id, deps)).rejects.toThrow("Conecta tu Higgsfield en Ajustes.");
  });

  it("con el permiso vigente lo devuelve sin llamar a Higgsfield", async () => {
    await connect(ana);
    expect(await accessTokenFor(ana.id, deps)).toBe("hf-acc-1");
    expect(hf.tokenRequests("refresh_token")).toHaveLength(0);
  });

  it("refresca cuando faltan menos de 60 s y guarda el token de refresco nuevo", async () => {
    hf.state.expiresIn = 30;
    await connect(ana);
    const before = (await credentialStatus(ana.id, "higgsfield")).meta.expiresAt as string;
    hf.state.expiresIn = 3600;
    expect(await accessTokenFor(ana.id, deps)).toBe("hf-acc-2");
    const [refresh] = hf.tokenRequests("refresh_token");
    expect(refresh.form.get("refresh_token")).toBe("hf-ref-1");
    expect(refresh.form.get("resource")).toBe("https://mcp.higgsfield.ai/mcp");
    const after = await readCredential<{ accessToken: string; refreshToken: string }>(ana.id, "higgsfield");
    expect(after!.secret).toMatchObject({ accessToken: "hf-acc-2", refreshToken: "hf-ref-2" });
    expect(new Date(after!.meta.expiresAt as string).getTime()).toBeGreaterThan(new Date(before).getTime());
    expect(await accessTokenFor(ana.id, deps)).toBe("hf-acc-2");
    expect(hf.tokenRequests("refresh_token")).toHaveLength(1);
  });

  it("dos peticiones a la vez refrescan una sola vez", async () => {
    hf.state.expiresIn = 30;
    await connect(ana);
    hf.state.expiresIn = 3600;
    hf.state.tokenDelayMs = 50;
    expect(await Promise.all([accessTokenFor(ana.id, deps), accessTokenFor(ana.id, deps)])).toEqual(["hf-acc-2", "hf-acc-2"]);
    expect(hf.tokenRequests("refresh_token")).toHaveLength(1);
  });

  it("un refresco forzado tras un 401, pedido dos veces a la vez, refresca una sola vez", async () => {
    await connect(ana);
    hf.state.tokenDelayMs = 50;
    expect(await Promise.all([refreshNow(ana.id, deps), refreshNow(ana.id, deps)])).toEqual(["hf-acc-2", "hf-acc-2"]);
    expect(hf.tokenRequests("refresh_token")).toHaveLength(1);
  });

  it("si Higgsfield rechaza el refresco, la conexión queda para reconectar y no se insiste", async () => {
    hf.state.expiresIn = 30;
    await connect(ana);
    hf.state.rejectRefresh = true;
    await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldAuthError);
    expect((await credentialStatus(ana.id, "higgsfield")).meta.needsReconnect).toBe(true);
    await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldAuthError);
    await expect(refreshNow(ana.id, deps)).rejects.toThrow(
      "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    );
    expect(hf.tokenRequests("refresh_token")).toHaveLength(1);
  });

  it("sin token de refresco, al caducar pide reconectar sin llamar a la red", async () => {
    hf.state.expiresIn = 30;
    hf.state.issueRefresh = false;
    await connect(ana);
    expect((await credentialStatus(ana.id, "higgsfield")).meta.hasRefreshToken).toBe(false);
    await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldAuthError);
    expect(hf.tokenRequests("refresh_token")).toHaveLength(0);
  });

  it("si Higgsfield está caído al refrescar, no da la conexión por perdida", async () => {
    hf.state.expiresIn = 30;
    await connect(ana);
    hf.state.refreshDown = true;
    await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
    expect((await credentialStatus(ana.id, "higgsfield")).meta.needsReconnect).toBe(false);
  });

  it("los errores nunca llevan los permisos en el mensaje", async () => {
    hf.state.expiresIn = 30;
    await connect(ana);
    hf.state.rejectRefresh = true;
    const error = await accessTokenFor(ana.id, deps).catch((e: Error) => e);
    expect(`${(error as Error).message} ${(error as Error).stack}`).not.toMatch(/hf-acc|hf-ref/);
  });
});

describe("desconectar", () => {
  it("revoca en Higgsfield y borra la conexión de esa persona y solo de ella", async () => {
    await connect(ana);
    await connect(luis, "luis@hf.test");
    await disconnect(ana.id, deps);
    const revokes = hf.requestsTo("https://higgsfield.ai/_clerk/oauth/token/revoke");
    expect(revokes.map((r) => r.form.get("token"))).toEqual(["hf-ref-1", "hf-acc-1"]);
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(false);
    expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(true);
  });

  it("si Higgsfield no responde, se borra igualmente en local", async () => {
    await connect(ana);
    const down = { fetch: (async () => { throw new Error("red caída"); }) as typeof fetch };
    await disconnect(ana.id, down);
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(false);
  });
});
