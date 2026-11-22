import { agentHeartbeat, requireAgent } from "@/server/agent";
import { handle } from "@/server/http";

/** Latido del programa del Mac (cada 30 s): `{ version, ytDlp }`. Sin sesión; entra con su ficha. */
export async function POST(request: Request) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const body = (await request.json().catch(() => null)) as { version?: unknown; ytDlp?: unknown } | null;
      await agentHeartbeat(agentId, {
        version: typeof body?.version === "string" ? body.version : "",
        ytDlp: typeof body?.ytDlp === "string" ? body.ytDlp : null,
      });
      return Response.json({ ok: true });
    },
    { public: true },
  );
}
