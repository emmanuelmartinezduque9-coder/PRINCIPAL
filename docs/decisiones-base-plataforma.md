# Decisiones de diseño: base de la plataforma

## Tarea 1: andamiaje

- **`cn` propio.** Se quita el paquete `cn` (como pide el plan) y `src/lib/utils.ts` define `cn` con `clsx` y `tailwind-merge`, que es lo que espera shadcn.
- **Sin fuentes de Google.** `layout.tsx` no usa `next/font/google`: la compilación no depende de la red y la tipografía es la del sistema. Se puede cambiar más adelante.
- **`npm start`.** El script apunta a `scripts/start.ts`, que llega con la tarea de despliegue (el mapa de archivos del plan lo prevé); hasta entonces se usa `npm run dev`.
- **Pruebas como usuario sin privilegios.** PostgreSQL no arranca como `root`: en contenedores donde el usuario es `root`, las pruebas se lanzan con otro usuario.
