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
