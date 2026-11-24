import { handle } from "@/server/http";
import { listPhones, savePhone } from "@/server/phones";
import { publicationsForPhone } from "@/server/videos/publications";
export async function GET() { return handle(async (user) => Response.json({ owner: user!.role === "dueno", phones: await Promise.all((await listPhones()).map(async (p) => ({ ...p, online: !!p.screenshotAt && Date.now() - p.screenshotAt.getTime() < 60_000, publications: await publicationsForPhone(p.id) }))) })); }
export async function POST(request: Request) { return handle(async (user) => Response.json(await savePhone(user!, null, await request.json()))); }
