# Almacén propio y montaje en la nube (23/11/2026)

Dos cambios pedidos por el dueño: **todo lo generado se guarda en un almacén propio** (no en enlaces
de Higgsfield que caducan) y **el montaje automático pasa del Mac a la nube**. El Mac queda solo
como ayudante para traer enlaces (Instagram) y, si está apagado, nada importante se bloquea.

## 1. Almacén de objetos

- **Cuál**: Railway Buckets (S3 compatible), en el mismo proyecto que el servicio `principal`.
  Precio (docs de Railway, 23/11/2026): 0,015 $ por GB y mes; descargas y operaciones gratis.
  Privado: el navegador lee cada archivo con un **enlace firmado** que caduca (6 h).
- **El almacén creado** (23/11/2026, con el OK de Emmanuel): bucket **`principal-medios`** en el
  proyecto `finanzas-tiendas`, entorno `production`, región `ams` (Europa Oeste); nombre S3
  `principal-medios-q5bkgi7m`. Solo lo usa el servicio `principal` (Finanzas no tiene sus
  variables ni se tocó nada suyo). Las variables del servicio `principal` son referencias al bucket:
  `BUCKET_ENDPOINT=${{principal-medios.ENDPOINT}}`, `BUCKET_NAME=${{principal-medios.BUCKET}}`,
  `BUCKET_ACCESS_KEY_ID=${{principal-medios.ACCESS_KEY_ID}}`,
  `BUCKET_SECRET_ACCESS_KEY=${{principal-medios.SECRET_ACCESS_KEY}}` y `BUCKET_REGION=auto`
  (la firma S3 de Railway usa `auto`, no `ams`). Las claves nunca van al repositorio.
- **Variables** del servicio `principal`: `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`,
  `BUCKET_SECRET_ACCESS_KEY` (y opcionales `BUCKET_REGION`, por defecto `auto`, y
  `BUCKET_PATH_STYLE=1`). Van las cuatro juntas: con algunas sí y otras no, la web no arranca; sin
  ninguna, arranca y avisa (todo se sirve como antes, desde Higgsfield).
- **Código**: `src/lib/object-store.ts`. Firma S3 con `aws4fetch` (un archivo, sin el SDK de AWS).
  Subidas en flujo con `UNSIGNED-PAYLOAD` (no se carga el vídeo entero en memoria). En el propio
  ordenador, sin bucket, el almacén es una carpeta (`~/.principal/objetos`) servida por
  `/api/objetos/...` con enlaces firmados por la web (HMAC, caducan).

### Qué se copia y cómo (`src/server/videos/archive.ts`, tabla `stored_media`)

- **Una fila por trabajo de Higgsfield** (`job_id`, el mismo en `generation_results` y
  `library_clips`): las imágenes (`frame`) y los clips de las generaciones, y todos los clips de la
  biblioteca. `discoverMedia` crea las que falten con una sola consulta, así que **lo antiguo (la
  migración) y lo nuevo entran por el mismo camino**: no hay un script aparte.
- **Qué se guarda** en `medios/<trabajo>/`: el archivo tal cual (`original.mp4|.png|…`), una
  **miniatura** JPEG de 540 px y una **vista ligera**: MP4 de 480 px sin sonido, 24 fps, CRF 30 y
  `faststart` (unos cientos de KB por clip) para pasar el ratón por la biblioteca; JPEG de 1080 px
  para las imágenes.
- **Cuándo**: tarea programada `medios.copia` cada minuto en el proceso en segundo plano (como
  mucho ~1 minuto después de terminar la generación). 3 copias a la vez, 12 por pasada.
- **Idempotente**: las claves salen del trabajo; repetir una copia sustituye los mismos archivos.
  Cada copia se reserva 15 min con `for update skip locked` (dos procesos nunca copian lo mismo).
  Las horas se comparan con el reloj de la base de datos (con el del programa había una carrera).
- **Reintentos**: 8, cada vez más espaciados (1, 2, 4… minutos, 2 h como mucho); después `failed`
  con el motivo. Un contenido que no es vídeo/imagen falla a la primera (reintentar no lo arregla).
  Los clips antiguos cuyo enlace de Higgsfield ya caducó acabarán `failed`: se siguen viendo como
  antes (o no, si Higgsfield ya los borró).

### Cómo se sirve

- La **biblioteca**, los **cuerpos** y los resultados de las generaciones devuelven enlaces firmados
  del almacén cuando el trabajo ya está copiado (`mediaLinks`), y los de Higgsfield si aún no.
  Se firman en el propio listado (una firma HMAC local por archivo): el navegador va directo al
  bucket, sin pasar por la web ni por una redirección por miniatura.
- La vista previa al pasar el ratón usa la **vista ligera** (`previewUrl`) en vez del vídeo entero.
- Las **descargas** (clip y cuerpo) redirigen (302) a un enlace firmado con el nombre del archivo
  (`response-content-disposition`).

### Canciones y fotos (`bytea`): se quedan en la base de datos, de momento

Valorado y **no movido**: las canciones son pocas (57 = 114 MB, máx. 25 MB cada una), las fotos de
producto son pequeñas (máx. 8 MB) y van con la copia de seguridad de la base de datos. Lo grande y
que crece sin parar son los vídeos generados y los **montajes** (hasta 200 MB cada uno): esos sí van
al almacén (los montajes nuevos; los antiguos siguen en `edits.data`). Si las canciones o fotos
crecen mucho, se mueven con el mismo `ObjectStore`.

## 2. Montaje en la nube

### Imagen de Railway (`Dockerfile`)

Antes Railpack (solo Node + ffmpeg). Ahora un `Dockerfile` propio, porque hace falta Python:

- Node 22, ffmpeg, Noto Color Emoji (emojis de los rótulos) y DejaVu (pruebas).
- `/opt/montador` (venv de Python): `montador/requirements.txt` (librosa, soundfile, numpy,
  Pillow, freetype-py, uharfbuzz, yt-dlp) y **rea-video** en el commit `a124acd` (el que se usaba en
  el Mac), con su modelo de separación ya dentro de la imagen.
- La **fuente de los rótulos** (TikTok Display Medium) **no** va en el repositorio ni en la
  imagen: está en el almacén (`recursos/fuentes/TikTok-Display-Medium.ttf`), se sube una vez con
  `railway run npx tsx scripts/subir-fuente.ts "<ruta>"` y el montaje la baja la primera vez.
- CI (`.github/workflows/pruebas.yml`, trabajo «Imagen de Railway y montador») construye la misma
  imagen y lanza dentro las pruebas del montador, con un montaje de verdad. Railway espera al CI.

### Rótulos sin Swift (`montador/texto06b.py`)

`texto06b.swift` (AppKit) solo existe en macOS. `texto06b.py` hace el mismo dibujo en cualquier
sistema: **HarfBuzz** (uharfbuzz) para las formas (kerning y ligaduras fi/fl como CoreText) y
**FreeType** (freetype-py) para dibujar cada glifo sin hinting, con su posición fraccionaria; trazo
negro de 0,05 em con uniones redondeadas debajo del relleno blanco; misma regla de tamaño (de 74
hacia abajo), misma caja 886×318, interlínea 35/31 y alto de línea `round(asc)+round(desc)` como
AppKit (medido). macOS engorda un poco el relleno: se imita con 0,35 px.

**Comprobación** (`montador/test_texto06b.py`, con PNG del Swift en `montador/referencias-06b/`):
mismos tamaños de letra en los 5 rótulos de prueba, caja del texto a ±1 px y diferencia media de
color ~1 % (2,5/255). A simple vista no se distinguen. Los emojis: en la nube salen con Noto Color
Emoji (en el Mac, Apple Color Emoji): mismo tamaño (0,92 em) y posición, otro dibujo.

`montar_auto.py` usa `texto06b.py` siempre (también en el Mac); sin sus dependencias vuelve al
dibujo simple con Pillow y lo avisa.

### Cola y concurrencia (`src/server/videos/montaje-nube.ts`, tabla `edit_runs`)

- «Montar» / lote listo crea un `edit_run` con la ficha (`EditSpec` v2). **Ya no hace falta el Mac**
  para montar (desaparece «Montaje: necesita el Mac»).
- El proceso en segundo plano revisa la cola cada 10 s y monta hasta `MONTAJE_CONCURRENCIA`
  (variable; 2 por defecto) a la vez; el resto espera por orden de llegada. Reserva con `for update
  skip locked`, latido cada 30 s; sin latido en 3 min (reinicio, publicación nueva) vuelve a la
  cola, y a los 3 intentos falla con «El montaje se interrumpió varias veces». Al parar el proceso,
  los montajes en marcha vuelven a la cola sin gastar intento.
- Entradas: clips del **almacén propio** (o de Higgsfield si aún no se copiaron), la canción de la
  biblioteca, el audio guardado de la referencia, la fuente. El montador se lanza con un entorno
  sin secretos (ni base de datos ni claves).
- Salida: el MP4 al almacén (`montajes/<vídeo>/<montaje>.mp4`) y una versión nueva en `edits`
  (`storage_key`; `data` solo si no hay almacén). Se ve y se descarga con enlace firmado.

### Enlaces (referencia de edición y «Audio original» de un enlace) — `src/server/link-media.ts`

- Una fila por enlace en `link_media`, compartida por todos los montajes; el vídeo va al almacén
  (`enlaces/<id>.mp4`) y el desglose de rea-video se guarda una vez (`breakdown`).
- **Primero la nube** con yt-dlp (TikTok/YouTube suelen dejar). **Si no puede** (Instagram), una
  tarea `media_fetch` para el Mac del dueño (programa 1.4.0, `puede: ["enlace_medio"]`), que lo baja
  con la sesión de Brave y lo entrega por trozos como una canción.
- **Nada se bloquea por el Mac**: el montaje espera mientras el Mac da señales, como mucho 20 min
  desde que se pidió (vuelve a mirar cada minuto, sin gastar intento). Si el Mac no responde, monta
  sin ese enlace y lo dice en los avisos del montaje («El Mac no responde y la nube no pudo traer la
  referencia de edición: se monta sin ella»).

### El Mac (agente 1.4.0)

- Ya no monta: se quitó el montador del programa y del instalador; la web dejó de dar tareas
  `montaje` (la migración `0028` cierra las que quedaran y los vídeos «en marcha» pasan a «pulsa
  Volver a montar»). Rutas retiradas: `/api/agente/tareas/<id>/cancion` y `/audio-referencia`.
- Sigue trayendo: referencias pegadas, canciones y ahora los enlaces que pide el montaje.
- Avisos claros en la web cuando el Mac no responde (Pegar enlaces del lote y del paso Referencia).

## Lo que queda

- Columnas antiguas sin uso: `videos.edit_task_id` y los montajes antiguos en `edits.data`
  (se pueden pasar al almacén y borrar más adelante).
- Canciones y fotos siguen en `bytea` (ver arriba).
- El tope de yt-dlp en el Mac es 100 MB por vídeo (suficiente para un reel).

## Comprobación con datos reales (23/11/2026)

- **Almacén**: a la media hora de publicar, 288 trabajos copiados (4,3 GB) y 222 en cola, sin
  ningún error.
- **Montaje en la nube** (dentro del servidor de Railway, sin crear nada en la base de datos): los
  dos clips del pedido 54 que el dueño dio por buenos (gancho `88a7e7b3…` + vídeo `263f4aa8…` como
  cuerpo reutilizado), desde el almacén propio, con «Let It Snow» y su drop (7,49 s) y los rótulos
  del V02. Tardó **47 s**: 14,0 s de vídeo, 10 planos, 5/9 cortes en beat, autocomprobación bien.
  El mismo montaje en el Mac con `texto06b.swift` da exactamente lo mismo (duración, planos,
  cortes); los fotogramas no se distinguen (solo el dibujo de los emojis, Noto en vez de Apple).
  El resultado quedó en el almacén (`pruebas/pedido54-gancho-cuerpo-*.mp4`).
- Para lanzarla se añadió una llave SSH temporal a la cuenta de Railway (con el OK del dueño) y se
  borró después (de Railway y del disco).

## Descargar los vídeos terminados de un lote (23/11/2026)

Pedido por Emmanuel: no sabía dónde ver los resultados de un lote, y al terminar pasa todos los
vídeos al iPhone por AirDrop.

- **Dónde**: en el lote, arriba del todo, el bloque **«Vídeos terminados · N de M»** (verde cuando
  el lote ha terminado). En la lista de lotes, cada tarjeta dice «N vídeos terminados · Descargar».
  La barra de abajo del lote lleva «Descargar terminados (N)» (el ZIP).
- **Opciones**: «Descargar todos (ZIP)» con una carpeta por cuenta; por cuenta, «ZIP de <cuenta>» y
  «Sueltos»; «N archivos sueltos» para todos; y cada vídeo por separado (sus nombres, debajo de su
  cuenta). AirDrop desde el Mac va mejor con MP4 sueltos: el ZIP se abre con doble clic y deja una
  carpeta con los vídeos; «sueltos» los deja directamente en Descargas (el navegador puede pedir
  permiso una vez para varias descargas).
- **Nombres**: «EisWerk - 03 - 2026-11-23.mp4» = cuenta (nombre del producto), número del vídeo en
  el lote (orden de creación, el del tablero) y fecha del montaje en hora de Alemania. Igual en el ZIP
  y en la descarga suelta.
- **ZIP en el servidor** (`src/server/media/zip.ts`, `/api/lotes/[id]/editados?formato=zip`): sin
  comprimir (los MP4 ya lo están), en flujo desde el almacén (no se carga ningún vídeo en memoria),
  ZIP64 si pasa de 4 GB, nombres UTF-8. Comprobado con `zipfile` de Python y con la utilidad de
  archivos de macOS (`ditto`).
- **Arreglo**: las descargas sueltas del tablero se hacían con `fetch` + archivo en memoria; con el
  almacén, el servidor redirige al enlace firmado de otro dominio y eso chocaba con CORS. Ahora se
  abren en segundo plano (un `iframe` oculto), que sigue la redirección sin problema.
- Probado en local con un lote de dos cuentas y tres vídeos reales del pedido 54 montados
  (`scripts/seed-demo-terminados.ts`). En la nube aún no hay lotes con vídeos montados: el primer
  lote real que termine es la prueba de verdad.
