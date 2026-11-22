"use client";

import { Film } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { claimPreview } from "./preview-slot";

/**
 * Hace falta quedarse un momento encima (o con el foco) para que el vídeo empiece: pasar el ratón
 * por la rejilla, o recorrerla con el tabulador, no descarga un vídeo por cada miniatura que roza.
 */
export const PREVIEW_DELAY_MS = 140;

/**
 * Si un clip se está previsualizando: al pasar el ratón o al recibir el foco con el teclado, tras
 * una pausa corta. Hasta entonces el vídeo no existe en la página, así que no carga nada. Solo hay
 * una vista previa a la vez (`claimPreview`): al empezar una, la anterior se apaga. Devuelve el
 * estado y los manejadores para el elemento que lo dispara.
 */
export function useHoverPreview() {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    release.current?.();
    release.current = null;
    setActive(false);
  }, []);
  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      release.current = claimPreview(stop);
      setActive(true);
    }, PREVIEW_DELAY_MS);
  }, [stop]);
  useEffect(() => stop, [stop]);

  return {
    active,
    handlers: {
      onPointerEnter: (event: React.PointerEvent) => {
        // En pantallas táctiles no hay «pasar por encima»: el toque abre el clip.
        if (event.pointerType === "mouse") start();
      },
      onPointerLeave: stop,
      onFocus: (event: React.FocusEvent) => {
        if (event.currentTarget.matches(":focus-visible")) start();
      },
      onBlur: stop,
    },
  };
}

/**
 * La miniatura vertical de un clip (rellena su contenedor, que debe ser `relative`): la imagen se
 * carga cuando se acerca a la pantalla; con `active`, encima se reproduce el vídeo sin sonido y en
 * bucle (`preload="metadata"`: se va descargando según se reproduce, no entero de golpe). Si la
 * miniatura falta o no carga, un icono; el vídeo se sigue viendo al previsualizar.
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
        <video src={videoUrl} muted loop playsInline autoPlay preload="metadata" aria-hidden className={cn("absolute inset-0 size-full object-cover", className)} />
      ) : null}
    </>
  );
}
