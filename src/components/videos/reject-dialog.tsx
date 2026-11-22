"use client";

import { Loader2, ThumbsDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Lo mismo que admite el servidor (`rejectRound`): una línea de hasta 300 caracteres. */
const MAX_REASON = 300;

/**
 * Botón que abre «¿Por qué no valen?» con una sola línea para el motivo (hace falta para
 * regenerar). Intro envía; el diálogo se cierra solo si el rechazo se guarda.
 */
export function RejectDialog({
  label,
  title,
  pending,
  onReject,
}: {
  label: string;
  title: string;
  pending: boolean;
  onReject: (reason: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
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
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 px-4">
          <ThumbsDown data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
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
            <Button type="submit" variant="destructive" className="h-10 gap-2 px-4" disabled={!text || pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsDown data-icon="inline-start" />}
              Rechazar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
