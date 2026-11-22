"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 6;
const ACCEPT = "image/jpeg,image/png,image/webp";

/** Sube una foto. El servidor decide si vale (formato, peso, cantidad) y explica el motivo. */
export async function uploadPhoto(productId: number, file: File): Promise<void> {
  const body = new FormData();
  body.append("foto", file);
  let response: Response;
  try {
    response = await fetch(`/api/productos/${productId}/fotos`, { method: "POST", body });
  } catch {
    throw new ApiError("No hay conexión con el servidor.", 0);
  }
  if (response.status === 401) {
    // Recarga completa a propósito: así no queda nada de la sesión anterior en pantalla.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error ?? "No se pudo subir la foto.", response.status);
  }
}

/** Sube varias fotos una tras otra y avisa de cada una que no valga, con el nombre del archivo. */
export async function uploadPhotos(productId: number, files: File[]): Promise<number> {
  let failed = 0;
  for (const file of files) {
    try {
      await uploadPhoto(productId, file);
    } catch (error) {
      failed += 1;
      toast.error(`${file.name}: ${error instanceof Error ? error.message : "No se pudo subir."}`, { duration: 10_000 });
    }
  }
  return failed;
}

/**
 * Zona para añadir fotos: se pueden arrastrar desde el ordenador o elegir con un clic
 * (o con Intro / Espacio desde el teclado).
 */
function PhotoDropzone({
  onFiles,
  disabled,
  busy,
  compact,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Más baja cuando ya hay fotos encima. */
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const off = disabled || busy;

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir fotos"
        data-testid="photo-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={off}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          if (off || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (off) return;
          const files = Array.from(event.dataTransfer.files);
          if (files.length) onFiles(files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl *:pointer-events-none border-2 border-dashed px-4 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "py-5" : "py-10",
          over ? "border-foreground/60 bg-foreground/[0.04]" : "border-border hover:border-foreground/30 hover:bg-muted/50",
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
        </span>
        <span className="text-sm font-medium">
          {busy ? "Subiendo fotos…" : over ? "Suelta las fotos aquí" : "Arrastra las fotos aquí o haz clic para elegirlas"}
        </span>
        <span className="text-xs text-muted-foreground">JPG, PNG o WebP · hasta 8 MB cada una · {MAX_PHOTOS} como máximo</span>
      </button>
    </div>
  );
}

function Thumb({
  src,
  alt,
  cover,
  removeLabel,
  onRemove,
  icon,
}: {
  src: string;
  alt: string;
  cover: boolean;
  removeLabel: string;
  onRemove: () => void;
  icon: React.ReactNode;
}) {
  return (
    <li className="group relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="size-full object-cover" />
      {cover ? (
        <span className="absolute bottom-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium shadow-sm">
          Portada
        </span>
      ) : null}
      <button
        type="button"
        aria-label={removeLabel}
        title={removeLabel}
        onClick={onRemove}
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/90 shadow-sm transition-colors outline-none hover:bg-background hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        {icon}
      </button>
    </li>
  );
}

const THUMB_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3";

/** Elegir fotos antes de que el producto exista: se ven en grande y se suben al guardar. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(added: File[]) {
    const room = MAX_PHOTOS - files.length;
    if (added.length > room) toast.error(`Un producto admite hasta ${MAX_PHOTOS} fotos.`);
    onChange([...files, ...added.slice(0, Math.max(room, 0))]);
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 ? (
        <ul className={THUMB_GRID}>
          {files.map((file, index) => (
            <Thumb
              key={`${file.name}-${index}`}
              // Vista previa local (blob:), no una imagen del servidor.
              src={previews[index]}
              alt={file.name}
              cover={index === 0}
              removeLabel={`Quitar ${file.name}`}
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
              icon={<X className="size-4" aria-hidden />}
            />
          ))}
        </ul>
      ) : null}
      {files.length < MAX_PHOTOS ? (
        <PhotoDropzone onFiles={add} compact={files.length > 0} />
      ) : (
        <p className="text-sm text-muted-foreground">Ya has elegido las {MAX_PHOTOS} fotos que admite. Quita una para añadir otra.</p>
      )}
    </div>
  );
}

interface PhotoInfo {
  id: number;
  mime: string;
  size: number;
}

/** Fotos de un producto ya creado: verlas, añadir más y borrar. */
export function PhotoManager({ productId }: { productId: number }) {
  const client = useQueryClient();
  const [toDelete, setToDelete] = useState<PhotoInfo | null>(null);
  const key = ["photos", productId];
  const photos = useQuery({
    queryKey: key,
    queryFn: () => api<{ photos: PhotoInfo[] }>(`/api/productos/${productId}/fotos`),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: ["products"] });
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadPhotos(productId, files),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/fotos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setToDelete(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo borrar la foto."),
  });

  const list = photos.data?.photos ?? [];

  return (
    <div className="flex flex-col gap-3">
      {photos.isLoading ? (
        <div className={THUMB_GRID}>
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="aspect-square rounded-xl" />
        </div>
      ) : photos.isError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          No se pudieron cargar las fotos. Recarga la página para volver a intentarlo.
        </p>
      ) : list.length === 0 ? null : (
        <ul className={THUMB_GRID}>
          {list.map((photo, index) => (
            <Thumb
              key={photo.id}
              src={`/api/fotos/${photo.id}`}
              alt={`Foto ${index + 1} del producto`}
              cover={index === 0}
              removeLabel={`Borrar la foto ${index + 1}`}
              onRemove={() => setToDelete(photo)}
              icon={<Trash2 className="size-4" aria-hidden />}
            />
          ))}
        </ul>
      )}

      {photos.isLoading || photos.isError ? null : list.length < MAX_PHOTOS ? (
        <PhotoDropzone onFiles={(files) => upload.mutate(files)} busy={upload.isPending} compact={list.length > 0} />
      ) : (
        <p className="text-sm text-muted-foreground">Ya tiene las {MAX_PHOTOS} fotos que admite. Borra una para añadir otra.</p>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar esta foto?</DialogTitle>
            <DialogDescription>No se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10 px-4" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="h-10 px-4"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              Borrar foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
