"use client";

import { Flag, ImagePlus, Loader2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/videos/dictate-button";
import { ApiError } from "@/lib/api";
import { MAX_REPORT_CHARS, MAX_SCREENSHOT_BYTES, type ReportStage } from "@/lib/mejoras";
import { cn } from "@/lib/utils";

/** A qué va ligado el reporte. Lo que falte lo completa el servidor (p. ej. la última ronda o montaje). */
export interface ReportTarget {
  stage: ReportStage;
  videoId?: number | null;
  generationId?: number | null;
  resultId?: number | null;
  editId?: number | null;
  batchId?: number | null;
}

/**
 * «Reportar un problema»: botón discreto que abre un texto libre (también dictado) y una captura
 * opcional (elegir archivo o pegarla con Cmd+V). Lo clasifica Claude solo y se sigue en «Mejoras».
 */
export function ReportButton({ target, className, label = "Reportar un problema", compact = false }: { target: ReportTarget; className?: string; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const pathname = usePathname();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(file: File | null | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast.error("La captura tiene que ser una imagen (PNG, JPEG o WebP).");
    if (file.size > MAX_SCREENSHOT_BYTES) return toast.error("La captura pesa demasiado (máx. 4 MB).");
    setShot(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("stage", target.stage);
      form.set("body", text);
      form.set("page", pathname ?? "");
      for (const key of ["videoId", "generationId", "resultId", "editId", "batchId"] as const) {
        const value = target[key];
        if (value) form.set(key, String(value));
      }
      if (shot) form.set("captura", shot);
      const response = await fetch("/api/mejoras", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(data?.error ?? "No se pudo enviar.", response.status);
      toast.success("Reporte enviado. Puedes seguirlo en «Mejoras».");
      setBody("");
      setShot(null);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground", className)}
          aria-label={compact ? label : undefined}
          title={compact ? label : undefined}
        >
          <Flag className="size-3.5" aria-hidden />
          {compact ? null : label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={submit}
          className="flex flex-col gap-4"
          onPaste={(event) => {
            const file = [...event.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (file) {
              event.preventDefault();
              pickFile(file);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <label htmlFor={id}>¿Qué ha pasado?</label>
            </DialogTitle>
            <DialogDescription>Cuéntalo con tus palabras. Se guarda con este {target.stage === "pantalla" ? "punto de la web" : target.stage} y su versión.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Textarea
              id={id}
              autoFocus
              value={body}
              maxLength={MAX_REPORT_CHARS}
              placeholder="Ej.: el vídeo ha salido sin audio"
              onChange={(event) => setBody(event.target.value)}
              className="min-h-28 pr-10"
            />
            <DictateButton iconOnly className="absolute top-1.5 right-1.5" onText={(text) => setBody((prev) => (prev ? `${prev} ${text}` : text))} />
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => pickFile(event.target.files?.[0])} />
            {shot ? (
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{shot.name || "Captura pegada"}</span>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Quitar la captura" onClick={() => setShot(null)}>
                  <X className="size-3.5" />
                </Button>
              </span>
            ) : (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
                Añadir captura (opcional)
              </Button>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-10 px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="h-10 gap-2 px-4" disabled={!body.trim() || sending}>
              {sending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Flag data-icon="inline-start" />}
              Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
