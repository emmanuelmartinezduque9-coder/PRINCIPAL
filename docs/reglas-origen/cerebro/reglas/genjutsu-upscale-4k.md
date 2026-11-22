# Genjutsu: upscale de 480p a 4K con Topaz

## Orden posterior — 04/10/2026

Emmanuel: «por que estas haceindo los upscalle con bytedace ... si te dije que lo hicieras con topaz??? continua con el lote».
Para NUEVOS upscales pendientes sin estado de envío, `EDITOR/upscale.py` usa
Topaz `topaz_video`, `2160p`, `aspect_ratio=auto`, también en Seedance.
No envía parámetros ByteDance (`model_version`, `fps`, `preset`) a Topaz.
Conserva audio mediante remux y verifica paquetes, fps, fotogramas, duración y
encuadre también para Seedance. La exención de entrega nativa 720p sigue vigente.
Estados existentes ByteDance, pagados, processing, submitting o uncertain no se
migran ni duplican. Los completados se conservan sin sobrescribir ni gasto
retroactivo; estado sin ID se reconcilia, nunca se reenvía por este cambio.
No se compran créditos. Esta nota prevalece sobre la mención histórica inferior
«Seedance conserva ByteDance». Las pruebas son locales; main coordina producción.

Orden de Emmanuel, 27/09/2026: «tambien actualiza en tu memoria hacerle el upscalle a los videos con gentjutsu ya que los generamos en 480 lo haces a 4k con topaz, tenlo en cuenta para adelante».

- Aplicar a los próximos vídeos de Genjutsu generados en 480p, tanto Object Swap como Motion Transfer.
- Tras su revisión y aprobación normal, escalar con Topaz a 4K antes de entregar y sustituir clips en CapCut.
- Conservar el vídeo original, audio, prompt, referencias, recibos y vínculo con la versión escalada. Verificar resolución real y conservación de audio.
- No cambiar duración, montaje ni frecuencia de imágenes por esta orden; el usuario solo ha especificado resolución y proveedor de escalado.
- Recuperar solicitudes de escalado existentes; nunca duplicar un envío pendiente o incierto.
- No aplicar retroactivamente a lotes o vídeos anteriores ni generar cargos históricos sin otra orden.
- Si el escalado falla, registrar el bloqueo: no presentar el original 480p como entrega final 4K.

Esta memoria establece la regla para producción futura. No certifica por sí sola integración automática en el motor; comprobar y aplicar la ruta de escalado al preparar los próximos envíos.

## Implementación acotada — 28/09/2026

`EDITOR/upscale.py` y `EDITOR/entregar.py` incorporan la ruta `topaz_video`,
`2160p`, `aspect_ratio=auto` para Genjutsu 480p. Reconocen `genjutsu`,
`hf_mult_motion_control` y `hf_mult_replace_object`. La elegibilidad automática
usa `created_at` del proveedor desde 28/09/2026 00:00 UTC (primer día completo
posterior a la orden), nunca la fecha de entrega. No se activan históricos por
reanudar su archivo. Seedance conserva ByteDance y Kling no entra en esta ruta.

Antes de cualquier envío se exige el QA existente o la excepción de usuario que
ya valida `encuadre_video.py`; no se modifica ni sustituye un veredicto. Se conserva
el hash del original revisado, copia del original, recibos y documentos de QA.
Un ticket pendiente se recupera por ID; un envío incierto o estado incompatible
bloquea nuevos cargos. Un fallo no entrega el 480p como 4K.

La salida remultiplexa el audio del original con copia de códec. Se verifican
resolución, encuadre, duración, fps y número de fotogramas, y la igualdad de hashes
de cada paquete de audio. Esta comprobación técnica no equivale a escucha ni
aprueba su contenido. Ficha y registro distinguen original, job de Topaz y final.

Pruebas locales: `python3 -m unittest test_upscale test_upscale_genjutsu
test_entregar_registro` desde `EDITOR/`. Estas pruebas no envían generaciones;
la aplicación a jobs reales corresponde al coordinador y requiere sus guardas.
