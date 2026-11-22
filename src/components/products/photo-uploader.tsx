"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

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

function FileButton({
  onFiles,
  disabled,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
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
      <Button type="button" variant="outline" className="h-11 w-full text-base sm:w-auto" disabled={disabled} onClick={() => input.current?.click()}>
        <ImagePlus className="size-5" />
        {children}
      </Button>
    </>
  );
}

/** Elegir fotos antes de que el producto exista: se ven en pequeño y se suben al guardar. */
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
        <ul className="grid grid-cols-3 gap-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* Vista previa local (blob:), no una imagen del servidor. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[index]} alt={file.name} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Quitar ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-background/90 shadow-sm"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FileButton onFiles={add} disabled={files.length >= MAX_PHOTOS}>
        {files.length ? "Añadir más fotos" : "Elegir fotos"}
      </FileButton>
      <p className="text-xs text-muted-foreground">JPG, PNG o WebP, hasta 8 MB cada una y 6 como máximo.</p>
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
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
        </div>
      ) : photos.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar las fotos.</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay fotos de este producto.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((photo, index) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/fotos/${photo.id}`} alt={`Foto ${index + 1} del producto`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Borrar la foto ${index + 1}`}
                onClick={() => setToDelete(photo)}
                className="absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-full bg-background/90 shadow-sm"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.length < MAX_PHOTOS ? (
        <FileButton onFiles={(files) => upload.mutate(files)} disabled={upload.isPending}>
          {upload.isPending ? "Subiendo…" : "Añadir fotos"}
        </FileButton>
      ) : (
        <p className="text-xs text-muted-foreground">Ya tiene las {MAX_PHOTOS} fotos que admite. Borra una para añadir otra.</p>
      )}
      {upload.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar esta foto?</DialogTitle>
            <DialogDescription>No se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="h-11"
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
