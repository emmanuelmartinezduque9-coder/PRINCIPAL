"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RejectDialog } from "@/components/videos/reject-dialog";
import { api } from "@/lib/api";
import type { BatchRowJson } from "./labels";

export function OwnerRedo({ batchId, row }: { batchId: number; row: BatchRowJson }) {
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  if (!row.ownerCanRedo) return null;
  async function redo(kind: "frame" | "clip", reason: string) {
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
  const kinds = [...(row.frame.current ? (["frame"] as const) : []), ...(row.frame.approvedResultId !== null && row.clip.current ? (["clip"] as const) : [])];
  if (kinds.length === 0) return null;
  return <div className="flex flex-wrap gap-2">
    {kinds.map((kind) => <RejectDialog key={kind} label={kind === "frame" ? "Rehacer imagen" : "Rehacer vídeo"}
      title="¿Qué quieres cambiar?" submitLabel={kind === "frame" ? "Rehacer imagen" : "Rehacer vídeo"}
      pending={pending} redo onReject={(reason) => redo(kind, reason)} className="h-8 gap-1.5 px-2.5 text-sm" />)}
  </div>;
}
