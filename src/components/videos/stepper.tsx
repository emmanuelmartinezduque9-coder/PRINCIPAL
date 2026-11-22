"use client";

import { Check, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  done: boolean;
  /** Paso que aún no se puede abrir: no es un botón, solo se ve dónde está en el camino. */
  locked?: string;
}

/**
 * Los pasos del vídeo en una fila. Los que se pueden abrir son botones (clic, Tab e Intro);
 * los bloqueados se muestran con un candado y el motivo, sin hacer nada al pulsarlos.
 */
export function Stepper<K extends string>({ steps, current, onSelect }: { steps: Step<K>[]; current: K; onSelect: (key: K) => void }) {
  return (
    <nav aria-label="Pasos del vídeo">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {steps.map((step, index) => {
          const active = step.key === current;
          const Icon = step.done ? Check : step.locked ? Lock : step.icon;
          const badge = (
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                step.done ? "bg-emerald-500 text-white" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
          );
          const text = (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>{step.label}</span>
              </span>
              {step.locked ? <span className="text-xs text-pretty text-muted-foreground">{step.locked}</span> : null}
            </span>
          );
          return (
            <li key={step.key} className="min-w-0">
              {step.locked ? (
                <div aria-disabled className="flex h-full items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 opacity-75">
                  {badge}
                  {text}
                </div>
              ) : (
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => onSelect(step.key)}
                  className={cn(
                    "flex h-full w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "border-foreground/80 bg-card shadow-[0_1px_6px_-2px_rgb(0_0_0/0.12)]" : "bg-card hover:bg-muted/60",
                  )}
                >
                  {badge}
                  {text}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
