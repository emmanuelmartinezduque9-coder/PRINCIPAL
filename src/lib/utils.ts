import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une nombres de clase y resuelve los conflictos de Tailwind (la última gana). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales para un avatar: «Ana García» → «AG», «Dueño» → «D». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
