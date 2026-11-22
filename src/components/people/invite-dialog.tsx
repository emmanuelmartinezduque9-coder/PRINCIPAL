"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Copy, Loader2, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/**
 * Invitar a una persona. El enlace (con su token de un solo uso) se enseña aquí una vez y solo
 * vive en el estado de este componente: al cerrar el cuadro desaparece.
 */
export function InviteDialog() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkField = useRef<HTMLInputElement>(null);

  const [confirmClose, setConfirmClose] = useState(false);

  /** Cerrar con el enlace a la vista y sin copiar pide confirmación: no se puede volver a ver. */
  function requestClose() {
    if (link && !copied) setConfirmClose(true);
    else reset(false);
  }

  function reset(next: boolean) {
    setOpen(next);
    setConfirmClose(false);
    if (!next) {
      setName("");
      setEmail("");
      setError(null);
      setLink(null);
      setCopied(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ link: string }>("/api/personas", {
        method: "POST",
        body: JSON.stringify({ name, email }),
      });
      setLink(result.link);
      await client.invalidateQueries({ queryKey: ["people"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la invitación.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link ?? "");
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles: se deja el enlace elegido para copiarlo a mano.
      linkField.current?.select();
      setError("No se pudo copiar solo. El enlace está seleccionado: cópialo con el menú de tu móvil.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset(true) : requestClose())}>
      <DialogTrigger asChild>
        <Button className="h-10 gap-2 px-4">
          <UserPlus className="size-5" />
          Invitar a una persona
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(event) => {
          if (link && !copied) {
            event.preventDefault();
            setConfirmClose(true);
          }
        }}
        onEscapeKeyDown={(event) => {
          if (link && !copied) {
            event.preventDefault();
            setConfirmClose(true);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{link ? "Invitación lista" : "Invitar a una persona"}</DialogTitle>
          <DialogDescription>
            {link
              ? "Envíaselo por WhatsApp o correo. Sirve una sola vez y caduca en 7 días."
              : "Entrará como colaborador: solo verá los productos que le asignes. Si ya había una invitación sin usar para ese correo, queda cancelada."}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col gap-3">
            <Label htmlFor="invite-link">Enlace para {name || email}</Label>
            <Input id="invite-link" ref={linkField} readOnly value={link} className="h-11 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy} className="h-11 gap-2">
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Este enlace solo se muestra ahora. Si lo pierdes, crea otra invitación.
            </p>
            {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">{error}</p> : null}
            {confirmClose ? (
              <div role="alertdialog" aria-label="Confirmar cierre" className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm">Si cierras ahora sin copiar el enlace, no podrás volver a verlo. ¿Cerrar de todos modos?</p>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-10" onClick={() => setConfirmClose(false)} autoFocus>
                    Seguir aquí
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => reset(false)}>
                    Cerrar y perder el enlace
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="h-10" onClick={requestClose}>
                Listo
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Nombre</Label>
              <Input id="invite-name" className="h-11 text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Correo</Label>
              <Input id="invite-email" type="email" className="h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="off" />
            </div>
            {error ? (
              <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="h-11">
              {busy ? <Loader2 className="animate-spin" /> : null}
              Crear invitación
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
