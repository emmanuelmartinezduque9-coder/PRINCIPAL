# Auditoría del sistema actual (lectura directa del Mac del dueño, 22/11/2026)

Fuente: lectura de solo lectura de `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS` y `/Volumes/T7/AUTOMATIZACION SEGA`. Hechos de primera mano salvo donde se indica "estimado".

## Negocio y necesidades declaradas por el dueño
- Dropshipping orgánico con IA. Productos virales de EE. UU. llevados a Alemania; los mismos vídeos en alemán sirven para Austria y Suiza. Algo de italiano.
- Descubre productos scrolleando una cuenta de Instagram; hace pedido de prueba y mide conversión por millón de visitas. Replica los vídeos virales (Seedance o Genjutsu), luego prueba conceptos de otras cuentas, ángulos de venta y audiencias distintas.
- Quiere: interfaz web mucho mejor; edición cuyo ritmo siga la canción y el vídeo de referencia; que personas contratadas la usen conectando SU PROPIA cuenta Higgsfield (plan de pago, no API) para testear productos; no tocar su sistema actual mientras se construye; gastar menos (Codex le cuesta ~500 $/mes y rinde poco).

## Sistema actual
- Motor Python (~900 archivos núcleo, ~1.800 con parches/copias), panel local `:8777`, ~8 SQLite + JSON, ~40 cuentas de producto. Puertas sólidas e idempotentes: `frame.py`, `lanzar.py`, `production_engine.py`.
- Flujo: enlace viral → análisis → frame Nano Banana Pro 2K 9:16 → aprobación humana de cada frame → clip (Seedance/Kling/Genjutsu/Wan a 480p) → upscale Topaz 1080p → montaje (FFmpeg/Creatomate/CapCut) → MP4; publica a mano.
- Nube actual: OpenAI Sites sin login (cualquiera con el enlace puede enviar encargos con coste); depende del Mac encendido.
- Mac-only: CapCut, Apple Vision OCR, Codex escritorio, CLI Higgsfield.

## Por qué Codex gasta ~500 $/mes (ordenado por impacto estimado)
1. Codex escribe y depura scripts nuevos por pedido: ~270 `order*_*.py` casi duplicados en 17 pedidos; el lote 81 tiene otros 23 scripts propios. Versiones render v2/v3/v5 = bucles corregir-renderizar-revisar.
2. Validaciones que obligan al agente a fabricar evidencias: `rhythm_edit.py` tiene 232 líneas, ~190 validan JSON de revisión firmados por "revisor independiente", ~40 calculan tiempos. Recibo de ~15 campos por vídeo.
3. Hooks (`guardia.py`) en cada comando Bash, cada envío de archivo y cada fin de turno; bloquea el cierre en 7 casos → llamadas extra con todo el contexto. Pide "un subagente por frame", contradiciendo el flujo ligero del 09/11.
4. Instrucciones en cadena: AGENTS.md 17 KB que obliga a leer ~10 notas de 77, CLAUDE.md 49 KB, BIBLIOTECA_PROMPTS 754 KB, 143 lecciones, ~60 reglas, enlace roto a un archivo inexistente.
5. "Oficina": 4 agentes Codex adicionales contra la misma cuota.
6. No se mide coste por vídeo en ningún sitio.
- Estimado: 8–10 de cada 12 pasos de un pedido pasan por el modelo.

## Dónde se pierden créditos de Higgsfield
- Correcciones encadenadas por referencias ambiguas (lote 81: producto adjunto con su efecto incluido → "alas luminosas flotantes"; patrón de producto ignorado). 24 envíos en ese expediente.
- Límite de reintentos por fallo, no por clip → original + r2 + r3.
- Doble gasto por clip: generación + upscale Topaz siempre.
- Nadie revisa el prompt antes de enviar (el flujo ligero lo eliminó). Geometría del producto heredada de la fuente en motion transfer.

## Ritmo de edición hoy (por qué falla)
- No hay detección de beats. Un único "drop" por canción marcado a mano; `offset = drop − entrada_cuerpo`. Es el único punto sincronizado.
- Cortes de la referencia: filtro de escenas de ffmpeg (umbral 0,2; mínimo 0,28 s). No se relaciona corte con beat.
- Asignación clip→escena por similitud visual (Apple Vision) o por orden; velocidad constante ≤1x en el cuerpo; gancho máx. 1,12x.
- Ensamblado con cortes secos (`concat -c copy`): sin rampas de velocidad, transiciones, zooms ni flashes.
- Varios montadores distintos por pedido aplican reglas de forma diferente.

## Reglas de imagen vigentes (resumen)
Nano Banana Pro 2K 9:16; prompt en prosa ~4.900 caracteres; lista negra (cinematic, bokeh, 8K…); composición idéntica a la referencia; producto sustituido; fondo rediseñado con 4–5 cambios; cara solo del avatar elegido; no adelantar el reveal; marcas reales de tienda conservadas. Reglas repartidas en CEREBRO/, memory/context/, AGENTS.md, T7/REGLAS_EDICION y ~/.codex/skills, con contradicciones entre épocas.

## Herramientas ya conectadas en la sesión de Claude del dueño
Higgsfield MCP (generación, análisis de vídeo, predictor de viralidad, separación de pistas, música trending de TikTok), Trendtrack MCP (productos ganadores, radar de lanzamientos, tiendas similares), Shopify, Meta Ads.
