import { describe, expect, it } from "vitest";
import { McpUnauthorizedError, openMcp } from "@/connectors/higgsfield/mcp";

/** Servidor MCP por HTTP simulado (JSON-RPC con respuestas JSON), servido por un `fetch` falso. */
function fakeMcpServer(options: { unauthorized?: boolean } = {}) {
  const seen: Array<{ url: string; method: string; authorization: string | null; rpc: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { id?: number; method: string }) : null;
    seen.push({ url, method: init?.method ?? "GET", authorization: headers.get("authorization"), rpc: body?.method ?? null });
    if (options.unauthorized) {
      return new Response("no", { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } });
    }
    if ((init?.method ?? "GET") !== "POST" || !body) return new Response(null, { status: 405 });
    if (body.id === undefined) return new Response(null, { status: 202 });
    const reply = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    switch (body.method) {
      case "initialize":
        return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hf", version: "1" } });
      case "tools/list":
        return reply({ tools: [{ name: "balance", inputSchema: { type: "object" } }, { name: "generate_video", inputSchema: { type: "object" } }] });
      case "tools/call":
        return reply({ content: [{ type: "text", text: '{"credits":5,"plan":"plus"}' }] });
      default:
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "no" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
    }
  }) as typeof fetch;
  return { fetch: fetchImpl, seen };
}

describe("transporte MCP", () => {
  it("manda el token de la persona como Bearer al MCP de Higgsfield y lee el texto como JSON", async () => {
    const server = fakeMcpServer();
    const caller = await openMcp("hf-acc-1", { fetch: server.fetch });
    expect(await caller.listTools()).toEqual(["balance", "generate_video"]);
    expect(await caller.callTool("balance", {})).toEqual({
      isError: false,
      text: '{"credits":5,"plan":"plus"}',
      data: { credits: 5, plan: "plus" },
    });
    await caller.close();
    const posts = server.seen.filter((r) => r.method === "POST");
    expect(posts.map((r) => r.rpc)).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    expect(posts.every((r) => r.url === "https://mcp.higgsfield.ai/mcp" && r.authorization === "Bearer hf-acc-1")).toBe(true);
  });

  it("un 401 del servidor sale como McpUnauthorizedError, sin el token en el mensaje", async () => {
    const server = fakeMcpServer({ unauthorized: true });
    const error = await openMcp("hf-acc-1", { fetch: server.fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpUnauthorizedError);
    expect(String((error as Error).message)).not.toContain("hf-acc-1");
  });
});
