import crypto from "node:crypto";

export { createFakeHiggsfield } from "@/connectors/higgsfield/fake";

/**
 * Servidor de permisos de Higgsfield simulado, servido por un `fetch` falso: metadatos, alta de
 * cliente, permiso (con comprobación PKCE de verdad), tokens, refresco y revocación. Ninguna
 * prueba sale a la red.
 */

const ISSUER = "https://higgsfield.ai/_clerk";
export const FAKE_METADATA = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  revocation_endpoint: `${ISSUER}/oauth/token/revoke`,
  registration_endpoint: `${ISSUER}/oauth/register`,
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["openid", "email", "offline_access"],
};

export interface FakeRequest {
  method: string;
  url: string;
  body: string;
  form: URLSearchParams;
  headers: Headers;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function idToken(email: string): string {
  const part = (o: object) => b64url(Buffer.from(JSON.stringify(o)));
  return `${part({ alg: "RS256" })}.${part({ sub: "user_x", email })}.firma`;
}

export function createFakeHiggsfieldAuth(options: { expiresIn?: number } = {}) {
  const requests: FakeRequest[] = [];
  const codes = new Map<string, { challenge: string; redirectUri: string; clientId: string; email: string }>();
  let tokenCounter = 0;
  const validRefresh = new Set<string>();
  const state = {
    expiresIn: options.expiresIn ?? 3600,
    /** El refresco responde `invalid_grant`. */
    rejectRefresh: false,
    /** El refresco responde 503. */
    refreshDown: false,
    /** Devolver token de refresco al conectar. */
    issueRefresh: true,
    /** Retraso del endpoint de tokens, para pruebas de concurrencia. */
    tokenDelayMs: 0,
  };

  function issueTokens(email?: string) {
    tokenCounter += 1;
    const body: Record<string, unknown> = {
      access_token: `hf-acc-${tokenCounter}`,
      token_type: "Bearer",
      expires_in: state.expiresIn,
      scope: "openid email offline_access",
    };
    if (state.issueRefresh) {
      body.refresh_token = `hf-ref-${tokenCounter}`;
      validRefresh.add(`hf-ref-${tokenCounter}`);
    }
    if (email) body.id_token = idToken(email);
    return body;
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "";
    const headers = new Headers(init?.headers);
    const form = new URLSearchParams(headers.get("content-type")?.includes("json") ? "" : body);
    requests.push({ method, url, body, form, headers });
    const { origin, pathname } = new URL(url);
    if (origin !== "https://higgsfield.ai") return new Response("no", { status: 404 });

    if (method === "GET" && pathname === "/_clerk/.well-known/oauth-authorization-server") return json(FAKE_METADATA);
    if (method === "POST" && pathname === "/_clerk/oauth/register") {
      const meta = JSON.parse(body) as Record<string, unknown>;
      return json({ ...meta, client_id: `cli-${requests.filter((r) => r.url.endsWith("/oauth/register")).length}` }, 201);
    }
    if (method === "POST" && pathname === "/_clerk/oauth/token") {
      if (state.tokenDelayMs) await new Promise((r) => setTimeout(r, state.tokenDelayMs));
      if (form.get("grant_type") === "authorization_code") {
        const entry = codes.get(form.get("code") ?? "");
        const verifier = form.get("code_verifier") ?? "";
        const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
        if (!entry || entry.challenge !== challenge || entry.redirectUri !== form.get("redirect_uri")) {
          return json({ error: "invalid_grant" }, 400);
        }
        codes.delete(form.get("code")!);
        return json(issueTokens(entry.email));
      }
      if (form.get("grant_type") === "refresh_token") {
        if (state.refreshDown) return new Response("caído", { status: 503 });
        const rt = form.get("refresh_token") ?? "";
        if (state.rejectRefresh || !validRefresh.has(rt)) return json({ error: "invalid_grant" }, 400);
        validRefresh.delete(rt); // rotación: el viejo deja de valer
        return json(issueTokens());
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (method === "POST" && pathname === "/_clerk/oauth/token/revoke") return new Response(null, { status: 200 });
    return new Response("no", { status: 404 });
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    requests,
    state,
    requestsTo: (url: string) => requests.filter((r) => r.url.split("?")[0] === url),
    tokenRequests: (grant: string) =>
      requests.filter((r) => r.url.endsWith("/oauth/token") && r.form.get("grant_type") === grant),
    /** La persona autoriza en Higgsfield: devuelve el `code` y el `state` con los que vuelve. */
    approve(authorizeUrl: string, email = "ana@hf.test"): { code: string; state: string } {
      const u = new URL(authorizeUrl);
      const code = `code-${crypto.randomBytes(6).toString("hex")}`;
      codes.set(code, {
        challenge: u.searchParams.get("code_challenge")!,
        redirectUri: u.searchParams.get("redirect_uri")!,
        clientId: u.searchParams.get("client_id")!,
        email,
      });
      return { code, state: u.searchParams.get("state")! };
    },
  };
}
