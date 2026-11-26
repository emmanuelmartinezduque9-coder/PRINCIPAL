"use client";

import { Loader2, RotateCcw, ThumbsDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Lo mismo que admite el servidor (`rejectRound`): una línea de hasta 300 caracteres. */
const MAX_REASON = 300;

/**
 * Botón que abre «¿Por qué no valen?» con una sola línea para el motivo (hace falta para
 * regenerar). Intro envía; el diálogo se cierra solo si el rechazo se guarda. Con `open` y
 * `onOpenChange` lo abre también quien lo usa (p. ej. con la tecla R en la revisión de un lote).
 */
export function RejectDialog({
  label,
  submitLabel = "Rechazar",
  redo = false,
  title,
  pending,
  onReject,
  open: controlledOpen,
  onOpenChange,
  className,
  hideTrigger = false,
}: {
  label: string;
  /** Sin botón propio: lo abre quien lo usa (`open`), p. ej. desde un menú. */
  hideTrigger?: boolean;
  submitLabel?: string;
  /** Rehacer a mano (no un rechazo): botón normal con la flecha de rehacer en vez del pulgar abajo. */
  redo?: boolean;
  title: string;
  pending: boolean;
  onReject: (reason: string) => Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [reason, setReason] = useState("");
  const id = useId();
  const text = reason.trim();
  // Intro dos veces seguidas (antes de que `pending` llegue) no rechaza dos veces.
  const sending = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text || pending || sending.current) return;
    sending.current = true;
    try {
      await onReject(text);
      setOpen(false);
      setReason("");
    } catch {
      // El aviso ya lo da quien rechaza; el diálogo sigue abierto con lo escrito.
    } finally {
      sending.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button variant="outline" className={className ?? "h-10 gap-2 px-4"}>
            {redo ? <RotateCcw data-icon="inline-start" /> : <ThumbsDown data-icon="inline-start" />}
            {label}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              <label htmlFor={id}>{title}</label>
            </DialogTitle>
          </DialogHeader>
          <Input
            id={id}
            autoFocus
            value={reason}
            maxLength={MAX_REASON}
            placeholder="Una línea"
            onChange={(event) => setReason(event.target.value.replace(/[\r\n]+/g, " "))}
            className="h-10"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-10 px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant={redo ? "default" : "destructive"} className="h-10 gap-2 px-4" disabled={!text || pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : redo ? <RotateCcw data-icon="inline-start" /> : <ThumbsDown data-icon="inline-start" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
