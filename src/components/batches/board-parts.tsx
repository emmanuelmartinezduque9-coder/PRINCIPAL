"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Package, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PRODUCT_NOTES } from "@/components/videos/brief-labels";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RISK_LABELS, type BatchRowJson, type BatchViewJson } from "./labels";

type GroupJson = BatchViewJson["groups"][number];

/** Los riesgos del desglose: un aviso pequeño con cuántos; el detalle, al pasar por encima. */
export function RiskChip({ risks }: { risks: BatchRowJson["risks"] }) {
  if (risks.length === 0) return null;
  const detail = risks.map((risk) => `${RISK_LABELS[risk.kind]}: ${risk.detail}`).join("\n");
  const kinds = [...new Set(risks.map((risk) => RISK_LABELS[risk.kind]))];
  return (
    <span
      title={detail}
      tabIndex={0}
      aria-label={`Riesgos: ${detail}`}
      className="inline-flex h-5 max-w-56 shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 text-[11px] font-medium text-amber-900 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-amber-200"
    >
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{kinds.length === 1 ? kinds[0] : `${kinds[0]} +${kinds.length - 1}`}</span>
    </span>
  );
}

/**
 * Cabecera de un producto del lote: portada, nombre, cuántos vídeos y sus «Indicaciones» (las
 * cambia quien creó el lote; al guardarlas, los desgloses de esos vídeos quedan por repetir).
 */
export function GroupHeader({ batchId, group, editable }: { batchId: number; group: GroupJson; editable: boolean }) {
  const client = useQueryClient();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/lotes/${batchId}/productos/${group.productId}`, { method: "PUT", body: JSON.stringify({ notes: draft.trim() || null }) });
      setEditing(false);
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar las indicaciones.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
          {group.coverPhotoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/fotos/${group.coverPhotoId}`} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <Package className="size-4" aria-hidden />
          )}
        </span>
        <h2 className="truncate text-base font-semibold">{group.name}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{group.videos === 1 ? "1 vídeo" : `${group.videos} vídeos`}</span>
        {editable && !editing ? (
          <Button
            variant="ghost"
            className="ml-auto h-8 gap-1.5 px-2.5 text-muted-foreground"
            onClick={() => {
              setDraft(group.notes ?? "");
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            Indicaciones
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            id={id}
            autoFocus
            aria-label={`Indicaciones para los vídeos de ${group.name}`}
            placeholder={`Indicaciones para los vídeos de ${group.name}`}
            value={draft}
            maxLength={MAX_PRODUCT_NOTES}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-8 px-3" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button className="h-8 gap-1.5 px-3" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Guardar
            </Button>
          </div>
        </div>
      ) : group.notes ? (
        <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground" title={group.notes}>
          {group.notes}
        </p>
      ) : null}
    </div>
  );
}

/** «Duplicar» y «Quitar» de una fila (quitar solo sin generaciones, y preguntando antes). */
export function RowActions({ batchId, row }: { batchId: number; row: BatchRowJson }) {
  const client = useQueryClient();
  const { uploads } = useReferenceUploads();
  const [busy, setBusy] = useState<null | "duplicate" | "remove">(null);
  const [asking, setAsking] = useState(false);
  const uploading = uploads[row.id]?.kind === "uploading";

  async function run(kind: "duplicate" | "remove") {
    setBusy(kind);
    try {
      if (kind === "duplicate") await api(`/api/lotes/${batchId}/videos/${row.id}/duplicar`, { method: "POST" });
      else await api(`/api/lotes/${batchId}/videos/${row.id}`, { method: "DELETE" });
      setAsking(false);
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
      void client.invalidateQueries({ queryKey: ["batches"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo hacer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        aria-label={`Duplicar ${row.title}`}
        title="Duplicar"
        disabled={busy !== null}
        onClick={() => void run("duplicate")}
      >
        {busy === "duplicate" ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
      </Button>
      {row.removable ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Quitar ${row.title}`}
          title="Quitar"
          disabled={busy !== null || uploading}
          onClick={() => setAsking(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Quitar {row.title}?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10 px-4" onClick={() => setAsking(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" className={cn("h-10 gap-2 px-4")} disabled={busy !== null} onClick={() => void run("remove")}>
              {busy === "remove" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** «Desglosar al subir» del lote, que puede cambiar quien lo creó. */
export function AutoAnalyzeSwitch({ batchId, value, editable }: { batchId: number; value: boolean; editable: boolean }) {
  const client = useQueryClient();
  const id = useId();
  const [saving, setSaving] = useState(false);
  async function change(next: boolean) {
    setSaving(true);
    try {
      await api(`/api/lotes/${batchId}`, { method: "PATCH", body: JSON.stringify({ autoAnalyze: next }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <label htmlFor={id} className={cn("flex h-9 items-center gap-2.5 text-sm", editable && "cursor-pointer")}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="size-4 accent-foreground"
        checked={value}
        disabled={!editable || saving}
        onChange={(event) => void change(event.target.checked)}
      />
      Desglosar al subir
    </label>
  );
}
