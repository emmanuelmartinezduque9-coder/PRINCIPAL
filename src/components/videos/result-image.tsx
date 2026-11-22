"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Una imagen que puede no cargar: mientras carga, un esqueleto; si falla, prueba la siguiente
 * dirección de `sources` (p. ej. la miniatura y, si no, la original) y, si ninguna sirve, el icono
 * de «sin imagen». Rellena su contenedor (que debe ser `relative`).
 */
export function ResultImage({ sources, className }: { sources: Array<string | null | undefined>; className?: string }) {
  const list = sources.filter((src): src is string => Boolean(src));
  const key = list.join("|");
  return <Fallbacks key={key} list={list} className={className} />;
}

function Fallbacks({ list, className }: { list: string[]; className?: string }) {
  const [at, setAt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = list[at];
  if (!src) {
    return (
      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
        <ImageOff className="size-6" role="img" aria-label="Sin imagen" />
      </div>
    );
  }
  return (
    <>
      {loaded ? null : <Skeleton className="absolute inset-0 rounded-none" aria-label="Cargando la imagen" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setAt((i) => i + 1);
        }}
        className={cn("absolute inset-0 size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0", className)}
      />
    </>
  );
}
