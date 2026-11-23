"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Download, FileVideo, FolderDown, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Un vídeo terminado tal como lo da `/api/lotes/[id]/editados`. */
interface EditFileJson {
  videoId: number;
  number: number;
  productId: number;
  account: string;
  fileName: string;
  size: number;
  url: string;
}

export const batchZipUrl = (batchId: number, productId?: number) =>
  `/api/lotes/${batchId}/editados?formato=zip${productId ? `&producto=${productId}` : ""}`;

/**
 * Descarga un archivo de la web sin salir de la pantalla: un `<iframe>` oculto que abre la ruta
 * (el servidor responde «adjunto» o redirige al enlace firmado del almacén). A diferencia de
 * `fetch`, sigue la redirección al almacén sin chocar con CORS.
 */
export function downloadInBackground(url: string): void {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  // Se quita cuando la descarga ya ha empezado.
  window.setTimeout(() => frame.remove(), 60_000);
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

/**
 * «Vídeos terminados» del lote: dónde se ven y se descargan los vídeos montados, para pasarlos al
 * iPhone por AirDrop. Todos en un ZIP (una carpeta por cuenta), los de una cuenta, o sueltos
 * uno a uno (mejor para AirDrop directo). Destacado cuando el lote ha terminado.
 */
export function FinishedDownloads({ batchId, editedCount, total, finished }: { batchId: number; editedCount: number; total: number; finished: boolean }) {
  const query = useQuery({
    queryKey: ["batch-edits", batchId, editedCount],
    queryFn: () => api<{ files: EditFileJson[] }>(`/api/lotes/${batchId}/editados`),
    enabled: editedCount > 0,
  });
  const [loose, setLoose] = useState<{ key: string; done: number; total: number } | null>(null);
  if (editedCount === 0) return null;
  const files = query.data?.files ?? [];
  const accounts = [...new Map(files.map((file) => [file.productId, file.account])).entries()].map(([id, name]) => ({
    id,
    name,
    files: files.filter((file) => file.productId === id),
  }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  /** Uno a uno: cada vídeo como archivo suelto, con su nombre, uno detrás de otro. */
  async function downloadLoose(key: string, list: EditFileJson[]) {
    if (loose) return;
    setLoose({ key, done: 0, total: list.length });
    for (const [i, file] of list.entries()) {
      downloadInBackground(file.url);
      setLoose({ key, done: i + 1, total: list.length });
      // Un respiro entre archivos para que el navegador no los junte ni los bloquee.
      await wait(1200);
    }
    setLoose(null);
    toast.success(list.length === 1 ? "Descarga lanzada." : `${list.length} descargas lanzadas. Si el navegador pregunta, permite varias descargas.`);
  }

  const looseLabel = (key: string, count: number) => (loose?.key === key ? `Descargando ${loose.done}/${loose.total}…` : count === 1 ? "1 archivo suelto" : `${count} archivos sueltos`);

  return (
    <section
      aria-labelledby="terminados"
      className={cn("flex flex-col gap-4 rounded-xl p-4 ring-1 sm:p-5", finished ? "bg-success/10 ring-success/30" : "bg-muted/40 ring-foreground/10")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CircleCheck className={cn("mt-0.5 size-5 shrink-0", finished ? "text-success" : "text-muted-foreground")} aria-hidden />
          <div className="min-w-0">
            <h2 id="terminados" className="text-base font-semibold">
              Vídeos terminados · {editedCount} de {total}
            </h2>
            <p className="text-sm text-muted-foreground">
              {finished ? "El lote ha terminado." : "Se van añadiendo según se montan."} Descárgalos para pasarlos al iPhone por AirDrop.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={batchZipUrl(batchId)} download className={cn(buttonVariants({ size: "lg" }), "h-10 gap-2 px-5")}>
            <FolderDown data-icon="inline-start" />
            Descargar todos (ZIP{totalSize ? ` · ${mb(totalSize)}` : ""})
          </a>
          <Button variant="outline" className="h-10 gap-2 px-4" disabled={loose !== null || files.length === 0} onClick={() => void downloadLoose("todos", files)}>
            {loose?.key === "todos" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {looseLabel("todos", files.length || editedCount)}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando los vídeos…</p>
      ) : accounts.length > 0 ? (
        <ul className="flex flex-col divide-y divide-foreground/10 rounded-lg bg-background ring-1 ring-foreground/10">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {account.name} <span className="font-normal text-muted-foreground">· {account.files.length === 1 ? "1 vídeo" : `${account.files.length} vídeos`}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {accounts.length > 1 ? (
                    <a href={batchZipUrl(batchId, account.id)} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                      <FolderDown data-icon="inline-start" />
                      ZIP de {account.name}
                    </a>
                  ) : null}
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={loose !== null} onClick={() => void downloadLoose(`p${account.id}`, account.files)}>
                    {loose?.key === `p${account.id}` ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
                    {loose?.key === `p${account.id}` ? looseLabel(`p${account.id}`, account.files.length) : "Sueltos"}
                  </Button>
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {account.files.map((file) => (
                  <li key={file.videoId}>
                    <a
                      href={file.url}
                      download
                      title={`Descargar «${file.fileName}»`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs tabular-nums hover:bg-muted/70"
                    >
                      <FileVideo className="size-3.5" aria-hidden />
                      {file.fileName.replace(/\.mp4$/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Para el iPhone: abre el ZIP con doble clic (sale una carpeta con los vídeos, una por cuenta), selecciónalos y AirDrop. Con «sueltos», los vídeos
        llegan directamente a Descargas.
      </p>
    </section>
  );
}
