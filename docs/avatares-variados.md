# Avatares variados y reparto por persona

Orden de Emmanuel, 28/11/2026. Ninguna cara nueva se genera con IA: la ampliación de la biblioteca usa fotografías reales de Pinterest revisadas con visión.

## Selección y reservas

`src/lib/avatar-choice.ts` conserva la determinación del público por indicaciones, ángulo y persona principal. Filtra por grupo y edad (±12 años; las edades desconocidas de la biblioteca antigua solo sirven para adultos de 18–55), rechaza etiquetas de mercado explícitamente incompatibles y ordena por uso reciente del producto y global. País, cercanía de edad y número solo desempatan. Un número bajo ya no gana frente a una identidad menos usada. Con alternativas evita el último avatar del producto y los ya usados en el lote.

`src/server/videos/avatar-assignment.ts` lee el último análisis terminado o en marcha por vídeo, incluyendo `auto_avatar_id`, `result.autoAvatars` y el avatar elegido en el vídeo. Cuenta cada identidad una vez por vídeo, no cada reanálisis. La ventana de uso es de siete días; el último vídeo asignado del producto y las reservas del mismo lote siguen impidiendo repetición aunque sean anteriores. La exclusión también incluye todas las identidades que se acaban de asignar dentro del vídeo.

Una transacción toma `pg_try_advisory_xact_lock(28112026)` y guarda las asignaciones en el propio `video_analyses` antes de soltar el cerrojo. Los trabajos simultáneos que no lo consiguen fallan de manera transitoria y los recupera el mecanismo de reintentos de trabajos. No se bloquean todas las conexiones del pool esperando un cerrojo mientras la selección de Pinterest necesita otra conexión. Un reintento del mismo análisis recupera su reserva sin consumir otra identidad. La comprobación final de referencia/indicaciones del desglose sigue vigente; un análisis superado queda fallido y deja de contar como reserva.

## Biblioteca insuficiente

`findRealAvatar` en `pinterest.ts` reutiliza `searchPins`, `phoneShapedFirst`, descarga y conversión de fotos y la pasarela de visión. Consulta sexo, edad y mercado (por ejemplo, `deutsche German Frau woman 25 selfie iphone candid portrait`). Descarta fotos no verticales y de baja resolución. Visión exige una sola persona real, rostro reconocible y aspecto cotidiano de móvil: rechaza IA, catálogo, montajes, filtros, texto y marcas de agua. El país es contexto de mercado, no una afirmación de nacionalidad inferida de la cara.

Se excluyen las huellas de retratos ya reservados y se muestran también esas caras como referencias negativas para evitar seleccionar a la misma persona en otra fotografía. Se comprueba nuevamente la edad elegida. La foto se guarda por huella mediante `storeRealAvatar`, en `src/server/avatars.ts`, con grupo, edad, etiquetas de mercado, `pinterest`, `foto_real`, descripción y URL de procedencia. El alta manual mantiene el permiso exclusivo del dueño; este ingreso interno está destinado al trabajo de selección de fotografías reales. Ningún otro módulo accede a la tabla de avatares.

Pinterest pendiente o sin candidatos no se sustituye por una cara generada ni por una persona de edad incompatible: el trabajo conserva el fallo y puede reintentarse. No se guarda un reparto incompleto.

## Personas, apertura y clip

El JSON del análisis añade `people`: id único, sexo, edad aproximada, rasgos (`notes`), presencia en el primer fotograma (`opening`) e intervalos `appearances` con segundos y número opcional de toma (desde 1). Se valida que los intervalos sean positivos y los ids únicos. La primera persona es la principal; `personaRef` permanece compatible y se completa desde esa persona cuando falta. Los análisis antiguos sin `people` conservan su funcionamiento con `personaRef`.

`autoAvatars: [{personId, avatarId}]` guarda el reparto; `autoAvatar` y `auto_avatar_id` mantienen el avatar principal para los consumidores antiguos. En automático se elige una identidad distinta para cada persona. Con biblioteca se conserva la elección principal expresa; con foto elegida se preservan las personas de apertura de esa foto y se asignan las que entran después.

`manifest.ts` incluye únicamente personas de apertura en la imagen inicial. En el clip incluye los retratos necesarios y lleva la persona y sus intervalos junto a cada adjunto. `clipPromptFor` escribe el número real `image [N]`, identidad, tomas y segundos, exige caras diferentes y conserva acción, lugar, cámara y tiempos de cada toma. No se omiten retratos silenciosamente cuando exceden la capacidad del modelo. La numeración escrita antes de conocer el reparto se traduce al manifiesto definitivo para no convertir una referencia de producto en un retrato. El prompt de imagen declara expresamente quién aparece en apertura y excluye las entradas posteriores.

Al cargar referencias, se inspecciona la generación de la imagen aprobada mediante `generations.request.importada`. Si es importada, **ningún avatar de apertura** se adjunta al clip, incluso con análisis antiguos sin reparto. Solo entran los retratos de personas posteriores. El prompt conserva las caras de la imagen aprobada durante sus apariciones y da prioridad al calendario de identidades frente a instrucciones generales anteriores. Esto cubre el fallo del conductor del vídeo 88.

## Verificación

Pruebas de selección con edades desconocidas, uso local/global y lote; reserva idempotente; Pinterest cuando falta una identidad y rechazo de duplicados; filtros y alta de fotografías reales; varias personas con intervalos disjuntos en manifiesto/prompt; solo apertura en la imagen; remapeo de referencias; apertura importada, incluida lectura real de `request.importada` en las pruebas con PostgreSQL. Los tests antiguos que esperaban elegir arbitrariamente una joven para un encargo de abuelas ahora simulan el alta de una foto real de edad válida.

`tests/boundaries.test.ts` y `tests/flujo-automatico.test.ts` no se modifican. No se añaden imágenes, clips ni pasos de aprobación al flujo automático.

Resultado en este entorno: `npx tsc --noEmit -p .` pasa. Los seis archivos aislados sin inicialización de PostgreSQL (`avatar-choice`, `avatar-assignment`, `avatar-pinterest`, `avatares-variados`, `video-manifest`, `boundaries`) pasan: 52 pruebas. `npx vitest run` queda bloqueado antes de ejecutar las pruebas por `listen EPERM: operation not permitted 127.0.0.1` en el arranque del PostgreSQL embebido. Por ello no se declara verde la suite completa ni el flujo con base de datos.
