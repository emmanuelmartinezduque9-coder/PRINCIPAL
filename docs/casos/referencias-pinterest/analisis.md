# Análisis de las referencias de entorno elegidas a mano por Emmanuel

Fecha del estudio: 22/11/2026. Estudio de solo lectura sobre el Mac del propietario. No se modificó nada fuera de `/tmp/principal-pin/`, que se borró al terminar. No se abrió ningún `.env*` ni credencial.

## 0. Resumen en diez líneas

- Se localizaron **44 fondos positivos elegidos a mano** por Emmanuel (R00–R48 del inventario del 17/11, sin R03, R07, R08, R19 y R42). Se vieron las 44 en hojas de contacto (tiles de 400 px). No se abrió ninguna a tamaño completo.
- Hay **5 imágenes excluidas**. Tres son de producto o ingrediente (R03, R19, R42). Dos son rechazos registrados (R07, R08), con **motivo desconocido**.
- El **único rechazo con motivo escrito por él** es el de los tres fondos de HoofHolly del 05/11: «Referencias con acabado profesional, espacios que no son tiendas reales. Exigir fotografías orgánicas de móvil tipo iPhone y comercio pertinente con mercancía a la venta».
- Las 44 elecciones están **muy sesgadas**. 29 son de la cuenta EisWerk y 24 son escenas de ocio en casa. 31 de las 44 son navideñas, por la época del corpus.
- Los patrones más fuertes: el fondo es del **mismo tipo de lugar que el clip del vídeo original**, **POV con elemento en primer plano**, **lugar habitado**, **profundidad con líneas de fuga** y **comercio real con mercancía y carteles**.
- Su regla escrita y sus elecciones discrepan en varios puntos (sección 6). El mayor es el filtro «descartar interiorismo y escenarios perfectos», que sus propias elecciones incumplen al menos 12 veces.
- Hay 10 preguntas abiertas para él al final (sección 7).

## 1. Dónde se encontró cada grupo

### 1.1 Elecciones manuales (grupo A, 44 positivas)

Todas las rutas son del Mac, volumen T7 (`/Volumes/T7/AUTOMATIZACION SEGA/`).

| Qué | Ruta | Evidencia |
|---|---|---|
| Inventario consolidado (49 imágenes únicas por SHA256) | `Referencias/Pinterest-seleccion-Emmanuel-20261117/inventario.json` | Campo `uses[].role = "fondo"`: imagen adjuntada por Emmanuel a una tarjeta o lote como fondo. Campo `approval_basis = manual_card_selection`. |
| Observaciones previas por imagen | `…/revision.md` (R00–R48) | Describe cada imagen y su clasificación. |
| Originales | `…/originales/<sha256>.jpg` | Sin modificar. |
| Contactos del 17/11 | `…/sheet-0.jpg`, `sheet-12.jpg`, `sheet-24.jpg`, `sheet-36.jpg` | Sirven de índice. |
| Pedidos de origen | Pedidos del propietario en `~/Library/Application Support/SEGATOM/local-access-state-20261005-1/original-intake/NanoBanana/_LOTES_APP/owners/emmanuel/orders/app-*.json` | 160 pedidos y 87 lotes escaneados. Cada imagen tiene sus `notes` literales. |

Resultado del inventario: `orders_scanned = 160`, `batches_scanned = 87`, `unique_count = 49`. Las 44 positivas se reparten así:

| Cuenta | Imágenes |
|---|---|
| EISWERK | 29 |
| FABLESEAT | 3 (R04, R05, R06) |
| FRECHFLAUSCH | 3 (R11, R12, R44) |
| HUPFPANDA | 2 (R13, R15) |
| WINTERDURCHBLICK | 2 (R45, R46) |
| ZIELALARM | 1 (R00) |
| HAARZAUBER | 1 (R14) |
| FENSTERFUNKELN | 1 (R34) |
| Chat directo (R47 Target, R48 IKEA) | 2 |

Qué prueba y qué no prueba este grupo:

- Prueba que **Emmanuel adjuntó esa imagen como fondo** y que lo confirmó en ese encargo. En `approval_basis` se lee «user confirms chosen references as approved in current request; not generated-frame approval».
- **No prueba que la imagen venga de Pinterest.** Todas llevan `pinterest_provenance: not_verified`, sin URL ni `source_metadata`.
- Indicio de origen, no prueba: 29 de las 44 miden 735 o 736 px de ancho. Ese es el tamaño estándar `736x` de `i.pinimg.com`. Las otras 15 tienen tamaños distintos (900×1200, 1200×1600, 1080×1920, 1134×2016, 1152×2048…). Pueden ser capturas de pantalla, fotos propias u otras fuentes. Son R06, R09, R12, R14, R17, R21, R24, R25, R29, R32, R40, R41, R43, R46 y R48.
- Casi nunca dejó el motivo. Sus notas dicen solo cómo usarla, por ejemplo «usa esta imagen de referencia como fondo». **Los criterios se infieren de lo que eligió.**

### 1.2 Rechazadas por él (grupo B)

| Imagen | Evidencia | Motivo |
|---|---|---|
| **R07** (salón nocturno con árbol y texto «cue silent night») y **R08** (POV de sofá con TV y árbol) | `explicit_decisions: [{batch 30eb0e20…, decision: rejected}]` en el inventario. Ambas fueron adjuntadas por él mismo en el pedido `app-5650ebc2…-37` («utilice de fondo la habitación que adjunte»). | **No registrado.** No encontré el registro de origen. El lote `app-30eb0e20…-39` tiene además un `all-frames-approved-decision.json` («apruebo todas»). Así que no puedo afirmar si rechazó la referencia, un frame resultante o un estado intermedio. |
| **HoofHolly V1–V3 del 05/11**: tres entornos (A y B, showrooms de guadarnés; C, rótulo de McDonald's drive-thru) y los tres frames generados con ellos | `CalendarioCaballos-20261105/human-rejection-20261105.json`: `decision: reject_all_three_frames`, `do_not_reuse_as_reference: true`. Entornos en `CalendarioCaballos-20261105/environments/`. Frames en `revision-frames/HoofHolly-V1…V3.png`. | **Sí, literal**: «Referencias con acabado profesional, espacios que no son tiendas reales. Exigir fotografías orgánicas de móvil tipo iPhone y comercio pertinente con mercancía a la venta.» |
| Fondo de **Target** para una prueba en Alemania (HaarFein, 18/11) | `Motor/order-preparation/app-1db468b5…-11/correction-de/decision.json` | Literal: «No estás usando la lógica. Hiciste fondo de target sabiendo que el país al que voy a testear es Alemania.» Pidió «la tienda DM de Alemania» y mantener Sephora «pero cambia el fondo de Sephora». Aprobó solo el frame 3. |

Salvo esos tres casos no encontré más rechazos registrados.

### 1.3 Elegidas por el agente antiguo (grupo C)

Son imágenes con ficha de procedencia. Todas se vieron.

| Origen | Ruta | Qué es |
|---|---|---|
| HoofHolly, segunda ronda tras el rechazo | `CalendarioCaballos-20261105/environments-r2/v1.jpg`, `v2.jpg`, `v3.jpg` (+ `.json` con pin y consulta) | Pines de Pinterest, con consultas «tack shop shopping inside» y «mcdonalds drive thru car pov». Los frames hechos con ellas (`referencia-visual-muy-aprobada/`) los aprobó él: «Estos resultados me gustaron mucho… Esto es lo que quiero que hagas en todos los productos» (`human-special-approval-20261105.json`). |
| Pedido de masajeadores de pies | `Motor/order-preparation/chat-test-7cfcb30a…/correction-v2-v3-realism/environment-v2.jpg`, `environment-v3.jpg` + `pinterest-provenance.json` | Pines de Pinterest, consulta «wohnzimmer wohnung alltag». |
| Test con perros y nieve | `TEST_PRODUCTOS_APP/emmanuel/100f6c2f…/v1-background-pinterest.jpg`, `v2-background-pinterest.jpg` + `pinterest-evidence.json` | Pines con URL. |
| Test con dormitorio de fan | `TEST_PRODUCTOS_APP/emmanuel/a250d475…/pinterest/v3-background.jpg` + `selection.json` | Pin con URL. |
| SchutzKlingel (camino al colegio) | `SchutzKlingel-Pinterest-20261105/r2/bg0.jpg`, `bg5.jpg`, `bg6.jpg` + `seleccion.json` | Consulta «park path». El frame resultante es el «ejemplo aprobado» de su skill. |
| Otros con «pinterest» en el nombre | `Motor/order-preparation/app-c85cc8da…-50/v10-correction/pinterest-salon.jpg`, `WinterTasse-Dfde5nqMXUk-20261108/source/pinterest-livingroom.jpg`, `TEST_PRODUCTOS_APP/emmanuel/{b64753cb…,330abef0…}/scene-preparation/environment-pinterest-*.jpg` | Salones navideños nocturnos. |
| Sephora, H&M y Action (HaarZauber) | `Motor/order-preparation/app-00c619fe…-24/environments/` y `app-89d8e7b1…-19`, `app-3963b8e6…-21` | Pines con fichas («BerlinWarda pin explicitly Berlin/Germany»). |
| Lote «de reserva» sin Pinterest | `Motor/order-preparation/app-8082c194…-81/references/new-environments-provenance.json`, `mcdonalds-bonn-provenance.json` y `app-6852a9fd…-54/references/environment-bebelplatz-independent.jpg` | Fotos de webs de turismo, inmobiliarias, TripAdvisor y la web oficial de McDonald's. La ficha dice: «Real-location fallback after Pinterest image searches returned no results; not claimed user approved». |

Aviso: de este grupo no se sabe qué piensa él de cada referencia. Solo se sabe qué dijo de los **frames** resultantes. Aprobar un frame no es aprobar la referencia.

### 1.4 Origen dudoso (grupo D)

- **dm.jpg y sephora.jpg del 18/11** (`app-1db468b5…-11/correction-de/`). La nota de memoria dice «Emmanuel seleccionó dm alemana en V1 y otro interior de Sephora en V2». Pero estos ficheros están en la carpeta de corrección que generó el agente, y no encontré un adjunto suyo. No sé si él subió las imágenes o eligió entre candidatos del agente. Se ven en la tabla como «D».
- Las imágenes de `Motor/order-preparation/*/references/` con nombre hash que coinciden con las R del inventario (por ejemplo `061c6446…` = R14, `29ac06fb…` = R10) son **reutilizaciones** de sus fondos en pedidos posteriores. No son elecciones nuevas.
- Los pedidos posteriores al 17/11 no se reinventariaron. Solo pude confirmar el caso HaarFein. Puede haber más elecciones suyas fuera del inventario.

## 2. Método y límites

- Se vieron en contactos de 3×3 tiles de 400 px, con etiqueta, hechos con ffmpeg en `/tmp/principal-pin/`:
  - las 44 positivas;
  - las 5 excluidas;
  - los 3 entornos HoofHolly rechazados, los 3 de la segunda ronda y los 6 frames (rechazados y aprobados);
  - 21 elecciones del agente;
  - 8 de la serie Sephora, dm, H&M y Action.
- A ese tamaño se aprecian lugar, cámara, luz y presencia de caras o textos. **No** se aprecian nitidez fina ni ruido. No se leyó EXIF. «Aspecto de móvil» es una impresión visual, no un dato. Tampoco se verificó el país ni la cadena de ninguna imagen.
- Mi clasificación de lugares es mía. El inventario no la trae.

## 3. Tabla de imágenes estudiadas

Leyenda: **A** = elegida a mano por él (positiva); **B** = rechazada; **C** = elegida por el agente; **D** = origen dudoso; **X** = excluida (no es entorno). «POV» = el móvil se sostiene desde un asiento, la cama, un carro o un coche, con parte del cuerpo o del mobiliario en primer plano.

### 3.1 Grupo A: elecciones manuales

| ID | Cuenta | Lugar y contenido | Cámara | Luz y color | Habitado, personas, texto | Encaje con la función |
|---|---|---|---|---|---|---|
| R00 | ZielAlarm | Dormitorio claro con cama y árbol | Plano general en diagonal, algo alto, objetos descentrados | Luz diurna suave, rojo y blanco | Gato en la cama y rascador. Sin texto. | Nota: «que el entorno… sea la habitación que subí» (cambio de fondo del clip 3). |
| R01 | EisWerk | Salón: sofá, manta, taza, perro, TV con película, chimenea y árbol | POV sentado, mano con taza en primer plano, ángulo bajo | Mixta: luz de la chimenea, TV y luz suave | Perro y manta. Una película en pantalla. | Disfrutar en casa con superficie delante. |
| R02 | EisWerk | Isla de cocina de mármol con cascanueces y guirnaldas | Frontal, ligeramente alto | Diurna, muy clara | Decoración **muy compuesta**. | Preparación. Encimera útil. |
| R04 | FableSeat | Atrio de centro comercial con árbol enorme y rótulo «Liverpool» | Desde un balcón, hacia abajo, vertical | Luces cálidas y puntuales | Gente muy pequeña. Logo Liverpool. Su inventario avisa de que no acredita Target ni mercado de EE. UU. | Nota: «cambia el fondo del centro comercial por la primera imagen». |
| R05 | FableSeat | Escritorio pastel azul y rosa, pantallas, silla blanca, decoración princesa | Frontal, centrado | Luz azul y rosa de LEDs, ambiente pastel | Muy curado. | Nota de princesas. Silla visible. |
| R06 | FableSeat | Rincón de escritorio blanco con silla y zapatillas | Frontal elevado | Lámparas cálidas, luz fría de pantalla | Muy ordenado. Zapatillas y manta como signos de uso. | Cambio de fondo de la habitación. |
| R09 | EisWerk | Pasillo de almacén con palés de bebidas | Pasillo profundo, líneas de fuga fuertes | Fluorescente de techo, mixta | Productos de muchos colores. Carteles colgantes. | Nota: «en el primer frame uses esta imagen». Tienda. |
| R10 | EisWerk | Salón alto: TV, chimenea, árbol, mesa | Frontal, vertical, desde sofá | Diurna, muy clara | Pocas personas, mucho objeto. | Nota: «a partir del segundo clip… la segunda imagen». |
| R11 | FrechFlausch | Interior de coche desde el conductor con volante y consola | POV, móvil sobre las piernas | Luz diurna nublada, pantallas azuladas | Móvil sobre las piernas. Coche de lujo. | «Fondo del primer clip». |
| R12 | FrechFlausch | Exposición navideña de una tienda grande con compradores | Plano medio, algo inclinado | Focos y tubos industriales | Compradores pequeños. Mercancía y árbol. | «Fondo». Comercio real. |
| R13 | HupfPanda | Salón con TV, perro blanco, manta roja y árbol | Frontal, desde sofá | Luz cálida y TV con **LED rojo trasero** | Perro, manta, bandeja de dulces. | Sin nota. |
| R14 | HaarZauber | Peluquería en uso, espejos, puestos, personal | Pasillo profundo, grano de móvil | Luz de techo blanca, suelo brillante | Personal y clientes con **caras visibles y pequeñas**. Cuadro de Audrey Hepburn. | «Fondo». Función: usar herramientas de pelo. |
| R15 | HupfPanda | Salón gris con mantas, guirnaldas y árbol | Gran angular, desde fondo | Diurna | Muy decorado. | Sin nota. |
| R16 | EisWerk | POV de sofá, zapatillas verdes de Grinch, TV | POV con piernas en primer plano | Luz cálida suave | Zapatillas, pantalla con película. | Disfrutar en casa. |
| R17 | EisWerk | Salón de día, pared de madera, TV, árbol, ventanales | Gran angular | Luz natural, tonos cálidos | Mesa de madera con vela. | Nota: «usa esta imagen de referencia como fondo». |
| R18 | EisWerk | POV de sofá bajo, mesa, taza, TV y árbol | POV con piernas | Luz de interior clara | Zapatillas, mesa pequeña. Pantalla con película. | «Usa la primera imagen como fondo». |
| R20 | EisWerk | Salón nocturno con chimenea, árbol y manta a cuadros | Frontal bajo, vertical | Luz cálida de noche | Manta, regalos. | Nota: «haz que el fondo sea esta habitación». |
| R21 | EisWerk | Zona navideña de supermercado con arco y reno | Frontal, profundidad media | Fluorescente de techo | Carteles de precio. | Nota: «primera imagen como fondo del primer clip en la tienda». |
| R22 | EisWerk | Portátil sobre manta delante de un árbol, con galletas | POV de lado, alto | Muy cálida, nocturna | Peluche Grinch, galletas. | «Segunda imagen… fondo del salón». |
| R23 | EisWerk | Cocina de madera con un hombre cocinando, de espaldas | Frontal, hombre de espaldas | Cálida suave | Persona de espaldas, sin cara. | Nota: «cambia el avatar por el hombre… y el fondo por la segunda imagen». |
| R24 | EisWerk | Cocina blanca con isla, ventana y árboles pequeños | Plano medio, algo alto | Luz cálida bajo armario más LED azul | Objetos sobre la isla. | Nota: «misma perspectiva que el vídeo de referencia». |
| R25 | EisWerk | Supermercado con arcos de guirnaldas y pasillos | Pasillo profundo, vertical, líneas de fuga | Tubos de techo, mezcla | Carteles de precio, clientes lejanos. | Nota: «segunda imagen… fondo del primer clip en el supermercado». |
| R26 | EisWerk | Salón con TV enmarcada en guirnalda y lazos | Frontal, ligeramente alto | Diurna cálida | Muy decorado. Mueble de TV con objetos. | «Segunda imagen como fondo». |
| R27 | EisWerk | Chimenea de piedra y árbol grande | Frontal bajo | Luz cálida de chimenea y luces del árbol | Alfombra, regalos, calcetines. | «Fondo del salón». |
| R28 | EisWerk | Cama con manta roja, portátil y nieve tras la ventana | POV desde la cama | Luz fría de ventana y colcha roja | Portátil, taza. | «Fondo del salón». |
| R29 | EisWerk | Congelador comercial con tarros de helado | Frontal cercano | Luz blanca de nevera | Marcas de helado. | Nota de función: sacar del congelador. |
| R30 | EisWerk | POV desde la cama, portátil, taza, rosquillas, ventana | POV, cuerpo ausente | Luz de ventana, tarde | Película en pantalla. | «Primer clip», diseño de ensamble. |
| R31 | EisWerk | Salón con película proyectada, manta y peluche | Plano bajo con manta en primer plano | Cálida y tenue, flash pedido | Rostro en la proyección. | Nota: «haz que sea como una foto tomada con flash». |
| R32 | EisWerk | Entrada de tienda con puesto «Merry Magic» y guirnaldas | Gran angular, inclinado | Focos de carril y luz natural | Texto del suelo y rótulos. | Tienda. |
| R33 | EisWerk | Salón nocturno: sofá gris, chimenea, TV | POV con brazo del sofá | Cálida, tenue | Lámpara de mimbre. | «Usa esta imagen como fondo». |
| R34 | FensterFunkeln | Salón de doble altura, árbol dorado, ventanales | Gran angular bajo, simétrico | Luz de techo dorada | **Acabado editorial.** | Elección expresa. |
| R35 | EisWerk | Salón familiar: TV con chimenea, árbol, sofás | Plano general alto | Diurna, rayo de sol en el suelo | Cojines, mesa. | Nota: «saque la máquina de helados de debajo de este árbol». |
| R36 | EisWerk | POV: piernas con pijama a cuadros, TV con película, árbol | POV con manta y piernas | Cálida, LED rojo tras la TV | Película en pantalla. | Nota: «con un perro en las piernas como el vídeo de referencia». |
| R37 | EisWerk | POV con piernas en pijama, TV con chimenea, árbol | POV bajo | Cálida | Pijama navideño. | Nota: «dos personas viendo una película». |
| R38 | EisWerk | Chimenea de piedra, vigas, árbol blanco | Plano general | Luz mixta | Muy decorado. | «Fondo». |
| R39 | EisWerk | Salón blanco alto, árbol, ventilador | Gran angular bajo | Diurna | Manta y cojines en primer plano. | «Fondo». |
| R40 | EisWerk | Salón con TV, chimenea de piedra y árboles | Plano general | Diurna | Sofás, cojines. | Nota: «cambies el fondo por este fondo». |
| R41 | EisWerk | Salón con TV (película), mesa lateral, árbol | POV con pierna | Clara, fría | Poinsettia. | Nota: «cambies el fondo por este fondo… sabor de helado de oreo». |
| R43 | EisWerk | Cocina blanca con isla de mármol y lazos rojos | Gran angular | Diurna | Decoración navideña. | Nota: «uses esta cocina como fondo». |
| R44 | FrechFlausch | Recepción de clínica con mostrador y sillas verdes | Gran angular, esquina | Luz blanca de techo | Personal pequeño. Pantalla con radiografía. | Nota: «utiliza la imagen… decoración de navidad». |
| R45 | WinterDurchblick | Calle nevada con coches cubiertos | Calle profunda, vertical | Hora azul, farola | Sin personas. | Nota de gancho. |
| R46 | WinterDurchblick | Coche nevado de noche | Plano bajo | Noche, luces del coche | Huellas en la nieve. | Nota pide «de día… luz, pero que se note el ambiente». La imagen es nocturna: manda la nota. |
| R47 | Chat | Cajas de supermercado Target (rojas) con logotipos | Gran profundidad, vertical | Fluorescente de techo | Logos físicos. | Referencia expresa para sustituir H&M en pruebas de EE. UU. |
| R48 | Chat | IKEA: carro azul en primer plano, pasillo de almacén | POV de carro | Luz de nave | Logo IKEA. | Producto a la derecha. |

### 3.2 Excluidas del grupo manual

| ID | Qué es | Observación |
|---|---|---|
| R03 | Camiseta navideña impresa | Producto, no entorno. |
| R19 | Helado con galletas | Textura y receta. |
| R42 | Envase Oreo | Ingrediente. |
| R07 | Salón nocturno con árbol y texto «cue silent night», ventanal de ciudad | **Rechazada.** Veo: texto superpuesto, acabado de «aesthetic», sin objetos de uso. El motivo es desconocido, esto es solo observación. |
| R08 | POV de sofá con TV (una modelo posando), árbol, mesa con libros de diseño, velas | **Rechazada.** Veo: la pantalla enseña una foto de moda, decoración de revista y mesa sin uso. Motivo desconocido. Compárese con R18 y R36 (aceptadas), que también son POV con TV y árbol. |

### 3.3 Grupo B: rechazados con motivo («HoofHolly»)

| ID | Qué se ve | Por qué encaja con su motivo |
|---|---|---|
| HOOF-rech-A | Showroom de guadarnés con pared terracota, silla de montar sobre soporte de madera clara, simétrico | Diseño y estudio. No hay mercancía a la venta. «Acabado profesional.» |
| HOOF-rech-B | Pared de madera con perchas y bridas, mesa de trabajo, sin precios ni etiquetas | Diseño de interiores. «No es una tienda real.» |
| HOOF-rech-C | Rótulo oficial de McDonald's «Drive Thru» desde fuera, plano limpio | Foto de catálogo. Sin POV de coche. |
| FRAME-rech-V1…V3 | Frames hechos con esas tres | Personas posando, mucho acabado. Rechazados. |

### 3.4 Grupo C: elegidas por el agente

| ID | Qué se ve | Observación |
|---|---|---|
| HOOF-r2-v1 | Tienda ecuestre con suelo gris, techo de madera, mucha mercancía | Aprobada de facto: el frame resultante entró en «muy aprobados». |
| HOOF-r2-v2 | POV de coche con salpicadero, parabrisas y cielo, cola del drive-thru | Idem. Precio en rand visible (no encaja con EE. UU.). |
| HOOF-r2-v3 | Estantería de ronzales con etiquetas, rótulos «HATS» y «BRUSHES», guirnaldas | Idem. Recorte cercano e iluminación desigual. |
| AG-chat7cfc-v2 | Salón con lámparas de colores saturados (rosa, naranja) | Estilo «habitación de TikTok». Resultado del pedido desconocido. |
| AG-chat7cfc-v3 | Salón gris oscuro con TV apagada y mesa de mármol | Frío y casi vacío. |
| AG-100f-v1bg, v2bg | Calle alemana de casas entramadas con nieve de noche; casa blanca con nieve en hora azul | Pines con URL. Orgánicas. |
| AG-a250-v3bg | Dormitorio de fan con muchísimo objeto (Harry Potter, pósters) | Pin con URL. Muy habitada. |
| AG-schutz-bg0 | Parque con césped y árboles al sol | Foto de naturaleza. Usada en el «ejemplo aprobado». |
| AG-schutz-bg5, bg6 | Canal con barcazas británicas y una esclusa con marca de agua de fotógrafo | Paisaje profesional, no alemán. |
| AG-c85c-salon, AG-330a-env, AG-b647-env, AG-wintertasse | Salones navideños nocturnos o de tarde, cálidos | Muy parecidos a sus A (R20, R27, R33). |
| AG-8082-harbor, yard, park, patio, store, street | Puerto de Hamburgo, patio holandés de inmobiliaria, parque al anochecer, terraza de restaurante, calle residencial | **Fotos de webs de turismo, inmobiliaria y TripAdvisor.** Muy retocadas (HDR). Él aprobó los frames del lote, no estas referencias. |
| AG-8082-mcd | Entrada de McDonald's de Bonn (web oficial) | Foto de ubicación oficial. |
| AG-6852-bebel | Panorámica de la Bebelplatz al anochecer | Foto profesional. |
| AG-seph-interior, v3-sephora, AG-3963-sephora | Interiores de Sephora con expositores | Pin de Berlín; foto de móvil con poca luz. |
| AG-seph-entrance, hm, action | Entrada de Sephora con cola, H&M, Action | Fotos de móvil con rótulo físico. |

### 3.5 Grupo D: origen dudoso

| ID | Qué se ve | Observación |
|---|---|---|
| DE-dm-18nov | Pasillo de dm con estanterías, luz clara | «Emmanuel seleccionó dm alemana». Origen exacto sin verificar. |
| DE-sephora-18nov | Zona de Sephora con clientas, anillo luminoso | Idem. |

## 4. Patrones de sus elecciones (grupo A, con imágenes)

Cada patrón lleva el recuento sobre las 44 positivas. Con el sesgo de la sección 1 (EisWerk, Navidad), no se pueden generalizar a otros productos.

1. **El fondo repite el tipo de lugar del clip original, y se pide por clip.** En muchos pedidos adjuntó dos fondos: tienda para el primer clip y salón para los siguientes. R04 (centro comercial) y R05/R06 (habitación). R09 + R10. R21 + R22. R25 + R27. R31 + R32. Sus notas lo dicen: «fondo del primer clip en la tienda… segunda imagen como fondo del salón». Para él la pregunta no es «un entorno bonito» sino «el sitio que ya está en el vídeo, pero con otra foto».
2. **Escena habitada, con signos de uso.** Mantas, tazas, mandos, portátiles, zapatillas, peluches, platos con galletas, mascotas (R00 gato, R01 y R13 perros). Aparecen en casi todas las del grupo de casa, 24 imágenes: R16, R18, R22, R30, R36, R37, R41…
3. **POV con un elemento del cuerpo o del mobiliario en primer plano.** 14 de 44: R01, R11, R16, R18, R22, R28, R30, R31, R33, R36, R37, R39, R41, R48. Son piernas, manta, brazo del sofá, taza, carro o móvil. El móvil está sostenido a la altura de quien se sienta, no en un trípode.
4. **Profundidad y líneas de fuga en las tiendas.** R09, R25, R47, R48, R14, R44: pasillos que se alejan, techo con luces repetidas. Se ve el suelo y hay espacio para andar.
5. **Comercio real con mercancía, carteles y marcas.** R09, R12, R21, R25, R29, R32, R47, R48. Hay precios, estantes llenos, rótulos físicos con logo (R47 Target, R48 IKEA, R04 Liverpool).
6. **Luz doméstica con fuentes visibles y mezcla de temperaturas.** Luces del árbol y chimenea (R20, R27, R33, R36), LED rojo tras la TV (R13, R36), luz bajo armarios más LED azul (R24), luces de techo frías en tiendas (R09, R25, R47). También hay escenas diurnas muy claras (R10, R17, R35, R39, R43). No elige un solo estilo de luz. Pidió flash solo en R31 y «de día» en R46.
7. **Función antes que estética.** R29 es un congelador comercial porque la acción era sacar helado de un congelador. R14 es una peluquería real. R44 es una recepción. R23 es una cocina con un hombre cocinando. R11, R45 y R46 son frío y coche. R24 pide «la misma perspectiva que el vídeo de referencia».
8. **Casi sin caras.** Las personas, cuando aparecen, son pequeñas, de espaldas o lejanas (R04, R12, R14, R23, R25, R44, R47). Las caras grandes están solo en pantallas de TV o proyecciones (R16, R18, R22, R31, R41) y no son «fondo».
9. **Cámara de móvil con pequeños defectos de encuadre.** Gran angular, verticales que convergen (R33, R39, R44), objetos cortados en el borde (R12, R16, R18), recortes descentrados (R00, R14). No son fotos simétricas ni de arquitectura, salvo R34 y, en parte, R02, R05, R06, R38 y R43.
10. **Navidad.** 31 de las 44 llevan árbol, guirnaldas o decoración navideña (R28 cuenta con dudas: nieve, luces y colcha de copos). Los 13 restantes son R05, R06, R09, R11, R14, R23, R29, R30, R44, R45, R46, R47 y R48. Es un efecto de la época, no una preferencia demostrada.

### Lo que evita de forma consistente

- **Productos, texturas o ingredientes como si fueran fondo.** R03, R19, R42 se excluyeron.
- **Tienda sin mercancía** (HoofHolly A y B): «espacios que no son tiendas reales».
- **Fotografía profesional o de showroom** (HoofHolly A, B, C): «acabado profesional».
- **Cadena o país equivocado para el mercado de la prueba**: Target para Alemania (18/11). R04 muestra Liverpool, no Target, y sus notas lo avisan.
- **Texto superpuesto y fondo «aesthetic»** (R07, R08): observación mía. Él no dio motivo.
- **Referencias con caras como identidad.** Sus notas y la regla del 14/11 y del 19/11 exigen que la identidad salga solo del avatar.

## 5. Diferencias entre lo que eligió él y lo que eligió el agente

| Tema | Él (A) | Agente (C) |
|---|---|---|
| Tiendas | Pasillos con mercancía, precios, luz de tubos, mucha profundidad (R09, R25, R47, R48) | Showrooms de guadarnés (HOOF-rech-A y B) y un drive-thru de catálogo (HOOF-rech-C) |
| Fuente | Fotos de móvil con aspecto de Pinterest (29 de 44 con 736 px) | En el lote de reserva (8082) fotos de webs de turismo, inmobiliarias y TripAdvisor; en SchutzKlingel paisajes de fotógrafo con marca de agua (bg6) |
| Luz | Mezclada y con fuentes visibles | A veces uniforme y retocada (AG-8082-yard, patio, street); a veces oscura y vacía (AG-chat7cfc-v3) |
| Habitado | Casi siempre | Salones vacíos (AG-chat7cfc-v3), naturaleza sin gente, plazas de postal |
| Mercado | Mezcla sin verificar (Liverpool, Target, IKEA). Pide Target para EE. UU. y rechaza Target en Alemania. | Intenta Berlín explícito en HaarZauber; mezcla en otros |
| Después de rechazar | Pidió «fotografías orgánicas de móvil… comercio pertinente con mercancía a la venta». | La segunda ronda de HoofHolly (HOOF-r2) cumplía esas condiciones y él la aprobó («Esto es lo que quiero que hagas en todos los productos») |

La segunda ronda del agente se parece a sus propias elecciones: mercancía con etiquetas, recorte cercano, POV de coche, luz desigual.

## 6. Dónde su regla escrita y sus elecciones discrepan

1. **«Descartar interiorismo y escenarios perfectos»** (`imagen-nano-banana.md`, orden del 05/11; skill, «interiores de catálogo, escenarios perfectos artificiales»). Sus elecciones incluyen al menos 12 imágenes muy compuestas o decoradas como revista: R02, R05, R06, R10, R15, R17, R26, R27, R34, R38, R39, R43. La skill trata solo R34 como excepción. En realidad son una familia: **casas decoradas por su dueño y fotografiadas con móvil**. Hipótesis (mía): tolera el pulido en casas y no lo tolera en tiendas y servicios, donde exige mercancía. HoofHolly apoya esto, pero un solo caso no lo prueba.
2. **«No repetir roble, paredes verdes, guirnaldas, sofás y árboles como firma estética»** (regla de imagen, «Patrón visual elegido»). Sus 17 salones de EisWerk (R01, R10, R16, R17, R18, R20, R26, R27, R31, R33, R35, R36, R37, R38, R39, R40, R41) son sofá, TV, árbol y guirnalda. La regla lo resuelve de forma implícita: los elementos «exigidos por la acción o la fuente» se conservan. Falta decir que, para EisWerk en Navidad, la acción de la fuente sí lo pide («saque la máquina de debajo de este árbol», «dos personas viendo una película»).
3. **«Navidad no es obligación perpetua»** (skill). Es coherente con lo que dice, pero 31 de 44 elecciones son navideñas y la regla no da ejemplos de otras estaciones. Con otros productos no hay datos.
4. **Caras visibles.** La orden del 19/11 («Una referencia de realismo o de entorno no debe llevar una cara visible»), en la regla de imagen, es **más estricta que sus elecciones**: R14 y R12 tienen caras pequeñas visibles. Hay que decidir si el criterio es «sin cara reconocible» o «sin caras».
5. **Procedencia.** La skill pide URL de pin verificada y, si falta, «origen no verificado». Para las 44 elecciones suyas **no hay URL**. Si el modelo exige URL, descartaría todas sus propias elecciones.
6. **POV.** La skill dice «no todos los planos deben ser POV». Es verdad, pero 14 de 44 son POV con primer plano. El rechazo R08 (POV con TV y árbol) y los ejemplos aceptados R18 y R36 muestran que el POV no basta ni descarta. Falta saber qué diferencia R08 de R18 y R36 para él.
7. **Mercado.** La skill pide comprobar cadena y país. Sus elecciones de tiendas (R12, R21, R25, R32) tienen cadena sin verificar, y R47 es Target, cadena de EE. UU. Para pruebas en Alemania rechazó Target. La regla debería enlazar la referencia con el país **de la prueba**, no con el país de la foto.
8. **Dónde se detiene el «aspecto de móvil».** La regla dice «validar apariencia y procedencia, no inventar EXIF». Entre sus elecciones, R34 y R02 se leen como foto editorial. Para el modelo, «aspecto de móvil» necesita señales concretas (sección 3 y propuesta).
9. **Referencias de reserva sin Pinterest.** En el lote 8082 el agente usó fotos de webs de turismo e inmobiliarias porque Pinterest no devolvió resultados, y él aprobó los frames. Es lo contrario de «acabado profesional» del 05/11. No sabemos si fue una aprobación consciente.

## 7. Preguntas abiertas para Emmanuel

1. **R07 y R08.** ¿Por qué los rechazaste? ¿Fue la referencia (texto superpuesto, pantalla con modelo, decoración de revista) o el frame resultante?
2. **Pulido en casas.** ¿Te parecen bien los salones muy decorados (R02, R05, R10, R15, R26, R27, R34, R38, R43) porque son casas reales de gente decorando? ¿O prefieres menos pulido también en casas?
3. **Origen.** ¿Todas tus elecciones vienen de Pinterest (29 miden 736 px)? ¿Puedes darme la lista de pines o el tablero? ¿Las otras 15 (900×1200, 1200×1600, capturas) vienen de otro sitio?
4. **Caras.** En una referencia de entorno, ¿valen caras pequeñas o de espaldas (R14, R12, R23)? ¿O ninguna cara?
5. **Otras estaciones y productos.** Tus 44 elecciones son casi todas navideñas y de EisWerk. ¿Tienes elecciones de otros productos o estaciones fuera del inventario del 17/11? ¿Y de los pedidos posteriores?
6. **POV.** El primer plano (piernas, manta, carro, taza) en 14 de 44: ¿lo buscas a propósito para que se note el móvil, o depende de la toma?
7. **Luz.** ¿Prefieres noche cálida con luces del árbol o día claro? ¿Hay una regla por tipo de toma? ¿El flash solo si lo pides (R31)?
8. **Tiendas alemanas.** Tu nota del 09/11 lista Lidl, Action, Aldi y MediaMarkt. El 18/11 pediste dm y mantener Sephora con otro fondo. ¿Añadimos dm y Sephora a la lista? ¿Con qué tipo de producto?
9. **Fotos de reserva.** Si Pinterest no devuelve nada, ¿prefieres que la app pare y te pregunte, o aceptas fotos de webs de turismo e inmobiliarias?
10. **Lujo.** R11 (coche de gama alta) y R46 (todoterreno de lujo): ¿el coche de lujo es deliberado o accesorio?
