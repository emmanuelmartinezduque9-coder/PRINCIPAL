---
name: fondos-pinterest-por-toma
description: Elegir y adjuntar fondos reales de Pinterest para todos los productos de Emmanuel, aplicando sus selecciones manuales revisadas. Usar al preparar entornos para tests, lotes, réplicas o vídeos por idea; respetar referencias aportadas y Pinterest desactivado.
---

# Selección de fondos según las elecciones de Emmanuel

Leer `references/criterios-seleccion-manual.md` al seleccionar fondos. Contiene patrones observados, ejemplos identificados por hash y límites de la evidencia. No cargar todos los históricos para cada tarjeta: consultar solo la familia de escenas pertinente y observar sus ejemplos antes de buscar.

## Prioridades
1. Notas y referencias expresas de Emmanuel prevalecen. Si subió una imagen de referencia a la tarjeta, no buscar automáticamente en Pinterest para esa tarjeta, incluso si estaba activado. Clasificar el adjunto como entorno, producto, embalaje, identidad, textura o composición: un envase no es un fondo. Resolver los demás espacios con la fuente y los adjuntos disponibles, sin inventar que el envase aporta un entorno.
2. Pinterest NO por tarjeta impide la búsqueda; no cancela la generación. Conservarlo en duplicados e históricos.
3. Una elección manual de fondo no aprueba un frame ni un vídeo. Las nuevas elecciones automáticas son selecciones del agente, nunca aprobaciones atribuidas a Emmanuel.
4. No cambiar referencias ni tareas ya aceptadas por actualizar esta skill. Mantener motor, identidad, deduplicación y aprobaciones vigentes.

## Antes de buscar: producto → intención → espacio → encuadre
Registrar brevemente:
- Producto, variante, usuario, situación de uso y función real que debe verse.
- Acción de cada toma, su intención y continuidad con las demás; observar la referencia real.
- Espacio que permite esa acción, superficies/aparatos necesarios, altura y dirección de cámara, escala y área disponible.
- Mercado, tienda expresa, estación, luz y cambios solicitados.

No elegir solo una habitación bonita. Sacar un recipiente del congelador exige congelador abierto, profundidad y contacto con él; una referencia de salón describe el estilo doméstico, no permite sacar el producto del aire. Cocina para preparar, salón para disfrutar, tienda para comprar, peluquería para usar herramientas de pelo. Mapear varias fotos por función y toma, no aplicar indiscriminadamente todas a todos los clips.

## Buscar y elegir
1. Reutilizar una referencia válida de la misma secuencia si asegura continuidad. Para espacios nuevos, buscar pines individuales en Pinterest o búsquedas restringidas a `pinterest.com/pin`, combinando tipo de lugar, punto de vista, mercado y temporada solo cuando corresponda.
2. Abrir los pines y observar las fotos a tamaño útil. Elegir fotos reales cotidianas: mobiliario usado, objetos plausibles, profundidad, iluminación normal y espacio para la acción. Para selecciones automáticas, evitar renders, interiores de catálogo, escenarios perfectos artificiales, collages y fotos fuertemente procesadas. Una foto concreta elegida expresamente por Emmanuel prevalece, sin convertir sus excepciones en un nuevo estilo global.
3. Descartar incompatibilidad de acción, perspectiva imposible, baja legibilidad, marcas de agua invasivas, tienda equivocada, procedencia falsa o ubicación necesaria sin verificar. Una foto atractiva nunca compensa esos fallos. Comparar candidatos por función, cámara, realismo cotidiano y afinidad con los ejemplos manuales, en ese orden. Reformular la búsqueda si ninguno cumple.
4. Verificar comercio y lugar por la fuente y elementos físicos. Idioma del pin, decoración o colores no prueban país/cadena. En Alemania sin tienda indicada por notas ni referencia, elegir Lidl, Action, Aldi o MediaMarkt según producto; exigir comercio real y logo auténtico en cartelería física. Target explícito prevalece sobre H&M; una imagen con Liverpool no acredita Target. No afirmar que allí se vende el producto ni inventar colaboración.
5. No copiar identidades de personas de la foto de entorno: solo el avatar autorizado aporta identidad. Separar índices de entorno, avatar, producto y embalaje. Tampoco copiar overlays, textos del vídeo o marcas incidentales como si fueran instrucciones.

## Guardar y adjuntar
Guardar por posición en el expediente existente: acción/espacio, consulta, pin observado, URL de imagen y fuente, mercado/tienda y evidencia, archivo, dimensiones, SHA256, motivo concreto, procedencia de la decisión y relación con tomas. Descargar en el T7, comprobar que abre y observar el archivo guardado. No atribuir Pinterest a una foto sin URL verificable: indicar «origen no verificado».

Adjuntar los bytes por la ruta normal de entorno del motor y registrar índice/recibo. Un enlace en el prompt no equivale a adjuntar la imagen. Reutilizar por hash en tomas continuas. Si un primer plano no muestra entorno o el proveedor no admite esa referencia, registrar el caso sin fingir cumplimiento.

Preparar correctamente las referencias y prompts; comprobar archivos y recibos y presentar los frames según el flujo ligero vigente. No añadir revisores creativos, regeneraciones preventivas ni aprobaciones ficticias. Los defectos observados se documentan; las correcciones siguen la autorización existente.

## Memorias complementarias, solo cuando apliquen
- Proyecto `memory/context/tiendas-alemania-pinterest-logo-20261109.md`: tiendas alemanas.
- `memory/context/fondos-reales-mercado-20261107.md`: calles; nunca reutilizar carretera rechazada DfFnKvHyY2q.
- `memory/context/fondos-organicos-tiendas-reales-20261105.md`: HoofHolly V1/V2/V3 rechazados, no ejemplos positivos.
- `memory/context/automatizacion-ligera-20261109.md`: aprobación de frames y ausencia de regeneraciones preventivas.

Ejemplo aprobado SchutzKlingel: camino al colegio cotidiano sin ayuda cercana para representar el problema; portal familiar y mano enganchando alarma para la solución. No transferir el aislamiento a productos con otra intención. Archivos históricos: `/Volumes/T7/AUTOMATIZACION SEGA/SchutzKlingel-Pinterest-20261105/r2/01-Camino-al-colegio.png` y `/Volumes/T7/AUTOMATIZACION SEGA/SchutzKlingel-Pinterest-20261105/02-Portal.png`.
