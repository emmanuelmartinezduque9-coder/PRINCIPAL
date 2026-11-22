"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { onRadioKeyDown, radioTabIndex } from "@/components/videos/radio-keys";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const KEY = ["ajustes", "modelo-imagen"];

interface ImageModels {
  model: string;
  models: Array<{ id: string; name: string }>;
}

/** Solo el dueño: con qué modelo se hace la imagen inicial de los vídeos (los que acepta el servidor). Se guarda al elegir. */
export function ImageModelCard() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api<ImageModels>("/api/ajustes/modelo-imagen") });
  const save = useMutation({
    mutationFn: (model: string) => api<{ model: string }>("/api/ajustes/modelo-imagen", { method: "PUT", body: JSON.stringify({ model }) }),
    onMutate: (model) => {
      client.setQueryData<ImageModels>(KEY, (data) => (data ? { ...data, model } : data));
    },
    onSuccess: () => toast.success("Modelo de imagen guardado."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }),
  });
  const data = query.data;
  const selected = data ? data.models.findIndex((m) => m.id === data.model) : -1;
  const choose = (model: string) => {
    if (model !== data?.model) save.mutate(model);
  };

  return (
    <Panel title="Modelo de imagen">
      {query.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !data ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm">No se pudo leer el modelo. Recarga la página.</p>
      ) : (
        <div role="radiogroup" aria-label="Modelo de imagen" className="grid gap-2 sm:grid-cols-2">
          {data.models.map((model, index) => {
            const on = index === selected;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={radioTabIndex(index, selected)}
                onClick={() => choose(model.id)}
                onKeyDown={(event) => onRadioKeyDown(event, (next) => choose(data.models[next].id))}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "border-foreground/80 bg-background font-semibold shadow-[0_1px_6px_-2px_rgb(0_0_0/0.12)]" : "hover:bg-muted/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    on ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  {on ? <Check className="size-4" /> : <ImageIcon className="size-4" />}
                </span>
                <span className="flex flex-col">
                  {model.name}
                  <span className="text-xs font-normal text-muted-foreground">2K · 9:16</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
