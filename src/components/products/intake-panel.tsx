"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ExternalLink, ImageIcon, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shell/panel";
import { api } from "@/lib/api";
import type { IntakeView } from "@/server/product-intake";
import type { Serialized } from "@/lib/api";

type View = Serialized<IntakeView>;
const RUNNING = ["trayendo", "analizando", "mockup"];

const STEPS: Array<{ key: string; label: string }> = [
  { key: "trayendo", label: "Traer el vídeo" },
  { key: "analizando", label: "Entender el producto y elegir la marca" },
  { key: "mockup", label: "Mockup sobre fondo gris" },
];

function stepState(status: string, key: string): "hecho" | "ahora" | "pendiente" {
  if (status === "listo") return "hecho";
  const order = STEPS.map((s) => s.key);
  const at = order.indexOf(status);
  const me = order.indexOf(key);
  if (at < 0) return "pendiente";
  return me < at ? "hecho" : me === at ? "ahora" : "pendiente";
}

/**
 * Alta automática desde un enlace: en qué paso va, qué encontró (marca y por qué, alternativas,
 * fuentes comprobadas) y el mockup. Se refresca solo mientras trabaja.
 */
export function IntakePanel({ productId }: { productId: number }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["intake", productId],
    queryFn: () => api<{ intake: View | null }>(`/api/productos/${productId}/alta`),
    refetchInterval: (q) => {
      const intake = q.state.data?.intake;
      return intake && (RUNNING.includes(intake.status) || intake.mockupStatus === "enviado") ? 4_000 : false;
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const intake = query.data?.intake;
  const running = !!intake && (RUNNING.includes(intake.status) || intake.mockupStatus === "enviado");
  const before = useRef<string | null>(null);
  const progress = intake ? `${intake.status}/${intake.mockupStatus}` : null;
  useEffect(() => {
    // Cada paso cambia la ficha o las fotos del producto: se vuelven a pedir.
    if (before.current !== null && before.current !== progress) {
      void client.invalidateQueries({ queryKey: ["product", String(productId)] });
      void client.invalidateQueries({ queryKey: ["photos", productId] });
      void client.invalidateQueries({ queryKey: ["products"] });
    }
    before.current = progress;
  }, [progress, client, productId]);
  if (!intake) return null;

  async function act(kind: "reanalizar" | "mockup", body: object = {}) {
    setBusy(kind);
    try {
      await api(kind === "reanalizar" ? `/api/productos/${productId}/alta` : `/api/productos/${productId}/alta/mockup`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await client.invalidateQueries({ queryKey: ["intake", productId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo hacer.");
    } finally {
      setBusy(null);
    }
  }

  const result = intake.result;
  const failed = intake.status === "fallido";
  const askCredits = intake.mockupStatus === "pendiente" && intake.status === "listo" && intake.mockupCredits;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          Alta automática
        </span>
      }
      actions={
        <a href={intake.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Ver enlace <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      {running || failed ? (
        <ol className="flex flex-col gap-2">
          {STEPS.filter((s) => s.key !== "trayendo" || intake.kind === "reel" || intake.kind === "cuenta").map((step) => {
            const state = failed ? (stepState(intake.status, step.key) === "hecho" ? "hecho" : "pendiente") : stepState(intake.status, step.key);
            return (
              <li key={step.key} className="flex items-center gap-2 text-sm">
                {state === "hecho" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                ) : state === "ahora" ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <span className="size-4 rounded-full border" aria-hidden />
                )}
                <span className={state === "pendiente" ? "text-muted-foreground" : ""}>
                  {step.key === "trayendo" && intake.kind === "cuenta" ? "Leer la cuenta y sus reels más vistos" : step.label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {intake.message ? (
        <p role={failed ? "alert" : "status"} className={failed ? "flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm" : "text-sm text-muted-foreground"}>
          {failed ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : null}
          {intake.message}
        </p>
      ) : null}

      {result && result.identificado ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <span className="font-medium">Marca elegida: {result.marca.nombre}.</span> {result.marca.porQue}
            {result.marca.alternativas.length ? <span className="text-muted-foreground"> Otras opciones: {result.marca.alternativas.join(", ")}.</span> : null}
          </p>
          <p>
            <span className="font-medium">Qué es:</span> {result.producto}. {result.mecanismo}
          </p>
          {(result.textoImpreso ?? []).some((t) => t.adaptado.trim() && t.adaptado.trim() !== t.original.trim()) ? (
            <p>
              <span className="font-medium">Texto del producto adaptado al idioma del país:</span>{" "}
              {(result.textoImpreso ?? []).map((t) => `«${t.original}» → «${t.adaptado}»`).join(" · ")}
            </p>
          ) : null}
          {result.sinVideo ? <p className="text-muted-foreground">Se analizó sin ver el vídeo (no se pudo traer).</p> : null}
          {result.motivo ? <p className="text-muted-foreground">Nota: {result.motivo}</p> : null}
          {result.fuentes.length ? (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Fuentes ({result.fuentes.length})</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.fuentes.map((f) => (
                  <li key={f.url} className="break-all">
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {f.url}
                    </a>{" "}
                    — {f.que}
                    {f.comprobada ? null : <span className="text-amber-700"> (sin comprobar)</span>}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {!running && intake.status !== "fallido" ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
            {intake.mockupStatus === "hecho" ? "Mockup sobre fondo gris listo: está en las fotos, como «Artículo»." : (intake.mockupNote ?? "Sin mockup.")}
          </p>
        </div>
      ) : null}

      {!running ? (
        <div className="flex flex-wrap gap-2">
          {askCredits ? (
            <Button className="h-10 px-4" disabled={busy !== null} onClick={() => void act("mockup", { aceptarCreditos: intake.mockupCredits })}>
              {busy === "mockup" ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Generar mockup ({intake.mockupCredits} créditos)
            </Button>
          ) : intake.status !== "fallido" && intake.mockupStatus !== "hecho" ? (
            <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => void act("mockup")}>
              {busy === "mockup" ? <Loader2 className="animate-spin" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
              Generar mockup
            </Button>
          ) : intake.mockupStatus === "hecho" ? (
            <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => void act("mockup")}>
              {busy === "mockup" ? <Loader2 className="animate-spin" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
              Otro mockup
            </Button>
          ) : null}
          <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => void act("reanalizar")}>
            {busy === "reanalizar" ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            Volver a analizar
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
