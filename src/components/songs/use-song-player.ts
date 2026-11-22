"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl } from "./labels";

export interface SongPlayer {
  /** La canción cargada (suene o no), o `null`. */
  songId: number | null;
  playing: boolean;
  /** Dónde va, en ms. */
  timeMs: number;
  /** Suena `songId` desde `fromMs` (o desde donde iba, si ya estaba cargada y no se dice). */
  play: (songId: number, fromMs?: number) => void;
  /** Pausa o sigue con `songId` (si es otra, empieza esa). */
  toggle: (songId: number, fromMs?: number) => void;
  pause: () => void;
  seek: (ms: number) => void;
}

/** Un reproductor para toda la pantalla: una sola canción suena a la vez. El audio llega con Range. */
export function useSongPlayer(): SongPlayer {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [songId, setSongId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const current = useRef<number | null>(null);

  const element = useCallback(() => {
    if (!audio.current) {
      const el = new Audio();
      el.preload = "auto";
      el.addEventListener("play", () => setPlaying(true));
      el.addEventListener("pause", () => setPlaying(false));
      el.addEventListener("ended", () => setPlaying(false));
      el.addEventListener("timeupdate", () => setTimeMs(Math.round(el.currentTime * 1000)));
      audio.current = el;
    }
    return audio.current;
  }, []);

  // Mientras suena, la posición se refresca a cada fotograma (el marcador se mueve suave).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audio.current) setTimeMs(Math.round(audio.current.currentTime * 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current?.removeAttribute("src");
    },
    [],
  );

  const play = useCallback(
    (id: number, fromMs?: number) => {
      const el = element();
      if (current.current !== id) {
        current.current = id;
        setSongId(id);
        el.src = audioUrl(id);
        setTimeMs(fromMs ?? 0);
      }
      if (fromMs !== undefined) el.currentTime = fromMs / 1000;
      void el.play().catch(() => setPlaying(false));
    },
    [element],
  );
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback(
    (id: number, fromMs?: number) => {
      if (current.current === id && audio.current && !audio.current.paused) audio.current.pause();
      else play(id, current.current === id ? undefined : fromMs);
    },
    [play],
  );
  const seek = useCallback((ms: number) => {
    if (audio.current) audio.current.currentTime = ms / 1000;
    setTimeMs(ms);
  }, []);

  return { songId, playing, timeMs, play, toggle, pause, seek };
}
