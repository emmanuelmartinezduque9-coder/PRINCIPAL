"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { onRadioKeyDown, radioTabIndex } from "./radio-keys";

/** Opciones en una pastilla (una elegida), con flechas del teclado. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  /** `short`: lo que se ve en pantallas estrechas, si el nombre entero no cabe. */
  options: ReadonlyArray<{ value: T; label: string; short?: string; icon?: LucideIcon }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selectedIndex = options.findIndex((option) => option.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid auto-cols-fr grid-flow-col rounded-lg bg-muted p-0.5", className)}>
      {options.map((option, index) => {
        const on = index === selectedIndex;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={option.short ? option.label : undefined}
            disabled={disabled}
            tabIndex={radioTabIndex(index, selectedIndex)}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onRadioKeyDown(event, (next) => onChange(options[next].value))}
            className={cn(
              "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
              on ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {option.short ? (
              <>
                <span className="truncate sm:hidden">{option.short}</span>
                <span className="hidden truncate sm:inline">{option.label}</span>
              </>
            ) : (
              <span className="truncate">{option.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
