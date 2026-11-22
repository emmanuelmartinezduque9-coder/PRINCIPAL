"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, Copy, FileVideo, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProductView } from "@/components/products/labels";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ADAPTATION, MAX_NOTE, MAX_PRODUCT_NOTES } from "@/components/videos/brief-labels";
import { appendDictation, DictateButton } from "@/components/videos/dictate-button";
import type { ProductPhoto } from "@/components/videos/labels";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";
import {
  AvatarBadge,
  AvatarSelect,
  defaultAvatarChoice,
  KindSelect,
  ProductCover,
  ProductSelect,
  type AvatarChoice,
} from "./batch-fields";
import { autoBatchName } from "./labels";

/** Lo mismo que admite el servidor. */
const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES = /\.(mp4|mov|webm)$/i;

interface Row {
  key: string;
  file: File;
  preview: string;
  /** `null`: el avatar habitual del producto. */
  avatar: AvatarChoice | null;
  kind: VideoKind;
  /** «Qué adaptación quieres» (solo con adaptación). */
  adaptation: string;
  /** «Cambios específicos». */
  note: string;
  /** «Más opciones» abierto. */
  open: boolean;
  error: string | null;
}

/** Un producto del lote con sus «Indicaciones» y sus vídeos. */
interface Group {
  key: string;
  productId: number | null;
  notes: string;
  rows: Row[];
}

let counter = 0;
const nextKey = (prefix: string) => `${prefix}-${++counter}`;
const newGroup = (productId: number | null = null): Group => ({ key: nextKey("grupo"), productId, notes: "", rows: [] });

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

const isVideoFile = (file: File) => VIDEO_TYPES.test(file.name) || /^video\/(mp4|quicktime|webm)$/.test(file.type);

/** Primer fotograma del archivo elegido, sin subir nada. */
function FilePreview({ src }: { src: string }) {
  return (
    <div className="relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
      <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

/** Zona para soltar o elegir vídeos de un grupo. */
function DropZone({ onFiles, big, disabled }: { onFiles: (files: File[]) => void; big: boolean; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files) onFiles([...event.target.files]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onFiles([...event.dataTransfer.files]);
        }}
        className={cn(
          "flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          big ? "flex-col py-12" : "py-4",
          over && "border-primary bg-muted/60 text-foreground",
        )}
      >
        <Upload className="size-4" aria-hidden />
        <span className={cn(big && "font-medium text-foreground")}>Arrastra aquí los vídeos de referencia</span>
        {big ? <span>MP4, MOV o WebM · hasta 100 MB cada uno</span> : null}
      </button>
    </>
  );
}

/** Una tarjeta: el archivo, el tipo y los cambios; el avatar, en «Más opciones». */
function RowCard({
  row,
  index,
  avatars,
  loadingAvatars,
  avatar,
  busy,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: Row;
  index: number;
  avatars: ProductPhoto[];
  loadingAvatars: boolean;
  avatar: AvatarChoice | null;
  busy: boolean;
  onChange: (changes: Partial<Row>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const noteId = useId();
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 lg:grid-cols-[auto_minmax(0,11rem)_10rem_minmax(0,1fr)_auto]">
        <FilePreview src={row.preview} />
        <div className="flex min-w-0 flex-col pt-1">
          <span className="truncate text-sm font-medium" title={row.file.name}>
            <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}</span>
            {row.file.name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{sizeLabel(row.file.size)}</span>
        </div>
        <div className="flex items-center gap-0.5 lg:order-last">
          <Button
            variant="ghost"
            className="h-9 gap-1.5 px-2"
            aria-expanded={row.open}
            aria-label="Más opciones"
            title="Más opciones"
            onClick={() => onChange({ open: !row.open })}
          >
            <AvatarBadge choice={avatar} />
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", row.open && "rotate-180")} aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-9" aria-label={`Duplicar ${row.file.name}`} title="Duplicar" disabled={busy} onClick={onDuplicate}>
            <Copy aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-9" aria-label={`Quitar ${row.file.name}`} title="Quitar" disabled={busy} onClick={onRemove}>
            <Trash2 aria-hidden />
          </Button>
        </div>
        <KindSelect value={row.kind} onChange={(kind) => onChange({ kind })} className="col-span-3 lg:col-span-1" />
        <div className="col-span-3 flex min-w-0 flex-col gap-1 lg:col-span-1">
          <Textarea
            id={noteId}
            aria-label="Cambios específicos"
            placeholder="Cambios específicos"
            value={row.note}
            maxLength={MAX_NOTE}
            rows={1}
            onChange={(event) => onChange({ note: event.target.value })}
            className="field-sizing-content max-h-48 min-h-9 resize-y py-1.5"
          />
          <DictateButton className="self-end" onText={(text) => onChange({ note: appendDictation(row.note, text).slice(0, MAX_NOTE) })} />
        </div>
      </div>
      {row.kind === "adaptacion_concepto" ? (
        <Textarea
          aria-label="Qué adaptación quieres"
          placeholder="Qué adaptación quieres"
          value={row.adaptation}
          maxLength={MAX_ADAPTATION}
          rows={3}
          onChange={(event) => onChange({ adaptation: event.target.value })}
          className="min-h-20 resize-y lg:ml-12 lg:w-[calc(100%-3rem)]"
        />
      ) : null}
      {row.open ? (
        <div className="flex items-center gap-3 lg:ml-12">
          <span className="text-sm text-muted-foreground">Avatar</span>
          <AvatarSelect avatars={avatars} loading={loadingAvatars} value={avatar} onChange={(choice) => onChange({ avatar: choice })} className="w-56" />
        </div>
      ) : null}
      {row.error ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive lg:ml-12">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {row.error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * `/lotes/nuevo`, agrupado por producto como el panel antiguo: cada grupo tiene su producto, sus
 * «Indicaciones para los vídeos de …» y sus tarjetas (una por referencia que se suelta en él);
 * «Añadir otro producto» abre otro grupo en el mismo lote. Cada tarjeta pide tipo y cambios; el
 * avatar empieza con el habitual del producto y se cambia en «Más opciones». «Crear y subir» crea
 * el lote (con un nombre automático si se deja vacío), guarda las indicaciones, crea los vídeos y
 * pone las subidas en la cola (como mucho 2 a la vez).
 */
export function NewBatch() {
  const router = useRouter();
  const client = useQueryClient();
  const { enqueue } = useReferenceUploads();
  const nameId = useId();
  const autoId = useId();
  const [name, setName] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [groups, setGroups] = useState<Group[]>(() => [newGroup()]);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductView[] }>("/api/productos"),
  });
  const productList = useMemo(() => products.data?.products ?? [], [products.data]);
  const productOf = (id: number | null) => productList.find((product) => product.id === id);

  const productIds = [...new Set(groups.map((group) => group.productId).filter((id): id is number => id !== null))];
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
  /** El avatar que se mandará: el elegido o el habitual del producto. */
  const avatarOf = (group: Group, row: Row): AvatarChoice | null => {
    if (row.avatar !== null) return row.avatar;
    const { loading, avatars } = avatarsOf(group.productId);
    return loading ? null : defaultAvatarChoice(productOf(group.productId), avatars);
  };

  // Las vistas previas se sueltan al quitar una fila o salir de la pantalla.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const preview = (file: File) => {
    const url = URL.createObjectURL(file);
    previews.current.add(url);
    return url;
  };
  const release = (row: Row) => {
    URL.revokeObjectURL(row.preview);
    previews.current.delete(row.preview);
  };

  const updateGroup = (key: string, change: (group: Group) => Group) => setGroups((all) => all.map((group) => (group.key === key ? change(group) : group)));
  const updateRow = (groupKey: string, rowKey: string, changes: Partial<Row>) =>
    updateGroup(groupKey, (group) => ({ ...group, rows: group.rows.map((row) => (row.key === rowKey ? { ...row, ...changes } : row)) }));

  function addFiles(groupKey: string, files: File[]) {
    const videos = files.filter(isVideoFile);
    if (videos.length < files.length) toast.error("Solo vídeos MP4, MOV o WebM.");
    const rows = videos.map(
      (file): Row => ({
        key: nextKey("fila"),
        file,
        preview: preview(file),
        avatar: null,
        kind: "replicar",
        adaptation: "",
        note: "",
        open: false,
        error: file.size > MAX_REFERENCE_BYTES ? "Pesa más de 100 MB." : null,
      }),
    );
    updateGroup(groupKey, (group) => ({ ...group, rows: [...group.rows, ...rows] }));
  }

  function duplicate(groupKey: string, row: Row) {
    updateGroup(groupKey, (group) => {
      const at = group.rows.findIndex((r) => r.key === row.key);
      const copy: Row = { ...row, key: nextKey("fila"), preview: preview(row.file), error: row.file.size > MAX_REFERENCE_BYTES ? row.error : null };
      return { ...group, rows: [...group.rows.slice(0, at + 1), copy, ...group.rows.slice(at + 1)] };
    });
  }

  function removeRow(groupKey: string, row: Row) {
    release(row);
    updateGroup(groupKey, (group) => ({ ...group, rows: group.rows.filter((r) => r.key !== row.key) }));
  }

  function removeGroup(group: Group) {
    group.rows.forEach(release);
    setGroups((all) => all.filter((g) => g.key !== group.key));
  }

  const rowCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const filled = groups.filter((group) => group.rows.length > 0);
  const tooBig = groups.some((group) => group.rows.some((row) => row.file.size > MAX_REFERENCE_BYTES));
  const complete = filled.every(
    (group) =>
      group.productId !== null &&
      group.rows.every((row) => avatarOf(group, row) !== null && (row.kind !== "adaptacion_concepto" || row.adaptation.trim() !== "")),
  );
  const automaticName = autoBatchName(new Date(), filled.map((group) => productOf(group.productId)?.name ?? ""));
  const canCreate = rowCount > 0 && complete && !tooBig && !busy;

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    try {
      let id = batchId;
      if (id === null) {
        const body = { name: name.trim() || automaticName, autoAnalyze };
        id = (await api<{ batch: { id: number } }>("/api/lotes", { method: "POST", body: JSON.stringify(body) })).batch.id;
        setBatchId(id);
      }
      const done = new Set<string>();
      for (const group of filled) {
        // Las indicaciones antes que los vídeos: así el primer desglose ya las lleva.
        try {
          await api(`/api/lotes/${id}/productos/${group.productId}`, { method: "PUT", body: JSON.stringify({ notes: group.notes.trim() || null }) });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudieron guardar las indicaciones.");
          continue;
        }
        // De uno en uno: así los vídeos quedan numerados en el orden de las tarjetas.
        for (const row of group.rows) {
          const avatar = avatarOf(group, row);
          try {
            const { video } = await api<{ video: { id: number } }>(`/api/lotes/${id}/videos`, {
              method: "POST",
              body: JSON.stringify({
                productId: group.productId,
                avatarPhotoId: typeof avatar === "number" ? avatar : null,
                avatarMode: typeof avatar === "number" ? "elegido" : avatar,
                kind: row.kind,
                adaptation: row.kind === "adaptacion_concepto" ? row.adaptation.trim() : null,
                note: row.note.trim() || null,
              }),
            });
            enqueue(video.id, row.file);
            done.add(row.key);
          } catch (error) {
            updateRow(group.key, row.key, { error: error instanceof Error ? error.message : "No se pudo crear." });
          }
        }
      }
      void client.invalidateQueries({ queryKey: ["batches"] });
      // Las vistas previas de las tarjetas creadas ya no hacen falta; el archivo sigue en la cola de subida.
      for (const group of groups) for (const row of group.rows) if (done.has(row.key)) URL.revokeObjectURL(row.preview);
      if (done.size === rowCount) {
        router.push(`/lotes/${id}`);
        return;
      }
      setGroups((all) => all.map((group) => ({ ...group, rows: group.rows.filter((row) => !done.has(row.key)) })));
      toast.error("Algunos vídeos no se han podido crear.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el lote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/lotes", label: "Lotes" }} title="Nuevo lote" />

      <section className="grid gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={nameId}>Nombre</Label>
          <Input
            id={nameId}
            value={name}
            maxLength={100}
            placeholder={automaticName}
            disabled={batchId !== null}
            onChange={(event) => setName(event.target.value)}
            className="h-9"
          />
        </div>
        <label htmlFor={autoId} className="flex h-9 cursor-pointer items-center gap-2.5 text-sm">
          <input
            id={autoId}
            type="checkbox"
            role="switch"
            className="size-4 accent-foreground"
            checked={autoAnalyze}
            disabled={batchId !== null}
            onChange={(event) => setAutoAnalyze(event.target.checked)}
          />
          Desglosar al subir
        </label>
      </section>

      {groups.map((group) => {
        const product = productOf(group.productId);
        const { loading, avatars } = avatarsOf(group.productId);
        const used = new Set(groups.filter((g) => g.key !== group.key).map((g) => g.productId));
        return (
          <section
            key={group.key}
            aria-label={product ? `Vídeos de ${product.name}` : "Vídeos de un producto"}
            className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex flex-col gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <ProductCover product={product} />
                <ProductSelect
                  label="Producto"
                  products={productList.filter((p) => !used.has(p.id))}
                  value={group.productId}
                  onChange={(productId) =>
                    updateGroup(group.key, (g) => ({ ...g, productId, rows: g.rows.map((row) => ({ ...row, avatar: null })) }))
                  }
                  className={cn(
                    "max-w-72",
                    group.productId !== null && "border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:bg-muted/60 dark:bg-transparent",
                  )}
                />
                <span className="text-sm text-muted-foreground tabular-nums">{group.rows.length === 1 ? "1 vídeo" : `${group.rows.length} vídeos`}</span>
                {groups.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-8"
                    aria-label={`Quitar ${product?.name ?? "este producto"} del lote`}
                    title="Quitar del lote"
                    disabled={busy}
                    onClick={() => removeGroup(group)}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </div>
              {group.productId !== null ? (
                <Textarea
                  aria-label={`Indicaciones para los vídeos de ${product?.name ?? "este producto"}`}
                  placeholder={`Indicaciones para los vídeos de ${product?.name ?? "este producto"}`}
                  value={group.notes}
                  maxLength={MAX_PRODUCT_NOTES}
                  rows={2}
                  onChange={(event) => updateGroup(group.key, (g) => ({ ...g, notes: event.target.value }))}
                  className="min-h-14 resize-y"
                />
              ) : null}
            </div>
            {group.rows.length > 0 ? (
              <ul className="flex flex-col divide-y">
                {group.rows.map((row, index) => (
                  <RowCard
                    key={row.key}
                    row={row}
                    index={index}
                    avatars={avatars}
                    loadingAvatars={group.productId !== null && loading}
                    avatar={group.productId === null ? null : avatarOf(group, row)}
                    busy={busy}
                    onChange={(changes) => updateRow(group.key, row.key, changes)}
                    onDuplicate={() => duplicate(group.key, row)}
                    onRemove={() => removeRow(group.key, row)}
                  />
                ))}
              </ul>
            ) : null}
            <div className="p-4 pt-3">
              <DropZone big={group.rows.length === 0} disabled={busy || group.productId === null} onFiles={(files) => addFiles(group.key, files)} />
            </div>
          </section>
        );
      })}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          className="h-10 gap-2 px-4"
          disabled={busy || productList.length <= groups.length}
          onClick={() => setGroups((all) => [...all, newGroup()])}
        >
          <Plus data-icon="inline-start" />
          Añadir otro producto
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {batchId !== null ? (
            <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-4")}>
              Ir al lote
            </Link>
          ) : null}
          <Button className="h-10 gap-2 px-5" disabled={!canCreate} onClick={() => void create()}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : batchId === null ? <Upload data-icon="inline-start" /> : <FileVideo data-icon="inline-start" />}
            {batchId === null ? `Crear y subir (${rowCount})` : `Añadir y subir (${rowCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
