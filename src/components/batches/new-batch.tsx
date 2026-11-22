"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileVideo, Loader2, Trash2, Upload, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProductView } from "@/components/products/labels";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import type { ProductPhoto } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Lo mismo que admite el servidor. */
const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;
const MAX_NOTE = 300;
const VIDEO_TYPES = /\.(mp4|mov|webm)$/i;
const NONE = "none";

interface Row {
  key: string;
  file: File;
  preview: string;
  productId: number | null;
  /** El producto se eligió a mano (ya no sigue al del lote). */
  productTouched: boolean;
  /** `null`: el de por defecto (el primer avatar del producto o «no aparece nadie»). */
  avatar: number | typeof NONE | null;
  note: string;
  error: string | null;
}

let rowCounter = 0;

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

function ProductSelect({
  products,
  value,
  onChange,
  id,
  label,
  className,
}: {
  products: ProductView[];
  value: number | null;
  onChange: (id: number) => void;
  id?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} aria-label={label} className={cn("h-9 w-full min-w-0", className)}>
        <SelectValue placeholder="Elige el producto" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {products.map((product) => (
            <SelectItem key={product.id} value={String(product.id)}>
              {product.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AvatarSelect({
  avatars,
  loading,
  value,
  onChange,
}: {
  avatars: ProductPhoto[];
  loading: boolean;
  value: number | typeof NONE | null;
  onChange: (value: number | typeof NONE) => void;
}) {
  if (loading) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando avatares" />;
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(v === NONE ? NONE : Number(v))}>
      <SelectTrigger aria-label="Avatar" className="h-9 w-full min-w-0">
        <SelectValue placeholder="Avatar" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {avatars.map((photo, index) => (
            <SelectItem key={photo.id} value={String(photo.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/fotos/${photo.id}`} alt="" className="size-6 rounded-full object-cover" />
              Avatar {index + 1}
            </SelectItem>
          ))}
          <SelectItem value={NONE}>
            <UserX className="size-4 text-muted-foreground" aria-hidden />
            No aparece nadie
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Primer fotograma del archivo elegido, sin subir nada. */
function FilePreview({ src }: { src: string }) {
  return (
    <div className="relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
      <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

/**
 * `/lotes/nuevo`: nombre, producto por defecto y los vídeos de referencia (se arrastran varios a la
 * vez; cada archivo es una fila con su producto, su avatar y una indicación). «Crear y subir» crea
 * el lote y sus vídeos y pone las subidas en la cola (como mucho 2 a la vez); siguen aunque se
 * cambie de pantalla.
 */
export function NewBatch() {
  const router = useRouter();
  const client = useQueryClient();
  const { enqueue } = useReferenceUploads();
  const nameId = useId();
  const productId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [defaultProduct, setDefaultProduct] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductView[] }>("/api/productos"),
  });
  const productList = useMemo(() => products.data?.products ?? [], [products.data]);

  const productIds = [...new Set(rows.map((row) => row.productId).filter((id): id is number => id !== null))];
  const photoQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["photos", id],
      queryFn: () => api<{ photos: ProductPhoto[] }>(`/api/productos/${id}/fotos`),
    })),
  });
  const avatarsOf = (id: number | null) => {
    const index = id === null ? -1 : productIds.indexOf(id);
    const query = index >= 0 ? photoQueries[index] : undefined;
    return { loading: !query?.data, avatars: (query?.data?.photos ?? []).filter((photo) => photo.role === "avatar") };
  };
  /** El avatar que se mandará: el elegido o, por defecto, el primero del producto o «no aparece nadie». */
  const avatarOf = (row: Row): number | typeof NONE | null => {
    if (row.avatar !== null) return row.avatar;
    const { loading, avatars } = avatarsOf(row.productId);
    if (loading) return null;
    return avatars[0]?.id ?? NONE;
  };

  // Las vistas previas se sueltan al quitar una fila o salir de la pantalla.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function addFiles(list: FileList | File[]) {
    const files = [...list];
    const videos = files.filter((file) => VIDEO_TYPES.test(file.name) || /^video\/(mp4|quicktime|webm)$/.test(file.type));
    if (videos.length < files.length) toast.error("Solo vídeos MP4, MOV o WebM.");
    setRows((current) => [
      ...current,
      ...videos.map((file) => {
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        return {
          key: `fila-${++rowCounter}`,
          file,
          preview,
          productId: defaultProduct,
          productTouched: false,
          avatar: null,
          note: "",
          error: file.size > MAX_REFERENCE_BYTES ? "Pesa más de 100 MB." : null,
        };
      }),
    ]);
  }

  const update = (key: string, changes: Partial<Row>) => setRows((all) => all.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  function remove(row: Row) {
    URL.revokeObjectURL(row.preview);
    previews.current.delete(row.preview);
    setRows((all) => all.filter((r) => r.key !== row.key));
  }

  function chooseDefault(id: number) {
    setDefaultProduct(id);
    // Las filas que no se tocaron siguen al producto del lote.
    setRows((all) => all.map((row) => (row.productTouched ? row : { ...row, productId: id, avatar: null })));
  }

  const tooBig = rows.some((row) => row.file.size > MAX_REFERENCE_BYTES);
  const complete = rows.every((row) => row.productId !== null && avatarOf(row) !== null);
  const canCreate = name.trim().length > 0 && rows.length > 0 && complete && !tooBig && !busy;

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    try {
      let id = batchId;
      if (id === null) {
        id = (await api<{ batch: { id: number } }>("/api/lotes", { method: "POST", body: JSON.stringify({ name }) })).batch.id;
        setBatchId(id);
      }
      const done = new Set<string>();
      // De uno en uno: así los vídeos quedan numerados en el orden de las filas.
      for (const row of rows) {
        const avatar = avatarOf(row);
        try {
          const { video } = await api<{ video: { id: number } }>(`/api/lotes/${id}/videos`, {
            method: "POST",
            body: JSON.stringify({
              productId: row.productId,
              avatarPhotoId: avatar === NONE ? null : avatar,
              noPerson: avatar === NONE,
              note: row.note.trim() || null,
            }),
          });
          enqueue(video.id, row.file);
          done.add(row.key);
        } catch (error) {
          update(row.key, { error: error instanceof Error ? error.message : "No se pudo crear." });
        }
      }
      void client.invalidateQueries({ queryKey: ["batches"] });
      // Las vistas previas de las filas creadas ya no hacen falta; el archivo sigue en la cola de subida.
      for (const row of rows) if (done.has(row.key)) URL.revokeObjectURL(row.preview);
      if (done.size === rows.length) {
        router.push(`/lotes/${id}`);
        return;
      }
      setRows((all) => all.filter((row) => !done.has(row.key)));
      toast.error("Algunos vídeos no se han podido crear.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el lote.");
    } finally {
      setBusy(false);
    }
  }

  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      addFiles(event.dataTransfer.files);
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/lotes", label: "Lotes" }} title="Nuevo lote" />

      <section className="grid gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={nameId}>Nombre</Label>
          <Input
            id={nameId}
            autoFocus
            value={name}
            maxLength={100}
            placeholder="Pedido 54"
            disabled={batchId !== null}
            onChange={(event) => setName(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={productId}>Producto</Label>
          <ProductSelect id={productId} products={productList} value={defaultProduct} onChange={chooseDefault} />
        </div>
      </section>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {rows.length === 0 ? (
        <button
          type="button"
          {...dropProps}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
            dragging && "border-primary bg-muted/60",
          )}
        >
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Upload className="size-5" aria-hidden />
          </span>
          <span className="font-medium">Arrastra aquí los vídeos de referencia</span>
          <span className="text-muted-foreground">MP4, MOV o WebM · hasta 100 MB cada uno</span>
        </button>
      ) : (
        <section aria-label="Vídeos del lote" className="flex flex-col gap-3" {...dropProps}>
          <ul
            className={cn(
              "flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
              dragging && "ring-2 ring-primary",
            )}
          >
            {rows.map((row, index) => {
              const { loading, avatars } = avatarsOf(row.productId);
              return (
                <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
                    <FilePreview src={row.preview} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium" title={row.file.name}>
                        <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}</span>
                        {row.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{sizeLabel(row.file.size)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 lg:order-last"
                      aria-label={`Quitar ${row.file.name}`}
                      disabled={busy}
                      onClick={() => remove(row)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                    <div className="col-span-3 grid grid-cols-2 gap-2 lg:col-span-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-3">
                      <ProductSelect
                        label="Producto"
                        products={productList}
                        value={row.productId}
                        onChange={(id) => update(row.key, { productId: id, productTouched: true, avatar: null, error: row.file.size > MAX_REFERENCE_BYTES ? row.error : null })}
                      />
                      {row.productId === null ? (
                        <span />
                      ) : (
                        <AvatarSelect avatars={avatars} loading={loading} value={avatarOf(row)} onChange={(avatar) => update(row.key, { avatar })} />
                      )}
                      <Input
                        aria-label="Indicación"
                        value={row.note}
                        maxLength={MAX_NOTE}
                        placeholder="Indicación (opcional)"
                        onChange={(event) => update(row.key, { note: event.target.value.replace(/[\r\n]+/g, " ") })}
                        className="col-span-2 h-9 lg:col-span-1"
                      />
                    </div>
                  </div>
                  {row.error ? (
                    <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                      <CircleAlert className="size-4 shrink-0" aria-hidden />
                      {row.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" className="h-10 gap-2 px-4" disabled={busy} onClick={() => fileInput.current?.click()}>
              <FileVideo data-icon="inline-start" />
              Añadir vídeos
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {batchId !== null ? (
                <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-4")}>
                  Ir al lote
                </Link>
              ) : null}
              <Button className="h-10 gap-2 px-5" disabled={!canCreate} onClick={() => void create()}>
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                {batchId === null ? `Crear y subir (${rows.length})` : `Añadir y subir (${rows.length})`}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
