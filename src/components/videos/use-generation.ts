"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { KIND_PATH, type GenerationKind } from "./labels";

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * Lo que la persona puede hacer con la imagen inicial o el clip de un vídeo: aprobar un resultado,
 * rechazar la ronda con motivo y salir de una duda atascada («Es este» / «No está»). Cada acción
 * vuelve a pedir el vídeo al terminar, salga bien o mal (otra pestaña pudo cambiarlo).
 */
export function useGenerationActions(videoId: number, kind: GenerationKind) {
  const client = useQueryClient();
  const base = `/api/videos/${videoId}/${KIND_PATH[kind]}`;
  const refresh = () => client.invalidateQueries({ queryKey: ["video", videoId] });
  const post = <T>(path: string, body?: unknown) =>
    api<T>(`${base}/${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  const approve = useMutation({
    mutationFn: (resultId: number) => post("aprobar", { resultId }),
    onError: (error) => toast.error(message(error, "No se pudo aprobar.")),
    onSettled: refresh,
  });
  const reject = useMutation({
    mutationFn: (reason: string) => post("rechazar", { reason }),
    onError: (error) => toast.error(message(error, "No se pudo rechazar.")),
    onSettled: refresh,
  });
  const adopt = useMutation({
    mutationFn: (jobId: string) => post<{ risk: string }>("es-este", { jobId }),
    onError: (error) => toast.error(message(error, "No se pudo marcar.")),
    onSettled: refresh,
  });
  const dismiss = useMutation({
    mutationFn: () => post<{ risk: string }>("no-esta"),
    onError: (error) => toast.error(message(error, "No se pudo marcar.")),
    onSettled: refresh,
  });
  return { approve, reject, adopt, dismiss };
}
