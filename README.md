# PRINCIPAL

Proyecto principal de las tiendas (EisWerk, EisWerk TM, HaarZauber): automatización de vídeos y
demás herramientas del negocio. Las webs que salgan de aquí se publicarán en Railway con acceso
para varias personas (correo y contraseña).

## Relación con Finanzas

La app de Finanzas vive en otro repositorio (`finanzas-tiendas`) y está publicada en Railway.

- **Desde este proyecto no se modifica Finanzas.** Ni su código ni sus datos, salvo que el dueño
  lo pida expresamente.
- Este proyecto puede **leer** datos de Finanzas (pedidos, costes, ventas) por un acceso de solo
  lectura. Ese acceso todavía no existe; añadirlo a Finanzas requiere permiso explícito.

## Dónde queda todo

- El código y los documentos viven en este repositorio de GitHub (privado).
- Las decisiones importantes se apuntan en `docs/` para que cualquier conversación nueva pueda
  continuar.
- Contraseñas y claves nunca van en el repositorio: van en las variables de Railway.

## Usarla

- **En tu ordenador:** `npm start` compila y abre la aplicación en <http://localhost:3000>. Sin
  inicio de sesión, porque solo escucha en tu propio ordenador. La base de datos local se crea
  sola.
- **En internet (Railway):** la web publicada pide correo y contraseña. La dirección pública se
  apuntará aquí cuando se publique (pendiente de seguir `docs/despliegue-railway.md`).

## Publicar cambios

`git push origin main` → GitHub pasa las pruebas (CI) → Railway publica solo la versión nueva.
La primera vez hay que montar el servicio a mano siguiendo `docs/despliegue-railway.md`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | En local: compila y abre la web. En Railway (`PRINCIPAL_CLOUD=1`): comprueba variables, migra y arranca web y proceso en segundo plano. |
| `npm run dev` | Modo desarrollo, con recarga. |
| `npm test` | Pruebas automáticas (con PostgreSQL embebido). |
| `npm run typecheck` | Comprobación de tipos. |
| `npm run lint` | Revisión de estilo. |
| `npm run build` | Compila la web. |
| `npm run db:generate` | Genera una migración tras cambiar `src/db/schema.ts`. |

## Dónde está cada cosa

- `src/app/` pantallas y rutas de la web; `src/server/` reglas de acceso y datos; `src/db/` base
  de datos (esquema, migraciones, datos iniciales); `src/lib/` utilidades (nube, bóveda, versión).
- `scripts/` arranque local (`dev.ts`) y en la nube (`start.ts`, `cloud.ts`).
- `src/worker/` proceso en segundo plano.
- `docs/despliegue-railway.md` guía de publicación; `docs/decisiones-base-plataforma.md`
  decisiones de diseño; `docs/decisiones-almacen-y-montaje-nube.md` almacén de archivos (Railway
  Buckets) y montaje en la nube; `docs/decisiones-alta-desde-enlace.md` «Nuevo producto» desde un
  enlace (ficha, marca, mockup gris) y la búsqueda de nicho, ángulo o audiencia con datos reales.
- `montador/` el montador de vídeos (Python), que corre en la nube; `Dockerfile` la imagen de
  Railway (Node, ffmpeg, Python con el montador, rea-video y yt-dlp).
- `agente-mac/` el programa del Mac: solo trae enlaces (Instagram, TikTok…) que la nube no alcanza.
