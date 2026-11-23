"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, ImagePlus, Loader2, MapPin, Package, Shapes, Sparkles, Trash2, UserRound, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { PHOTO_ROLES, type PhotoRole } from "@/lib/photo-roles";
import { cn } from "@/lib/utils";
import { PHOTO_ROLE_HINTS, PHOTO_ROLE_LABELS } from "./labels";

export const MAX_PHOTOS = 12;
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

export const ROLE_ICONS: Record<PhotoRole, LucideIcon> = {
  articulo: Package,
  embalaje: Gift,
  avatar: UserRound,
  entorno: MapPin,
  funcionamiento: Sparkles,
  otro: Shapes,
};

/** Un color propio por papel: se reconoce de un vistazo sin leer nada. */
export const ROLE_TINT: Record<PhotoRole, string> = {
  articulo: "bg-warning text-white",
  embalaje: "bg-info text-white",
  avatar: "bg-kind-adapt text-white",
  entorno: "bg-success text-white",
  funcionamiento: "bg-kind-adapt text-white",
  otro: "bg-slate-500 text-white",
};

/** Una foto elegida y el papel que tendrá. */
export interface PendingPhoto {
  file: File;
  role: PhotoRole;
}

/** Los cinco papeles como botones de icono (para elegir el papel de las fotos que se van a subir). */
function RoleSelector({ value, onChange }: { value: PhotoRole; onChange: (role: PhotoRole) => void }) {
  return (
    // En una casilla estrecha los iconos pasan a dos filas en vez de salirse.
    <div
      role="group"
      aria-label="Papel de las fotos nuevas"
      className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-3xl bg-muted p-1"
    >
      {PHOTO_ROLES.map((role) => {
        const Icon = ROLE_ICONS[role];
        const on = role === value;
        return (
          <button
            key={role}
            type="button"
            aria-pressed={on}
            aria-label={PHOTO_ROLE_LABELS[role]}
            title={PHOTO_ROLE_HINTS[role]}
            data-role={role}
            onClick={() => onChange(role)}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              on ? ROLE_TINT[role] : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Papel actual de una foto como una insignia de icono y color; al pulsarla (o con Intro / Espacio)
 * se abre un menú con los cinco papeles. Flechas para moverse, Esc para cerrar.
 */
function RoleBadge({ value, onChange }: { value: PhotoRole; onChange: (role: PhotoRole) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const Icon = ROLE_ICONS[value];

  useEffect(() => {
    if (!open) return;
    items.current[PHOTO_ROLES.indexOf(value)]?.focus();
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, value]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const at = items.current.findIndex((el) => el === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      items.current[(to + PHOTO_ROLES.length) % PHOTO_ROLES.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(PHOTO_ROLES.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="absolute bottom-2 left-2 z-10" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Papel: ${PHOTO_ROLE_LABELS[value]}. Cambiar`}
        title={PHOTO_ROLE_HINTS[value]}
        data-role-badge={value}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid size-10 place-items-center rounded-full shadow-md ring-2 ring-background transition-transform outline-none hover:scale-105 focus-visible:ring-ring",
          ROLE_TINT[value],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Papel de la foto"
          className="absolute bottom-12 left-0 flex w-36 flex-col rounded-xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        >
          {PHOTO_ROLES.map((role, index) => {
            const ItemIcon = ROLE_ICONS[role];
            return (
              <button
                key={role}
                ref={(el) => {
                  items.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={role === value}
                data-role={role}
                title={PHOTO_ROLE_HINTS[role]}
                onClick={() => {
                  if (role !== value) onChange(role);
                  close();
                }}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg px-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                  role === value && "font-medium",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-full", ROLE_TINT[role])}>
                  <ItemIcon className="size-3.5" aria-hidden />
                </span>
                {PHOTO_ROLE_LABELS[role]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Sube una foto. El servidor decide si vale (formato, peso, cantidad) y explica el motivo. */
export async function uploadPhoto(productId: number, file: File, role: PhotoRole = "articulo"): Promise<void> {
  const body = new FormData();
  body.append("foto", file);
  body.append("papel", role);
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
export async function uploadPhotos(productId: number, photos: PendingPhoto[]): Promise<number> {
  let failed = 0;
  for (const { file, role } of photos) {
    try {
      await uploadPhoto(productId, file, role);
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
  role,
  onRole,
}: {
  onFiles: (files: File[]) => void;
  /** Papel con el que entran las fotos que se añadan. */
  role: PhotoRole;
  onRole: (role: PhotoRole) => void;
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
    <div
      data-dropzone
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
        "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed p-2 transition-colors",
        variant === "tile" ? "aspect-square" : "min-h-44 flex-1",
        over ? "border-foreground/60 bg-foreground/[0.04]" : "border-border",
      )}
    >
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
      <RoleSelector value={role} onChange={onRole} />
      <button
        type="button"
        title="JPG, PNG o WebP · hasta 8 MB"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={cn(
          "flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-lg px-4 text-center transition-colors outline-none *:pointer-events-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress disabled:opacity-70",
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

/** «3 / 12» junto al título del panel de fotos. */
export function PhotoCount({ count }: { count: number }) {
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      <span aria-hidden>
        {count} / {MAX_PHOTOS}
      </span>
      <span className="sr-only">
        {count} de {MAX_PHOTOS} fotos
      </span>
    </span>
  );
}

function Thumb({
  src,
  alt,
  cover,
  role,
  onRole,
  removeLabel,
  onRemove,
  icon,
  className,
}: {
  src: string;
  alt: string;
  cover: boolean;
  role: PhotoRole;
  onRole: (role: PhotoRole) => void;
  removeLabel: string;
  onRemove: () => void;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("group relative aspect-square rounded-xl bg-muted ring-1 ring-foreground/10", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 size-full rounded-xl object-cover" />
      {cover ? (
        <span className="absolute top-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm">
          Portada
        </span>
      ) : null}
      <RoleBadge value={role} onChange={onRole} />
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
export function PhotoPicker({ files, onChange }: { files: PendingPhoto[]; onChange: (files: PendingPhoto[]) => void }) {
  const [newRole, setNewRole] = useState<PhotoRole>("articulo");
  const previews = useMemo(() => files.map(({ file }) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const coverIndex = Math.max(files.findIndex((f) => f.role === "articulo"), 0);

  function add(added: File[]) {
    const room = MAX_PHOTOS - files.length;
    if (added.length > room) toast.error(`Un producto admite hasta ${MAX_PHOTOS} fotos.`);
    onChange([...files, ...added.slice(0, Math.max(room, 0)).map((file) => ({ file, role: newRole }))]);
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {files.length > 0 ? (
        <ul className={PICKER_GRID}>
          {files.map(({ file, role }, index) => (
            <Thumb
              key={`${file.name}-${index}`}
              // Vista previa local (blob:), no una imagen del servidor.
              src={previews[index]}
              alt={file.name}
              cover={index === coverIndex}
              role={role}
              onRole={(next) => onChange(files.map((f, i) => (i === index ? { ...f, role: next } : f)))}
              removeLabel={`Quitar ${file.name}`}
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
              icon={<X className="size-4" aria-hidden />}
            />
          ))}
        </ul>
      ) : null}
      {files.length < MAX_PHOTOS ? <PhotoDropzone onFiles={add} variant="fill" role={newRole} onRole={setNewRole} /> : null}
    </div>
  );
}

interface PhotoInfo {
  id: number;
  mime: string;
  size: number;
  role: PhotoRole;
}

/** Fotos de un producto ya creado: verlas, añadir más y borrar. Avisa del número de fotos. */
export function PhotoManager({ productId, onCount }: { productId: number; onCount?: (count: number) => void }) {
  const client = useQueryClient();
  const [toDelete, setToDelete] = useState<PhotoInfo | null>(null);
  const [newRole, setNewRole] = useState<PhotoRole>("articulo");
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
    mutationFn: (files: File[]) => uploadPhotos(productId, files.map((file) => ({ file, role: newRole }))),
    onSettled: refresh,
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: PhotoRole }) =>
      api(`/api/fotos/${id}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    // El cambio se ve al instante y se deshace si el servidor lo rechaza.
    onMutate: async ({ id, role }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<{ photos: PhotoInfo[] }>(key);
      client.setQueryData<{ photos: PhotoInfo[] }>(key, (data) =>
        data ? { photos: data.photos.map((p) => (p.id === id ? { ...p, role } : p)) } : data,
      );
      return { before };
    },
    onError: (error, _vars, context) => {
      if (context?.before) client.setQueryData(key, context.before);
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar el papel.");
    },
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
  // La portada (primera foto de artículo, o la primera si no hay ninguna) va delante y en grande;
  // las demás siguen en su orden.
  const shown = useMemo(() => {
    const cover = list.find((p) => p.role === "articulo") ?? list[0];
    return cover ? [cover, ...list.filter((p) => p !== cover)] : list;
  }, [list]);

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
          {shown.map((photo, index) => (
            <Thumb
              key={photo.id}
              src={`/api/fotos/${photo.id}`}
              alt={`Foto ${index + 1} del producto`}
              cover={index === 0}
              role={photo.role}
              onRole={(role) => changeRole.mutate({ id: photo.id, role })}
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
                role={newRole}
                onRole={setNewRole}
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
