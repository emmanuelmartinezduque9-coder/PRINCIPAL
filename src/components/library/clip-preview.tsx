"use client";

import { Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Hace falta quedarse un momento encima para que el vídeo empiece: pasar el ratón por la rejilla
 * no descarga un vídeo por cada miniatura que roza.
 */
const HOVER_DELAY_MS = 140;

/**
 * Si un clip se está previsualizando: al pasar el ratón (tras una pausa corta) o al recibir el
 * foco con el teclado. Devuelve el estado y los manejadores para el elemento que lo dispara.
 */
export function useHoverPreview() {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return {
    active,
    handlers: {
      onPointerEnter: (event: React.PointerEvent) => {
        // En pantallas táctiles no hay «pasar por encima»: el toque abre el clip.
        if (event.pointerType !== "mouse") return;
        stop();
        timer.current = setTimeout(() => setActive(true), HOVER_DELAY_MS);
      },
      onPointerLeave: () => {
        stop();
        setActive(false);
      },
      onFocus: (event: React.FocusEvent) => {
        if (event.currentTarget.matches(":focus-visible")) setActive(true);
      },
      onBlur: () => {
        stop();
        setActive(false);
      },
    },
  };
}

/**
 * La miniatura vertical de un clip (rellena su contenedor, que debe ser `relative`): la imagen se
 * carga cuando se acerca a la pantalla; con `active`, encima se reproduce el vídeo sin sonido y en
 * bucle. Si la miniatura falta o no carga, un icono; el vídeo se sigue viendo al previsualizar.
 */
export function ClipPreview({ thumbUrl, videoUrl, active, className }: { thumbUrl: string | null; videoUrl: string; active: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <>
      {thumbUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={cn("absolute inset-0 size-full object-cover", className)}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          <Film className="size-5" aria-hidden />
        </span>
      )}
      {active ? (
        <video src={videoUrl} muted loop playsInline autoPlay preload="auto" aria-hidden className={cn("absolute inset-0 size-full object-cover", className)} />
      ) : null}
    </>
  );
}
