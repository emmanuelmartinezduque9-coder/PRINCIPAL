"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Music, Pause, Play, Search, SkipForward, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/server/auth";
import { ImportSongs } from "./import-songs";
import { SongLinkField, SongLinkRows, useSongLinks } from "./song-links";
import { formatTime, groupSongs, searchSongs, SONGS_KEY, type SongJson } from "./labels";
import { MiniTimeline, SongTimeline } from "./song-timeline";
import { useSongPlayer, type SongPlayer } from "./use-song-player";

export function useSongs() {
  return useQuery({ queryKey: SONGS_KEY, queryFn: () => api<{ songs: SongJson[] }>("/api/canciones"), staleTime: 60_000 });
}

function PlayButton({ song, player, className }: { song: SongJson; player: SongPlayer; className?: string }) {
  const playing = player.playing && player.songId === song.id;
  return (
    <Button
      variant={playing ? "default" : "ghost"}
      size="icon"
      className={cn("rounded-full", className)}
      aria-label={playing ? `Pausar ${song.title}` : `Escuchar ${song.title}`}
      onClick={(event) => {
        event.stopPropagation();
        player.toggle(song.id, song.startMs);
      }}
    >
      {playing ? <Pause /> : <Play />}
    </Button>
  );
}

/** El panel de la canción elegida: la onda con el inicio y el drop, y los controles. */
function SongDetail({ song, player, owner }: { song: SongJson; player: SongPlayer; owner: boolean }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const loaded = player.songId === song.id;
  const playing = loaded && player.playing;

  async function save(changes: { dropMs?: number | null; startMs?: number }) {
    const before = client.getQueryData<{ songs: SongJson[] }>(SONGS_KEY);
    client.setQueryData<{ songs: SongJson[] }>(SONGS_KEY, (data) =>
      data ? { songs: data.songs.map((s) => (s.id === song.id ? { ...s, ...changes } : s)) } : data,
    );
    try {
      await api(`/api/canciones/${song.id}`, { method: "PATCH", body: JSON.stringify(changes) });
    } catch (error) {
      if (before) client.setQueryData(SONGS_KEY, before);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function remove() {
    try {
      await api(`/api/canciones/${song.id}`, { method: "DELETE" });
      if (loaded) player.pause();
      setConfirm(false);
      await client.invalidateQueries({ queryKey: SONGS_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo borrar.");
    }
  }

  const here = loaded ? player.timeMs : null;
  return (
    <section aria-label={song.title} className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-foreground text-base font-semibold text-background tabular-nums">
          {song.number ?? <Music className="size-4" aria-hidden />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-lg font-semibold tracking-tight" title={song.title}>
            {song.title}
          </h2>
          <span className="truncate text-sm text-muted-foreground">{[formatTime(song.durationMs, false), ...song.sections].join(" · ")}</span>
        </div>
        {owner ? (
          <Button variant="ghost" size="icon" aria-label="Borrar canción" title="Borrar" onClick={() => setConfirm(true)}>
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <SongTimeline
        songId={song.id}
        durationMs={song.durationMs}
        dropMs={song.dropMs}
        startMs={song.startMs}
        positionMs={here}
        editable={owner}
        onSeek={(ms) => player.play(song.id, ms)}
        onMarker={(marker, ms) => void save(marker === "drop" ? { dropMs: ms } : { startMs: ms })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9 gap-1.5 px-3" onClick={() => (playing ? player.pause() : player.play(song.id, loaded ? undefined : song.startMs))}>
          {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {playing ? "Pausa" : "Escuchar"}
        </Button>
        <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={song.dropMs === null} onClick={() => player.play(song.id, song.dropMs ?? 0)}>
          <SkipForward data-icon="inline-start" />
          Escuchar desde el drop
        </Button>
        {owner ? (
          <>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={here === null} onClick={() => here !== null && void save({ dropMs: here })}>
              <Zap data-icon="inline-start" className="text-music" />
              Marcar drop aquí
            </Button>
            <Button variant="ghost" className="h-9 gap-1.5 px-3" disabled={here === null} onClick={() => here !== null && void save({ startMs: here })}>
              <Flag data-icon="inline-start" className="text-info-ink" />
              Inicio aquí
            </Button>
            {song.dropMs !== null ? (
              <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => void save({ dropMs: null })}>
                Quitar drop
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar «{song.title}»?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** `/canciones`: la biblioteca común por secciones, con búsqueda, escucha y el drop de cada canción. */
export function SongsScreen() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: AuthUser | null; authRequired: boolean }>("/api/auth/me"), staleTime: 5 * 60_000 });
  const owner = me.data?.user?.role === "dueno";
  const songs = useSongs();
  const player = useSongPlayer();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Una canción que llega de un enlace se abre en el editor del drop (aunque la búsqueda o la sección la escondan).
  const links = useSongLinks(owner, (songId) => {
    setQuery("");
    setSection(null);
    setSelectedId(songId);
  });

  const all = useMemo(() => songs.data?.songs ?? [], [songs.data]);
  const groups = useMemo(() => groupSongs(searchSongs(all, query)), [all, query]);
  const allGroups = useMemo(() => groupSongs(all), [all]);
  const shown = section === null ? groups : groups.filter((group) => group.section === section);
  const selected = all.find((song) => song.id === selectedId) ?? shown[0]?.songs[0] ?? null;
  const withDrop = all.filter((song) => song.dropMs !== null).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Canciones"
        actions={
          owner ? (
            <div className="flex flex-wrap items-center gap-2">
              <SongLinkField />
              <ImportSongs />
            </div>
          ) : null
        }
      >
        {all.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground tabular-nums">
            <span>{all.length} canciones</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-music" aria-hidden />
              {withDrop} con drop
            </span>
          </p>
        ) : null}
      </PageHeader>

      {owner ? <SongLinkRows links={links} /> : null}

      {songs.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" aria-label="Cargando las canciones">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : songs.isError ? (
        <p role="alert" className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-destructive">
          No se pudieron cargar las canciones.
        </p>
      ) : all.length === 0 ? (
        <EmptyState icon={Music} title="Sin canciones" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Buscar por número o título"
                placeholder="Número o título"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 pl-8"
              />
            </div>
            {allGroups.length > 1 ? (
              <div role="group" aria-label="Secciones" className="flex flex-wrap gap-1.5">
                {[{ section: null as string | null, count: all.length }, ...allGroups.map((g) => ({ section: g.section as string | null, count: g.songs.length }))].map((chip) => (
                  <button
                    key={chip.section ?? "todas"}
                    type="button"
                    aria-pressed={section === chip.section}
                    onClick={() => setSection(chip.section)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      section === chip.section ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {chip.section ?? "Todas"}
                    <span className="tabular-nums opacity-70">{chip.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="panel overflow-hidden">
              {shown.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nada con «{query}».</p>
              ) : (
                shown.map((group) => (
                  <section key={group.section} aria-label={group.section}>
                    <h3 className="sticky top-0 border-b bg-muted/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{group.section}</h3>
                    <ul className="divide-y">
                      {group.songs.map((song) => {
                        const active = selected?.id === song.id;
                        return (
                          <li key={song.id}>
                            <div className={cn("flex items-center gap-1 px-2 py-1 hover:bg-muted/50", active && "bg-muted hover:bg-muted")}>
                              <PlayButton song={song} player={player} className="size-8 shrink-0" />
                              <button
                                type="button"
                                aria-current={active || undefined}
                                onClick={() => setSelectedId(song.id)}
                                className="grid min-w-0 flex-1 grid-cols-[2.25rem_minmax(0,1fr)_5rem_3rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                <span className="text-right font-medium text-muted-foreground tabular-nums">{song.number ?? ""}</span>
                                <span className={cn("truncate", active && "font-medium")} title={song.title}>
                                  {song.title}
                                </span>
                                <MiniTimeline durationMs={song.durationMs} dropMs={song.dropMs} startMs={song.startMs} />
                                <span className="text-right text-xs text-muted-foreground tabular-nums">{formatTime(song.durationMs, false)}</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>
          <div className="lg:sticky lg:top-6">{selected ? <SongDetail key={selected.id} song={selected} player={player} owner={owner} /> : null}</div>
        </div>
      )}
    </div>
  );
}
