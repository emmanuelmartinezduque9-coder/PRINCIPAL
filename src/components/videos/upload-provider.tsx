"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { uploadInChunks, type UploadSession } from "@/lib/chunked-upload";
import type { VideoViewJson } from "./labels";

/**
 * Subidas de la referencia en curso, en el navegador y no en el estado del vídeo: mientras se
 * sustituye una referencia lista, el vídeo sigue «lista» hasta que la nueva termina de subir.
 *
 * Viven en el diseño de la aplicación (no en la pantalla del vídeo), así que moverse por la web
 * —la pestaña Fotos, volver al producto, el menú— no corta la subida: al volver al vídeo, el paso
 * Referencia la vuelve a enseñar donde vaya. Cerrar o recargar la pestaña sí la corta (el
 * navegador lo avisa antes); la subida queda apuntada en `sessionStorage` por vídeo, nombre y
 * tamaño del archivo, y elegir otra vez el mismo archivo sigue donde iba. «Reintentar» también
 * sigue la misma subida en vez de empezar de cero.
 */

export type ReferenceUpload =
  | { kind: "idle" }
  /** `queued`: en la cola de un lote, esperando a que termine otra (como mucho `MAX_PARALLEL` a la vez). */
  | { kind: "uploading"; file: File; fraction: number; queued?: boolean }
  | { kind: "failed"; file: File; message: string };

interface UploadsContext {
  uploads: Record<number, ReferenceUpload>;
  start(videoId: number, file: File): void;
  /** Pone en cola la subida (las de un lote): suben como mucho `MAX_PARALLEL` a la vez. */
  enqueue(videoId: number, file: File): void;
  /** La pantalla del vídeo está abierta (para no repetir con un aviso lo que ya se ve en ella). */
  watch(videoId: number): () => void;
}

const Context = createContext<UploadsContext | null>(null);
const IDLE: ReferenceUpload = { kind: "idle" };
/** Subidas en cola que van a la vez, como mucho. */
export const MAX_PARALLEL = 2;

// `lastModified` evita mezclar dos archivos distintos con el mismo nombre y tamaño en una sola subida.
const storageKey = (videoId: number, file: File) =>
  `principal:subida:${videoId}:${file.size}:${file.lastModified}:${file.name}`;

/** Copia en memoria por si `sessionStorage` no está disponible (ventana privada): «Reintentar» sigue la misma subida. */
const memorySessions = new Map<string, UploadSession>();

function readSession(key: string): UploadSession | undefined {
  const inMemory = memorySessions.get(key);
  if (inMemory) return inMemory;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as UploadSession | null;
    return value && typeof value.uploadId === "string" && Number.isSafeInteger(value.chunkBytes) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, session: UploadSession | null) {
  if (session) memorySessions.set(key, session);
  else memorySessions.delete(key);
  try {
    if (session) sessionStorage.setItem(key, JSON.stringify(session));
    else sessionStorage.removeItem(key);
  } catch {
    // Sin almacenamiento (ventana privada): queda la copia en memoria para «Reintentar»; tras recargar se empieza de nuevo.
  }
}

export function ReferenceUploadsProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [uploads, setUploads] = useState<Record<number, ReferenceUpload>>({});
  const controllers = useRef(new Map<number, AbortController>());
  const watched = useRef(new Map<number, number>());
  const queue = useRef<Array<{ videoId: number; file: File }>>([]);
  const running = useRef(0);

  const uploading = Object.values(uploads).some((upload) => upload.kind === "uploading");
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const set = useCallback((videoId: number, upload: ReferenceUpload) => setUploads((all) => ({ ...all, [videoId]: upload })), []);

  /** Sube de verdad. Solo la llama `pump`, que lleva la cuenta de las que van a la vez. */
  const run = useCallback(
    async (videoId: number, file: File) => {
      controllers.current.get(videoId)?.abort();
      const own = new AbortController();
      controllers.current.set(videoId, own);
      const key = storageKey(videoId, file);
      set(videoId, { kind: "uploading", file, fraction: 0 });
      const offScreen = () => !watched.current.get(videoId);
      try {
        await uploadInChunks(file, videoId, {
          signal: own.signal,
          resume: readSession(key),
          onSession: (session) => writeSession(key, session),
          onProgress: (fraction) =>
            setUploads((all) => {
              const current = all[videoId];
              return current?.kind === "uploading" && current.file === file ? { ...all, [videoId]: { ...current, fraction } } : all;
            }),
        });
        if (own.signal.aborted) return;
        writeSession(key, null);
        // Ya está «preparándose»: se enseña al momento, sin esperar a la siguiente consulta.
        client.setQueryData<VideoViewJson>(["video", videoId], (view) =>
          view ? { ...view, video: { ...view.video, referenceStatus: "processing", referenceError: null } } : view,
        );
        set(videoId, IDLE);
        if (offScreen()) toast.success(`${file.name}: subido. Preparando el vídeo…`);
      } catch (error) {
        if (own.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        const message = error instanceof Error ? error.message : "No se pudo subir el vídeo.";
        set(videoId, { kind: "failed", file, message });
        if (offScreen()) toast.error(`${file.name}: ${message}`, { duration: 10_000 });
      } finally {
        if (controllers.current.get(videoId) === own) controllers.current.delete(videoId);
        void client.invalidateQueries({ queryKey: ["video", videoId] });
        void client.invalidateQueries({ queryKey: ["videos"] });
        void client.invalidateQueries({ queryKey: ["batch"] });
      }
    },
    [client, set],
  );

  const pump = useCallback(() => {
    const next = () => {
      while (running.current < MAX_PARALLEL && queue.current.length > 0) {
        const { videoId, file } = queue.current.shift()!;
        running.current += 1;
        void run(videoId, file).finally(() => {
          running.current -= 1;
          next();
        });
      }
    };
    next();
  }, [run]);

  /**
   * Toda subida pasa por la cola, también la que se elige a mano en la pantalla del vídeo (esa va la
   * primera): así nunca suben más de `MAX_PARALLEL` a la vez. Si ese vídeo ya estaba en cola, se
   * sustituye; si ya estaba subiendo, esa subida se corta y deja su hueco a la nueva.
   */
  const schedule = useCallback(
    (videoId: number, file: File, first: boolean) => {
      queue.current = queue.current.filter((item) => item.videoId !== videoId);
      if (first) queue.current.unshift({ videoId, file });
      else queue.current.push({ videoId, file });
      set(videoId, { kind: "uploading", file, fraction: 0, queued: true });
      controllers.current.get(videoId)?.abort();
      pump();
    },
    [pump, set],
  );
  const start = useCallback((videoId: number, file: File) => schedule(videoId, file, true), [schedule]);
  const enqueue = useCallback((videoId: number, file: File) => schedule(videoId, file, false), [schedule]);

  const watch = useCallback((videoId: number) => {
    watched.current.set(videoId, (watched.current.get(videoId) ?? 0) + 1);
    return () => watched.current.set(videoId, (watched.current.get(videoId) ?? 1) - 1);
  }, []);

  const value = useMemo<UploadsContext>(
    () => ({ uploads, start, enqueue, watch }),
    [uploads, start, enqueue, watch],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** La subida de la referencia de un vídeo, si hay una en este navegador, y cómo empezarla. */
export function useReferenceUpload(videoId: number) {
  const context = useContext(Context);
  if (!context) throw new Error("useReferenceUpload necesita ReferenceUploadsProvider.");
  const { uploads, start, watch } = context;
  useEffect(() => watch(videoId), [watch, videoId]);
  return { state: uploads[videoId] ?? IDLE, start: (file: File) => start(videoId, file) };
}

/** Todas las subidas de este navegador (para el tablero de un lote) y cómo poner una en cola. */
export function useReferenceUploads() {
  const context = useContext(Context);
  if (!context) throw new Error("useReferenceUploads necesita ReferenceUploadsProvider.");
  return { uploads: context.uploads, enqueue: context.enqueue };
}
