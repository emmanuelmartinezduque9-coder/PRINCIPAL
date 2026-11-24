import { handle, HttpError } from "@/server/http";
import { approveEdit, rejectEdit } from "@/server/videos/publications";
export async function POST(request: Request, { params }: { params: Promise<{videoId: string}> }) { return handle(async (user) => {
 const body = await request.json(); const id = Number((await params).videoId);
 if (body.action === "approve") await approveEdit(user!, id);
 else if (body.action === "reject" && typeof body.reason === "string") await rejectEdit(user!, id, body.reason);
 else throw new HttpError(400, "Revisión no válida.");
 return Response.json({ok:true});
}); }
