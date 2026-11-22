# Genjutsu — flujo acordado y estado del primer ensayo

## Actualización posterior — 29 septiembre 2026

Todo NUEVO envío exige frame inicial limpio aprobado y realmente adjuntado;
leer `genjutsu-frame-inicial-obligatorio.md`. Prevalece sobre notas históricas
de esta guía que omitan frames. Se conservan fuente, acciones, tiempos y tickets.

## Actualización posterior — 12 septiembre 2026

Emmanuel autorizó separar los controles. Leer `controles-video-por-motor.md`:
Genjutsu no requiere Memories ni un desglose exhaustivo por escenas. Se revisan el
original, los cambios solicitados y después el resultado; se mantienen assets,
avatar/sin avatar, duración de fuente, créditos autorizados y ticket de un solo envío.
Las exigencias de análisis Memories del historial inferior quedan sustituidas.

## Autorización de créditos — 2026-09-10

Emmanuel para RufZeit, trabajo 2026-09-10-014: «no uses prueba gratis, usa de los creditos».
Esta orden autoriza un envío de ese vídeo con créditos, Hombre 1 y habla en alemán.
El manifiesto declara `use_free_gens: false` y `autorizacion_creditos` con la orden literal;
no lleva autorización gratis. La puerta permite ambas modalidades por separado, con
autorización explícita propia, sin convertir automáticamente una en otra. Conserva
480p, el ticket de un solo envío, cotejo de fuente/SHA256/recibo y revisión antes de escalar.
Los defaults de Replicar y las autorizaciones de los otros trabajos no cambian.

## Replicar en la app — 2026-09-10

En Replicar se puede elegir Genjutsu, Hombre/Mujer y un número permanente de Avatares,
con vista previa. Añadir al lote guarda `metodo: genjutsu`, `avatar_selector`, identidad
del retrato y `genjutsu` con los defaults definidos en `EDITOR/replicar.py`. Se aplica a
todos los enlaces de ese envío, sin cambiar el avatar habitual de ninguna cuenta.
CLI equivalente: `pipeline.py nuevo CUENTA genjutsu URL --avatar-selector 'hombre 4'`.

Guardar no genera, no autoriza consumo y no traslada autorizaciones de ensayos anteriores.
Al preparar: descargar original, analizar con Memories, leer los defaults y concretar
acciones/cambios/en_pantalla en un manifiesto para lanzar.py. No mandar el diccionario de
defaults como prompt ni usar la ruta de frames/montaje de A/B/C. La puerta sigue exigiendo
fuente, análisis, avatar numerado, plan y autorización explícita de prueba gratis.

## Contrato y primer ensayo

Verificado el 2026-09-09 contra Higgsfield CLI y conector:
- `hf_mult_replace_object`: Genjutsu Object Swap (sustituir personaje, producto, ropa,
  objetos o localización conservando la estructura del vídeo).
- `hf_mult_motion_control`: Genjutsu Motion Transfer (reconstruir escena conservando movimiento).
- Object Swap recibe exactamente UN `video_references` y al menos una `image_references`.
- Resoluciones del esquema: 480p, 720p, 1080p. No enviar duration/aspect_ratio de Seedance:
  no figuran como parámetros de este modelo; la duración procede del vídeo fuente.
- Página oficial: https://higgsfield.ai/genjutsu — hasta 30 segundos. La página y el blog
  discrepan en mínimo (3/4s) y máximo de imágenes (40/30); comprobar en el generador para
  casos límite, no inventar un límite del esquema donde no aparece.
- Fuente adicional: https://higgsfield.ai/blog/higgsfield-genjutsu

Solicitud del usuario: recibir link de referencia, descargar vídeo autorizado y cambiar
avatar, detalles de fondo y todas las apariciones de caja/artículo que correspondan.
Primer ensayo elegido el 2026-09-10: RENTIERGLANZ, Hombre 2, lote 2026-09-10-011,
https://www.instagram.com/reel/DczQtd7pzIw/. Job 075dba16-b876-48e1-b91b-ca1c92f919fc,
480p, prueba gratis autorizada. Todavía pendiente de resultado/revisión. No prometer resultado
perfecto, velocidad o conservación exacta antes de comparar el original y el editado.

Primer ensayo cuando Emmanuel pase el enlace:
1. Identificar cuenta y selector (por ejemplo hombre 4), acciones esenciales y cambios.
2. Descargar el original al trabajo, sin saltar controles de acceso. Si no se puede obtener
   con la sesión autorizada, pedir MP4. Analizar el vídeo con Memories para inventario de
   sujetos, acciones y productos; no convertirlo en un prompt de movimiento inventado.
3. Object Swap para ediciones selectivas; Motion Transfer solo si pide rehacer la escena
   entera conservando los movimientos. Describir qué cambia y qué permanece.
4. Adjuntar el avatar elegido, EMBALAJE si hay caja cerrada y ARTICULO si es visible, sin
   confundirlos ni adjuntar frames como productos. La escala se conserva mediante la foto
   validada, no mediante medidas inventadas.
5. Mostrar plan: fuente, duración, selector, imágenes y papel, prompt de edición completo.
6. La puerta lanzar.py admite el piloto Object Swap como motor=genjutsu y
   uso_imagen=video_fuente. EDITOR/genjutsu.py valida fuente local + SHA256 + URL/media del
   lote, análisis de Memories del mismo archivo, avatar numerado, cambios y autorización
   de ensayo gratis. Mantiene los controles comunes de prompt/producto/cuenta; no hay frame
   inicial ficticio. Todavía no se ha habilitado Motion Transfer ni consumo pagado.
   La CLI instalada no soporta use_free_gens: generar reserva un ticket de envío MCP.
   enviar-mcp TICKET revalida y devuelve parámetros de UN SOLO USO; el host los pasa
   literalmente al conector generate_video y conserva el recibo completo, sin reconstruirlos.
   recibir-mcp TICKET RECIBO verifica modelo/prompt/resolución/referencias, registra, espera
   y entrega. Un envío ambiguo se reconcilia: nunca se reclama otra vez ni cambia a pago.
   Manifest del piloto: EDITOR/lotes/genjutsu_rentier_hombre2_20260910.json.
   Ensayo gratis aprobado: «Sí, usar la prueba gratis». No volver a preguntarlo para este job.
7. Probar un único vídeo en 480p y revisarlo antes de escalar. Si hay un ensayo gratis,
   ofrecerlo al usuario y usarlo solo si lo pide/autoriza, sin consumo pagado de respaldo.
8. Comparar cortes, acción exacta (p.ej. café soltado y caída), manos/cara, proporciones,
   consistencia de cajas, fondo, textos físicos, audio y logos. Entregar original y resultado.

Memories MCP vigente no expone analyze_video con prompt libre. En este ensayo se reutilizó
el caption y la transcripción del vídeo ya indexado vid_bviu74wwp2aqp337yi5ooezc4m:
SHA256 de los bytes indexados y de la nueva descarga idéntico. No presentarlo como análisis
completo de diez puntos. La caída se verificó además en fotogramas locales del original.

Plantilla de intención (rellenar y guardar, nunca enviar corchetes vacíos):
Use the supplied source video as the motion, camera, action and timing reference.
Replace [specific visible subject] with the person in image [N], preserving the subject's
gestures, gaze and interactions. Image [N] supplies identity only, not the original photo's
background. Replace every visible closed carton with the exact [account] retail packaging
from image [N]. [Concrete background changes.] Preserve [enumerated unchanged details],
natural phone-camera lighting, skin texture, contact shadows and physically consistent size.
