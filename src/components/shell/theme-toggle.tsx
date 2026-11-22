"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Como el sistema", icon: Monitor },
] as const;

const subscribe = () => () => {};

/** Claro · Oscuro · Sistema, en el pie del menú lateral. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // El tema solo se conoce en el navegador: hasta entonces no se marca ninguno.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <ToggleGroup
      type="single"
      aria-label="Tema"
      value={mounted ? (theme ?? "system") : ""}
      onValueChange={(value) => value && setTheme(value)}
      className={className}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={value} aria-label={label} className="flex-1 px-0">
              <Icon />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
