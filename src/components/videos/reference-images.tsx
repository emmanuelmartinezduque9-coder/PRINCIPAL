"use client";

import { ImagePlus, Images, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MAX_REFERENCE_IMAGES,
  REFERENCE_ROLE_LABELS,
  REFERENCE_ROLES,
  referenceThumbUrl,
  type ReferenceImage,
  type ReferenceRole,
} from "@/lib/reference-images";

/**
 * Imágenes de referencia subidas a mano (orden del dueño, 24/11/2026): varias, cada una con su
 * papel. Cada imagen se sube al soltarla (`/api/referencias`) y aquí solo se guarda su huella y su
 * papel, así viajan con el borrador, «Duplicar» y el grupo. Un fondo a mano manda: la imagen no
 * elige sala del banco.
 */

const MAX_BYTES = 20 * 1024 * 1024;

/** Sube las imágenes elegidas o soltadas, una detrás de otra; devuelve las que se subieron. */
async function upload(files: File[]): Promise<ReferenceImage[]> {
  const out: ReferenceImage[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      toast.error(`${file.name}: solo imágenes.`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name}: pesa más de 20 MB.`);
      continue;
    }
    try {
      const { sha256 } = await api<{ sha256: string }>("/api/referencias", { method: "POST", body: file, headers: { "Content-Type": file.type } });
      out.push({ sha256, role: "fondo" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${file.name}: no se pudo subir.`);
    }
  }
  return out;
}

/**
 * La lista con miniaturas, el papel de cada una y «Añadir» (elegir o arrastrar varias). `inherited`:
 * las del grupo, que usa la tarjeta mientras no tenga las suyas (se ven atenuadas).
 */
export function ReferenceImagesField({
  value,
  onChange,
  inherited = [],
  disabled = false,
  compact = false,
}: {
  value: ReferenceImage[];
  onChange: (next: ReferenceImage[]) => void;
  inherited?: ReferenceImage[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const shown = value.length > 0 ? value : inherited;
  const fromGroup = value.length === 0 && inherited.length > 0;

  async function add(files: File[]) {
    if (disabled || files.length === 0) return;
    const room = MAX_REFERENCE_IMAGES - value.length;
    if (room <= 0) {
      toast.error(`Como mucho ${MAX_REFERENCE_IMAGES} imágenes de referencia.`);
      return;
    }
    setBusy(true);
    try {
      const added = await upload(files.slice(0, room));
      if (added.length > 0) onChange([...value, ...added.filter((ref) => !value.some((v) => v.sha256 === ref.sha256))]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 rounded-lg", over && "ring-2 ring-brand/50")}
      onDragOver={(event) => {
        if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        void add(Array.from(event.dataTransfer.files));
      }}
    >
      {shown.map((ref, i) => (
        <div key={ref.sha256} className={cn("flex items-center gap-1.5 rounded-md border bg-card p-1", fromGroup && "opacity-60")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por la web */}
          <img src={referenceThumbUrl(ref.sha256)} alt={REFERENCE_ROLE_LABELS[ref.role]} className={cn("w-auto rounded object-cover", compact ? "h-9" : "h-12")} loading="lazy" />
          {fromGroup ? (
            <span className="pr-1 text-xs text-muted-foreground">{REFERENCE_ROLE_LABELS[ref.role]} · del grupo</span>
          ) : (
            <>
              <Select
                value={ref.role}
                disabled={disabled}
                onValueChange={(role) => onChange(value.map((v, j) => (j === i ? { ...v, role: role as ReferenceRole } : v)))}
              >
                <SelectTrigger size="sm" className="h-7 w-auto gap-1 px-2 text-xs" aria-label="Para qué es esta imagen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {REFERENCE_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground"
                aria-label="Quitar imagen de referencia"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X aria-hidden />
              </Button>
            </>
          )}
        </div>
      ))}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-dashed text-muted-foreground"
            disabled={disabled || busy || value.length >= MAX_REFERENCE_IMAGES}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {shown.length === 0 ? "Imágenes de referencia" : "Añadir"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Elige o arrastra imágenes (un fondo, ambiente, ropa…). Un fondo subido aquí manda sobre el banco.</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Botón compacto para la fila de la tarjeta: abre o cierra el campo; en color si hay imágenes. */
export function ReferenceImagesButton({
  count,
  inherited,
  open,
  onOpenChange,
}: {
  count: number;
  inherited: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const label = count > 0 ? `Imágenes de referencia: ${count}` : inherited > 0 ? `Imágenes de referencia del grupo: ${inherited}` : "Imágenes de referencia";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", count > 0 ? "text-brand" : inherited > 0 ? "text-brand/60" : "text-muted-foreground")}
          aria-label={label}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Images aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
