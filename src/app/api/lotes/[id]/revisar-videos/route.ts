import { handle } from "@/server/http";
import { approveEdits, reviewBatch } from "@/server/videos/publications";
export async function GET(_request: Request, { params }: { params: Promise<{id: string}> }) { return handle(async (user) => Response.json({ videos: await reviewBatch(user!, Number((await params).id)) })); }
export async function POST(_request: Request, { params }: { params: Promise<{id: string}> }) { return handle(async (user) => { await approveEdits(user!, Number((await params).id)); return Response.json({ok:true}); }); }
