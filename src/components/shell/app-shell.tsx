"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogOut, Package, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/server/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Solo el dueño lo ve. */
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/gasto", label: "Gasto", icon: Wallet },
  { href: "/reglas", label: "Reglas", icon: BookOpen, ownerOnly: true },
  { href: "/personas", label: "Personas", icon: Users, ownerOnly: true },
];

/** Opciones del menú que ve una persona según su papel. Todos ven Productos y Gasto; el dueño, además, Reglas y Personas. */
export function navFor(role: AuthUser["role"] | undefined): NavItem[] {
  return NAV.filter((item) => !item.ownerOnly || role === "dueno");
}

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: AuthUser | null; authRequired: boolean }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
}

function Brand() {
  return (
    <Link href="/productos" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
        <Sparkles className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">PRINCIPAL</span>
        <span className="block text-xs text-muted-foreground">Ángulos de venta</span>
      </span>
    </Link>
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  // Recarga completa a propósito: así no queda nada de la sesión anterior en pantalla.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

function SignOutButton({ className, label }: { className?: string; label?: string }) {
  const { data } = useMe();
  // Sin inicio de sesión (uso en el propio ordenador) no hay nada de lo que salir.
  if (!data?.authRequired || !data.user) return null;
  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Cerrar sesión"
      className={cn(
        "flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
        className,
      )}
    >
      <LogOut className="size-4 shrink-0" />
      {label}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useMe();
  const items = navFor(data?.user?.role);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh">
      {/* Escritorio: menú lateral. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card p-3 lg:flex">
        <div className="px-2.5 pt-2">
          <Brand />
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                isActive(href)
                  ? "bg-foreground/[0.06] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {data?.user ? <p className="truncate px-2.5 text-xs text-muted-foreground">{data.user.name}</p> : null}
          <SignOutButton className="h-10 px-2.5" label="Cerrar sesión" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Móvil: cabecera sencilla. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Brand />
          <SignOutButton className="size-10 justify-center" />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>

      {/* Móvil: barra inferior fija. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs transition-colors",
                  isActive(href) ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
