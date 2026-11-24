import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
// Módulo JS del agente, igual que las pruebas de agente-mac existentes.
import { publishPhone } from "../agente-mac/telefonos.mjs";

const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0)) await fs.rm(dir,{recursive:true,force:true});});
describe("publicación física en el agente",()=>{
 it.each([0,3])("ejecuta una sola vez sin simular y entrega el código %i",async(code)=>{
   const tmpDir=await fs.mkdtemp(path.join(os.tmpdir(),"phone-agent-test-"));dirs.push(tmpDir);
   const executions:{bin:string;args:string[];options:Record<string,unknown>}[]=[];
   const spawn=vi.fn((bin:string,args:string[],options:Record<string,unknown>)=>{
     executions.push({bin,args,options});
     const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()});
     queueMicrotask(()=>{child.stderr.emit("data",Buffer.from(code===3 ? "Bloqueo después de enviar" : ""));child.emit("close",code);});
     return child;
   });
   const calls:{route:string;body?:unknown}[]=[];
   const call=vi.fn(async(_config:unknown,_deps:unknown,_method:string,route:string,options?:{json?:unknown})=>{
     calls.push({route,body:options?.json});
     return route.endsWith("video-publicacion") ? new Response(new Uint8Array([0,0,0,1])) : new Response("{}");
   });
   let delivered:Record<string,unknown>={};
   const upload=vi.fn(async(_config:unknown,_deps:unknown,_task:unknown,file:string)=>{delivered=JSON.parse(await fs.readFile(file,"utf8"));return "ok";});
   const deps={fs,spawn,fetch:vi.fn(async()=>{throw new Error("Sin WDA en pruebas");})};
   await publishPhone({tmpDir,url:"https://principal.test",token:"secret"},deps,{taskId:4,uploadId:"u",phoneId:2,videoId:33,description:"Texto en alemán",network:"instagram",wdaUrl:"http://phone:8100"},call,upload);
   expect(executions).toHaveLength(1);
   expect(executions[0].bin).toBe("python3");
   expect(executions[0].args).toContain("-B");
   expect(executions[0].args).toContain("publicar_reel.py");
   expect(executions[0].args).not.toContain("--simular");
   expect(delivered).toMatchObject({ok:code===0,code});
   expect(calls.at(-1)).toMatchObject({route:"/api/agente/tareas/4/terminar",body:{ok:true,uploadId:"u"}});
 });
 it("no vuelve a ejecutar el publicador si falla la entrega del resultado",async()=>{
   const tmpDir=await fs.mkdtemp(path.join(os.tmpdir(),"phone-lost-test-"));dirs.push(tmpDir);
   const spawn=vi.fn(()=>{
     const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()});
     queueMicrotask(()=>child.emit("close",3));return child;
   });
   const call=vi.fn(async()=>new Response(new Uint8Array([0,0,0,1])));
   const upload=vi.fn(async()=>({error:"Sin red"}));
   await publishPhone({tmpDir,url:"https://principal.test"},{fs,spawn},{taskId:4,uploadId:"u",phoneId:2,description:"Texto",network:"facebook"},call,upload);
   expect(spawn).toHaveBeenCalledTimes(1);expect(upload).toHaveBeenCalledTimes(1);expect(call).toHaveBeenCalledTimes(1);
 });
});
