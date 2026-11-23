# Reglas fijas del motor de producción (dueño, 22/11/2026)

Texto íntegro de las reglas que Emmanuel entregó el 22/11/2026 tras la primera prueba de lote (la imagen inicial salió mal). Son los criterios de aceptación del motor. Vienen de su automatización anterior; donde nombran piezas de aquel sistema (`AGENTS.md`, `reference_music_match.py`, recibos, SHA256…) se aplican a su equivalente en PRINCIPAL. Qué está aplicado y qué falta: `docs/reglas-motor-estado.md`.

> **Regla fija añadida el 23/11/2026 (pedida tres veces): referencias de Pinterest SIEMPRE.** Cada imagen inicial lleva fotos reales de Pinterest como referencia de entorno y realismo, también al regenerar una rechazada. La búsqueda aprende de las referencias que el dueño eligió a mano en escenas parecidas (p. ej. «salón con decoración navideña» → `Wohnzimmer Weihnachten Sofa Handyfoto`). Única excepción: una referencia puesta a mano en la tarjeta o el vídeo; entonces no se busca. **Corrección del mismo día:** de momento no se busca en Pinterest (las fotos nuevas salían falsas y oscuras); se reutilizan solas las referencias que él ya aprobó en lotes anteriores (banco de aprobadas), y cada imagen aprobada con referencia a mano suma al banco. Sin pasos en que él elija. Detalle: `reglas/referencias-pinterest.md` y `docs/decisiones-referencias-pinterest.md`.

---

Eres responsable de mejorar el motor de producción de vídeos de Emmanuel. Trabaja sobre la aplicación, el catálogo, la memoria, la cola y los conectores existentes. El objetivo es producir más vídeos simultáneamente, reducir tiempo y créditos por vídeo utilizable, y mejorar la calidad de las imágenes y los clips. El resultado esperado es una implementación comprobable que funcione desde la interfaz hasta la entrega. Usa las reglas de abajo como criterios de aceptación.

## 1. Empieza por el motor real

Lee `AGENTS.md`, la memoria aplicable, las reglas de edición y las skills vigentes de Nano Banana, fondos de Pinterest y los modelos que intervengan. Localiza dónde la aplicación guarda una tarjeta, congela el pedido, elige el modelo, construye sus referencias, calcula créditos, envía al proveedor y recupera el resultado. Sigue una tarjeta real de principio a fin para detectar dónde se pierde cada selección.
Conserva el pedido inmutable y su SHA256, el propietario, la cuenta, el mercado y el idioma. Mantén el orden de `clip_sequence` y `concept_snapshot.clips`, sus `source_clip`, avatares, capturas, productos, notas y ajustes de edición. Guarda las correcciones como revisiones ligadas al pedido y conserva los trabajos aceptados. La instrucción expresa más reciente de Emmanuel para esa tarjeta prevalece sobre los valores por defecto.

## 2. Cada tarjeta tiene dos fuentes distintas

La referencia de generación gobierna las acciones, la composición, la perspectiva y la secuencia que se van a replicar. La referencia de edición gobierna el montaje, los tiempos de texto, el ritmo y el análisis de audio. Si el enlace opcional de edición está vacío, hereda la referencia de generación. Si está relleno, abre y analiza ese vídeo real. El enlace de edición no sustituye la escena ni el producto de la referencia de generación.
Antes de generar, revisa todo el lote, incluidas las ediciones. Resuelve lo recuperable mediante las notas, la memoria, los archivos y las bibliotecas. Si quedan dudas indispensables, agrúpalas en una sola consulta. El envío del pedido autoriza los frames necesarios. Presenta el grupo completo de frames con `presentation_policy=complete_round`, identificado por vídeo, clip y cuenta. Tras la aprobación visual, ejecuta clips y ediciones sin otra ronda creativa rutinaria. Mantén los vídeos independientes en marcha si uno queda bloqueado.

## 3. Una variante seleccionada es un requisito de producción

Separa siempre la variante visible en el original de la variante de destino seleccionada por Emmanuel. El original indica qué ocurre en la toma. La variante de destino determina qué artículo y qué embalaje aparecen en el resultado.

* Resuelve cuenta, variante, artículo y embalaje mediante los IDs del catálogo. Comprueba el archivo, hash y recibo de cada referencia. La caja turquesa no sirve para la azul. Una caja genérica recoloreada tampoco sirve.
* Si se ve la caja, adjunta la caja oficial de destino. Si se ve el aparato, adjunta el aparato exacto. Si se ven ambos en momentos distintos, conserva ambas referencias y especifica en qué toma manda cada una.
* Comprueba que los IDs y el orden de las imágenes del prompt coinciden con los adjuntos de la solicitud real al proveedor. Una selección correcta en la interfaz no acredita que se haya enviado correctamente.
* Enumera qué cambia y qué se conserva. Ejemplo: «Cambia la máquina rosa y su caja por la variante blanca con fresas y su caja oficial. Conserva la extracción del congelador, el orden de la receta, la escala en mano y el ángulo de cada toma».
* Revisa el frame y el vídeo real. Un plano correcto no compensa que reaparezca la variante original en un plano posterior. Si falta el archivo oficial de una variante, busca primero en el catálogo, los recibos y el SSD. Si no existe una coincidencia verificable, bloquea esa tarjeta antes de gastar créditos y registra qué asset falta.

En Genjutsu, la conservación del producto fuente es el valor por defecto cuando no se solicita un cambio. La selección expresa de otra variante anula ese valor. Una excepción de adjuntos para el vídeo no elimina las referencias necesarias para generar sus frames.

## 4. Referencias, avatares y fondos

Permite subir referencias también en los ganchos validados de biblioteca, igual que en las demás opciones. Admite varias imágenes con un papel por imagen: fondo, composición, realismo, identidad de avatar, artículo, caja o funcionamiento. Conserva miniatura, papel, instrucción y orden al guardar, recargar o enviar. Haz que las instrucciones largas se puedan leer y ampliar en un campo multilínea.
Si Emmanuel adjunta una referencia para una tarjeta, úsala y desactiva Pinterest automáticamente para esa tarjeta. Si Pinterest está activado y corresponde buscar fondo, empieza por el producto, el público, la acción y el mercado. Después elige una foto real con perspectiva, espacio, luz y superficies compatibles. Un plano de sacar algo del congelador necesita que se vean su interior y su puerta, aunque el resto de la receta use una referencia de salón o cocina. Si se pide dm, Aldi o Sephora, respeta la cadena y el mercado. Si la tienda queda abierta, busca un entorno local plausible y comprueba su identidad física. No inventes que el artículo se vende allí.
En Genjutsu Object Swap y Wan 3.0 Prime, sustituye todos los entornos originales. Agrupa por lugar real, no por nombre de clip. Si el patrón es A/A/B/C/D, usa cuatro fondos nuevos y conserva el mismo fondo nuevo en las dos tomas de A. Registra toma → entorno original → referencia nueva → archivo/hash → índice de adjunto. Comprueba la cobertura en el vídeo terminado.
La identidad procede exclusivamente del avatar seleccionado o de la biblioteca activa para ese papel. Una persona visible en una foto de fondo o realismo no es un avatar. Usa la versión con la cara cubierta si esa referencia está en la biblioteca de realismo. Mantén identidad, ropa y rasgos consistentes entre tomas. Si la tarjeta pide otro aspecto o raza de perro, aplícalo en todas las tomas pertinentes y conserva su especie y su papel.

## 5. Frames con estética de iPhone 17 Pro Max

Genera solo los frames que pide la selección. Cada clip Genjutsu que se vaya a generar necesita su apertura inicial aprobada. En «solo gancho», genera la apertura del gancho y recupera el cuerpo ya elegido. Conserva las capturas y el encuadre originales como anclas. Si Emmanuel pide corregir un frame, regenera esa posición y conserva las demás aprobaciones.
La estética objetivo es vídeo vertical móvil, cercano y cotidiano. Busca profundidad de campo natural con fondo legible, luz práctica del lugar, piel con textura, reflejos y sombras coherentes, perspectiva creíble y contacto real entre manos, objetos y superficies. Evita el desenfoque extremo, el look de cámara de cine, la piel plástica y la apariencia de persona recortada y pegada. «Parecer móvil» no significa añadir distorsión, ruido excesivo o mala resolución.
Usa la referencia de composición para encuadre y posición, la del entorno para luz y perspectiva, y las de producto y avatar para identidad. Enumera esos papeles en el prompt con los índices reales. No generes subtítulos, emojis ni rótulos editoriales. Conserva textos físicos pertinentes, como la marca impresa en el envase o en una sábana. Antes de presentar, abre cada resultado y comprueba variante, caja, avatar, fondo, acción y realismo. Registra fuentes, hashes y defectos observados.

## 6. El modelo de vídeo se elige en la tarjeta

Permite elegir explícitamente Genjutsu Motion Transfer, Genjutsu Object Swap, Wan 3.0 Prime y Seedance, además de un modo automático que indique cuál ha resuelto. Mapea cada etiqueta al ID real del proveedor leyendo el catálogo y los adaptadores existentes. No adivines IDs ni cambies el modelo elegido para ahorrar créditos. Conserva selección, resolución, parámetros y coste en el pedido y el recibo.

* Genjutsu Motion Transfer. El vídeo aporta movimiento, cámara, acciones y tiempos. El frame aprobado fija la apertura y la adaptación visual. Escribe instrucciones concretas sobre qué movimiento conservar y qué cambiar de fondo, identidad o producto. Mantén los cortes y la geometría del artículo. Si la mano vierte ingredientes, deben entrar por la abertura real, sin deformar la tapa para acomodar el gesto. Usa Motion Transfer normal salvo selección expresa.
* Genjutsu Object Swap. Escribe un mapa de sustituciones por toma: qué objeto o persona cambia, qué referencia identifica el resultado y qué fondo nuevo le corresponde. Conserva función, contacto, acciones, ritmo y continuidad. Ordena eliminar desde el primer hasta el último frame todos los textos editoriales, emojis y overlays originales, reconstruyendo el fondo que tapan. Comprueba el archivo real antes de añadir los textos nuevos en edición.
* Wan 3.0 Prime. Aplica los mismos requisitos de fondos y eliminación de textos que en Object Swap. Usa un prompt compacto con acciones y cambios ordenados por toma, la correspondencia exacta de adjuntos y los elementos que deben conservarse. Comprueba que el adaptador admite todas las referencias necesarias. Si hay un límite real, resuélvelo por la ruta prevista del motor y conserva la continuidad. No descartes fondos para que la solicitud quepa.
* Seedance. Escribe instrucciones de escena con sujeto, acción, objeto, cámara, audio y tiempos claros. Adjunta el frame aprobado y la referencia del producto exacto, con su escala real en mano. Para diálogo manda la frase literal en idioma destino y especifica quién habla. En «1, 2, 3», la tela oculta por completo las cajas durante la cuenta y la frase. Se retira después de terminar «Mal sehen, wie es geworden ist» si esa es la frase aprobada. Revisa voz, destape y pausa real en el resultado. El gancho de cuenta atrás dura como máximo 6 s y respeta cualquier límite más corto de la tarjeta. Regalo pop y caída de café tienen máximo 3 s. Estos límites no se aplican al cuerpo ni a todas las réplicas.

Convierte las notas de Emmanuel en acciones visibles verificables. Si pide que un coche se esté acercando mientras el perro sale corriendo, comprueba que el coche se mueve y se acerca en esa toma del gancho. Un coche aparcado, unos faros lejanos o un taxi en otra toma no cumplen la instrucción.

## 7. Montaje, música y entrega

Una réplica completa conserva el orden, los cortes, el ritmo y la duración de referencia. En gancho + cuerpo, conserva todos los clips de cuerpo seleccionados y su orden, excluyendo el gancho antiguo. La selección manual prevalece. Si el cuerpo es automático, identifica de forma visual dónde empieza, busca primero la misma referencia y cuenta y conserva los clips de cuerpo necesarios. No generes un cuerpo automáticamente para cubrir una fuente ausente.
Respeta la canción expresa de biblioteca. Para selección automática compara el audio real de edición con los MP3 usando `reference_music_match.py` y registra archivo, hash, coincidencia y límites. Una coincidencia acústica propone una pista y un inicio. Si hay ambigüedad, voces fuertes o versiones aceleradas, analiza antes de elegir. En réplicas completas aplica la regla vigente de conservación de audio del modelo y del pedido. Cuando corresponda usar la misma canción de la referencia, identifica la grabación real. No copies su audio mezclado como sustituto de una pista limpia.
Con una pista de biblioteca, conserva el drop guardado y alinéalo al corte o a la acción funcional pedida. Recorta la entrada de la canción para conseguirlo sin alargar el gancho. Aplica el contrato vigente de música continua y revisa el nivel con la voz. En gancho + cuerpo, conserva el habla inicial que corresponda, separa música original si es necesario y excluye el audio original del cuerpo según la regla vigente. Comprueba que no se cortan palabras. Distingue escucha real, análisis local de audio y verificación técnica.
Añade los textos solo en edición. Para Alemania, usa alemán natural, marca, tienda, emojis y CTA correctos. Aplica el estilo físico 06B vigente del motor. Ajusta el texto al tiempo que se muestra y verifica su legibilidad. Para idiomas adicionales conserva la versión original y exporta un archivo y recibo por idioma. Cambia solo textos salvo petición expresa de doblaje.
Usa Topaz Theia 1080p como valor por defecto para material de 480p, con FPS originales, y conserva nativos 1080p sin upscale. Revisa el MP4 final contra notas, referencia y archivos de audio. Comprueba cortes, textos originales retirados, producto, acciones, audio y salida. Entrega juntos los MP4 verificados y sus descripciones por cuenta e idioma en la carpeta habitual del motor. Si un defecto no se resuelve, conserva el archivo y deja claro qué revisión falta. No marques un lote incompleto como listo para subir.

## 8. Más volumen, menos espera y menos créditos


* Usa una cola existente con concurrencia por proveedor y etapa. Mientras un vídeo está en generación, prepara los que ya tienen dependencias resueltas y edita los terminados. No serialices todo el lote por una tarjeta.
* Reutiliza referencias, subidas y derivados exactos mediante hash, ámbito y recibo verificado. Reutiliza análisis de fuente y audio cuando coincidan las entradas y las reglas aplicadas. Una corrección debe invalidar solo los resultados que dependan del cambio.
* Antes de enviar, comprueba variante, caja, adjuntos, modelo, frames aprobados, duración y cotización. Tras una interrupción, reconcilia nodos, solicitudes y recibos. Recupera trabajos aceptados con el mismo ID. Conserva los inciertos sin reenviarlos.
* Usa los eventos del motor o consultas agrupadas y espaciadas para recuperar trabajos. Evita consultas repetidas por clip. Mantén los límites del proveedor, los controles de identidad, mantenimiento, deduplicación y gasto. No compres ni recargues.
* Guarda progreso recuperable por posición con ruta, hash, job, proveedor, coste y motivo exacto del bloqueo. Permite retomar desde la última etapa confirmada.
* Mide tiempo hasta frames completos, tiempo desde aprobación hasta entrega, créditos por vídeo verificado, tasa de regeneración, reutilización de referencias y número de lotes que avanzan a la vez. Compara con un lote representativo antes de afirmar que mejoró. No declares ahorro si bajó la calidad o se omitieron verificaciones.


## 9. Pruebas de aceptación

Comprueba primero los payloads y las transiciones con recibos existentes o simulados. Separa cualquier prueba pagada y usa la autorización aplicable.

1. Cambio de variante. Original rosa, destino blanco con fresas. Comprueba selección guardada, prompts, adjuntos reales, frame, caja y vídeo. La prueba falla si reaparece la rosa en una toma.
2. Cambio de referencia de edición. Generación desde A y edición desde B. Verifica que escenas, textos y audio se toman de la fuente correcta. Repite con el campo B vacío.
3. Fondos A/A/B/C/D. Prueba Object Swap y Wan Prime. Verifica cuatro fondos nuevos, continuidad en A y eliminación total de los textos originales.
4. Gancho validado con adjuntos. Sube una foto real, guarda, recarga y envía. Verifica que se preserva la referencia, se desactiva Pinterest para esa tarjeta y el cuerpo seleccionado queda intacto.
5. Elección de modelo. Comprueba que cada opción de la interfaz activa su adaptador y sus reglas. Una incompatibilidad debe aparecer antes de gastar créditos.
6. Recuperación. Interrumpe un flujo con un trabajo aceptado, otro incierto y una tarjeta bloqueada. Comprueba recuperación por ID, ausencia de duplicados y avance de los demás.
7. Entrega. Verifica archivos finales, alemán, descripciones, audio, correspondencia con las tarjetas y que la carpeta contiene todos los vídeos esperados antes de anunciar el lote como listo.

Implementa primero los puntos donde se pierden selecciones o se duplican envíos. Después mejora concurrencia y reutilización. Muestra qué comprobaste con archivos, recibos o pruebas reproducibles, qué cambió en la práctica y qué depende todavía del proveedor.

---

## 10. Reglas fijas del flujo (Emmanuel, 23/11/2026)

Añadidas tras los vídeos de prueba del 23/11 (EisWerk, vídeo 2): el paso «Desglose» enseñaba tarjetas amarillas de «riesgos» y se quedaba parado, y el paso «Imagen» pedía «Generar 2 imágenes · Esto cuesta 4 créditos». Emmanuel no lee análisis ni avisos.

* **Flujo automático.** Referencia → desglose → imagen → clip → montaje se encadenan solos, dentro de los topes de gasto, el saldo y el presupuesto del lote. El envío del pedido (crear el vídeo o enviar el lote) autoriza los frames necesarios: no hay botones de «¿generar?» ni de «Confirmar» el presupuesto.
* **Sin avisos.** Los riesgos del desglose son instrucciones internas que el motor aplica en los prompts. No se enseñan como avisos ni paran el flujo; como mucho, plegados en «Detalles técnicos».
* **Una imagen por vídeo por defecto** (como el motor de Codex: un frame por clip). Más solo si Emmanuel lo especifica en la tarjeta o en el lote.
* **Solo preguntas obligatorias.** El flujo se para únicamente con una pregunta concreta que solo él puede decidir (avatar obligatorio sin elegir, variante, canción, falta un archivo, no hay saldo o se pasa del presupuesto) y sigue solo en cuanto responde. Nunca preguntas por preguntar.
* La aprobación visual de la imagen (punto 2) sigue siendo la única parada rutinaria; tras ella, clip y montaje van sin otra ronda. Un rechazo se regenera solo dentro de sus rondas.
