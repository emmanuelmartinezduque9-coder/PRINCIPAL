"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RejectDialog } from "@/components/videos/reject-dialog";
import { api } from "@/lib/api";
import type { BatchRowJson } from "./labels";

type RedoKind = "frame" | "clip";
const LABEL: Record<RedoKind, string> = { frame: "Rehacer imagen", clip: "Rehacer vídeo" };

/**
 * «Rehacer» a mano del dueño, aunque el vídeo haya pasado su límite: un solo botón de icono (como «Duplicar» y
 * «Quitar») que abre un menú con lo que se puede rehacer; cada opción pide qué cambiar. Antes eran dos botones con
 * texto que se montaban encima del coste (26/11/2026).
 */
export function OwnerRedo({ batchId, row }: { batchId: number; row: BatchRowJson }) {
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<RedoKind | null>(null);
  const client = useQueryClient();
  if (!row.ownerCanRedo) return null;
  async function redo(kind: RedoKind, reason: string) {
    setPending(true);
    try {
      await api(`/api/lotes/${batchId}/videos/${row.id}/rehacer`, { method: "POST", body: JSON.stringify({ kind, reason }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo rehacer.");
      throw error;
    } finally { setPending(false); }
  }
  // Rehacer la imagen cuando ya hay una; el vídeo, cuando la imagen está aprobada (sin ella no hay clip que rehacer).
  const kinds: RedoKind[] = [...(row.frame.current ? (["frame"] as const) : []), ...(row.frame.approvedResultId !== null && row.clip.current ? (["clip"] as const) : [])];
  if (kinds.length === 0) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Rehacer ${row.title}`} title="Rehacer" disabled={pending}>
            <RotateCcw aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {kinds.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => setOpen(kind)}>
              {LABEL[kind]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {kinds.map((kind) => (
        <RejectDialog
          key={kind}
          hideTrigger
          open={open === kind}
          onOpenChange={(next) => setOpen(next ? kind : null)}
          label={LABEL[kind]}
          title="¿Qué quieres cambiar?"
          submitLabel={LABEL[kind]}
          pending={pending}
          redo
          onReject={(reason) => redo(kind, reason)}
        />
      ))}
    </>
  );
}
