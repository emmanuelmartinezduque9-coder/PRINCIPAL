"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/** Claro, oscuro o el del sistema (por defecto). Se guarda en este navegador. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
