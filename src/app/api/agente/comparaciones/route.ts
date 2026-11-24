import { requireAgent } from "@/server/agent";
import { handle } from "@/server/http";
import { saveMacComparison } from "@/server/mac-comparisons";

export async function POST(request: Request) {
  return handle(async () => {
    const { agentId } = await requireAgent(request);
    if (Number(request.headers.get("content-length")) > 3_000_000) return new Response(null, { status: 413 });
    await saveMacComparison(agentId, await request.json());
    return Response.json({ ok: true });
  }, { public: true });
}
