import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { approveEdit, rejectEdit, sweepPublications } from "@/server/videos/publications";
import { savePhone, setProductPhone } from "@/server/phones";
import { createVideo, getVideoFor } from "@/server/videos/videos";
import { saveEdit } from "@/server/videos/edits";
import { appendTaskChunk, claimTask, createAgentToken, expireLeases, finishTask } from "@/server/agent";
import { requestEditChange } from "@/server/videos/cambio-montaje";

const mocks=vi.hoisted(()=>({call:vi.fn(), change:vi.fn()}));
vi.mock("@/llm/gateway",async(importOriginal)=>({...await importOriginal<object>(),getGateway:()=>({call:mocks.call})}));
vi.mock("@/server/videos/cambio-montaje",async(importOriginal)=>({...await importOriginal<object>(),requestEditChange:mocks.change}));
beforeEach(async()=>{await truncateAll();mocks.call.mockReset();mocks.change.mockReset();mocks.call.mockResolvedValue({data:{text:"SofaLeiste macht deinen Alltag leichter.\nKommentiere Sofa!\n#sofa #wohnen #wohnzimmer #ordnung #zuhause"}});mocks.change.mockResolvedValue({runId:1,reportId:1});});
async function fixture(delegated=true) {
 const user=await makeUser("dueno");
 const product=await makeProduct(user,{name:"SofaLeiste"});
 const [phone]=await savePhone(user,null,{name:"iPhone 1"});
 if(delegated) await setProductPhone(user,product.id,{phoneId:phone.id,instagramAccount:"sofaleiste",facebookAccount:null});
 const video=await createVideo(user,product.id,{});
 // saveEdit únicamente marca el montaje que sigue siendo el del vídeo.
 const [run]=await getDb().insert(schema.editRuns).values({videoId:video.id,spec:{},requestedBy:user.id,status:"done"}).returning();
 await getDb().update(schema.videos).set({editRunId:run.id}).where(eq(schema.videos.id,video.id));
 await getDb().transaction(tx=>saveEdit(tx,{videoId:video.id,runId:run.id,size:4,bytes:Buffer.from("mp4!"),storageKey:null,durationMs:1000,selfCheck:null}));
 return {user,product,phone,video,run};
}
describe("productos delegados al móvil",()=>{
 it("solo los delegados esperan revisión al terminar el montaje",async()=>{
   const f=await fixture(false);
   expect((await getVideoFor(f.user,f.video.id)).editReview).toBeNull();
   await setProductPhone(f.user,f.product.id,{phoneId:f.phone.id,instagramAccount:null,facebookAccount:null});
   await getDb().transaction(tx=>saveEdit(tx,{videoId:f.video.id,runId:f.run.id,size:4,bytes:Buffer.from("mp4!"),storageKey:null,durationMs:1000,selfCheck:null}));
   expect((await getVideoFor(f.user,f.video.id)).editReview).toBe("pendiente");
 });
 it("aprobar crea IG y Facebook una sola vez con descripción sin marcas ajenas",async()=>{
   const f=await fixture();await approveEdit(f.user,f.video.id);await approveEdit(f.user,f.video.id);
   const pubs=await getDb().select().from(schema.publications);
   expect(pubs).toHaveLength(2);expect(pubs.map(p=>p.network).sort()).toEqual(["facebook","instagram"]);
   expect(pubs.every(p=>p.description.includes("#sofa") && !/ikea|amazon|target/i.test(p.description))).toBe(true);
   expect(mocks.call.mock.calls[0][0].instructions).not.toContain("No nombres marcas ajenas");
   expect(mocks.call.mock.calls[0][0].tier).toBe("small");
 });
 it("rechazar guarda el motivo y pide el cambio; el remontaje vuelve a pendiente",async()=>{
   const f=await fixture();await rejectEdit(f.user,f.video.id,"Quita el emoji");
   expect(requestEditChange).toHaveBeenCalledWith(f.user,f.video.id,"Quita el emoji");
   expect(await getVideoFor(f.user,f.video.id)).toMatchObject({editReview:"rechazado",editReviewReason:"Quita el emoji"});
   await getDb().transaction(tx=>saveEdit(tx,{videoId:f.video.id,runId:f.run.id,size:4,bytes:Buffer.from("mp4!"),storageKey:null,durationMs:1000,selfCheck:null}));
   expect(await getVideoFor(f.user,f.video.id)).toMatchObject({editReview:"pendiente",editReviewReason:null});
 });
 it("pausado no crea tareas y un fallo entregado no se repite",async()=>{
   const f=await fixture();const {agentId}=await createAgentToken(f.user,"Mac");
   await approveEdit(f.user,f.video.id);
   await savePhone(f.user,f.phone.id,{paused:true});await sweepPublications(new Date("2026-11-30"));
   expect(await getDb().select().from(schema.agentTasks)).toHaveLength(0);
   await savePhone(f.user,f.phone.id,{paused:false});await sweepPublications(new Date("2026-11-30"));
   const task=await claimTask(agentId,new Date(),{can:["movil"]});
   expect(task?.kind).toBe("phone_publish");
   const bytes=Buffer.from(JSON.stringify({ok:false,code:3,error:"Bloqueo después de enviar"}));
   await appendTaskChunk(agentId,task!.taskId,task!.uploadId,0,bytes);
   await finishTask(agentId,task!.taskId,{ok:true,uploadId:task!.uploadId,totalBytes:bytes.length});
   const [failed]=await getDb().select().from(schema.publications).where(eq(schema.publications.agentTaskId,task!.taskId));
   expect(failed.status).toBe("fallida");
   await expireLeases(new Date("2026-12-01"));await sweepPublications(new Date("2026-12-01"));
   const tasks=await getDb().select().from(schema.agentTasks);
   expect(tasks.filter(t=>t.id===task!.taskId)).toMatchObject([{status:"failed",attempts:1}]);
 });
 it("una reserva perdida queda fallida sin volver a la cola",async()=>{
   const f=await fixture();const {agentId}=await createAgentToken(f.user,"Mac");
   await approveEdit(f.user,f.video.id);await sweepPublications();
   const task=await claimTask(agentId,new Date(),{can:["movil"]});
   await expireLeases(new Date(Date.now()+6*60_000));
   const [row]=await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.id,task!.taskId));
   expect(row.status).toBe("failed");expect(row.attempts).toBe(1);
 });
});
