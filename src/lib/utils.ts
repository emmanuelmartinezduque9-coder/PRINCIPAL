import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une nombres de clase y resuelve los conflictos de Tailwind (la última gana). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
