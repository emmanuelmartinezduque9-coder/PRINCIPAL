import { handle } from "@/server/http";
import { codeQueueMarkdown } from "@/server/videos/mejoras/reports";

/** La cola de arreglos de código pendientes, en Markdown, para el coordinador (chat PRINCIPAL LOCAL). Solo el dueño. */
export async function GET() {
  return handle(
    async (user) => new Response(await codeQueueMarkdown(user!), { headers: { "Content-Type": "text/markdown; charset=utf-8" } }),
    { role: "dueno" },
  );
}
