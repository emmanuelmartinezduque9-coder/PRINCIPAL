"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, Link2, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Serialized } from "@/lib/api";
import { linkLabel, songLinkOf } from "@/lib/links";
import type { SongLink } from "@/server/song-downloads";
import { SONGS_KEY } from "./labels";

/**
 * «Pegar enlace» en Canciones (solo el dueño): el Mac descarga el audio como MP3 y la canción entra
 * en la biblioteca. Mientras tanto la fila dice «Descargando en el Mac…»; al llegar, se abre el
 * editor del drop sobre ella.
 */

type SongLinkJson = Serialized<SongLink>;
const LINKS_KEY = ["song-links"] as const;
const POLL_MS = 3000;
const pending = (link: SongLinkJson) => link.status === "queued" || link.status === "downloading";

/**
 * Los enlaces de canción del dueño; pregunta cada 3 s mientras alguno se descarga. Cuando uno que
 * se estaba descargando aquí llega, recarga la biblioteca y llama a `onReady` con la canción.
 */
export function useSongLinks(enabled: boolean, onReady: (songId: number) => void) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: LINKS_KEY,
    queryFn: () => api<{ links: SongLinkJson[] }>("/api/canciones/enlaces"),
    enabled,
    refetchInterval: (state) => (state.state.data?.links.some(pending) ? POLL_MS : false),
  });
  const waiting = useRef(new Set<number>());
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);
  const links = query.data?.links;
  useEffect(() => {
    for (const link of links ?? []) {
      if (pending(link)) waiting.current.add(link.id);
      else if (waiting.current.delete(link.id) && link.status === "done" && link.songId !== null) {
        const songId = link.songId;
        void client.invalidateQueries({ queryKey: SONGS_KEY }).then(() => ready.current(songId));
      }
    }
  }, [links, client]);
  return links ?? [];
}

/** El campo «Pegar enlace», junto a «Importar carpeta». */
export function SongLinkField() {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    if (songLinkOf(value) === null) {
      toast.error("Pega un enlace de YouTube, TikTok, Instagram, Facebook o SoundCloud.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/canciones/enlaces", { method: "POST", body: JSON.stringify({ url: value }) });
      setValue("");
      await client.invalidateQueries({ queryKey: LINKS_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo pedir la canción.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-w-0 items-center gap-1">
      <div className="relative min-w-0">
        <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="url"
          inputMode="url"
          aria-label="Pegar enlace"
          placeholder="Pegar enlace"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-9 w-56 max-w-full pl-8"
        />
      </div>
      <Button type="submit" variant="outline" size="icon" className="size-9 shrink-0" disabled={busy || !value.trim()} aria-label="Traer canción" title="Traer canción">
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
      </Button>
    </form>
  );
}

/** Las filas de los enlaces en marcha o fallidos (los hechos ya son canciones de la lista). */
export function SongLinkRows({ links }: { links: SongLinkJson[] }) {
  const client = useQueryClient();
  const shown = links.filter((link) => link.status !== "done");
  if (shown.length === 0) return null;

  async function dismiss(id: number) {
    try {
      await api(`/api/canciones/enlaces/${id}`, { method: "DELETE" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar.");
    }
    await client.invalidateQueries({ queryKey: LINKS_KEY });
  }

  return (
    <ul aria-label="Enlaces" className="divide-y overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
      {shown.map((link) => {
        const { host, code } = linkLabel(link.url);
        const failed = link.status === "failed";
        return (
          <li key={link.id} className="flex items-center gap-3 px-4 py-2">
            {failed ? (
              <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate" title={link.url}>
              <span className="font-medium">{host}</span>
              {code ? <span className="text-muted-foreground"> · {code}</span> : null}
            </span>
            <span className={failed ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"} role={failed ? "alert" : "status"}>
              {failed ? link.error : "Descargando en el Mac…"}
            </span>
            {failed ? (
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Quitar" title="Quitar" onClick={() => void dismiss(link.id)}>
                <X />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
