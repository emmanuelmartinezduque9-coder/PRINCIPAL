"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Serialized } from "@/lib/api";
import type { AgentInfo } from "@/server/agent";

/** `GET /api/ajustes/agente`: todos reciben `online`; el dueño, además, sus Mac. */
export interface MacStatus {
  online: boolean;
  lastSeenAt?: string | null;
  agents?: Array<Serialized<AgentInfo>>;
}

export const MAC_KEY = ["ajustes", "agente"];

/**
 * El Mac de quien mira, para pegar enlaces. `own`: esta persona puede tener un Mac (hoy, solo el
 * dueño): a los demás no se les enseña nada de enlaces. `online`: su Mac está conectado ahora.
 */
export function useMac(options: { every?: number } = {}) {
  const query = useQuery({
    queryKey: MAC_KEY,
    queryFn: () => api<MacStatus>("/api/ajustes/agente"),
    refetchInterval: options.every ?? 30_000,
    staleTime: 5_000,
  });
  return { query, data: query.data, own: query.data?.agents !== undefined, online: query.data?.online === true };
}

/** Pide al Mac que traiga `url` como referencia del vídeo (también para reintentar un enlace que falló). */
export function requestLink(videoId: number, url: string): Promise<{ taskId: number }> {
  return api<{ taskId: number }>(`/api/videos/${videoId}/referencia/enlace`, { method: "POST", body: JSON.stringify({ url }) });
}
