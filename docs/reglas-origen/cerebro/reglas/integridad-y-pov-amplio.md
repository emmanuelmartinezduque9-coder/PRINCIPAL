# Orden permanente de Emmanuel — 11 septiembre 2026, segunda revisión

**Actualización 12 septiembre:** `controles-video-por-motor.md` sustituye únicamente
la exigencia general de Q&A nativo: Genjutsu usa revisión del original y cambios;
Seedance admite material Memories API real. POV, fuentes válidas y revisión independiente
permanecen. No aplicar los párrafos históricos de Q&A para bloquear estas rutas.

Esta orden prevalece sobre prompts históricos y ejemplos de cámara contradictorios.

## Seedance largo

Nada de macro, plano pegado al producto, cenital o cámara situada encima. Preferir
primera persona natural a distancia de brazo, con producto completo, manos y bastante
habitación visibles. Para escenas con personas conservar sus papeles y una toma
media amplia. También se amplían los planos originales de detalle: conservar acciones,
objetos, orden y cortes; cambiar únicamente la cámara conforme a esta orden.
No basta añadir «no zoom» después de un prompt que sigue ordenando acercamientos.

`lanzar.py` añade el contrato de POV amplio y bloquea las órdenes de macro/cenital
en positivo. Se considera largo todo Seedance contextual, declarado largo o de ≥8 s.
Caras humanas en cualquier toma: 720p nativo sin upscale; sin caras: 480p y escalado
habitual. El encuadre se revisa también en el MP4 resultante, no solo en el prompt.

## Correcciones de frames

Nunca corregir desde una generación rechazada o pendiente de aprobación. Volver a
la imagen original del usuario, fotograma original del vídeo o frame explícitamente
aprobado. Declarar `fuente_composicion` con ID, archivo y SHA-256; para un fotograma,
añadir vídeo original, su hash y segundo. El ID debe ser el que realmente se envía.
Se coteja además el contenido con las generaciones no aprobadas: renombrar/subir
de nuevo una imagen mala no la convierte en fuente válida. `insistir` autoriza otro
intento pagado, pero NO salta la revisión de la fuente.

## Análisis y revisión antes del vídeo

Una réplica requiere el Q&A de Memories con `EDITOR/PROMPT_ANALISIS.md`, no una
descripción general o transcripción. Conservar original y respuesta íntegra. Obtener
la versión sin overlays, manteniendo toda la secuencia. Elaborar un desglose con
tiempos de origen y destino, sujeto, acción, objeto, resultado, cámara y fragmento
exacto del prompt de cada escena. No rellenar huecos inventando demostraciones.
En RentierGlanz: el artículo es una luz plana de reno, aproximadamente 10 cm de alto
y 9 cm de ancho incluyendo toda la silueta. No omitir esas medidas.

`EDITOR/integridad_previa.py` genera el expediente sobre el prompt FINAL y las
referencias resueltas. Un agente independiente mira fuente, evidencias y prompt, y
escribe `veredicto.json` en el expediente con su ID, hash y evidencia por criterio.
El agente que redactó el prompt NO firma ese veredicto. No heredar el contexto
completo: dar un brief acotado, las fuentes y el encargo. Se puede revisar un lote
en una sola tarea independiente sin abrir una tarea por vídeo.

La puerta retiene el gasto si falta el desglose/veredicto, si está suspendido o si
cambió cualquier entrada. Los guiones genuinamente originales usan el encargo
explícito como origen; nunca presentar una réplica como guion original para saltar
Memories. Si Memories o un permiso bloquea, informar; no sustituirlo silenciosamente.
