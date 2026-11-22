"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { api } from "@/lib/api";
import type { AuthUser } from "@/server/auth";
import { DiagnosticsPanel, HiggsfieldCard } from "./higgsfield-card";

const RESULT_TOASTS: Record<string, (reason: string | null) => void> = {
  conectado: () => toast.success("Higgsfield conectado."),
  cancelado: () => toast("Conexión cancelada."),
  error: (reason) => toast.error(`No se pudo conectar Higgsfield${reason ? ` (${reason})` : ""}.`),
};

/** Ajustes de cada persona: su propia conexión de Higgsfield (y, para el dueño, el diagnóstico). */
export function SettingsView({ result, reason }: { result: string | null; reason: string | null }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: AuthUser | null; authRequired: boolean }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || !result) return;
    shown.current = true;
    RESULT_TOASTS[result]?.(reason && /^[a-z_]{1,40}$/.test(reason) ? reason : null);
    // Se limpia la dirección para que recargar no repita el aviso.
    window.history.replaceState(null, "", "/ajustes");
  }, [result, reason]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ajustes" />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HiggsfieldCard />
        {me.data?.user?.role === "dueno" ? <DiagnosticsPanel /> : null}
      </div>
    </div>
  );
}
