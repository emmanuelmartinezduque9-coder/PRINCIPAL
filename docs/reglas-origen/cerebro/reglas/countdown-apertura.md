# Cuenta ordenada: apertura específica obligatoria

Orden de Emmanuel, 2026-09-20. `EDITOR/countdown_guard.py` se aplica en
`lanzar.py` al preparar y antes de crear un vídeo nuevo. Detecta 1,2,3 y 3,2,1
en prompt o transcripción Memories cacheada (inglés, alemán, español y cifras).
No confundir duraciones con cuenta hablada ni usar un frame solo contextual.

Declarar `countdown_apertura`: `media_id`, `item_lote`, `archivo`, `sha256` y
`fuente: {video: {archivo, sha256}, imagen: {archivo, sha256}, segundo}`.
El media coincide con `frame`, aprobado en esta cuenta/lote; `uso_imagen` y
`encuadre.modo` son `frame_inicial`, enviado como `start_image` real.
`segundo` conserva el instante real de extracción, finito en [0, 0.25],
incluido 0. No convertir 0.1 en 0 ni saltar validación por un cero legítimo.

`integridad_previa.py` liga esa evidencia al fingerprint y exige el check
independiente `countdown_apertura`: comprobar visualmente fuente, captura y
frame aprobado. Los hashes no sustituyen esa comparación. `production_engine.py`
congela los archivos y hashes de apertura, vídeo y fuentes del desglose.
Cambios antes de enviar requieren un nuevo preflight; no invalidar ni regenerar
jobs ya enviados. Su recuperación continúa sin volver a gastar.
# Duración — orden posterior del 25/09/2026

Los próximos ganchos «1,2,3» tienen máximo 6 segundos. No ampliar a 8 por
decisión interna. Adaptar ritmo sin omitir la cuenta ni el destape. No relanzar
trabajos ya enviados ni modificar históricos por esta regla. Ver
`.cursor/rules/ganchos-countdown-duracion.mdc`.
