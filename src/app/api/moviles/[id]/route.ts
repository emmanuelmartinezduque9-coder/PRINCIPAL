import { handle } from "@/server/http";
import { savePhone } from "@/server/phones";
export async function PATCH(request: Request, { params }: { params: Promise<{id: string}> }) { return handle(async (user) => Response.json(await savePhone(user!, Number((await params).id), await request.json()))); }
