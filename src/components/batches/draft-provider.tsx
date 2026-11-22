"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DRAFT_STORAGE_KEY, emptyDraft, hasContent, parseDraft, serializeDraft, type Draft, type Group, type Row } from "./draft";

/**
 * El borrador de «Nuevo lote» vive en el diseño de la aplicación (como las subidas de vídeo): ir
 * a Biblioteca, Gasto… y volver no pierde nada, tampoco los archivos soltados. Sin los archivos se
 * guarda además en `localStorage`, así que recargar o cerrar la pestaña conserva enlaces, textos
 * y opciones.
 */

interface DraftContext {
  draft: Draft;
  /** Hay un borrador sin enviar (para el punto de «Lotes» en el menú). */
  hasDraft: boolean;
  setName(name: string): void;
  setAutoAnalyze(value: boolean): void;
  setBatchId(id: number | null): void;
  setGroups(change: (groups: Group[]) => Group[]): void;
  /** Vista previa de un archivo soltado; se suelta al quitar la tarjeta o al vaciar el borrador. */
  preview(file: File): string;
  release(row: Row): void;
  /** Vacía el borrador (tras crear el lote o con «Descartar borrador»). */
  clear(): void;
}

const Context = createContext<DraftContext | null>(null);

function readStored(): Draft | null {
  try {
    return parseDraft(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function writeStored(draft: Draft) {
  try {
    if (hasContent(draft)) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft(draft)));
    else localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Sin almacenamiento (ventana privada): el borrador sigue en memoria mientras la pestaña esté abierta.
  }
}

export function NewBatchDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const previews = useRef(new Set<string>());

  // Lo guardado se lee después de montar: el servidor no tiene `localStorage`.
  useEffect(() => {
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- una sola vez, al montar
    if (stored) setDraft(stored);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeStored(draft);
  }, [draft, loaded]);

  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const preview = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    previews.current.add(url);
    return url;
  }, []);

  const release = useCallback((row: Row) => {
    if (row.source.type !== "file") return;
    URL.revokeObjectURL(row.source.preview);
    previews.current.delete(row.source.preview);
  }, []);

  const clear = useCallback(() => {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current.clear();
    setDraft(emptyDraft());
  }, []);

  const value = useMemo<DraftContext>(
    () => ({
      draft,
      hasDraft: hasContent(draft),
      setName: (name) => setDraft((d) => ({ ...d, name })),
      setAutoAnalyze: (autoAnalyze) => setDraft((d) => ({ ...d, autoAnalyze })),
      setBatchId: (batchId) => setDraft((d) => ({ ...d, batchId })),
      setGroups: (change) => setDraft((d) => ({ ...d, groups: change(d.groups) })),
      preview,
      release,
      clear,
    }),
    [draft, preview, release, clear],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNewBatchDraft(): DraftContext {
  const context = useContext(Context);
  if (!context) throw new Error("useNewBatchDraft necesita NewBatchDraftProvider");
  return context;
}
