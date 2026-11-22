"use client";

import { useQuery } from "@tanstack/react-query";
import { AudioLines, Check, Music, Pause, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTime, searchSongs, SONGS_KEY, type SongJson, type SongSummaryJson } from "./labels";
import { MiniTimeline } from "./song-timeline";
import { useSongPlayer } from "./use-song-player";

/** Lo que enseña el control con una canción elegida: el número grande y el título. */
function Chosen({ song }: { song: SongSummaryJson | null }) {
  if (!song) {
    return (
      <>
        <AudioLines className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-muted-foreground">Audio original</span>
      </>
    );
  }
  return (
    <>
      <span className="grid size-5 shrink-0 place-items-center rounded bg-music/15 text-music"><Music className="size-3" aria-hidden /></span>
      {song.number !== null ? <span className="font-semibold tabular-nums">{song.number}</span> : null}
      <span className="truncate">{song.title}</span>
    </>
  );
}

/**
 * «Música» de un vídeo: «Audio original» o una canción de la biblioteca. El botón abre la lista
 * con búsqueda por número o título y escucha previa; elegir guarda y cierra. En solo lectura, se ve
 * lo elegido.
 */
export function MusicPicker({
  value,
  onChange,
  readOnly = false,
  compact = false,
  className,
}: {
  value: SongSummaryJson | null;
  onChange: (song: SongJson | null) => void;
  readOnly?: boolean;
  /** En el tablero: solo el número (o el icono de audio original). */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = value ? `Música: ${value.number ?? ""} ${value.title}`.replace("  ", " ") : "Música: audio original";

  const face = compact ? (
    value ? (
      <>
        <Music className="size-3.5 text-music" aria-hidden />
        {value.number !== null ? <span className="font-semibold tabular-nums">{value.number}</span> : null}
      </>
    ) : (
      <AudioLines className="size-4 text-muted-foreground" aria-hidden />
    )
  ) : (
    <Chosen song={value} />
  );

  if (readOnly) {
    return (
      <span title={value ? value.title : "Audio original"} aria-label={label} className={cn("inline-flex h-8 min-w-0 items-center gap-1.5 text-sm", className)}>
        {face}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-8 min-w-0 justify-start gap-1.5 px-2.5 font-normal", compact && "px-2", className)}
          aria-label={label}
          title={value ? value.title : "Audio original"}
        >
          {face}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[26rem] flex-col gap-2 p-2" align="start">
        {open ? (
          <PickerList
            value={value}
            onPick={(song) => {
              setOpen(false);
              if ((song?.id ?? null) !== (value?.id ?? null)) onChange(song);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PickerList({ value, onPick }: { value: SongSummaryJson | null; onPick: (song: SongJson | null) => void }) {
  const songs = useQuery({ queryKey: SONGS_KEY, queryFn: () => api<{ songs: SongJson[] }>("/api/canciones"), staleTime: 60_000 });
  const player = useSongPlayer();
  const [query, setQuery] = useState("");
  const found = useMemo(() => searchSongs(songs.data?.songs ?? [], query), [songs.data, query]);

  const row = "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            type="search"
            aria-label="Buscar por número o título"
            placeholder="Número o título"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && found.length > 0) onPick(found[0]);
            }}
            className="h-9 border-0 bg-muted/60 pl-8 shadow-none focus-visible:ring-2"
          />
        </div>
        <div className="max-h-80 min-h-0 overflow-y-auto">
          {!query ? (
            <button type="button" className={row} onClick={() => onPick(null)}>
              <span className="grid size-8 place-items-center">
                <AudioLines className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="flex-1">Audio original</span>
              {value === null ? <Check className="size-4" aria-label="Elegida" /> : null}
            </button>
          ) : null}
          {songs.isLoading ? (
            <div className="flex flex-col gap-1.5 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : found.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{songs.data?.songs.length ? `Nada con «${query}».` : "Sin canciones"}</p>
          ) : (
            <ul className="flex flex-col">
              {found.map((song) => {
                const playing = player.playing && player.songId === song.id;
                return (
                  <li key={song.id} className="flex items-center gap-1">
                    <Button
                      variant={playing ? "default" : "ghost"}
                      size="icon"
                      className="size-8 shrink-0 rounded-full"
                      aria-label={playing ? `Pausar ${song.title}` : `Escuchar ${song.title}`}
                      onClick={() => player.toggle(song.id, song.dropMs ?? song.startMs)}
                    >
                      {playing ? <Pause /> : <Play />}
                    </Button>
                    <button type="button" className={row} onClick={() => onPick(song)} aria-label={`Elegir ${song.number ?? ""} ${song.title}`}>
                      <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{song.number ?? ""}</span>
                      <span className="min-w-0 flex-1 truncate">{song.title}</span>
                      <MiniTimeline durationMs={song.durationMs} dropMs={song.dropMs} startMs={song.startMs} className="w-16 shrink-0" />
                      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatTime(song.durationMs, false)}</span>
                      <span className="grid w-4 shrink-0 place-items-center">{value?.id === song.id ? <Check className="size-4" aria-label="Elegida" /> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
    </>
  );
}
