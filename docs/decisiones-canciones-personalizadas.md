# Implementación de canciones personalizadas (26/11/2026)

Se implementa el diseño de canciones personalizadas con `products.kind`: físico por defecto y canción como selección explícita en la ficha. La migración 0068 añade el tipo y `song_lyrics` (una letra por canción, borrado en cascada). Las canciones no requieren artículo, caja ni variantes; se conservan los requisitos de avatar y las reglas de localización, Pinterest, sitio y aprobación visual existentes. No se han editado las reglas del motor.

`video.cancion` se encola tras preparar la referencia y desde el seguimiento para referencias anteriores. Usa pasos separados `runStep` para Whisper, adaptación con `getGateway()`, composición remota y descarga/guardado. El guardado transaccional bloquea el vídeo, comprueba que sigue siendo su referencia y confirma audio, letra y `song_id` juntos. Una canción ya elegida se respeta. El montaje espera la canción; el seguimiento también reanuda los lotes que habían terminado sus clips mientras se creaba.

La integración lee exclusivamente `WEB_MUSICAL_URL` y `WEB_MUSICAL_INTERNAL_KEY` del entorno. POST y descarga llevan `x-internal-key`; el audio se descarga desde el endpoint autenticado, sin confiar en una URL del cuerpo remoto. Los errores persistidos están en español y no incluyen el cuerpo ni las cabeceras remotas. No se ha llamado al servicio de producción durante las pruebas.

La canción empieza en 0 durante el montaje, sin referencia ni doblaje. La lectura de edición adapta solo gancho y llamada final, excluyendo la letra antigua. La letra nueva se incorpora a una capa `subtitles` independiente de `texts`: amarillo debajo del gancho, tiempos absolutos por palabra, agrupación por líneas/secciones y línea completa cuando alguna palabra tiene duración cero. El render y la comprobación 06B mantienen su recorrido anterior.

La API musical no ofrece clave de idempotencia ni consulta por petición. Si el proceso muere después de que el POST haya generado/cobrado pero antes de confirmar el resultado en `job_steps`, un reintento puede componer otra canción. Una composición ya confirmada nunca se repite al fallar la descarga o el guardado. Es la limitación del contrato remoto actual, no una garantía de cobro único ante ese corte.

## Validación local

- TypeScript: `npx tsc --noEmit -p .`.
- Vitest completo: `npx vitest run`, intentado; PostgreSQL embebido no puede arrancar en este entorno (`shmget: Operation not permitted`). Por ello quedan sin verificar aquí las pruebas de persistencia, migración, producto y montaje con base real.
- Pruebas HTTP de canciones ejecutadas con configuración temporal sin PostgreSQL y proveedores simulados.
- Montador: `python3 -m unittest discover -s montador -p 'test_*.py'`; incluye un render MP4 real con ffmpeg/Pillow. Algunas pruebas requieren fuentes, módulos o modelos no instalados y se omiten.
- Whisper real, Claude, ElevenLabs y extremo a extremo en producción quedan pendientes; la transcripción y los proveedores se simulan en las pruebas automáticas.

La migración se generó con drizzle-kit sobre una copia temporal de las migraciones existentes sin los archivos auxiliares AppleDouble `._*` de macOS (drizzle-kit los intentaba interpretar como JSON). SQL, snapshot y journal son la salida del generador.

Resultado final: TypeScript correcto; 6 pruebas HTTP correctas (configuración temporal sin arranque de PostgreSQL); montador 51 pruebas, 40 correctas y 11 omitidas. `git diff --check` correcto. El intento de `git add` falló al crear `.git/index.lock` por permisos: este entorno solo permite leer `.git`. No se pudieron crear los commits locales solicitados y no se hizo push.

## Archivos de la implementación

- Datos: `src/db/schema.ts`, `drizzle/0068_panoramic_major_mapleleaf.sql`, `drizzle/meta/0068_snapshot.json`, `drizzle/meta/_journal.json`.
- Producto: `src/server/products.ts`, `src/app/api/productos/route.ts`, `src/app/api/productos/[id]/route.ts`, `src/components/products/product-fields.tsx`, `product-form.tsx` y `product-detail.tsx` de la misma carpeta.
- Producción: `src/server/songs.ts`, `src/jobs/video-jobs.ts`, `src/server/videos/canciones.ts`, `analysis.ts`, `lote.ts`, `videos.ts`, `pinterest.ts`, `sweep.ts`, `edits.ts` y `montaje-nube.ts` de la misma carpeta de vídeos.
- Python: `montador/doblar.py`, `montador/montador.py`, `montador/montar_auto.py`, `montador/rotulos_layout.py`, `montador/test_doblar.py` y `montador/test_montar_auto.py`.
- Pruebas TypeScript: `tests/canciones.test.ts`, `tests/montaje.test.ts`, `tests/products.test.ts`, `tests/video-analysis.test.ts` y `tests/helpers/fixtures.ts`.

Los cambios preexistentes en `.claude/launch.json`, el diseño original sin seguimiento y la imagen de `docs/piloto-pedido-54/` no se han modificado.
