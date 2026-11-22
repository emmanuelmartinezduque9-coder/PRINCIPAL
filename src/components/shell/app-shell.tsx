"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogOut, Package, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AuthUser } from "@/server/auth";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Brand } from "./brand";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Solo el dueño lo ve. */
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/reglas", label: "Reglas", icon: BookOpen, ownerOnly: true },
  { href: "/personas", label: "Personas", icon: Users, ownerOnly: true },
];

const ROLE_LABELS: Record<AuthUser["role"], string> = { dueno: "Dueño", colaborador: "Colaborador" };

/** Opciones del menú que ve una persona según su papel: el colaborador, Productos; el dueño, además Reglas y Personas (Gasto se añade cuando exista su pantalla). */
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

function HomeLink() {
  return (
    <Link
      href="/productos"
      aria-label="PRINCIPAL, ir a Productos"
      className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Brand />
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
      aria-label={label ? undefined : "Salir"}
      className={cn(
        "flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

function CurrentUser({ user }: { user: AuthUser }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold text-foreground"
      >
        {initials(user.name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{user.name}</span>
        {/* El papel solo se repite si dice algo que el nombre no dice. */}
        {user.name !== ROLE_LABELS[user.role] ? (
          <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
        ) : null}
      </span>
    </div>
  );
}

const scrollKey = (path: string) => `principal:scroll:${path}`;

function readScroll(path: string): number | null {
  try {
    const value = sessionStorage.getItem(scrollKey(path));
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function saveScroll(path: string, top: number) {
  try {
    sessionStorage.setItem(scrollKey(path), String(Math.round(top)));
  } catch {
    // Sin almacenamiento (ventana privada): simplemente no se recuerda la posición.
  }
}

/**
 * En el ordenador se desplaza la columna del contenido, no la ventana, así que lo que el
 * navegador hace solo con la ventana se hace aquí: el teclado (Espacio, AvPág, Inicio, Fin)
 * desplaza la columna desde que se abre la página, cada pantalla nueva empieza arriba y al
 * volver atrás se recupera la posición en la que se estaba.
 */
function useContentColumn(pathname: string) {
  const column = useRef<HTMLDivElement>(null);
  const cameBack = useRef(false);
  const current = useRef(pathname);

  // Guarda la posición de cada dirección mientras se desplaza.
  useEffect(() => {
    const el = column.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      // Al cambiar de pantalla el contenido se acorta y el navegador recorta la posición: ese
      // desplazamiento ya no es de la pantalla anterior (la dirección ha cambiado) y no se guarda.
      frame = requestAnimationFrame(() => {
        if (window.location.pathname === current.current) saveScroll(current.current, el.scrollTop);
      });
    };
    // Justo antes de seguir un enlace se guarda la posición exacta de la pantalla que se deja.
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) saveScroll(current.current, el.scrollTop);
    };
    const onPop = () => {
      cameBack.current = true;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    // Al recargar o llegar con «Atrás» desde otra web, también se recupera la posición.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    cameBack.current = nav?.type === "reload" || nav?.type === "back_forward";
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    const el = column.current;
    if (!el) return;
    current.current = pathname;
    const back = cameBack.current;
    cameBack.current = false;

    // El foco pasa a la columna salvo que la pantalla ya lo haya puesto en un campo.
    const active = document.activeElement;
    if (!active || active === document.body || !el.contains(active)) el.focus({ preventScroll: true });

    const target = back ? readScroll(pathname) : null;
    if (!target) {
      el.scrollTop = 0;
      return;
    }
    // El contenido puede tardar un poco en tener su alto (datos, imágenes): se reintenta
    // durante un segundo como mucho hasta poder llegar a la posición guardada.
    let tries = 0;
    let frame = 0;
    const restore = () => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) > 2 && tries++ < 60) frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return column;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const column = useContentColumn(pathname);
  const { data } = useMe();
  const items = navFor(data?.user?.role);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh bg-background md:h-dvh md:min-h-0 md:overflow-hidden">
      {/* Ordenador y tableta: menú lateral fijo. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex lg:w-60">
        <div className="flex h-16 items-center px-4">
          <HomeLink />
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-0.5 px-3 pt-3">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-foreground/[0.07] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "")} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t p-3">
          {data?.user ? <CurrentUser user={data.user} /> : null}
          <SignOutButton className="h-9 px-2.5" label="Salir" />
        </div>
      </aside>

      <div ref={column} tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none md:overflow-y-auto">
        {/* Móvil: cabecera sencilla. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <HomeLink />
          <SignOutButton className="size-10 justify-center" />
        </header>

        <main className="flex flex-1 flex-col px-4 pt-6 pb-28 md:px-8 md:pt-6 md:pb-8">
          <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col">{children}</div>
        </main>
      </div>

      {/* Móvil: barra inferior fija. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
