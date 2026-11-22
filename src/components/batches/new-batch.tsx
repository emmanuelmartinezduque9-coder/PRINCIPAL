"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Copy, FileVideo, Link2, Loader2, MonitorOff, Pencil, Plus, RotateCcw, Tag, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BodyPicker, HookStepper } from "@/components/library/body-picker";
import { productLabel, type ProductView } from "@/components/products/labels";
import { ActionBar } from "@/components/shell/action-bar";
import { PageHeader } from "@/components/shell/page-header";
import { MusicPicker } from "@/components/songs/music-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_ADAPTATION, MAX_NOTE, MAX_PRODUCT_NOTES } from "@/components/videos/brief-labels";
import { appendDictation, DictateButton } from "@/components/videos/dictate-button";
import type { ProductPhoto } from "@/components/videos/labels";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { useMac } from "@/components/videos/use-mac";
import { api } from "@/lib/api";
import { linkLabel, parsePastedLinks } from "@/lib/links";
import { cn } from "@/lib/utils";
import { useAvatars } from "@/components/avatars/avatars-screen";
import type { AvatarJson } from "@/components/avatars/labels";
import {
  AvatarPicker,
  avatarBody,
  defaultAvatarChoice,
  KindSegmented,
  ProductCover,
  ProductPicker,
  VariantPicker,
  VariantSwatches,
  type AvatarChoice,
  type VariantJson,
} from "./batch-fields";
import { autoBatchName } from "./labels";
import { newGroup, nextKey, type Group, type Row, type Source } from "./draft";
import { useNewBatchDraft } from "./draft-provider";
import { checkLink, EditReferenceButton, EditReferenceField } from "./edit-reference";
import { Indications } from "./indications";

/** Lo mismo que admite el servidor. */
const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES = /\.(mp4|mov|webm)$/i;
const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

const isVideoFile = (file: File) => VIDEO_TYPES.test(file.name) || /^video\/(mp4|quicktime|webm)$/.test(file.type);

const tooBig = (row: Row) => row.source.type === "file" && row.source.file.size > MAX_REFERENCE_BYTES;
/** Archivo soltado antes de recargar: hay que volver a arrastrarlo. */
const isMissing = (row: Row) => row.source.type === "missing";
/** Cómo se llama la tarjeta: el archivo, o el sitio y el código del enlace. */
const rowName = (row: Row) => {
  if (row.source.type === "file") return row.source.file.name;
  if (row.source.type === "missing") return row.source.name;
  const { host, code } = linkLabel(row.source.url);
  return code ? `${host} ${code}` : host;
};

/** Miniatura 9:16 de la tarjeta: el primer fotograma del archivo, o el icono del enlace. */
function RowPreview({ row }: { row: Row }) {
  return (
    <div className="relative grid h-[6.25rem] w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground ring-1 ring-foreground/[0.06] max-sm:hidden">
      {row.source.type === "file" ? (
        <video src={`${row.source.preview}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
      ) : row.source.type === "missing" ? (
        <FileVideo className="size-5" aria-hidden />
      ) : (
        <Link2 className="size-5" aria-hidden />
      )}
    </div>
  );
}

/**
 * Tarjeta de un archivo que se soltó antes de recargar la página: el navegador no lo conserva, así
 * que se vuelve a arrastrar (o elegir) aquí mismo.
 */
function RedropZone({ name, onFile, disabled }: { name: string; onFile: (file: File) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={`Vuelve a arrastrar ${name}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed border-warning/60 bg-warning/5 px-4 py-2.5 text-sm text-foreground transition-colors outline-none hover:bg-warning/10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          over && "border-brand bg-brand/5",
        )}
      >
        <RotateCcw className="size-4 text-warning-ink" aria-hidden />
        Vuelve a arrastrar este archivo
      </button>
    </>
  );
}

/**
 * Una sola zona para traer referencias: soltar vídeos (o elegirlos) y, para quien tiene Mac, pegar
 * enlaces (uno por línea; al pegar, con Intro o al salir del campo). Grande mientras el grupo está
 * vacío; después, una franja.
 */
function SourceZone({
  onFiles,
  onLinks,
  big,
  disabled,
  links,
  offline,
}: {
  onFiles: (files: File[]) => void;
  onLinks: (links: string[]) => void;
  big: boolean;
  disabled: boolean;
  /** Quien mira puede pegar enlaces (tiene Mac). */
  links: boolean;
  offline: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(0);
  const hintId = useId();
  const pasteOff = disabled || offline;

  function commit(raw: string) {
    const parsed = parsePastedLinks(raw);
    if (parsed.links.length > 0) onLinks(parsed.links);
    setText(parsed.invalid.join("\n"));
    setInvalid(parsed.invalid.length);
  }
  const hint = !links
    ? null
    : offline
      ? "El Mac no está conectado"
      : invalid > 0
        ? invalid === 1
          ? "No es un enlace de Instagram, TikTok, YouTube o Facebook"
          : `${invalid} no son enlaces de Instagram, TikTok, YouTube o Facebook`
        : null;

  const linkField = links ? (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15 dark:bg-input/30",
        big ? "w-full max-w-md" : "flex-1",
        invalid > 0 && "border-destructive/60",
        pasteOff && "opacity-60",
      )}
    >
      <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <textarea
        aria-label="Pegar enlaces"
        aria-invalid={invalid > 0 || undefined}
        aria-describedby={hint ? hintId : undefined}
        placeholder="Pega enlaces de Instagram, TikTok…"
        value={text}
        rows={1}
        disabled={pasteOff}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          if (invalid > 0) setInvalid(0);
        }}
        onPaste={(event) => {
          event.preventDefault();
          commit(`${text}\n${event.clipboardData.getData("text")}`);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          commit(text);
        }}
        onBlur={() => {
          if (text.trim()) commit(text);
        }}
        className="field-sizing-content max-h-32 min-h-5 w-full min-w-0 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files) onFiles([...event.target.files]);
          event.target.value = "";
        }}
      />
      <div
        role="group"
        aria-label="Añadir referencias"
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) onFiles([...event.dataTransfer.files]);
        }}
        className={cn(
          "relative rounded-xl border border-dashed transition-[background-color,border-color] duration-150",
          big ? "flex flex-col items-center gap-4 bg-sunken/60 px-6 py-10 text-center" : "flex flex-wrap items-center gap-3 bg-sunken/40 p-2.5",
          over ? "border-brand bg-brand/5" : "border-foreground/15",
          disabled && "opacity-60",
        )}
      >
        {big ? (
          <>
            <span aria-hidden className="relative flex items-center">
              <span className="grid size-12 -rotate-6 place-items-center rounded-xl bg-card text-muted-foreground shadow-raised ring-1 ring-border">
                <FileVideo className="size-5" />
              </span>
              <span className="-ml-3 grid size-12 rotate-6 place-items-center rounded-xl bg-card text-brand shadow-raised ring-1 ring-border">
                <Upload className="size-5" />
              </span>
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">{links ? "Suelta vídeos o pega enlaces" : "Suelta aquí los vídeos de referencia"}</p>
              <p className="text-sm text-muted-foreground">MP4, MOV o WebM · hasta 100 MB</p>
            </div>
            <div className="flex w-full flex-wrap items-start justify-center gap-2">
              <Button variant="outline" className="h-9 gap-2 px-3.5" disabled={disabled} onClick={() => input.current?.click()}>
                <Upload data-icon="inline-start" />
                Elegir vídeos
              </Button>
              {linkField}
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" className="h-9 gap-2 px-3 text-muted-foreground" disabled={disabled} onClick={() => input.current?.click()}>
              <Upload data-icon="inline-start" />
              {over ? "Suelta para añadir" : "Añadir vídeos"}
            </Button>
            {linkField}
          </>
        )}
      </div>
      {hint ? (
        <p id={hintId} role={offline ? "status" : "alert"} className={cn("flex items-center gap-1.5 text-xs", offline ? "text-muted-foreground" : "text-destructive")}>
          {offline ? <MonitorOff className="size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0" aria-hidden />}
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** El nombre de la tarjeta; si es un enlace, con el lápiz para cambiarlo (se valida como al pegar). */
function SourceName({ row, index, disabled, onLink }: { row: Row; index: number; disabled: boolean; onLink: (url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = rowName(row);
  const link = row.source.type === "link" ? linkLabel(row.source.url) : null;

  function save() {
    const checked = checkLink(text);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    onLink(checked.url);
    setEditing(false);
  }

  if (editing && row.source.type === "link") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            aria-label="Enlace de la referencia"
            aria-invalid={error !== null || undefined}
            value={text}
            spellCheck={false}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              } else if (event.key === "Escape") setEditing(false);
            }}
            className="h-8 min-w-0 flex-1"
          />
          <Button className="h-8 px-3" onClick={save}>
            Guardar
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Cancelar" onClick={() => setEditing(false)}>
            <X aria-hidden />
          </Button>
        </div>
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
      <span className="min-w-0 truncate text-sm font-medium" title={row.source.type === "link" ? row.source.url : name}>
        {link ? link.host : name}
        {link?.code ? <span className="font-normal text-muted-foreground"> · {link.code}</span> : null}
        {row.source.type !== "link" ? (
          <span className="font-normal text-muted-foreground tabular-nums"> · {sizeLabel(row.source.type === "file" ? row.source.file.size : row.source.size)}</span>
        ) : null}
      </span>
      {row.source.type === "link" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label="Cambiar enlace"
              disabled={disabled}
              onClick={() => {
                setText(row.source.type === "link" ? row.source.url : "");
                setError(null);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cambiar enlace</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/**
 * Una tarjeta: la miniatura y el nombre; el tipo (segmentado) y los cambios; a la derecha, la
 * variante, quién sale y la música (cada uno, una imagen que abre su selector visual).
 */
function RowCard({
  row,
  productId,
  coverPhotoId,
  index,
  avatars,
  loadingAvatars,
  avatar,
  library,
  variants,
  busy,
  editReference,
  onChange,
  onDuplicate,
  onRemove,
  onRedrop,
}: {
  row: Row;
  productId: number | null;
  coverPhotoId: number | null;
  index: number;
  avatars: ProductPhoto[];
  loadingAvatars: boolean;
  avatar: AvatarChoice | null;
  library: AvatarJson[];
  variants: VariantJson[];
  busy: boolean;
  /** El servidor guarda la «Edición de referencia». */
  editReference: boolean;
  onChange: (changes: Partial<Row>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRedrop: (file: File) => void;
}) {
  const name = rowName(row);
  const [refOpen, setRefOpen] = useState(false);
  return (
    <li className="group/row flex gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.015]">
      <RowPreview row={row} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-48 flex-1 pt-0.5">
            <SourceName row={row} index={index} disabled={busy} onLink={(url) => onChange({ source: { type: "link", url } })} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <VariantPicker variants={variants} coverPhotoId={coverPhotoId} value={row.variant} onChange={(variant) => onChange({ variant })} />
            <AvatarPicker
              avatars={avatars}
              library={library}
              loading={loadingAvatars}
              value={avatar}
              onChange={(choice) => onChange({ avatar: choice })}
            />
            <MusicPicker value={row.song} onChange={(song) => onChange({ song })} className="max-w-40" />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {editReference ? <EditReferenceButton value={row.editReference} open={refOpen} onOpenChange={setRefOpen} /> : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Duplicar ${name}`} disabled={busy} onClick={onDuplicate}>
                  <Copy aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Quitar ${name}`} disabled={busy} onClick={onRemove}>
                  <Trash2 aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quitar</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2.5">
          <KindSegmented value={row.kind} onChange={(kind) => onChange({ kind })} className="max-w-full overflow-x-auto" />
          <div className="relative min-w-60 flex-1">
            <Textarea
              aria-label="Cambios específicos"
              placeholder="Cambios específicos"
              value={row.note}
              maxLength={MAX_NOTE}
              rows={1}
              onChange={(event) => onChange({ note: event.target.value })}
              className="field-sizing-content max-h-48 min-h-9 resize-none py-1.5 pr-9"
            />
            <DictateButton iconOnly className="absolute top-1 right-1" onText={(text) => onChange({ note: appendDictation(row.note, text).slice(0, MAX_NOTE) })} />
          </div>
        </div>
        {row.source.type === "missing" ? <RedropZone name={name} onFile={onRedrop} disabled={busy} /> : null}
        {row.kind === "adaptacion_concepto" ? (
          <Textarea
            aria-label="Qué adaptación quieres"
            placeholder="Qué adaptación quieres"
            value={row.adaptation}
            maxLength={MAX_ADAPTATION}
            rows={2}
            onChange={(event) => onChange({ adaptation: event.target.value })}
            className={cn("min-h-16 resize-y", row.adaptation.trim() === "" && "border-kind-adapt/40")}
          />
        ) : null}
        {row.kind === "solo_gancho" && productId !== null ? (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <HookStepper value={row.hookSeconds} onChange={(hookSeconds) => onChange({ hookSeconds })} disabled={busy} />
            <BodyPicker productId={productId} value={row.bodies} onChange={(bodies) => onChange({ bodies })} className="min-w-0 flex-1" />
          </div>
        ) : null}
        {editReference && refOpen ? (
          <EditReferenceField value={row.editReference} onSave={(url) => onChange({ editReference: url ?? "" })} onClose={() => setRefOpen(false)} />
        ) : null}
        {row.error ? (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {row.error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** «Descartar borrador», con confirmación: vacía el formulario entero. */
function DiscardDraft({ onDiscard }: { onDiscard: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-3 text-muted-foreground hover:text-destructive">
          <Trash2 data-icon="inline-start" />
          Descartar borrador
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-6 p-6 sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>¿Descartar el borrador?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="h-10 px-4" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="h-10 px-4"
            onClick={() => {
              onDiscard();
              setOpen(false);
            }}
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cabecera de un producto del lote: la portada grande (la de la variante elegida para las tarjetas
 * nuevas) y, a su lado, el producto, el tipo de las tarjetas nuevas, las variantes como muestras
 * y las «Indicaciones» plegadas.
 */
function GroupHeader({
  group,
  product,
  products,
  variants,
  removable,
  busy,
  onProduct,
  onChange,
  onRemove,
}: {
  group: Group;
  product: ProductView | undefined;
  products: ProductView[];
  variants: VariantJson[];
  removable: boolean;
  busy: boolean;
  onProduct: (productId: number) => void;
  onChange: (change: Partial<Group>) => void;
  onRemove: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(group.notes.trim() !== "");
  const variant = variants.find((v) => v.id === group.variant);
  const coverId = variant?.articlePhotoIds[0] ?? product?.coverPhotoId ?? null;
  return (
    <div className="flex gap-5 p-5">
      <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted sm:size-28 text-muted-foreground shadow-card ring-1 ring-foreground/[0.06]">
        {coverId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={coverId} src={`/api/fotos/${coverId}`} alt="" className="absolute inset-0 size-full animate-in object-cover duration-200 fade-in-0" />
        ) : (
          <ProductCover product={undefined} className="size-full rounded-none bg-transparent ring-0" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <ProductPicker products={products} value={group.productId} onChange={onProduct} />
            {group.rows.length > 0 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{group.rows.length}</span>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <KindSegmented compact label="Tipo de los vídeos que vas a añadir" value={group.kind} onChange={(kind) => onChange({ kind })} />
            {group.kind === "solo_gancho" ? <HookStepper value={group.hookSeconds} onChange={(hookSeconds) => onChange({ hookSeconds })} disabled={busy} /> : null}
            {removable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Quitar ${product?.name ?? "este producto"} del lote`} disabled={busy} onClick={onRemove}>
                    <X aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Quitar del lote</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        {product ? (
          <>
            <VariantSwatches variants={variants} coverPhotoId={product.coverPhotoId ?? null} value={group.variant} onChange={(variant) => onChange({ variant })} />
            <Indications value={group.notes} open={notesOpen} onOpenChange={setNotesOpen}>
              <Textarea
                autoFocus={group.notes === ""}
                aria-label={`Indicaciones para los vídeos de ${product.name}`}
                placeholder={`Para todos los vídeos de ${product.name}`}
                value={group.notes}
                maxLength={MAX_PRODUCT_NOTES}
                rows={2}
                onChange={(event) => onChange({ notes: event.target.value })}
                className="min-h-16 resize-y"
              />
            </Indications>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `/lotes/nuevo`, agrupado por producto: cada grupo tiene su producto (portada grande y variantes
 * como muestras), sus «Indicaciones» y sus tarjetas (una por referencia que se suelta o enlace que
 * se pega). La variante y el tipo del grupo son los que reciben las tarjetas nuevas. Cada tarjeta
 * elige tipo, cambios, variante, quién sale y música; con «Solo gancho», además la duración del
 * gancho y los cuerpos. «Crear y subir» crea el lote (con un nombre automático si se deja vacío),
 * guarda las indicaciones, crea los vídeos y pone las subidas en la cola (como mucho 2 a la vez);
 * los vídeos de enlace se crean ya con su enlace y los trae el Mac de quien los crea.
 *
 * Pegar enlaces solo lo ve quien puede tener un Mac (el dueño); sin su Mac conectado, desactivado.
 */
export function NewBatch() {
  const router = useRouter();
  const client = useQueryClient();
  const { enqueue } = useReferenceUploads();
  const mac = useMac();
  const editReference = true; // el servidor ya guarda `editReferenceUrl`
  // Todo el formulario vive en el borrador del diseño: salir y volver no pierde nada.
  const { draft, hasDraft, setName, setAutoAnalyze, setGroups, setBatchId, preview, release, clear } = useNewBatchDraft();
  const { name, autoAnalyze, groups, batchId } = draft;
  const [busy, setBusy] = useState(false);

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
  const variantQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["variants", id],
      queryFn: () => api<{ variants: VariantJson[] }>(`/api/productos/${id}/variantes`),
    })),
  });
  const variantsOf = (id: number | null): VariantJson[] => {
    const index = id === null ? -1 : productIds.indexOf(id);
    return (index >= 0 ? variantQueries[index]?.data?.variants : undefined) ?? [];
  };
  const libraryQuery = useAvatars();
  const library = useMemo(() => (libraryQuery.data?.avatars ?? []).filter((avatar) => !avatar.retired), [libraryQuery.data]);
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

  /** Una tarjeta nueva, con el tipo, la duración del gancho y la variante que tenga elegidos su grupo. */
  const newRow = (source: Source, group: Pick<Group, "kind" | "hookSeconds" | "variant">): Row => ({
    key: nextKey("fila"),
    source,
    avatar: null,
    variant: group.variant,
    kind: group.kind,
    adaptation: "",
    hookSeconds: group.hookSeconds,
    bodies: [],
    note: "",
    editReference: "",
    song: null,
    open: false,
    error: null,
  });

  const updateGroup = (key: string, change: (group: Group) => Group) => setGroups((all) => all.map((group) => (group.key === key ? change(group) : group)));
  const updateRow = (groupKey: string, rowKey: string, changes: Partial<Row>) =>
    updateGroup(groupKey, (group) => ({ ...group, rows: group.rows.map((row) => (row.key === rowKey ? { ...row, ...changes } : row)) }));

  function addFiles(groupKey: string, files: File[]) {
    const defaults = groups.find((group) => group.key === groupKey) ?? newGroup();
    const videos = files.filter(isVideoFile);
    if (videos.length < files.length) toast.error("Solo vídeos MP4, MOV o WebM.");
    const rows = videos.map((file): Row => {
      const row = newRow({ type: "file", file, preview: preview(file) }, defaults);
      return { ...row, error: tooBig(row) ? "Pesa más de 100 MB." : null };
    });
    updateGroup(groupKey, (group) => ({ ...group, rows: [...group.rows, ...rows] }));
  }

  /** Cada enlace pegado es una tarjeta más; uno que ya está en el grupo no se repite. */
  function addLinks(groupKey: string, links: string[]) {
    updateGroup(groupKey, (group) => {
      const present = new Set(group.rows.flatMap((row) => (row.source.type === "link" ? [row.source.url] : [])));
      const fresh = links.filter((url) => !present.has(url));
      return { ...group, rows: [...group.rows, ...fresh.map((url) => newRow({ type: "link", url }, group))] };
    });
  }

  function duplicate(groupKey: string, row: Row) {
    updateGroup(groupKey, (group) => {
      const at = group.rows.findIndex((r) => r.key === row.key);
      const source: Source = row.source.type === "file" ? { ...row.source, preview: preview(row.source.file) } : row.source;
      const copy: Row = { ...row, key: nextKey("fila"), source, error: tooBig(row) ? row.error : null };
      return { ...group, rows: [...group.rows.slice(0, at + 1), copy, ...group.rows.slice(at + 1)] };
    });
  }

  /** El archivo de una tarjeta que se soltó antes de recargar, otra vez en memoria. */
  function redrop(groupKey: string, row: Row, file: File) {
    if (!isVideoFile(file)) {
      toast.error("Solo vídeos MP4, MOV o WebM.");
      return;
    }
    const next: Row = { ...row, source: { type: "file", file, preview: preview(file) } };
    updateRow(groupKey, row.key, { source: next.source, error: tooBig(next) ? "Pesa más de 100 MB." : null });
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
  const anyTooBig = groups.some((group) => group.rows.some(tooBig));
  const anyMissing = groups.some((group) => group.rows.some(isMissing));
  const complete = filled.every(
    (group) =>
      group.productId !== null &&
      group.rows.every((row) => avatarOf(group, row) !== null && (row.kind !== "adaptacion_concepto" || row.adaptation.trim() !== "")),
  );
  const automaticName = autoBatchName(new Date(), filled.map((group) => productOf(group.productId)?.name ?? ""));
  const canCreate = rowCount > 0 && complete && !anyTooBig && !anyMissing && !busy;

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
                ...avatarBody(avatar!),
                variantId: row.variant,
                kind: row.kind,
                adaptation: row.kind === "adaptacion_concepto" ? row.adaptation.trim() : null,
                ...(row.kind === "solo_gancho" ? { hookSeconds: row.hookSeconds, bodyClipIds: row.bodies } : {}),
                note: row.note.trim() || null,
                songId: row.song?.id ?? null,
                // Con enlace, el vídeo nace esperando al Mac; con archivo, se sube después.
                ...(row.source.type === "link" ? { linkUrl: row.source.url } : {}),
              }),
            });
            // La «Edición de referencia» va aparte, por el PUT del vídeo (solo si el servidor la guarda).
            if (editReference && row.editReference.trim()) {
              await api(`/api/videos/${video.id}`, { method: "PUT", body: JSON.stringify({ editReferenceUrl: row.editReference.trim() }) }).catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "No se pudo guardar la edición de referencia."),
              );
            }
            if (row.source.type === "file") enqueue(video.id, row.source.file);
            done.add(row.key);
          } catch (error) {
            updateRow(group.key, row.key, { error: error instanceof Error ? error.message : "No se pudo crear." });
          }
        }
      }
      void client.invalidateQueries({ queryKey: ["batches"] });
      if (done.size === rowCount) {
        // Todo enviado: el borrador se vacía (los archivos siguen en la cola de subida).
        clear();
        router.push(`/lotes/${id}`);
        return;
      }
      // Las vistas previas de las tarjetas creadas ya no hacen falta.
      for (const group of groups) for (const row of group.rows) if (done.has(row.key)) release(row);
      setGroups((all) => all.map((group) => ({ ...group, rows: group.rows.filter((row) => !done.has(row.key)) })));
      toast.error("Algunos vídeos no se han podido crear.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el lote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader back={{ href: "/lotes", label: "Lotes" }} title="Nuevo lote" actions={hasDraft && !busy ? <DiscardDraft onDiscard={clear} /> : null} />

      {groups.map((group) => {
        const product = productOf(group.productId);
        const { loading, avatars } = avatarsOf(group.productId);
        const used = new Set(groups.filter((g) => g.key !== group.key).map((g) => g.productId));
        const variants = variantsOf(group.productId);
        return (
          <section
            key={group.key}
            aria-label={product ? `Vídeos de ${productLabel(product)}` : "Vídeos de un producto"}
            className="panel flex flex-col overflow-hidden"
          >
            <GroupHeader
              group={group}
              product={product}
              products={productList.filter((p) => !used.has(p.id))}
              variants={variants}
              removable={groups.length > 1}
              busy={busy}
              // Otro producto: su avatar habitual, sus variantes y sus propios cuerpos.
              onProduct={(productId) =>
                updateGroup(group.key, (g) => ({ ...g, productId, variant: null, rows: g.rows.map((row) => ({ ...row, avatar: null, variant: null, bodies: [] })) }))
              }
              onChange={(change) => updateGroup(group.key, (g) => ({ ...g, ...change }))}
              onRemove={() => removeGroup(group)}
            />
            {group.rows.length > 0 ? (
              <ul className="flex flex-col divide-y border-t">
                {group.rows.map((row, index) => (
                  <RowCard
                    key={row.key}
                    row={row}
                    productId={group.productId}
                    coverPhotoId={product?.coverPhotoId ?? null}
                    index={index}
                    avatars={avatars}
                    loadingAvatars={group.productId !== null && loading}
                    avatar={group.productId === null ? null : avatarOf(group, row)}
                    library={library}
                    variants={variants}
                    busy={busy}
                    editReference={editReference}
                    onChange={(changes) => updateRow(group.key, row.key, changes)}
                    onDuplicate={() => duplicate(group.key, row)}
                    onRemove={() => removeRow(group.key, row)}
                    onRedrop={(file) => redrop(group.key, row, file)}
                  />
                ))}
              </ul>
            ) : null}
            <div className={cn("px-5 pb-5", group.rows.length > 0 ? "border-t pt-4" : "pt-0")}>
              <SourceZone
                big={group.rows.length === 0}
                disabled={busy || group.productId === null}
                links={mac.own}
                offline={!mac.online}
                onFiles={(files) => addFiles(group.key, files)}
                onLinks={(links) => addLinks(group.key, links)}
              />
            </div>
          </section>
        );
      })}

      <Button
        variant="ghost"
        className="h-12 gap-2 self-stretch rounded-xl border border-dashed text-muted-foreground hover:border-foreground/25 hover:text-foreground"
        disabled={busy || productList.length <= groups.length}
        onClick={() => setGroups((all) => [...all, newGroup()])}
      >
        <Plus data-icon="inline-start" />
        Añadir otro producto
      </Button>

      <ActionBar
        aside={
          <>
            <div className="relative w-full max-w-72">
              <Tag className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                aria-label="Nombre del lote"
                value={name}
                maxLength={100}
                placeholder={automaticName}
                disabled={batchId !== null}
                onChange={(event) => setName(event.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground">
              <Switch checked={autoAnalyze} disabled={batchId !== null} onCheckedChange={setAutoAnalyze} aria-label="Desglosar al subir" />
              Desglosar al subir
            </label>
          </>
        }
      >
        {batchId !== null ? (
          <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-4")}>
            Ir al lote
          </Link>
        ) : null}
        <Button className="h-10 gap-2 px-5" disabled={!canCreate} onClick={() => void create()}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : batchId === null ? <Upload data-icon="inline-start" /> : <FileVideo data-icon="inline-start" />}
          {batchId === null ? "Crear y subir" : "Añadir y subir"}
          <span className="rounded-md bg-primary-foreground/15 px-1.5 text-xs tabular-nums">{rowCount}</span>
        </Button>
      </ActionBar>
    </div>
  );
}
