// Publicación física: nunca se repite un envío, aunque se pierda la respuesta de la web.
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const busy = new Set();
const baseDir = path.dirname(fileURLToPath(import.meta.url));
function command(deps, bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = deps.spawn(bin, args, { ...options, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "";
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }, options.timeout ?? 15 * 60_000);
    child.stdout.on("data", (data) => { output = (output + data).slice(-8000); });
    child.stderr.on("data", (data) => { output = (output + data).slice(-8000); });
    child.once("error", (error) => {clearTimeout(timer); reject(error);});
    child.once("close", (code) => {clearTimeout(timer); resolve({code:code ?? -1, output});});
  });
}
export async function publishPhone(config, deps, task, call, upload) {
  const dir = await deps.fs.mkdtemp(path.join(config.tmpDir ?? os.tmpdir(), "principal-phone-"));
  busy.add(task.phoneId);
  let leaseLost = false;
  const beat = setInterval(() => void call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).then((r) => {if(!r.ok) leaseLost=true;},()=>{leaseLost=true;}),60_000);
  let outcome = {ok:false,code:-1,error:"No se pudo preparar la publicación."};
  try {
    const route = `/api/agente/tareas/${task.taskId}/video-publicacion`;
    // Solo se manda la ficha a la web, nunca a WDA ni a una dirección del resultado.
    const response = await call(config, deps, "GET", route, {timeout:120_000});
    if (!response.ok || !response.body) throw new Error("No se pudo descargar el montaje.");
    const video = path.join(dir,"video.mp4");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(video, {mode:0o600}));
    const description = path.join(dir,"descripcion.txt");
    await deps.fs.writeFile(description, task.description, {mode:0o600});
    if (leaseLost) throw new Error("Se perdió la reserva antes de publicar.");
    const scriptDir = path.resolve(process.env.PRINCIPAL_MOVIL_DIR || config.movilDir || path.join(baseDir,"movil"));
    const args = ["-B", "publicar_reel.py",video,"--texto",description,"--app",task.network,"--salida",dir];
    if (task.wdaUrl) args.push("--wda",task.wdaUrl);
    const result = await command(deps,"python3",args,{cwd:scriptDir,env:{...process.env,PRINCIPAL_AGENTE_TOKEN:""}});
    outcome = {ok:result.code===0, code:result.code, ...(result.code===0 ? {} : {error:result.output.trim().slice(-1800) || "No se pudo publicar."})};
    if(result.code === 0) {
      try {
        const screen=await deps.fetch(new URL("/screenshot",task.wdaUrl || process.env.WDA_URL || "http://192.168.1.139:8100"),{signal:AbortSignal.timeout(5000)});
        const raw=await screen.json();
        if(screen.ok && typeof raw.value === "string") await deps.fs.writeFile(path.join(dir,"final.png"),Buffer.from(raw.value,"base64"));
      } catch { /* Se conserva la captura que haya dejado el publicador. */ }
    }
    const files = (await deps.fs.readdir(dir)).filter((f)=>f.endsWith(".png"));
    const capture = files.find((f)=>f.startsWith("bloqueo-")) ?? (files.includes("final.png") ? "final.png" : files.at(-1));
    if (capture) {
      // ffmpeg reduce también los PNG grandes antes de subirlos.
      const resized = path.join(dir,"captura.png");
      const converted = await command(deps,"ffmpeg",["-y","-i",path.join(dir,capture),"-vf","scale=480:-1","-frames:v","1",resized],{timeout:20_000});
      const bytes = await deps.fs.readFile(converted.code===0 ? resized : path.join(dir,capture));
      if(bytes.length < 2_500_000) outcome.screenshot=bytes.toString("base64");
    }
    // El publicador actual no siempre devuelve enlace; si aparece uno directo, se conserva.
    const link = result.output.match(/https:\/\/(?:www\.)?(?:instagram\.com|facebook\.com)\/(?:reel|reels|p)\/[^\s"'<>]+/);
    if (link) outcome.resultUrl=link[0];
  } catch(error) { outcome={ok:false,code:-1,error:error instanceof Error ? error.message : "Publicación interrumpida."}; }
  try {
    const file=path.join(dir,"resultado.json");
    await deps.fs.writeFile(file,JSON.stringify(outcome));
    const size=(await deps.fs.stat(file)).size;
    const sent=await upload(config,deps,task,file,size);
    if(sent === "ok") await call(config,deps,"POST",`/api/agente/tareas/${task.taskId}/terminar`,{json:{ok:true,uploadId:task.uploadId,totalBytes:size}});
    // Un fallo de entrega deja caducar la reserva. Jamás vuelve a ejecutar publicar_reel.py.
  } finally {
    clearInterval(beat);busy.delete(task.phoneId);
    await deps.fs.rm(dir,{recursive:true,force:true});
  }
  return outcome.ok ? "done" : "failed";
}
export async function phoneScreens(config,deps,call) {
  for (;;) {
    try {
      const response=await call(config,deps,"GET","/api/agente/movil/pantalla");
      const data=response.ok ? await response.json() : null;
      await Promise.all((data?.phones ?? []).filter(p=>p.wdaUrl && !busy.has(p.id) && !p.activity?.startsWith("Publicando vídeo")).map(async(phone)=>{
        let activity="Esperando", screenshot;
        let dir;
        try {
          const wda=await deps.fetch(new URL("/screenshot",phone.wdaUrl),{signal:AbortSignal.timeout(3500)});
          if(!wda.ok) throw new Error("WDA");
          const raw=await wda.json();
          dir=await deps.fs.mkdtemp(path.join(os.tmpdir(),"principal-screen-"));
          await deps.fs.writeFile(path.join(dir,"screen.png"),Buffer.from(raw.value,"base64"));
          const converted=await command(deps,"ffmpeg",["-y","-i",path.join(dir,"screen.png"),"-vf","scale=360:-1","-q:v","5","-frames:v","1",path.join(dir,"screen.jpg")],{timeout:4000});
          if(converted.code!==0) throw new Error("Captura");
          screenshot=(await deps.fs.readFile(path.join(dir,"screen.jpg"))).toString("base64");
        } catch {activity="Sin conexión con el móvil";}
        finally {if(dir) await deps.fs.rm(dir,{recursive:true,force:true});}
        if(!busy.has(phone.id)) await call(config,deps,"POST","/api/agente/movil/pantalla",{json:{phoneId:phone.id,activity,screenshot}}).catch(()=>{});
      }));
    } catch { /* La siguiente pasada vuelve a consultar. */ }
    await deps.sleep(5000);
  }
}
