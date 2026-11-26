# Referencias de Pinterest en la imagen inicial (23/11/2026)

**Por qué:** el dueño lo pidió tres veces. La imagen del 23/11 a las 3:34 (EisWerk, salón navideño, manos con un regalo redondo) salió solo con 4 adjuntos (fotograma original, avatar, producto, caja) y sin ninguna referencia de Pinterest. En la automatización anterior sí existía (skill `fondos-pinterest-por-toma`), pero se quitó al limpiar las reglas (`docs/decisiones-base-plataforma.md`, Tarea 9).

**Regla (fija):** por defecto, siempre se buscan referencias de Pinterest para cada imagen inicial, también al regenerar una rechazada. Excepción: si el vídeo lleva una referencia de entorno puesta a mano, no se busca. Texto completo para el modelo: `reglas/referencias-pinterest.md`.

## Corrección del dueño (23/11/2026, la que manda ahora)

Las 2 fotos que la búsqueda nueva eligió para la escena de EisWerk le parecieron falsas, de mala calidad, muy oscuras y sin decoración navideña. Orden: **de momento nada de buscar en Pinterest**; usar solo referencias que él ya puso a mano y aprobó, elegidas solas (sin ningún paso en que él elija), y que el banco crezca con lo que apruebe.

- **Banco** (`reference_bank`): 44 fotos del sistema anterior (R00–R48 menos R03, R19 y R42, que no son sitios, y R07 y R08, que rechazó), pasadas a JPEG y subidas al almacén (`pinterest/<sha256>.jpg`). Índice con código, cuentas y descripción en `reglas/banco-referencias.json`; se siembra al arrancar (`seedReferenceBank`).
- **Elección:** tras el desglose, Claude describe la escena (como antes) y, en vez de buscar, mira con visión las miniaturas de todo el banco con su descripción y su cuenta y elige como mucho 2 (`BANK_ONLY = true` en `pinterest.ts`). Las búsquedas anteriores se borraron en la migración 0033 para que todas se rehagan con el banco.
- **Crece solo:** al aprobar una imagen de un vídeo con referencia de entorno puesta a mano, esa foto entra en el banco (`addApprovedToBank`, código `V<vídeo>`).
- **Igual que antes:** la imagen no se pide sin referencias (salvo entorno a mano), van al final del manifiesto con su papel en el prompt y se ven en la tarjeta. Cada envío real deja en el registro «Imagen del vídeo N enviada: X referencias; referencias aprobadas de Pinterest: sí/no».
- La búsqueda nueva (abajo) queda en el código, apagada, para afinarla más adelante.

## Cómo lo hacía el sistema anterior

- No había un buscador automático: el agente abría `pinterest.com/search/pins/?q=…` en el navegador con la sesión del dueño, miraba los pines y bajaba la foto (`i.pinimg.com/736x/…`, a veces `originals`). Se intentó buscar sin navegador y Pinterest devolvía páginas vacías («Invalid Resource Request»); también se probó Bing filtrando pines (muchos resultados basura).
- Elegía mirando cada foto (sin puntuación automática), con los criterios de la skill: producto → acción → espacio → cámara; fotos reales cotidianas; nada de renders, catálogos, collages, marcas de agua o tienda equivocada.
- Guardaba por foto un JSON con consulta, pin, URL, SHA256 y motivo, y la adjuntaba como un archivo más (un enlace en el prompt no vale). El número cambiaba según el caso (p. ej. 1 composición, 2 avatar, 3 producto, 4 entorno de Pinterest) y el prompt lo citaba: «Use image 3 as the environment…», «Image 4 supplies the actual architecture and light», «its observed lighting is the primary authority for the entire scene».
- Consultas reales por escena (salón navideño `Wohnzimmer Weihnachten Fernseher Sofa echtes Zuhause`, cocina `christmas kitchen real home`, peluquería `Friseursalon Deutschland Innen`…): tabla en la regla. Las 44 elecciones manuales del dueño (R00–R48) están analizadas en `docs/casos/referencias-pinterest/`.

## Cómo queda en PRINCIPAL

1. **Cuándo:** al terminar un desglose (`runAnalysis` → `startPinterestAfterAnalysis`) se apunta una búsqueda por desglose (`video_pinterest_refs`) y se encola `video.pinterest`. Si el vídeo lleva entorno a mano, no se apunta nada.
2. **Consultas:** Claude (nivel medio) lee el desglose (tomas, lógica, adaptación), el primer fotograma, el producto, el mercado, el mes y las indicaciones, con la regla `referencias-pinterest`, y devuelve la escena (lugar, época, luz, estilo, lo que tiene que verse) y 2–3 consultas cortas: la primera en el idioma del mercado.
3. **Búsqueda:** la nube pide el buscador de pines de Pinterest (`/resource/BaseSearchResource/get/`, la misma petición que su web, sin sesión; comprobado el 23/11 desde el Mac del dueño: 24 pines con su foto original). Se quitan vídeos, anuncios e «ideas». Si Pinterest no deja a la nube, la consulta pasa al **Mac del dueño** (tarea `pinterest_search`, agente 1.6.0), que hace la misma petición desde su conexión y entrega la respuesta. Las búsquedas se guardan una semana (`pinterest_searches`).
4. **Elección con visión:** Claude mira hasta 24 miniaturas (repartidas entre las consultas) junto al primer fotograma y elige como mucho 2, de mejor a peor, con su motivo: fotos reales de móvil, sin texto ni marcas de agua, mismo tipo de sitio, la acción cabe, época y luz correctas. Si ninguna vale, se vuelve a empezar con otras consultas (hasta 3 intentos).
5. **Almacén:** cada foto se baja a tamaño original, se pasa a JPEG (lado largo 2048) y se guarda una vez por huella en el almacén (`pinterest/<sha256>.jpg`, bucket `principal-medios`; sin almacén, en la base de datos). Se reutiliza al regenerar.
6. **Adjuntos:** van **al final** del manifiesto de la imagen (después de composición, avatar, artículo y embalaje), para no cambiar los números que ya cita el prompt del desglose. Al pedir la imagen se añade al prompt un párrafo con sus números reales y su papel (entorno y realismo; su luz manda; no copiar personas, caras, textos, logos, marcas de agua ni pantallas). Se suben a Higgsfield como cualquier referencia (`ensureMedia`, una vez por archivo).
7. **Sin ellas no se genera:** `buildFrameRequest` llama a `requirePinterestRefs`: si aún no están, 409 «Buscando referencias de Pinterest…» (el lote lo salta y lo repite en el siguiente avance); si fallaron, se vuelven a buscar desde cero. Nunca se envía una imagen sin Pinterest salvo con entorno a mano.
8. **Pantalla:** «Referencias de Pinterest» con miniaturas pequeñas en el paso «Imagen» del vídeo y en la tarjeta de «Revisar imágenes» del lote; clic amplía y enseña la búsqueda y el motivo. No pide nada.
9. **Seguimiento:** cada minuto se vuelven a encolar las búsquedas pendientes, las que esperaban al Mac (cuando ya contestó) y las que se quedaron a medias.

## Límites conocidos

- Hoy hay una imagen por vídeo, así que las referencias son de esa imagen. Cuando haya un frame por toma, la búsqueda irá por toma (misma tabla, una fila por toma).
- No se verifica el país de la foto: el idioma del pin no lo prueba. Para tiendas concretas la regla pide la cadena en la consulta y la elección lo mira, pero no hay comprobación externa.
- Pinterest puede cambiar su buscador; si deja de responder en la nube y en el Mac, la búsqueda falla con el motivo y la imagen espera (no se genera sin referencias).

## El prompt con la sala: método aprobado copiado tal cual (23/11/2026, tarde)

Las imágenes de la ronda 3 del vídeo 2 salieron casi iguales que sin referencias. El prompt real (volcado de producción) lo explica: el desglose, escrito antes de elegir la sala, se inventaba su propio salón («dark green sofa, wooden shelf…»), decía que image 1 es «la base» y las dos fotos solo aparecían al final en un párrafo genérico. Nano Banana ignora un cambio de fondo pedido así y devuelve la habitación del original.

Se copia el método del sistema anterior (prompts aprobados en `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-01d9c7c947cb45aca4ea24b00fa5b216-6/frame-preparation/v2-c1-user-background-r3b-prepared/frame-001.txt` → `frames_salida/55ba5917_crudo.png`, y los de los pedidos 47 y 52; política de luz de `engine-backup/frame_realism.py`):

- Tras elegir la sala del banco, Claude mira esa foto y el fotograma original y reescribe el prompt en los **ocho párrafos** de entonces: composición («Use image 1 ONLY for the exact opening action… Replace all original … scenery with the exact … in image N»), identidad, producto, **entorno** («Reference image N is the EXACT requested background, not an inspiration. Preserve its …» con 6–12 elementos y su posición, cámara dentro de esa sala), **luz** de esa foto + la frase fija `LIGHTING_POLICY` literal, **realismo** (la segunda foto, solo textura, párrafo literal), negativos y formato literales. Se guarda en `video_pinterest_refs.frame_prompt` con `{ROOM}`/`{REALISM}` y el constructor pone los números reales (`framePromptFor`). Si el prompt del vídeo cambia a mano, se vuelve al del desglose con el párrafo de papeles.
- La primera foto elegida es el fondo exacto; la segunda, la de realismo (va última, como entonces).
- Regla: `reglas/imagen-nano-banana.md`, «Fondo con referencia de salón o espacio», con los prompts aprobados A, C y D.

Lo que no se copia tal cual: el orden de adjuntos de entonces era composición, producto visible, sala, avatar, realismo; aquí sigue siendo composición, avatar, artículo, embalaje, sala, realismo (los números del prompt son siempre los reales, que es lo que importa). Tampoco se pasa `thinking-level high`: el conector de Higgsfield de la aplicación no tiene ese ajuste.

**Prueba real (23/11/2026, 06:05).** Con el prompt que escribió producción para el vídeo 2 (sala R33, realismo R36) y los mismos 6 adjuntos en el mismo orden, Nano Banana 2.1 a 2K devolvió la sala de la referencia entera (estantes con velas a la izquierda, lámpara, tocadiscos turquesa, árbol nevado a la derecha, lámpara de mimbre, sofá gris en primer plano) con las manos y el regalo del fotograma y sin rótulos: el mismo comportamiento que la imagen aprobada A del sistema anterior (`frames_salida/55ba5917_crudo.png`). La ronda 3 anterior, con el párrafo genérico, devolvía la sala del original. (La prueba se hizo en la cuenta de Higgsfield de la sesión, no desde la web: el vídeo 2 ya había gastado sus regeneraciones.) Se quitó el volcado temporal del vídeo 2.

**Corrección tras la primera prueba (23/11/2026, 06:20).** El dueño vio en la prueba las manos y el regalo «pegados con Canva» (con la luz del original, no la de la sala) y el papel cambiado de dorado a rojo. Causas: (1) el orden de adjuntos no era el de Codex (composición, avatar, artículo, caja, sala, realismo) y el artículo y la caja se adjuntaban aunque no se vieran; (2) el prompt del desglose proponía cambiar el papel. Ahora, con el prompt del método aprobado, el manifiesto usa el orden de Codex (composición, producto solo si se ve, sala, avatar, realismo; `codexOrder` en `manifest.ts`), Claude decide `productVisible` y cita cada imagen por su papel (`{ROOM}`, `{AVATAR}`, `{ARTICLE}`, `{PACKAGING}`, `{REALISM}`; el constructor pone los números reales), conserva los objetos del fotograma y describe cómo se reilumina el sujeto con la luz de la sala. Segunda prueba (1 fotograma, 2 sala R33, 3 avatar, 4 realismo R36): papel kraft conservado, manos y regalo con la luz cálida y tenue de la sala y sus sombras. La migración 0036 rehace todos los prompts con este orden.

**El producto del original reaparecía (FalterPfote, 23/11/2026).** La imagen del vídeo 6 (lote «23/11 · FalterPfote») salió con las alas proyectadas tipo dragón del vídeo original, no con las alas de mariposa del producto. Causas: la foto del collar funcionando (el perro con las alas de mariposa proyectadas, el asset `funcionamiento` del sistema anterior) se importó con papel «otro», que nunca se adjunta, así que Nano Banana solo veía el collar apagado; y el prompt pedía las alas «in the same position and size as the wings in image 1». Arreglo para todos los productos: papel nuevo de foto **«Funcionando»** (`funcionamiento`), que va con el artículo en la imagen inicial (y en el desglose); la foto de FalterPfote pasa a ese papel (migración 0045); el prompt con sala nombra el producto de image 1 y ordena sustituirlo por el del encargo con forma, color y efecto de sus fotos (`{ARTICLE}`, `{EFFECT}`), sin «same as image 1» para su aspecto; Claude ve las fotos del producto al escribirlo; la caja solo va si se ve. La imagen del vídeo 6 se rechaza una vez al arrancar para que el lote la regenere con esto.

**El producto no se nombra por su marca (23/11/2026, tarde).** Higgsfield bloqueaba imágenes de FalterPfote («filtro de contenido o de marcas»): el prompt decía «the exact FalterPfote of image 2», y un nombre de marca se trata como marca ajena. Como en el método aprobado (`Motor/order-preparation/app-6852a9fdeb44480983cc86d73a67d471-54/frame-preparation/*-prompt*.txt`): «Image N is the exact selected product; image M is its exact retail packaging. Retain its geometry, markings, materials and realistic scale», descripción genérica, la marca propia solo como marca física impresa, y nunca el nombre ni la marca del producto de la referencia. Aplicado al prompt con sala, al desglose (imagen y vídeo, también Object Swap y Wan) y a la regla.

**Paso del efecto, automático (23/11/2026, noche).** En FalterPfote, ni la foto de funcionamiento ni la sustitución escrita bastaban: con un solo paso Nano Banana conservaba la forma de las alas del vídeo original. Funcionó, probado a mano y aprobado, un segundo paso corto de edición sobre la imagen hecha con la foto de funcionamiento. Ahora lo hace la web sola (`src/server/videos/efecto.ts`): al escribir el prompt con sala, Claude decide `effectVisible` y escribe `effectPrompt`; al terminar la imagen principal (`afterFrameDone`, en el trabajo de finalizar) se rechaza con «Corrección automática: paso del efecto (1)» (no gasta regeneraciones) y la ronda siguiente que pide el lote o el flujo del vídeo es la edición (image 1 = la imagen principal por su trabajo de Higgsfield, image 2 = la foto de funcionamiento, 1 candidata). Al terminar, Claude (nivel pequeño) compara el efecto con la foto de funcionamiento; si no coincide, se repite una vez desde la misma imagen principal («… (2)»), y no más. El presupuesto del lote cuenta una ronda de imagen más para los vídeos que la necesitan. Las búsquedas con sala hechas antes de este cambio no traen `effectVisible`: se aplica a los prompts con sala nuevos.

## Imágenes de referencia subidas a mano (24/11/2026)

Petición del dueño: en cada tarjeta de «Nuevo lote», en su grupo y en la pantalla del vídeo, subir varias imágenes (arrastrar o elegir) y decir para qué son.
- **Subida:** `POST /api/referencias` (el cuerpo es la imagen) la pasa a JPEG y la guarda una vez por huella en el almacén (`pinterest_images`). El borrador del lote guarda solo `{ sha256, role }` por tarjeta (`Row.refs`) y por grupo (`Group.refs`), así aguantan recargas y «Duplicar»; una tarjeta sin las suyas usa las del grupo (`effectiveRefs`). Al crear el vídeo van en `references` y quedan en `video_references`; «Duplicar» del tablero las copia. En el vídeo, `PUT /api/videos/[id]/referencias` (mientras la imagen no esté aprobada).
- **Papeles:** fondo / sala (por defecto), ambiente, ropa, realismo, otra.
- **En la imagen:** un **fondo** a mano es la sala del método aprobado y no se elige nada del banco; Claude empieza el párrafo de entorno con «Image N is the user-selected room background only, not product identity.» (frase de los prompts aprobados del sistema anterior) y lo describe elemento a elemento. Un **ambiente** o **realismo** a mano ocupa el hueco de realismo. **Ropa** y **otra** van adjuntas después del avatar con su papel (`{MANUAL1}`…). Cambiar las imágenes rehace el prompt con sala.
- **Aprendizaje:** al aprobar la imagen, los fondos y ambientes subidos a mano entran en el banco de aprobadas (`addApprovedToBank`).
- Sin fondo a mano (solo ropa, por ejemplo) la sala sigue saliendo del banco.

## La imagen empieza igual que el fotograma (24/11/2026)

Emmanuel rechazó cuatro imágenes del lote 6 (EisWerk 4, HaarZauber 6 y 7, vídeo 16): mano que no agarra
nada, fondo que no pega con el producto, franja blanca abajo, producto que no era el real. Causa: el prompt
con sala no obligaba a copiar la acción del fotograma ni a poner el producto en la mano, y el motivo del
rechazo del dueño no llegaba a la siguiente imagen. Ahora: `COMPOSE_INSTRUCTIONS` copia pose, acción y
momento de image 1 y pone el producto del encargo en la mano (o sus cajas en el escaparate); el banco y la
composición eligen un fondo del tipo de producto; el NEGATIVE prohíbe franjas y bordes; el motivo del rechazo
del dueño (`OWNER_CORRECTION_PREFIX`) pasa a la escena y al prompt, y al rechazarse se rehace la sala.

## Se vuelve a buscar en Pinterest, con los filtros del dueño (24/11/2026)

Orden expresa de Emmanuel: se acabó reutilizar el banco. `BANK_ONLY = false`. Toda imagen inicial busca en
Pinterest según la escena, con sus filtros (fotos de iPhone, verticales, orgánicas; nada cuadrado, profesional,
de estudio, de stock, render ni retocado), aplicados en tres sitios:
- **Consultas** (`PLAN_INSTRUCTIONS`): cada una lleva una palabra de foto de móvil y nunca «professional»,
  «studio», «stock», «aesthetic»…
- **Medidas** (`phoneShapedFirst`): fuera las originales con alto/ancho < 1,2 o lado largo < 1000 px; primero
  las verticales con medidas, después las que no traen medidas (las mira la visión).
- **Visión** (`PICK_INSTRUCTIONS`): ve las medidas de cada candidata y rechaza cuadradas u horizontales, de
  cámara profesional, de estudio, de stock, retocadas o de baja resolución.

El banco solo es respaldo cuando Pinterest no da nada válido (sin candidatas, ninguna pasa el filtro, ninguna
se elige o no bajan), y el registro lo dice («se usa el banco de respaldo»). Con una tienda concreta no hay
respaldo: se reintenta. Un fondo subido a mano sigue mandando (no se busca); un ambiente o realismo a mano
ocupa el hueco de realismo, también con fotos de Pinterest. En Codex no había filtros de medidas: se copiaron
sus criterios de elección y sus consultas de ejemplo (`criterios-seleccion-manual.md`).

## Cadena y país reconocibles; segunda búsqueda (24/11/2026)

En la prueba real, el vídeo 20 (supermercado discount alemán) eligió tiendas que no eran Aldi ni Lidl (una,
con rótulo «hôma», de fuera de Alemania) y el 15 (dm) una droguería sin rótulo de dm. Orden del dueño: pidió
dm, Sephora y Lidl precisamente para que se vea esa tienda. Ahora la escena trae `requiredChain` (la cadena
que tiene que reconocerse) y `retryQueries`; la elección con visión exige reconocer la cadena (rótulo, logo,
colores o mobiliario) y que rótulos, precios e idioma sean del país del anuncio, sin quedarse con «lo más
cercano». Si en la primera búsqueda ninguna vale, se busca otra vez con `retryQueries` (cadena + ciudad o
país, en el idioma local) y el registro lo dice («se busca otra vez»). Solo después se reintenta (tienda
pedida) o se usa el banco de respaldo (sin tienda).

Prueba real (vídeos 15 y 20): con la exigencia estricta, ninguna foto valió ni en la segunda búsqueda
(Pinterest casi no tiene fotos de móvil del interior de dm o de Aldi en Alemania: salían dm de Eslovaquia,
Aldi de EE. UU., collages, fachadas). Fallar ahí pararía el lote, contra la regla del flujo automático. Por
eso hay un tercer paso: con las candidatas ya vistas, vale un interior real de ese tipo de tienda en ese
país, sin rastro de otra cadena ni de otro país (se apunta «último intento»). Además, la escena del vídeo 20
se inventó «Aldi» como tienda pedida (namedPlace), lo que quitaba el respaldo del banco: namedPlace es solo
lo que escribe el dueño; lo que exige la escena va en `requiredChain`.

## Una búsqueda por sitio de la referencia (24/11/2026)

Regla fija de Emmanuel: cada toma conserva su sitio. Con varios sitios en la referencia (`Analysis.places`, ver `docs/sitios-de-la-referencia.md`), `video_pinterest_refs` tiene una búsqueda por sitio (columna `tramo`, única con vídeo y desglose). La escena de cada búsqueda la sigue escribiendo Claude con PLAN_INSTRUCTIONS, pero recibe solo ese sitio: su lugar, su acción, sus objetos, sus tomas y el primer fotograma de ese sitio. Los filtros, la cadena, el último intento y el banco de respaldo no cambian. La referencia de entorno del dueño (`environmentPhotoId` o un «fondo» subido) solo cubre los sitios con `ownerEnvironment`. Un rechazo de la apertura de un sitio borra solo la búsqueda de ese sitio.

## Variante y etiquetas sin foto en el prompt de la imagen (26/11/2026, vídeo 71 del lote 12)

- **La variante manda en la descripción del producto.** El escritor del prompt (`composeFramePrompt`)
  veía las fotos de artículo de siempre aunque la tarjeta tuviera una variante. Con la variante azul,
  describía una máquina rosa y salió rosa en todas las rondas. Ahora `productPhotosFor` enseña solo las
  fotos de la variante (artículo en su orden y su caja), y se le dice cuál es. Tras escribirlo, una
  comprobación con visión compara el párrafo del producto con la foto de la variante. Si el color, el
  acabado o la forma no coinciden, se reescribe (hasta 2 veces). La huella del prompt guardado incluye
  la variante (`basePromptShaOf`): cambiar de variante no reutiliza un prompt escrito para otra. Sin
  variante, la huella es la de siempre.
- **Nunca «image ?».** Una etiqueta sin foto en el manifiesto (p. ej. `{ARTICLE2}` con una sola foto
  de artículo) ya no se resuelve a «?». Su frase se quita del prompt (`dropUnresolved`).
- Revisión de Codex aplicada: las fotos de la variante toman el papel del hueco que ocupan (como
  `ofVariant`); las claves de los pasos llevan la variante y sus fotos; `dropUnresolved` respeta
  comillas, paréntesis y abreviaturas («e.g.»).

## Tele encendida en el salón navideño (26/11/2026, regla de Emmanuel con su consentimiento: «sí, para todos»)

En toda escena de salón navideño con televisión (imagen inicial y clip), la tele va ENCENDIDA con una
película de Navidad reconocible (Home Alone / «Kevin – Allein zu Haus», o El Grinch) y su luz fría.
Nunca apagada. Está en `src/server/videos/tele-navidad.ts`: se detecta por el texto del prompt (Navidad +
salón + tele). Se añade al prompt de la imagen (`frame.ts`) y al del clip (`clip.ts`), y el escritor de la
sala lo sabe (`COMPOSE_INSTRUCTIONS`). Si el intento anterior lo bloqueó el filtro de Higgsfield, el
siguiente lleva una escena navideña genérica en la pantalla, sin pararse. Con la imagen de entorno del
dueño no se añade nada: lo que traiga su pantalla se queda.

## La variante también en el desglose; la tele por lo que se ve (26/11/2026)

- **Desglose (`analysis.ts`).** Las fotos de artículo y de embalaje del manifiesto ya eran las de la
  variante. Ahora además se nombran como de la variante «X», y se ordena describir el color, el acabado
  y la forma solo con ellas. Tras el desglose, la misma comprobación con visión que en el escritor de la
  sala (`variante-check.ts`) mira imagePrompt y videoPrompt contra la foto de la variante. Si no
  coinciden, se rehace el desglose con el motivo (hasta 2 veces). Así el prompt base ya no dice «pink»
  cuando la variante es la azul.
- **Tele navideña.** El escritor de la sala marca `christmasTv` si el fotograma de la referencia o la
  foto de la sala muestran un salón navideño con tele. La imagen y el clip aplican la regla con esa marca
  aunque el prompt no nombre la tele (`christmasTvSeen`).
- Revisión de Codex del desglose: la comprobación y cada reescritura van en su propio paso (si se pausa
  por el tope, al reanudar no se repite ni se cobra otra vez lo hecho). Su coste se suma al del desglose
  (`analysisStepKeys`). Un fallo al leer la foto o al comprobar no tumba el desglose: se queda el último
  bueno.
