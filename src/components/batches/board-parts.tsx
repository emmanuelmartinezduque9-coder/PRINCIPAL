"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Copy, Loader2, Package, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PRODUCT_NOTES } from "@/components/videos/brief-labels";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/videos/segmented";
import type { VariantJson } from "./batch-fields";
import { linkLabel } from "@/lib/links";
import { EditReferenceButton, EditReferenceField } from "./edit-reference";
import { Indications } from "./indications";
import type { BatchRowJson, BatchViewJson } from "./labels";
import { Switch } from "@/components/ui/switch";
import { ClipModelSelect } from "@/components/videos/clip-model-picker";
import { CLIP_MODEL_LABEL, DEFAULT_CLIP_MODEL_CHOICE, type ClipModelChoice } from "@/lib/clip-models";

type GroupJson = BatchViewJson["groups"][number];

/**
 * Cabecera de un producto del lote: portada grande, nombre, cuántos vídeos, las variantes que
 * usan sus vídeos, sus «Indicaciones» plegadas (las cambia quien creó el lote; al guardarlas, los
 * desgloses de esos vídeos quedan por repetir), su «Edición de referencia» y su «Modelo» del vídeo
 * (al cambiarlos pasan a las filas del grupo que no tienen uno propio).
 */
export function GroupHeader({ batchId, group, editable, variants }: { batchId: number; group: GroupJson; editable: boolean; variants?: VariantJson[] }) {
  const client = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(group.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  async function saveEditReference(url: string | null) {
    try {
      await api(`/api/lotes/${batchId}/productos/${group.productId}`, { method: "PUT", body: JSON.stringify({ editReferenceUrl: url }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la edición de referencia.");
    }
  }

  async function saveClipModel(clipModel: ClipModelChoice | null) {
    try {
      await api(`/api/lotes/${batchId}/productos/${group.productId}`, { method: "PUT", body: JSON.stringify({ clipModel }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el modelo.");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/api/lotes/${batchId}/productos/${group.productId}`, { method: "PUT", body: JSON.stringify({ notes: draft.trim() || null }) });
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar las indicaciones.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-4 border-b p-5">
      <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground shadow-card ring-1 ring-foreground/[0.06]">
        {group.coverPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/fotos/${group.coverPhotoId}`} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <Package className="size-5" aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-lg font-semibold tracking-tight">{group.name}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{group.videos}</span>
          {variants && variants.length > 0 ? (
            <span className="ml-1 flex items-center -space-x-1.5" aria-label={`${variants.length} variantes`}>
              {variants.slice(0, 6).map((variant) => (
                <span key={variant.id} title={variant.name} className="relative size-6 overflow-hidden rounded-md bg-muted ring-2 ring-card">
                  {variant.articlePhotoIds[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/fotos/${variant.articlePhotoIds[0]}`} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : null}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 items-start gap-3">
          <Indications
            className="min-w-0 flex-1"
            value={group.notes ?? ""}
            open={open}
            editable={editable}
            onOpenChange={(next) => {
              if (next) setDraft(group.notes ?? "");
              setOpen(next);
            }}
          >
            {editable ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  id={id}
                  autoFocus
                  aria-label={`Indicaciones para los vídeos de ${group.name}`}
                  placeholder={`Para todos los vídeos de ${group.name}`}
                  value={draft}
                  maxLength={MAX_PRODUCT_NOTES}
                  rows={3}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setOpen(false);
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" className="h-8 px-3" disabled={saving} onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button className="h-8 gap-1.5 px-3" disabled={saving || draft.trim() === (group.notes ?? "").trim()} onClick={() => void save()}>
                    {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{group.notes}</p>
            )}
          </Indications>
          {editable ? (
            <ClipModelSelect compact label={`Modelo del vídeo para ${group.name}`} value={group.clipModel ?? DEFAULT_CLIP_MODEL_CHOICE} onChange={(next) => void saveClipModel(next)} />
          ) : (
            <span className="inline-flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-sm text-muted-foreground">
              {CLIP_MODEL_LABEL[(group.clipModel ?? DEFAULT_CLIP_MODEL_CHOICE) as ClipModelChoice] ?? group.clipModel}
            </span>
          )}
          {editable ? (
            <EditReferenceButton value={group.editReferenceUrl ?? ""} open={refOpen} onOpenChange={setRefOpen} />
          ) : group.editReferenceUrl ? (
            <a
              href={group.editReferenceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-2.5 text-sm text-brand-ink"
            >
              <Clapperboard className="size-4" aria-hidden />
              {linkLabel(group.editReferenceUrl).host}
            </a>
          ) : null}
        </div>
        {editable && refOpen ? (
          <EditReferenceField value={group.editReferenceUrl ?? ""} onSave={saveEditReference} onClose={() => setRefOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

/** «Duplicar» y «Quitar» de una fila (quitar solo sin generaciones, y preguntando antes). */
export function RowActions({ batchId, row }: { batchId: number; row: BatchRowJson }) {
  const client = useQueryClient();
  const { uploads } = useReferenceUploads();
  const [busy, setBusy] = useState<null | "duplicate" | "remove" | "include">(null);
  const [asking, setAsking] = useState(false);
  const uploading = uploads[row.id]?.kind === "uploading";

  async function run(kind: "duplicate" | "remove" | "include") {
    setBusy(kind);
    try {
      if (kind === "include") await api(`/api/lotes/${batchId}/videos/${row.id}/incluir`, { method: "POST" });
      else if (kind === "duplicate") await api(`/api/lotes/${batchId}/videos/${row.id}/duplicar`, { method: "POST" });
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
      {row.skipped ? (
        <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm" disabled={busy !== null} onClick={() => void run("include")}>
          {busy === "include" ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Volver a incluir
        </Button>
      ) : null}
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
    <label htmlFor={id} className={cn("flex h-9 items-center gap-2.5 px-1 text-sm text-muted-foreground", editable && "cursor-pointer")}>
      <Switch id={id} checked={value} disabled={!editable || saving} onCheckedChange={(next) => void change(next)} />
      Desglosar al subir
    </label>
  );
}

/**
 * «Traducir el diálogo al alemán» del lote: el montaje de cada vídeo (que no diga otra cosa en su
 * tarjeta) dobla solo la voz del «Audio original» y deja la música igual. Solo quien creó el lote.
 */
export function DubDialogueSwitch({ batchId, value, editable }: { batchId: number; value: boolean; editable: boolean }) {
  const client = useQueryClient();
  const id = useId();
  const [saving, setSaving] = useState(false);
  async function change(next: boolean) {
    setSaving(true);
    try {
      await api(`/api/lotes/${batchId}`, { method: "PATCH", body: JSON.stringify({ dubDialogue: next }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <label htmlFor={id} className={cn("flex h-9 items-center gap-2.5 px-1 text-sm text-muted-foreground", editable && "cursor-pointer")}>
      <Switch id={id} checked={value} disabled={!editable || saving} onCheckedChange={(next) => void change(next)} />
      Traducir el diálogo al alemán
    </label>
  );
}

const FRAME_COUNT_OPTIONS = (["1", "2", "3", "4"] as const).map((value) => ({ value, label: value }));

/** «Imágenes por vídeo» del lote (1 por defecto: regla fija del dueño). Solo quien lo creó lo cambia. */
export function FrameCountPicker({ batchId, value, editable }: { batchId: number; value: number; editable: boolean }) {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  async function change(next: string) {
    if (Number(next) === value) return;
    setSaving(true);
    try {
      await api(`/api/lotes/${batchId}`, { method: "PATCH", body: JSON.stringify({ frameCount: Number(next) }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex h-9 items-center gap-2.5 px-1 text-sm text-muted-foreground">
      <span>Imágenes por vídeo</span>
      <Segmented
        label="Imágenes por vídeo"
        options={FRAME_COUNT_OPTIONS}
        value={String(value) as (typeof FRAME_COUNT_OPTIONS)[number]["value"]}
        onChange={(next) => void change(next)}
        disabled={!editable || saving}
      />
    </div>
  );
}
