"use client";

import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface Step<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  done: boolean;
}

/** Los pasos del vídeo en una fila, en orden; cada uno es un botón (clic, Tab e Intro). */
export function Stepper<K extends string>({ steps, current, onSelect }: { steps: Step<K>[]; current: K; onSelect: (key: K) => void }) {
  return (
    <nav aria-label="Pasos del vídeo">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const active = step.key === current;
          const Icon = step.done ? Check : step.icon;
          return (
            <Fragment key={step.key}>
              {index > 0 ? (
                <li aria-hidden className="text-muted-foreground">
                  <ChevronRight className="size-4" />
                </li>
              ) : null}
              <li className="min-w-0 flex-1 sm:flex-none">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => onSelect(step.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border py-2 pr-5 pl-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto",
                    active ? "border-foreground/80 bg-card shadow-[0_1px_6px_-2px_rgb(0_0_0/0.12)]" : "bg-card hover:bg-muted/60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      step.done ? "bg-success text-white" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>{step.label}</span>
                    {step.done ? <span className="sr-only">(hecho)</span> : null}
                  </span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
