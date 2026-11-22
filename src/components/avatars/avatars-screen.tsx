"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CircleAlert, Loader2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { AVATAR_GROUPS, normalizeTag, type AvatarGroup } from "@/lib/avatar-groups";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/server/auth";
import { ImportAvatars } from "./import-avatars";
import { avatarImageUrl, AVATARS_KEY, GROUP_LABELS, type AvatarJson } from "./labels";

export function useAvatars() {
  return useQuery({ queryKey: AVATARS_KEY, queryFn: () => api<{ avatars: AvatarJson[] }>("/api/avatares"), staleTime: 60_000 });
}

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const chipClass = (on: boolean) => cn(CHIP, on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground");

/** Edad, rasgos, descripción, grupo y retirar: solo el dueño. */
function EditAvatar({ avatar, onClose }: { avatar: AvatarJson; onClose: () => void }) {
  const client = useQueryClient();
  const [group, setGroup] = useState<AvatarGroup>(avatar.group);
  const [age, setAge] = useState(avatar.ageYears === null ? "" : String(avatar.ageYears));
  const [tags, setTags] = useState(avatar.tags.join(", "));
  const [description, setDescription] = useState(avatar.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/avatares/${avatar.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await client.invalidateQueries({ queryKey: AVATARS_KEY });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  const ageValue = age.trim() === "" ? null : Number(age);
  const ageBad = ageValue !== null && !(Number.isInteger(ageValue) && ageValue >= 0 && ageValue <= 120);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {avatar.name}
            {avatar.retired ? <Badge variant="secondary">Retirado</Badge> : null}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-5 sm:grid-cols-[14rem_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (ageBad) return;
            void save({ group, ageYears: ageValue, tags: tags.split(",").map(normalizeTag).filter(Boolean), description });
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarImageUrl(avatar.id)} alt="" className="aspect-[3/4] w-full rounded-lg bg-muted object-cover" />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="avatar-grupo">Grupo</Label>
                <Select value={group} onValueChange={(value) => setGroup(value as AvatarGroup)}>
                  <SelectTrigger id="avatar-grupo" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {AVATAR_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {GROUP_LABELS[g]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="avatar-edad">Edad</Label>
                <Input
                  id="avatar-edad"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  value={age}
                  autoFocus={avatar.ageYears === null}
                  aria-invalid={ageBad || undefined}
                  onChange={(event) => setAge(event.target.value)}
                  className="h-9 tabular-nums"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="avatar-rasgos">Rasgos</Label>
              <Input id="avatar-rasgos" placeholder="aleman, rubia" value={tags} onChange={(event) => setTags(event.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="avatar-descripcion">Descripción</Label>
              <Textarea id="avatar-descripcion" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            {error ? (
              <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="sm:col-span-2 sm:justify-between">
            <Button type="button" variant="ghost" className="h-10 gap-2 px-3 text-muted-foreground" disabled={busy} onClick={() => void save({ retired: !avatar.retired })}>
              {avatar.retired ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
              {avatar.retired ? "Recuperar" : "Retirar"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="h-10 px-4" disabled={busy || ageBad}>
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AvatarCard({ avatar, onOpen }: { avatar: AvatarJson; onOpen: (() => void) | null }) {
  const body = (
    <>
      <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarImageUrl(avatar.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        <span
          className={cn(
            "absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow-sm",
            avatar.ageYears === null ? "bg-amber-400 text-amber-950" : "bg-background/90 text-foreground",
          )}
          title={avatar.ageYears === null ? "Sin edad" : "Edad"}
        >
          {avatar.ageYears ?? "¿?"}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1 pt-2 text-left">
        <span className="truncate text-sm font-medium">{avatar.name}</span>
        {avatar.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {avatar.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );
  const className = cn("flex w-full flex-col rounded-xl p-1.5", avatar.retired && "opacity-45");
  if (!onOpen) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Editar ${avatar.name}`}
      className={cn(className, "outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {body}
    </button>
  );
}

/** `/avatares`: la biblioteca global de avatares, con filtros por grupo y edad; el dueño edita e importa. */
export function AvatarsScreen() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: AuthUser | null }>("/api/auth/me"), staleTime: 5 * 60_000 });
  const owner = me.data?.user?.role === "dueno";
  const avatars = useAvatars();
  const [group, setGroup] = useState<AvatarGroup | null>(null);
  const [noAge, setNoAge] = useState(false);
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const all = useMemo(() => (avatars.data?.avatars ?? []).filter((avatar) => owner || !avatar.retired), [avatars.data, owner]);
  const groups = AVATAR_GROUPS.filter((g) => all.some((avatar) => avatar.group === g));
  const withoutAge = all.filter((avatar) => avatar.ageYears === null).length;
  const min = minAge === "" ? null : Number(minAge);
  const max = maxAge === "" ? null : Number(maxAge);
  const shown = all.filter((avatar) => {
    if (group !== null && avatar.group !== group) return false;
    if (noAge) return avatar.ageYears === null;
    if (min !== null && (avatar.ageYears === null || avatar.ageYears < min)) return false;
    if (max !== null && (avatar.ageYears === null || avatar.ageYears > max)) return false;
    return true;
  });
  const editingAvatar = all.find((avatar) => avatar.id === editing) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Avatares" actions={owner ? <ImportAvatars /> : null} />

      {avatars.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Cargando los avatares">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
          ))}
        </div>
      ) : avatars.isError ? (
        <p role="alert" className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-destructive">
          No se pudieron cargar los avatares.
        </p>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-20 text-center text-sm text-muted-foreground">
          <span className="grid size-12 place-items-center rounded-full bg-muted">
            <UserRound className="size-5" aria-hidden />
          </span>
          Sin avatares
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Grupo" className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)} className={chipClass(group === null)}>
                Todos <span className="tabular-nums opacity-70">{all.length}</span>
              </button>
              {groups.map((g) => (
                <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(group === g ? null : g)} className={chipClass(group === g)}>
                  {GROUP_LABELS[g]} <span className="tabular-nums opacity-70">{all.filter((avatar) => avatar.group === g).length}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground" role="group" aria-label="Edad">
              <span>Edad</span>
              <Input
                type="number"
                inputMode="numeric"
                aria-label="Edad mínima"
                placeholder="0"
                min={0}
                max={120}
                value={minAge}
                disabled={noAge}
                onChange={(event) => setMinAge(event.target.value)}
                className="h-7 w-16 tabular-nums"
              />
              <span aria-hidden>–</span>
              <Input
                type="number"
                inputMode="numeric"
                aria-label="Edad máxima"
                placeholder="120"
                min={0}
                max={120}
                value={maxAge}
                disabled={noAge}
                onChange={(event) => setMaxAge(event.target.value)}
                className="h-7 w-16 tabular-nums"
              />
            </div>
            {withoutAge > 0 ? (
              <button type="button" aria-pressed={noAge} onClick={() => setNoAge(!noAge)} className={chipClass(noAge)}>
                <span className="size-2 rounded-full bg-amber-400" aria-hidden />
                Sin edad <span className="tabular-nums opacity-70">{withoutAge}</span>
              </button>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Ninguno con esos filtros.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
              {shown.map((avatar) => (
                <li key={avatar.id}>
                  <AvatarCard avatar={avatar} onOpen={owner ? () => setEditing(avatar.id) : null} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editingAvatar ? <EditAvatar key={editingAvatar.id} avatar={editingAvatar} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
