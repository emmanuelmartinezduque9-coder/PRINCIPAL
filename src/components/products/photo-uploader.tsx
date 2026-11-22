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

export const MAX_PHOTOS = 6;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT = ACCEPTED_TYPES.join(",");

/**
 * Se queda con las fotos de un formato admitido y avisa de cada archivo que no lo es
 * (un PDF, un vídeo, una foto HEIC…), sin aceptarlo.
 */
export function keepPhotos(files: File[]): File[] {
  const photos: File[] = [];
  for (const file of files) {
    if (ACCEPTED_TYPES.includes(file.type)) photos.push(file);
    else if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      // Foto de iPhone: se dice cómo hacer que la cámara guarde en un formato que sirve.
      toast.error(`${file.name}: usa JPG, PNG o WebP (en iPhone: Ajustes → Cámara → Formatos → «El más compatible»).`, {
        duration: 10_000,
      });
    } else toast.error(`${file.name}: no es una foto JPG, PNG o WebP.`, { duration: 8_000 });
  }
  return photos;
}

/**
 * Mientras haya una zona de fotos en pantalla, soltar un archivo fuera de ella no abre el
 * archivo en la pestaña (lo que haría el navegador y se perdería lo escrito).
 */
function useBlockStrayDrops() {
  useEffect(() => {
    // Solo arrastres de archivos: arrastrar texto entre campos sigue funcionando.
    const outsideZone = (event: DragEvent) =>
      !!event.dataTransfer?.types.includes("Files") &&
      !(event.target instanceof Element && event.target.closest("[data-dropzone]"));
    function onDragOver(event: DragEvent) {
      if (!outsideZone(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    }
    function onDrop(event: DragEvent) {
      if (outsideZone(event)) event.preventDefault();
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}

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
 * (o con Intro / Espacio desde el teclado). `tile` es una casilla más de la rejilla de fotos;
 * `fill` ocupa todo el alto libre del panel.
 */
function PhotoDropzone({
  onFiles,
  busy,
  variant,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  variant: "tile" | "fill";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  useBlockStrayDrops();

  function accept(files: File[]) {
    const photos = keepPhotos(files);
    if (photos.length) onFiles(photos);
  }

  return (
    <div className={cn(variant === "tile" ? "aspect-square" : "flex min-h-44 flex-1 flex-col")}>
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
          accept(files);
        }}
      />
      <button
        type="button"
        data-dropzone
        title="JPG, PNG o WebP · hasta 8 MB"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          if (busy || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!busy) accept(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex size-full flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors outline-none *:pointer-events-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress disabled:opacity-70",
          over ? "border-foreground/60 bg-foreground/[0.04]" : "border-border hover:border-foreground/30 hover:bg-muted/50",
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
        </span>
        <span className="text-sm font-medium">{busy ? "Subiendo…" : over ? "Suelta aquí" : "Añadir fotos"}</span>
        {/* En la casilla no cabe: los formatos se ven al elegir y se avisa si un archivo no vale. */}
        {variant === "fill" ? <span className="text-xs text-muted-foreground">JPG, PNG o WebP · 8 MB</span> : null}
      </button>
    </div>
  );
}

/** «3 / 6» junto al título del panel de fotos. */
export function PhotoCount({ count }: { count: number }) {
  return (
    <span className="text-sm text-muted-foreground tabular-nums" aria-label={`${count} de ${MAX_PHOTOS} fotos`}>
      {count} / {MAX_PHOTOS}
    </span>
  );
}

function Thumb({
  src,
  alt,
  cover,
  removeLabel,
  onRemove,
  icon,
  className,
}: {
  src: string;
  alt: string;
  cover: boolean;
  removeLabel: string;
  onRemove: () => void;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("group relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 size-full object-cover" />
      {cover ? (
        <span className="absolute bottom-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm">
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

const PICKER_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3";
/**
 * Fotos del detalle a todo el ancho: la portada en grande (4 columnas × 3 filas de casillas
 * cuadradas, o sea 4:3) y a su derecha una tira con las demás y la casilla de añadir.
 */
// Filas iguales: el alto lo marcan las casillas cuadradas, no el tamaño real de la foto.
const MANAGER_GRID = "grid grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3 lg:auto-rows-fr lg:grid-cols-6";
const HERO = "col-span-full aspect-[4/3] lg:col-span-4 lg:row-span-3 lg:aspect-auto";

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
    <div className="flex flex-1 flex-col gap-3">
      {files.length > 0 ? (
        <ul className={PICKER_GRID}>
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
      {files.length < MAX_PHOTOS ? <PhotoDropzone onFiles={add} variant="fill" /> : null}
    </div>
  );
}

interface PhotoInfo {
  id: number;
  mime: string;
  size: number;
}

/** Fotos de un producto ya creado: verlas, añadir más y borrar. Avisa del número de fotos. */
export function PhotoManager({ productId, onCount }: { productId: number; onCount?: (count: number) => void }) {
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

  const list = useMemo(() => photos.data?.photos ?? [], [photos.data]);
  useEffect(() => {
    if (photos.data) onCount?.(list.length);
  }, [photos.data, list.length, onCount]);
  const room = list.length < MAX_PHOTOS;
  const empty = list.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {photos.isLoading ? (
        <div className={MANAGER_GRID}>
          <Skeleton className={cn("rounded-xl", HERO)} />
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="aspect-square rounded-xl" />
        </div>
      ) : photos.isError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          No se pudieron cargar las fotos. Recarga la página.
        </p>
      ) : (
        <ul className={MANAGER_GRID}>
          {list.map((photo, index) => (
            <Thumb
              key={photo.id}
              src={`/api/fotos/${photo.id}`}
              alt={`Foto ${index + 1} del producto`}
              cover={index === 0}
              removeLabel={`Borrar la foto ${index + 1}`}
              onRemove={() => setToDelete(photo)}
              icon={<Trash2 className="size-4" aria-hidden />}
              className={index === 0 ? HERO : undefined}
            />
          ))}
          {room ? (
            // Sin fotos, la zona ocupa la fila entera; con fotos, es una casilla más.
            <li className={empty ? "col-span-full flex h-72 flex-col" : undefined}>
              <PhotoDropzone
                onFiles={(files) => {
                  if (files.length > MAX_PHOTOS - list.length) toast.error(`Un producto admite hasta ${MAX_PHOTOS} fotos.`);
                  upload.mutate(files.slice(0, MAX_PHOTOS - list.length));
                }}
                busy={upload.isPending}
                variant={empty ? "fill" : "tile"}
              />
            </li>
          ) : null}
        </ul>
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
