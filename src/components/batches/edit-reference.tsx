"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard, CircleAlert, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { linkLabel, parsePastedLinks } from "@/lib/links";
import { cn } from "@/lib/utils";
import type { BatchSummaryJson, BatchViewJson } from "./labels";

/**
 * ¿El servidor guarda ya la «Edición de referencia» (`editReferenceUrl` en los vídeos)? Se mira en
 * el tablero de un lote cualquiera: mientras el campo no exista, el control no se enseña (nada de
 * botones que no hacen nada).
 */
export function useEditReferenceSupport(): boolean {
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api<{ batches: BatchSummaryJson[] }>("/api/lotes") });
  const first = batches.data?.batches.find((batch) => batch.videos > 0)?.id ?? null;
  const view = useQuery({
    queryKey: ["batch", first],
    queryFn: () => api<BatchViewJson>(`/api/lotes/${first}`),
    enabled: first !== null,
  });
  return rowSupportsEditReference(view.data?.rows[0]);
}

/** La fila trae el campo `editReferenceUrl` (aunque esté vacío). */
export const rowSupportsEditReference = (row: object | undefined): boolean => row !== undefined && "editReferenceUrl" in row;

/** Comprueba un enlace como al pegarlo: uno solo y de un sitio admitido. */
export function checkLink(text: string): { url: string } | { error: string } {
  const parsed = parsePastedLinks(text);
  if (parsed.links.length === 1 && parsed.invalid.length === 0) return { url: parsed.links[0] };
  if (parsed.links.length > 1) return { error: "Solo un enlace." };
  return { error: "No es un enlace de Instagram, TikTok, YouTube o Facebook" };
}

/**
 * «Edición de referencia»: un icono pequeño que se despliega en un campo para pegar el enlace del
 * vídeo cuya edición se copia. Con enlace, el icono va en color de marca.
 */
export function EditReferenceButton({ value, open, onOpenChange }: { value: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const label = value ? `Edición de referencia: ${linkLabel(value).host}` : "Edición de referencia";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={cn("size-8 text-muted-foreground", value && "bg-brand/10 text-brand-ink hover:bg-brand/15 hover:text-brand-ink")}
        >
          <Clapperboard aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** El campo desplegado: se valida como al pegar; vacío, se quita. */
export function EditReferenceField({
  value,
  onSave,
  onClose,
  className,
}: {
  value: string;
  onSave: (url: string | null) => void | Promise<void>;
  onClose: () => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const done = useRef(false);
  async function commit() {
    if (done.current) return;
    if (!text.trim()) {
      done.current = true;
      await onSave(null);
      onClose();
      return;
    }
    const checked = checkLink(text);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    done.current = true;
    await onSave(checked.url);
    onClose();
  }
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-ink">
          <Clapperboard className="size-4" aria-hidden />
        </span>
        <Input
          autoFocus
          aria-label="Enlace del vídeo cuya edición se copia"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? id : undefined}
          placeholder="Edición de referencia · enlace"
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            } else if (event.key === "Escape") onClose();
          }}
          onBlur={() => void commit()}
          className="h-8 flex-1"
        />
        {value ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Quitar la edición de referencia"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              void onSave(null);
              onClose();
            }}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={id} role="alert" className="flex items-center gap-1.5 pl-10 text-xs text-destructive">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
