import { Client, SdkHttpError, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { HIGGSFIELD_MCP_URL } from "./oauth";

/**
 * ÚNICO archivo que importa `@modelcontextprotocol/*` (lo comprueba `tests/boundaries.test.ts`).
 * Solo transporte: abre un cliente MCP por HTTP en flujo con el token de acceso de la persona en
 * la cabecera `Authorization` y llama herramientas. Los permisos los gestiona `oauth.ts`; aquí el
 * SDK no hace OAuth (sin `onUnauthorized`: un 401 sale como `McpUnauthorizedError`).
 */

export interface McpCaller {
  /** `data`: `structuredContent` si viene; si no, el texto leído como JSON; si no, `null`. */
  callTool(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string; data: unknown }>;
  listTools(): Promise<string[]>;
  close(): Promise<void>;
}

/** El servidor MCP respondió 401: el token no vale (caducado, revocado o no aceptado). */
export class McpUnauthorizedError extends Error {
  constructor() {
    super("Higgsfield rechazó el permiso (401).");
    this.name = "McpUnauthorizedError";
  }
}

const VERSION = "0.1.0";
const REQUEST_TIMEOUT_MS = 60_000;

function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) return true;
  if (error instanceof SdkHttpError && error.data?.status === 401) return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause ? isUnauthorized(cause) : false;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUnauthorized(error)) throw new McpUnauthorizedError();
    throw error;
  }
}

function readText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function openMcp(accessToken: string, options: { fetch?: typeof fetch } = {}): Promise<McpCaller> {
  const transport = new StreamableHTTPClientTransport(new URL(HIGGSFIELD_MCP_URL), {
    authProvider: { token: async () => accessToken },
    onInsufficientScope: "throw",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const client = new Client({ name: "principal", version: VERSION });
  try {
    await guard(() => client.connect(transport, { timeout: REQUEST_TIMEOUT_MS }));
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  return {
    async callTool(name, args) {
      const result = await guard(() => client.callTool({ name, arguments: args }, { timeout: REQUEST_TIMEOUT_MS }));
      const text = readText(result.content);
      const structured = (result as { structuredContent?: unknown }).structuredContent;
      return { isError: result.isError === true, text, data: structured ?? parseJson(text) };
    },
    async listTools() {
      const result = await guard(() => client.listTools(undefined, { timeout: REQUEST_TIMEOUT_MS }));
      return result.tools.map((tool) => tool.name);
    },
    async close() {
      await client.close().catch(() => {});
    },
  };
}
