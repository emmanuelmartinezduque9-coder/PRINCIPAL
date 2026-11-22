"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileQuestion, FolderInput, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { runPool } from "@/components/batches/run-pool";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { findManifest, importForm, planImport, SONGS_KEY, type ImportItem, type ImportPlan, type PackageSong } from "./labels";

interface Run {
  total: number;
  done: number;
  created: number;
  repeated: number;
  failed: Array<{ label: string; error: string }>;
  missing: string[];
  finished: boolean;
}

async function uploadOne(item: ImportItem): Promise<boolean> {
  const response = await fetch("/api/canciones", { method: "POST", body: importForm(item) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "No se pudo subir.");
  return body.created === true;
}

const AUDIO_FILE = /\.(mp3|m4a|wav)$/i;

/**
 * «Importar carpeta» (el paquete con `canciones.json` y sus archivos) y «Subir» (canciones
 * sueltas, con el nombre del archivo como título). Sube de 2 en 2 y al terminar dice cuántas
 * entraron, cuántas ya estaban, cuáles fallaron y cuáles no tenían archivo.
 */
export function ImportSongs() {
  const client = useQueryClient();
  const folder = useRef<HTMLInputElement>(null);
  const loose = useRef<HTMLInputElement>(null);
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    // `webkitdirectory` no está en los tipos de React: se pone a mano.
    folder.current?.setAttribute("webkitdirectory", "");
    folder.current?.setAttribute("directory", "");
  }, []);

  async function start(plan: ImportPlan) {
    if (plan.items.length === 0 && plan.missing.length === 0) return;
    const state: Run = { total: plan.items.length, done: 0, created: 0, repeated: 0, failed: [], missing: plan.missing, finished: false };
    setRun({ ...state });
    await runPool(plan.items, 2, async (item) => {
      try {
        if (await uploadOne(item)) state.created += 1;
        else state.repeated += 1;
      } catch (error) {
        state.failed.push({ label: item.label, error: error instanceof Error ? error.message : "No se pudo subir." });
      }
      state.done += 1;
      setRun({ ...state, failed: [...state.failed] });
    });
    setRun({ ...state, failed: [...state.failed], finished: true });
    void client.invalidateQueries({ queryKey: SONGS_KEY });
  }

  async function fromFolder(files: File[]) {
    const manifest = findManifest(files);
    if (!manifest) {
      toast.error("No hay canciones.json en esa carpeta.");
      return;
    }
    let data: { songs?: PackageSong[] };
    try {
      data = JSON.parse(await manifest.text());
    } catch {
      toast.error("canciones.json no se puede leer.");
      return;
    }
    await start(planImport(files, manifest, data));
  }

  function fromFiles(files: File[]) {
    const items = files
      .filter((file) => AUDIO_FILE.test(file.name))
      .map((file, i): ImportItem => {
        const title = file.name.replace(AUDIO_FILE, "").trim() || file.name;
        return { key: `${i}-${file.name}`, label: title, file, fields: { titulo: title.slice(0, 200) } };
      });
    if (items.length < files.length) toast.error("Solo MP3, M4A o WAV.");
    void start({ items, missing: [] });
  }

  const busy = run !== null && !run.finished;
  return (
    <>
      <input
        ref={folder}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void fromFolder(files);
        }}
      />
      <input
        ref={loose}
        type="file"
        multiple
        accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) fromFiles(files);
        }}
      />
      <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={busy} onClick={() => loose.current?.click()}>
        <Upload data-icon="inline-start" />
        Subir
      </Button>
      <Button className="h-9 gap-1.5 px-3" disabled={busy} onClick={() => folder.current?.click()}>
        {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FolderInput data-icon="inline-start" />}
        Importar carpeta
      </Button>

      <Dialog open={run !== null} onOpenChange={(open) => !open && !busy && setRun(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy} onInteractOutside={(event) => busy && event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{busy ? "Importando…" : "Importación"}</DialogTitle>
          </DialogHeader>
          {run ? (
            <div className="flex flex-col gap-4">
              {run.total > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Progress value={(run.done / run.total) * 100} aria-label="Progreso" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {run.done}/{run.total}
                  </span>
                </div>
              ) : null}
              <p className="text-sm font-medium tabular-nums" role="status">
                {run.created} importadas · {run.repeated} repetidas · {run.failed.length} {run.failed.length === 1 ? "fallo" : "fallos"}
              </p>
              {run.failed.length > 0 ? (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
                  {run.failed.map((fail) => (
                    <li key={fail.label} className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                      <span className="min-w-0">
                        <span className="font-medium">{fail.label}</span>
                        <span className="text-muted-foreground"> · {fail.error}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {run.missing.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <FileQuestion className="size-4 text-muted-foreground" aria-hidden />
                    Sin archivo ({run.missing.length})
                  </span>
                  <ul className="flex max-h-32 flex-col overflow-y-auto text-sm text-muted-foreground">
                    {run.missing.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {run?.finished ? (
            <DialogFooter>
              <Button onClick={() => setRun(null)}>Listo</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
