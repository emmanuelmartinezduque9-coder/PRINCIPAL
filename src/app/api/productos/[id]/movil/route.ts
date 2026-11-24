import { handle } from "@/server/http";
import { setProductPhone } from "@/server/phones";
export async function PUT(request: Request, { params }: { params: Promise<{id: string}> }) { return handle(async (user) => { await setProductPhone(user!, Number((await params).id), await request.json()); return Response.json({ok:true}); }); }
