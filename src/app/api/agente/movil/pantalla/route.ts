import { handle } from "@/server/http";
import { requireAgent } from "@/server/agent";
import { listPhones } from "@/server/phones";
import { receiveScreen } from "@/server/phone-agent";
export async function GET(request: Request) { return handle(async () => { await requireAgent(request); return Response.json({phones: await listPhones()}); }, {public:true}); }
export async function POST(request: Request) { return handle(async () => { await requireAgent(request); await receiveScreen(await request.json()); return Response.json({ok:true}); }, {public:true}); }
