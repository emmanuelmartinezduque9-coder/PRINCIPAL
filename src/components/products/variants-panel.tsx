"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { VariantJson } from "@/components/batches/batch-fields";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductPhoto } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAX_ARTICLES = 4;
const photoUrl = (id: number) => `/api/fotos/${id}`;

function Thumb({ id, className }: { id: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={photoUrl(id)} alt="" className={cn("size-12 rounded-md bg-muted object-cover ring-1 ring-foreground/10", className)} />;
}

/** Crear o cambiar una variante: nombre, fotos de artículo en el orden en que se pulsan (hasta 4) y una de embalaje. */
function VariantDialog({
  productId,
  photos,
  variant,
  onClose,
}: {
  productId: number;
  photos: ProductPhoto[];
  variant: VariantJson | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(variant?.name ?? "");
  const [articles, setArticles] = useState<number[]>(variant?.articlePhotoIds ?? []);
  const [packaging, setPackaging] = useState<number | null>(variant?.packagingPhotoId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleArticle = (id: number) =>
    setArticles((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_ARTICLES ? list : [...list, id]));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({ name, articlePhotoIds: articles, packagingPhotoId: packaging });
      if (variant) await api(`/api/productos/${productId}/variantes/${variant.id}`, { method: "PATCH", body });
      else await api(`/api/productos/${productId}/variantes`, { method: "POST", body });
      await client.invalidateQueries({ queryKey: ["variants", productId] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-lg">{variant ? variant.name : "Nueva variante"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="variante-nombre">Nombre</Label>
            <Input id="variante-nombre" value={name} maxLength={60} placeholder="rosa" autoFocus onChange={(event) => setName(event.target.value)} className="h-9 max-w-72" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              Artículo <span className="text-muted-foreground tabular-nums">{articles.length}/{MAX_ARTICLES}</span>
            </legend>
            <ul className="grid grid-cols-6 gap-2">
              {photos.map((photo) => {
                const at = articles.indexOf(photo.id);
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      aria-pressed={at >= 0}
                      aria-label={at >= 0 ? `Foto ${photo.id}, artículo ${at + 1}` : `Foto ${photo.id}`}
                      onClick={() => toggleArticle(photo.id)}
                      className={cn(
                        "relative block aspect-square w-full rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring",
                        at >= 0 ? "ring-3 ring-foreground" : "ring-1 ring-foreground/10 hover:ring-foreground/40",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(photo.id)} alt="" className="absolute inset-0 size-full rounded-[inherit] object-cover" />
                      {at >= 0 ? (
                        <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-foreground text-xs font-semibold text-background tabular-nums">
                          {at + 1}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Embalaje</legend>
            <ul className="grid grid-cols-6 gap-2">
              {photos.map((photo) => {
                const on = packaging === photo.id;
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Foto ${photo.id} como embalaje`}
                      onClick={() => setPackaging(on ? null : photo.id)}
                      className={cn(
                        "relative block aspect-square w-full rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring",
                        on ? "ring-3 ring-foreground" : "ring-1 ring-foreground/10 opacity-60 hover:opacity-100",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(photo.id)} alt="" className="absolute inset-0 size-full rounded-[inherit] object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {error ? (
            <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={busy || !name.trim() || articles.length === 0}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Variantes» del producto (colores, modelos): qué fotos usa cada una. Un vídeo con variante solo usa esas. */
export function VariantsPanel({ productId }: { productId: number }) {
  const client = useQueryClient();
  const photos = useQuery({ queryKey: ["photos", productId], queryFn: () => api<{ photos: ProductPhoto[] }>(`/api/productos/${productId}/fotos`) });
  const variants = useQuery({ queryKey: ["variants", productId], queryFn: () => api<{ variants: VariantJson[] }>(`/api/productos/${productId}/variantes`) });
  const [editing, setEditing] = useState<VariantJson | "nueva" | null>(null);
  const photoList = photos.data?.photos ?? [];
  const list = variants.data?.variants ?? [];

  async function remove(variant: VariantJson) {
    try {
      await api(`/api/productos/${productId}/variantes/${variant.id}`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["variants", productId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo borrar.");
    }
  }

  if (photoList.length === 0) return null;
  return (
    <Panel
      title="Variantes"
      actions={
        <Button variant="outline" className="h-8 gap-1.5 px-3" onClick={() => setEditing("nueva")}>
          <Plus data-icon="inline-start" />
          Nueva
        </Button>
      }
    >
      {list.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {list.map((variant) => (
            <li key={variant.id} className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0">
              <span className="w-40 truncate text-sm font-medium" title={variant.name}>
                {variant.name}
              </span>
              <span className="flex gap-1.5">
                {variant.articlePhotoIds.map((id) => (
                  <Thumb key={id} id={id} />
                ))}
              </span>
              {variant.packagingPhotoId !== null ? (
                <span className="flex items-center gap-1.5 border-l pl-4" title="Embalaje">
                  <Package className="size-4 text-muted-foreground" aria-label="Embalaje" />
                  <Thumb id={variant.packagingPhotoId} />
                </span>
              ) : null}
              <span className="ml-auto flex gap-0.5">
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Editar ${variant.name}`} title="Editar" onClick={() => setEditing(variant)}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Borrar ${variant.name}`} title="Borrar" onClick={() => void remove(variant)}>
                  <Trash2 aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <VariantDialog productId={productId} photos={photoList} variant={editing === "nueva" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </Panel>
  );
}
