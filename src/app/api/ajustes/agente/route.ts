import { agentStatus, createAgentToken, listAgents, revokeAgent } from "@/server/agent";
import { handle } from "@/server/http";

/**
 * Si quien pregunta tiene un Mac conectado (`{ online }`): con él puede pegar enlaces. El dueño
 * ve además cuándo dio señales por última vez y sus Mac con ficha en vigor.
 */
export async function GET() {
  return handle(async (user) => {
    const status = await agentStatus(user!);
    const body = user!.role === "dueno" ? { ...status, agents: await listAgents(user!) } : { online: status.online };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Crea la ficha de un Mac (`name`): `{ agentId, token }`. La ficha solo se enseña aquí. Solo el dueño. */
export async function POST(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
      const created = await createAgentToken(owner!, typeof body?.name === "string" ? body.name : "");
      return Response.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
    },
    { role: "dueno" },
  );
}

/** Revoca la ficha de un Mac (`agentId`). Solo el dueño. */
export async function DELETE(request: Request) {
  return handle(
    async (owner) => {
      const body = (await request.json().catch(() => null)) as { agentId?: unknown } | null;
      await revokeAgent(owner!, typeof body?.agentId === "number" ? body.agentId : Number.NaN);
      return Response.json({ ok: true });
    },
    { role: "dueno" },
  );
}
