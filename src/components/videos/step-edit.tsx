"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Type } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { EditDownload, EditNotice, EditPlayer, SelfCheck, StartEditButton } from "./edit-parts";
import type { VideoViewJson } from "./labels";

/** Los dos rótulos del montaje (el principal y el CTA). Sirven para el siguiente «Montar». */
function EditTexts({ view }: { view: VideoViewJson }) {
  const client = useQueryClient();
  const saved = view.editTexts;
  const [main, setMain] = useState(saved.main);
  const [cta, setCta] = useState(saved.cta);
  const changed = main.trim() !== saved.main || cta.trim() !== saved.cta;
  const save = useMutation({
    mutationFn: () => api(`/api/videos/${view.video.id}/montaje/textos`, { method: "PUT", body: JSON.stringify({ main, cta }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["video", view.video.id] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
  });
  if (!saved.editable) return null;
  return (
    <form
      className="panel flex flex-col gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !save.isPending) save.mutate();
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Type className="size-4 text-muted-foreground" aria-hidden />
        Rótulos
      </h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rotulo-principal" className="text-xs text-muted-foreground">
          Principal
        </Label>
        <Input id="rotulo-principal" value={main} maxLength={200} onChange={(event) => setMain(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rotulo-cta" className="text-xs text-muted-foreground">
          CTA
        </Label>
        <Input id="rotulo-cta" value={cta} maxLength={200} onChange={(event) => setCta(event.target.value)} />
      </div>
      {changed ? (
        <Button type="submit" variant="outline" className="h-9 gap-1.5 self-start px-3" disabled={save.isPending || !main.trim() || !cta.trim()}>
          {save.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
          Guardar
        </Button>
      ) : null}
    </form>
  );
}

/** Paso «Montaje»: el vídeo montado en el Mac, su descarga, «Montar» / «Volver a montar» y sus rótulos. */
export function StepEdit({ view }: { view: VideoViewJson }) {
  const { video, edit } = view;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_340px] lg:gap-8">
      <div className="min-w-0">
        <EditPlayer videoId={video.id} edit={edit} className={edit.latest ? "ring-3 ring-success" : undefined} />
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Montaje">
        <EditNotice edit={edit} />
        <EditDownload videoId={video.id} edit={edit} />
        <StartEditButton videoId={video.id} edit={edit} />
        <SelfCheck edit={edit} />
        <EditTexts key={`${view.editTexts.main}|${view.editTexts.cta}`} view={view} />
      </aside>
    </div>
  );
}
