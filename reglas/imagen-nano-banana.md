# Imágenes con Nano Banana

Esta es la guía única para generar las imágenes de este proyecto, por orden de Emmanuel del 01/10/2026. No combinar instrucciones creativas de otras guías de imagen. Las imágenes se generan con Nano Banana 2.1 a 2K, el modelo que usa Emmanuel; el modelo lo fija la aplicación y el dueño puede cambiarlo en Ajustes. Recoge la receta técnica de realismo del 03/10/2026 y los ejemplos validados por Emmanuel el 07/10/2026.

## Reglas fijas del frame (orden de Emmanuel, 22/11/2026)

Estas reglas mandan sobre todo lo demás de esta guía. Salen del primer lote de prueba en la aplicación, cuya imagen salió mal: el modelo reinventó la escena en vez de replicar el fotograma (otra postura, una taza sin asa y con otra forma, un salón de catálogo y esquinas negras de lente).

### 1. El fotograma original es el ancla, no una inspiración
La captura de la referencia (la imagen de composición) es la BASE de la imagen. El prompt empieza diciéndolo y enumera lo que se conserva EXACTAMENTE: recorte, distancia y altura de cámara, ángulo, postura del cuerpo, qué mano sujeta qué y por dónde, puntos de contacto, lado de la imagen de cada objeto, proporción de manos, objetos y producto dentro del encuadre, y el estado de la acción en ese instante (qué está lleno, abierto, servido). No acercar, no alejar, no recortar de nuevo y no cambiar la pose para acomodar el fondo o el avatar. Después se dice qué cambia, y solo eso.

Describir de nuevo la escena «desde cero» con las propias palabras es el error que hay que evitar: el modelo genera otra foto. La fórmula es «conserva exactamente esto de image 1; cambia solo esto».

### 2. Lista de qué cambia y qué se conserva
El prompt lleva las dos listas, concretas y comprobables, escritas en prosa:
- **Se conserva:** la acción, el encuadre, la escala en mano, el ángulo y todo lo de la regla 1.
- **Cambia:** cada sustitución con la forma «elemento original → elemento nuevo» (identidad, ropa, variante del producto, entorno), para poder comprobarla en la imagen. Ejemplo: «Cambia la máquina rosa y su caja por la variante blanca con fresas y su caja oficial. Conserva la extracción del congelador, el orden de la receta, la escala en mano y el ángulo de cada toma».

### 3. El producto y su variante
- Separar siempre la variante que se ve en el original de la variante de destino del encargo. El original dice qué ocurre en la toma; la variante de destino dice qué artículo y qué embalaje aparecen.
- El artículo se reproduce exactamente como en sus fotos de artículo: misma forma, mismas piezas y su número, mismo color y estampado, mismas proporciones, misma orientación (de qué lado queda el asa, hacia dónde mira el botón). No rediseñar, no simplificar, no recolorear una pieza genérica.
- Si en la toma se ve la caja, manda la foto del embalaje de esa variante; si se ve el aparato, mandan las fotos del artículo; si se ven los dos, cada uno sigue la suya. Una caja de otro color no sirve, ni una caja genérica recoloreada.
- Si el original ya muestra la misma variante que el destino, decirlo: el producto de image 1 se conserva tal cual y las fotos del artículo solo confirman el detalle.
- La escala es la del original en mano: no agrandar el producto para hacerlo protagonista.

### 4. Papeles de las referencias, con su número real
Cada referencia se cita por su número («image N») y con un solo papel: composición (encuadre, pose y acción), avatar (identidad), artículo, embalaje, entorno (espacio, luz y perspectiva). La identidad sale exclusivamente del avatar. Una persona visible en una foto de fondo o de realismo no es un avatar. Identidad, ropa y rasgos se mantienen iguales entre tomas del mismo vídeo.

### 5. Entorno
Si el encargo trae una foto de entorno, se usa esa y aporta el espacio, la luz y la perspectiva. Si no la trae, el lugar es un sitio real y plausible del mercado del anuncio, del mismo tipo que el original y compatible con la acción (un plano de sacar algo del congelador necesita ver su interior y su puerta), descrito con sustituciones concretas «elemento original → elemento nuevo». Lo que da el ambiente de la cuenta (por ejemplo la tele encendida, las luces cálidas y la manta de una noche en casa) es estilo y se conserva; lo que cambia es el decorado.

### 6. Estética de iPhone 17 Pro Max
Vídeo vertical de móvil, cercano y cotidiano, cámara principal a 1x:
- profundidad de campo natural, con el fondo legible (ni todo desenfocado ni recortado);
- luz práctica del propio lugar, con sus zonas más claras y más oscuras;
- piel con textura, reflejos y sombras coherentes con una sola situación de luz;
- perspectiva creíble y contacto real entre manos, objetos y superficies, con sus sombras de contacto.

«Parecer de móvil» NO significa añadir distorsión, bordes curvados, viñeta o esquinas oscuras, ruido fuerte ni mala resolución. Tampoco desenfoque extremo, aspecto de cámara de cine, piel de plástico ni una persona o un producto con pinta de recortado y pegado. Una casa real está usada: nada colocado para la foto, nada simétrico de catálogo.

### 7. Texto
La imagen no lleva subtítulos, emojis ni rótulos editoriales: los textos sobreimpresos del fotograma original se quitan y se reconstruye lo que tapaban. Los textos físicos que pertenecen a la escena (la marca impresa en el envase, una sábana, un cartel) se conservan.

### 8. Solo los frames que hacen falta
Se genera la apertura de cada clip que se va a generar. Si el encargo es únicamente el gancho, la del gancho; el cuerpo ya elegido se recupera, no se regenera. Al corregir una imagen, se regenera esa y las demás aprobaciones se conservan.

## Identidad y realismo (orden de Emmanuel, 14/11/2026)
En los frames de testeos y lotes, para la identidad y las facciones se usa exclusivamente el avatar elegido por Emmanuel, o el que se haya seleccionado para ese papel. Las personas que aparecen en las referencias de realismo, estilo, composición o fondo NO son avatares salvo asignación expresa. Está prohibido copiar o mezclar sus ojos, nariz, boca, mandíbula, edad, pelo o parecido. Aplicar textura fotográfica al avatar sin sustituir su identidad; la luz sigue la referencia de entorno. Identificar en el prompt el papel y el índice de cada imagen. No reutilizar como identidad una referencia elegida solo para realismo. Fondo y composición no son identidad salvo asignación expresa.

## Cómo se hace una imagen que vale (receta validada el 02/09/2026)

Emmanuel, sobre el frame del Lidl: *«está demasiado bien, ha mejorado demasiado, este tipo de resultado es el que busco en TODAS las imágenes»*. Es la primera imagen que aprueba sin reservas después de siete intentos. Esta es la receta.

### 1. El prompt es PROSA, nunca bloques
Documentación oficial de Google para Nano Banana Pro: *«Describe the scene, don't just list keywords. A narrative, descriptive paragraph will almost always produce a better, more coherent image than a simple list.»*

Los prompts anteriores eran **10.400 caracteres en bloques de MAYÚSCULAS** (`CRITICAL —`, `NEGATIVE:`, `STRICT REQUIREMENTS:`) con veinte líneas de prohibiciones. Trabajaban **contra** el resultado. El bueno son **4.900 caracteres en párrafos corridos**. Tres bloques o más ya es demasiado.

### 2. Los negativos se escriben en POSITIVO
Regla oficial: en vez de «no cars», escribir «an empty, deserted street with no signs of traffic». Aplicado: en vez de «no studio lighting», **describir la luz fea que sí hay** — «lit only by the shop's own recessed ceiling fluorescent tubes, falling from directly above, so the light is bland and shadowless and there is nothing dramatic anywhere».

### 3. Lista negra (no usar nunca estas palabras en el prompt)
`cinematic` · `studio lighting` · `softbox` · `golden hour` (el default más pegajoso del modelo) · `color grading` · `moody` · `dramatic lighting` · `professional photograph` · `editorial` · `hyperrealistic` · `8K` · `masterpiece` · `octane render` · `subsurface scattering` · `bokeh` · `shallow depth of field` · `flawless skin` · `dewy` · `airbrushed` · `glowing skin`

### 4. Lo que sí hay que describir
- **Nota fechada (03/10/2026):** el criterio de realismo del 03/10 sustituye a tres pautas del 02/09 («todo enfocado», «sombras levantadas y luces quemadas» y «encuadre descuidado de unos dos grados»). Ya no se aplican: manda la variación de exposición y de detalle justificada por la luz y la captura, sin imponer desenfoque, ruido ni encuadre torcido.
- **Afilado por zonas.** Cartón, letras, tela y pelo crujientes; paredes y sombras **lavadas** por la reducción de ruido. Las dos cosas a la vez.
- **Piel real** con la formulación que tiene evidencia visual en este modelo: poros y textura acordes a la edad, tono desigual, rojez en nariz y mejillas, pequeñas imperfecciones, asimetría natural, brillo en frente y nariz. *«Keep it subtle and true to life, without smoothing.»*
- **Perspectiva de la cámara principal del móvil a 1x** (corregido el 22/11/2026): el primer plano algo más grande que el fondo, como en cualquier foto de móvil, con las líneas rectas. Ya no se pide «24 mm» ni «líneas arqueadas en los bordes»: producía esquinas negras y aspecto de ojo de pez.

### 5. La imagen NO se retoca (corregido el 02/09/2026)
Corrección de Emmanuel del 09/09/2026: la piel y la luz se verifican, no se presuponen. No basta escribir «poros» al final del prompt: describir textura localizada en cara y manos, cambios de tono, cutículas y vello acordes al avatar, y comprobarlo a tamaño de móvil. La luz debe producir sombras de contacto, reflejos y caída de intensidad coherentes con una fuente física. El nivel exigido se juzga sobre la imagen, no sobre el texto del prompt. No alterar POV, producto o identidades para resolver la textura.

Se midió que el modelo no obedece «shadows lifted»: devolvía los negros en **4,1** cuando la foto real de Emmanuel está en **11,4**. Se probó igualar la firma tonal con un ajuste posterior automático, convencidos por los números. **Emmanuel rechazó ese resultado en cuanto lo vio: le había salido AMARILLA.** Y tenía razón: el ajuste subía la temperatura de **+14,7** a **+34,3**. Lo que aprueba es **el crudo del modelo**.

> **Las medidas sirven para DIAGNOSTICAR, no para corregir por encima de su ojo.** Si un valor se desvía, se cambia el **prompt** y se vuelve a generar. La imagen no se toca.

Y una lección de comprensión, no de técnica: *«la última imagen generada»* significa **la última que generó el modelo**, no la última que se envió. Un retoque no es una generación.

### 6. Ajustes
**2K, nunca 4K**: el 4K sobre-afila los poros.

### 7. Placebo comprobado
**JSON / metadata prompting estilo EXIF no sirve.** Un test controlado sobre este mismo modelo: *«Skip the JSON. It's a placebo.»* **ISO y velocidad de obturación no tienen ninguna evidencia**; focal y apertura **sí** están documentados como controlables.

## No anticipar un reveal en la imagen inicial
Si en el vídeo el producto **se revela** (quitar la sábana o la manta, girar la cámara al estante, abrir la caja), la imagen de inicio NO puede enseñar ya el producto. No anticipar un reveal.

- Las estanterías y los pasillos de la imagen llevan **stock genérico y variado** (electrodomésticos surtidos de marcas distintas), nunca un muro de cajas iguales del producto.
- Ejemplos donde aplica: un selfie que gira al estante, una sábana que se quita, abrir una caja.

Por qué: llenar el fondo de cajas del producto **mata la sorpresa** y no tiene sentido narrativo (error real del 31/08/2026).

Corolario sobre referencias: si el producto va tapado todo el clip, su imagen de producto NO se adjunta; basta el embalaje, que da la forma del bulto bajo la tela. Si el vídeo revela el producto después, la imagen inicial no lo enseña ya.

## Luz de la referencia e integración completa (orden del 30/10/2026)
La luz observada de la imagen de habitación o espacio es la autoridad principal de toda la escena, por encima de recetas genéricas y de la iluminación del avatar, del producto o de la composición original. Igualar dirección, fuentes, temperatura de color, intensidad, contraste, exposición y caída de luz en persona, piel, manos, ropa, producto y embalaje. Integrar sombras proyectadas y de contacto, oclusiones, reflejos y rebotes de color, perspectiva, escala, profundidad, nitidez y textura. No pegar recortes ni mantener luz de estudio independiente. Uniformidad significa coherencia visual, no iluminación plana: conservar zonas iluminadas y sombras reales de la referencia.

Antes del prompt observar la referencia real e identificar qué imagen aporta el entorno y su luz, usando su índice efectivo. No inventar una dirección de luz no observada. La imagen de estilo no reemplaza la iluminación del espacio. Reluminar el avatar y el producto para integrarlos, conservando identidad, geometría y color físico del producto. Si hay varias referencias de espacios incompatibles, resolver la principal por toma según las notas y el alcance antes de generar, sin mezclar luces arbitrariamente.

Comprobar el prompt FINAL y revisar visualmente cada resultado contra esa referencia: luces y sombras en cara, manos y producto, sombras de contacto, reflejos, escala, perspectiva, profundidad y bordes sin halos. Indicar qué referencia se usó y qué se observó. Una instrucción no acredita integración visual.

## Fondos por toma
La indicación de la toma y el fondo que aporta Emmanuel tienen prioridad. Aplicar por espacio y mantener continuidad.

### Referencias de entorno orgánicas (orden del 05/11/2026)
Para todas las imágenes, seleccionar fotos cotidianas de móvil, con apariencia orgánica tipo iPhone; descartar fotografía profesional, sesiones de arquitectura o interiorismo, estudios, catálogos y renders. No afirmar dispositivo iPhone sin evidencia: validar apariencia y procedencia, no inventar EXIF. Si la acción es comprar en una tienda, exigir un comercio real: mercancía a la venta, estanterías, etiquetas u otras señales comerciales. Un guadarnés privado, un estudio de diseño o una exposición de equipamiento no sustituyen una tienda ecuestre. Revisar este filtro tanto en la referencia como en el resultado generado. Mantener luz cotidiana y sujetos integrados, sin pose ni acabado publicitario. Los HoofHolly V1/V2/V3 entregados el 05/11/2026 quedan completamente rechazados por Emmanuel: nunca son estilo ni composición de nuevas generaciones. La caja y los charms aprobados mantienen su aprobación.

### Tiendas alemanas y logo real visible (09/11/2026)
Si no hay tienda explícita en las instrucciones o en el texto de la referencia, elegir Lidl, Action, Aldi o MediaMarkt con lógica de producto. Usar fotografías reales verificadas y mostrar el logo auténtico integrado en cartelería física del fondo. No sustituir por almacén genérico ni inventar marca o arquitectura. Una tienda expresamente indicada prevalece. Esto no acredita ventas ni colaboración de la tienda.

## Criterio de realismo de Emmanuel (03/10/2026)
Referencias vigentes para nuevas imágenes. No copiar identidades, vestuario, poses, logos o productos como instrucciones de contenido.

| Foto | Selección y lectura visual | Aplicación pertinente |
|---|---|---|
| 1 | Positiva; selfie de coche con banda de sol y sombra fuerte en rostro/techo | Contraste real de luz de ventana; no rellenar lado en sombra ni imponer un selfie |
| 2 | Positiva; pasillo de snacks, luminarias puntuales, envases variados, zonas menos iluminadas | Tienda usada y exposición desigual; snacks solo si pertenecen al escenario |
| 3 | Positiva; captura tenue, tono y detalle variables, textura de captura | Solo entornos con poca luz; no ruido fuerte universal ni cambio de escena a cama |
| 4 | Positiva; escalones y puerta, luz lateral intensa, sombras marcadas | Sol lateral con contacto/sombras coherentes; no copiar persona/ropa/postura |
| 5 | Negra, inutilizable | No usar como referencia ni inventar descripción |
| 6 | Positiva; espejo de baño, focos sobre pared, rincones oscuros | Caída espacial de luz práctica; no convertir todos los hooks en espejos/baños |
| 7 | Rechazada; EisWerk POV, luz muy rellenada, detalle limpio similar en planos, salón compuesto | No usar de estilo |
| 8 | Rechazada; tienda y avatar, textura facial sí presente pero conjunto uniformemente tratado | No usar de estilo. Añadir poros no resuelve la uniformidad de iluminación y materiales |

Las positivas no comparten una paleta ni un nivel de brillo: comparten variación justificada por la luz y la captura. Las negativas no carecen completamente de textura; su tratamiento conjunto se parece más a una foto preparada. Es un diagnóstico visual, no una inferencia de parámetros internos del modelo.

Una referencia pertinente por toma; composición/acción, avatar y producto siguen siendo fuentes distintas. No forzar encuadre torcido, desorden artificial, fondos oscuros o defectos para aparentar espontaneidad.

## Patrón visual elegido
- El color procede de rótulos de tienda, ropa, decoración o productos propios del lugar. No fabricar un arcoíris de cajas, snacks, bloques o paredes de colores.
- Piel y tejidos naturales, exposición cotidiana y suavidad moderada de vídeo de móvil. No piel cerosa, detalle exagerado, HDR, filtros ni aspecto de render.
- El problema no se arregla añadiendo poros: respetar variación de exposición y detalle entre zonas iluminadas, sombras, movimiento y planos. No recuperar artificialmente todos los rincones ni tratar tela, piel y fondo con igual nitidez. No imponer oscuridad, ruido fuerte, desenfoque o mala calidad a todos los hooks.
- Luz de fuentes reales: pueden coexistir techo frío, lámparas cálidas y ventana. Sombras, reflejos y exposición deben conectar sujeto, producto y entorno.
- Una tienda debe parecer un lugar utilizado; la decoración navideña solo cuando corresponda al encargo. No convertir todas las imágenes en cafeterías o tiendas.
- No repetir roble, paredes verdes, guirnaldas, sofás y árboles como firma estética. Conservar elementos exigidos por la acción o la fuente; los demás dependen del lugar. Snacks son pertinentes en un pasillo de snacks, no un relleno cromático universal.
- La composición define acción y encuadre; el avatar define identidad; el asset define producto. La imagen de estilo no redefine ninguno de ellos. Especificar prendas que conservar para evitar copiar involuntariamente el conjunto de estilo.

## Ejemplos de prompts validados por Emmanuel

**Precedencia:** estos ejemplos enseñan solo la precisión en los papeles de las referencias y en los invariantes (qué se conserva y qué cambia). Para el ESTILO de redacción mandan la regla de prosa y la lista negra de arriba: los ejemplos contienen bloques en MAYÚSCULAS, listas de NEGATIVE y palabras de la lista negra que no se deben imitar.

Emmanuel declara validados estos cuatro ejemplos; no tienen una certificación visual independiente. Antes de redactar, leer el ejemplo pertinente completo como patrón de precisión, no como plantilla universal. Los cuatro textos están íntegros, sin adaptación:

- **Ejemplo 1 · Café, apertura y producto fuera de plano:** roles separados de composición, identidad exclusiva y textura.
- **Ejemplo 2 · Tienda de motocicletas:** identidad y acción conservadas, cinco sustituciones concretas del entorno.
- **Ejemplo 3 · Plato y cubierta transparente:** contacto de ambas manos, escala, orientación del artículo visible y avatar independiente.
- **Ejemplo 4 · POV con producto visible:** cámara, agarre y producto invariantes, cambios acotados y ambiente expresamente conservado.

### Ejemplo 1 (texto íntegro)

```text
Reference image 1 supplies the woman-with-coffee composition and camera distance, not her identity. Keep the previously requested opening before the surprise: relaxed eyes, lips touching the straw, iced coffee held securely in one hand and her free hand down naturally, walking toward the phone. Keep the three-quarter body view with generous surrounding store space. The display she will discover is offscreen to her right. Do not copy captions or the source woman's face.

The main woman is the woman in image 2 and only her. Preserve her exact face, hair and skin tone. Keep her everyday green clothing and unposed body language; natural facial asymmetry, flyaway hair and fine skin texture without exaggerated pores. Do not blend identities with any other reference.

No ZielAlarm article or retail packaging is visible in this opening. They remain completely offscreen; do not add any substitute product to her hands or shelves.

Make the setting a believable German homewares store near its cafe, not a grocery aisle. Replace the original bare concrete wall with a real cafe counter and a physical green hanging sign reading Cafe, replace the dark ceiling with a normal light ceiling and practical fixtures, replace the long table with smaller used wooden cafe tables, and add a decorated Christmas tree near the entrance plus one pine garland with red fabric bows. A few real mugs and plates belong near the cafe counter. Colour comes from the green sign, her clothing and Christmas ornaments, not from shelves of colourful boxes. Check these concrete differences from image 1 while preserving the opening action and camera distance. No candy aisle, no rainbow storage cubes, no colour-block backdrop.

Use the everyday ceiling illumination of a real store with slightly warmer cafe lights farther away. Preserve natural face exposure, imperfect reflections and contact shadows. Allow small normal exposure differences across the room rather than uniformly illuminating every surface.

Image 3 is a realism reference only. Match its believable phone-video texture, ordinary lens perspective, slight softness in moving details, natural skin and knitted fabric, and a lived-in retail environment. Do not copy its person, beverage, Walmart logo, flags, pose, captions or costume. This should look like a candid frame from a friend's phone, not a beauty portrait or a glossy product advertisement. Skin is neither smoothed nor sharpened into coarse artificial pores.

Avoid waxy skin, plastic-looking faces, artificial sharpness, perfect glossy surfaces, colourful abstract blocks, repeated identical packages, fused fingers, floating objects and pasted-in people. Keep background people incidental and anatomically distinct.

Vertical 9:16, same subject scale and camera distance as the requested opening. No on-screen text, no captions, no subtitles, no emojis, no watermark, no interface. Only the physical store signage belongs in the scene.

```

### Ejemplo 2 (texto íntegro)

```text
Use image [1] for this exact bearded man's identity, brown hair, grey leather motorcycle jacket with its real physical patches, dark T-shirt, jeans, chain and tattooed hand holding an open brown beer bottle. Preserve his half-body camera distance, location at left, surprised open mouth and gaze to the right, hand height and upright bottle. Keep the actual bottle and its label rather than replacing it with a glass or cola bottle. The alarm and its boxes are not yet visible in this opening photograph.

Make the setting a genuinely different motorcycle clothing shop while retaining the same camera angle and space to the man's right. Replace the pale wood slatwall with charcoal metal mesh display panels, the brown floor with pale-grey rectangular tiles, the arrangement of overhead leather jackets with spaced jacket rails, the helmet shelves with dark metal shelves holding a different mix of helmet shapes and colors, and the motorcycle visible behind him with a motorcycle-accessory counter and riding boots. Retain authentic physical Harley-Davidson patches and signage where appropriate to this store, but no floating marketing graphics. Before rendering confirm that all five named background elements differ unmistakably from image [1], not simply a color filter over the old store.

Illuminate people and merchandise together using bright ordinary rectangular overhead shop lights, neutral white balance and restrained saturation. His face, beard, skin texture and hand tattoos remain plainly visible, with coherent contact shadows on bottle, fingers and clothing. Use a casual vertical iPhone 1x photograph with broad focus, small natural skin imperfections, detailed leather grain and modest phone sensor texture. Preserve the composition, expression and original camera distance. No text overlays, captions, emojis, play or mute buttons or interface. No watermarks.

```

### Ejemplo 3 (texto íntegro)

```text
Use image [1] only for the opening pose, exact phone camera height and distance, vertical framing and the two-hand contact with the white plate and clear rounded cover. Replace the opening presenter with the woman in image [4] and only her: her face, hair, age and identity come exclusively from this portrait, not from the source presenter. Preserve the source hand positions, body stance and relative size of the covered volume, wearing a plain light-grey sweatshirt without logos. Retain the framing even if it naturally crops part of the head; do not widen the camera to force a full portrait.

The plush toy is visible through the clear cover as in the source. Replace it with the exact green KuschelGrinch plush in image [2], with its broad muzzle, embroidered smile, green tuft and plump limbs. It lies under the cover with its back towards the camera in the source pose, retaining the source toy's relative size instead of becoming miniature. Preserve the white plate and clear cover dimensions and hand grip. Keep the yellow spiral belly on the anatomically correct front of the toy; do not put a face or belly on its back. Do not add a cloth or conceal details that are visible in the source.

Image [3] supplies the requested Christmas bedroom design only. Build one coherent room with a red bed throw over cream bedding, dark bedside cabinets, patterned black-and-white curtains around tall bright windows, a Christmas tree with red and gold ornaments, a dark geometric ceiling fixture and cream rug with dark lines. The presenter stands in the corresponding clear floor area with the same body position and camera perspective as image [1]. Replace the purple strip lighting, Hello Kitty wall pictures, character decorations and pink textiles with these named elements; verify that all four changes are clearly visible wherever the framing includes them.

Keep her face, hands and covered object clearly exposed by bright neutral window light, with coherent contact shadows and legible fabric texture; tree lights only add small background accents. Preserve the portrait's natural skin texture, subtle facial lines, hand creases and normal tonal variation without smoothing. Make a casual unedited iPhone 1x photograph with restrained color, broadly focused details, mild sensor noise and realistic proportions throughout. No text overlays, no captions, no emojis, no watermarks and no interface graphics.

```

### Ejemplo 4 (texto íntegro)

```text
REFERENCE IMAGE [1]: this is MY OWN finished image and it is the base. Keep EXACTLY: the first-person POV framing from the person's own lap, the left hand holding a pink bowl of soft-serve ice cream with crushed cookies and chocolate sauce, the right hand holding the pink ice cream maker with its clear dome, the bare knees under a cream cable-knit blanket, and the bedroom beyond. Change ONLY what the checklist below says.

CAMERA — MATCH EXACTLY, NON-NEGOTIABLE: same crop, same distance, same POV angle and the same proportion of hands, bowl and product within the frame as image [1]. Do not zoom in, do not pull back, do not re-crop.

PRODUCT — PRESERVE, DO NOT CHANGE, DO NOT REDESIGN, DO NOT SUBSTITUTE: the pink ice cream maker in the right hand is reproduced exactly as in image [1] and image [2] — same shape, same clear dome, same white oval button, same pink body, same proportions, same number of parts, held in the same position at the same distance from camera.

MANDATORY BACKGROUND CHANGES — CHECKLIST, VERIFY EACH ONE BEFORE RENDERING. The final image MUST differ from image [1] in ALL SIX of the following ways simultaneously, and each must be visibly and unmistakably different:
1. A Christmas tree is ADDED in the right background where the side table stood — a real fir with warm white lights, deep red and brushed-gold baubles, and a few wrapped presents at its base.
2. The headboard wall is REPLACED — from the plain beige padded headboard with a bare string of lights to a deep green padded headboard with a eucalyptus-and-pinecone garland running along its top edge.
3. The bedside surface is REPLACED — from the stacked books and candles to a small wooden advent house, two red pillar candles lit, and a bowl of clementines.
4. The blanket is REPLACED — from cream cable knit to a chunky oatmeal knit with a deep red woven throw folded across the corner of frame.
5. The sleeve is REPLACED — from the cream cable-knit jumper to a soft charcoal-grey knit with the cuff pushed up.
6. The wall colour is REPLACED — from warm beige to a soft muted sage green, with one small framed print hanging at the left edge.
This must read as a genuinely different bedroom dressed for Christmas, not a redecorated version of the same one.

SETTING / MOOD — MANDATORY, NON-NEGOTIABLE: the cosy German night-in mood of the original is the STYLE, not the background, and it must survive intact. These must all stay present and clearly visible: the TV switched on showing a scene, the warm fairy lights, the soft blanket, and the single warm lamp. On top of that the room is now dressed for Christmas. This mood must never be lost or replaced.

THE SCENE — ONE REAL, COHERENT PHOTOGRAPH, NOT A COLLAGE: picture a genuine home on a December evening as it actually exists — the blanket bunched unevenly, a few stray pine needles, a used mug left within reach, the tree lights very slightly uneven, nothing arranged for a photo. Everything sits under the same single light source at the same colour temperature.

LIGHTING — CHANGE DIRECTION ONLY: the warm light now falls from the left instead of the right, so the shadows of the hands and the bowl drop the other way. A single coherent warm source of about 2700K lighting hands, bowl, product, blanket and room alike. Real soft contact shadows under the bowl, under the product and where the blanket folds.

CRITICAL — indistinguishable from a real, unedited iPhone photo. NOT a graphic-design composition, NOT a Canva-style edit, NOT a collage:
- Real skin texture on the hands with visible pores, knuckle creases, fine lines and natural tonal irregularity — no smoothing, no plastic beauty-filter look.
- Anatomically correct hands: five fingers each, natural grip, realistic nail shape.
- Realistic texture of soft-serve ice cream, of the knitted sleeve and of the blanket: creases, weave, sheen.
- Real soft contact shadows under the bowl, under the product and under every object touching a surface, consistent with the single light direction.
- The product reproduces image [2] exactly — same shape, colours, artwork, text and proportions, in PINK.
- Muted, natural, low-contrast colours, slightly desaturated in the shadows — never vivid or oversaturated.
- A single coherent warm source of about 2700K, warm muted low-contrast colours, highlights protected from clipping.
- Visible natural sensor grain consistent with a phone camera in this low light.
- Shot on a recent iPhone main camera, 1x.
- Moderate depth of field, the room softly and naturally out of focus, not artificially blurred.
- Even sharpness across the plane of focus, no chromatic aberration.
- Slightly imperfect, casual handheld framing — a candid phone shot, not a professional shoot.

NEGATIVE / avoid completely:
- A background that matches image [1] in ANY of the checklist elements above — that is a failed generation.
- Removing, reducing or hiding the TV, the fairy lights, the blanket or the warm lamp — they are the style of this account, not background to change.
- Losing the cosy night-in mood (turning the scene brighter, colder, emptier or more sterile).
- Any change to the product: it stays the SAME pink machine, same shape, same parts, same size and same position in the hand. Do not redesign it, do not recolour it, do not change the number of parts.
- Any change to the ice cream, its toppings or the pink bowl.
- Any change of camera angle, distance, crop or framing from image [1].
- Any change to the hand positions or the grip.
- Any text, logo or interface appearing on the TV screen.
- Any leftover caption text, emoji, play button, mute icon or watermark.
- A dull two-tone room: the Christmas dressing must have varied, real colour.
- Any graphic-design composition, Canva-style edit or collage of separately-lit elements.
- Mismatched lighting or shadow direction between hands, product and background.
- Oversaturated colours, dark vignette, dramatic studio lighting, flat shadowless lighting.
- Perfectly clean, noise-free, airbrushed rendering.
- Malformed hands, extra or missing fingers.
- Plastic beauty-filter skin, 3D-render or generic-AI look.
- Any baby, toddler or child anywhere in the frame.

STRICT REQUIREMENTS:
- The pink product is unchanged and clearly legible, identical to image [2].
- The ice cream, the toppings and the pink bowl are unchanged.
- All checklist items visibly changed; the room reads as dressed for Christmas.
- TV on, fairy lights, blanket and warm lamp all still present and clearly visible.
- Same composition, camera angle, camera distance and framing as image [1].
- One pair of hands only, POV from the person's own point of view. No other people.
- No text overlays, no watermarks, no on-screen interface of any kind.
- Vertical mobile photo format.

```

### Cómo aplicar sus patrones a la escena real
- Asignar a cada referencia su función y exclusiones, usando su índice efectivo. Identidad solo del avatar seleccionado; una misma referencia puede aportar identidad y composición únicamente si ese es el encargo, como en el ejemplo 2.
- Separar explícitamente invariantes de cambios: cámara, recorte, distancia, frontalidad/orientación, mirada, manos con lados de imagen y puntos de contacto, escala relativa, silueta y apoyo. No cambiar pose para acomodar el fondo o el avatar.
- Describir sustituciones de fondo concretas «elemento original → elemento nuevo» y comprobar su presencia en el encuadre; no confundir filtro de color con cambio de entorno. Conservar los elementos o el ambiente que el usuario exija conservar.
- Declarar visibilidad real: fuera de plano no significa cubierto; tela opaca oculta impresión/artículo pero puede conservar silueta; cubierta transparente deja ver el artículo. Producto visible exige geometría, orientación y contacto canónicos. No anticipar un reveal ni copiar una solución de ocultación ajena.
- La foto de realismo aporta textura, luz o ambiente según su rol, nunca otra persona, pose, manos, objeto o composición. Coherencia de luz y contacto, sin alisado ni poros exagerados, según la distancia y condiciones reales.
- Elegir negativos ligados a riesgos de esa toma, no concatenar listas de ejemplos. No universalizar Navidad, 2700K, marca, persona, lateralidad de manos, habitación, cantidad de cambios, número de párrafos ni todos los detalles de un ejemplo.

Comprobar el prompt FINAL, no solo el borrador: sus cambios de entorno y luz no deben contradecir los invariantes. Un texto validado como ejemplo no demuestra que un nuevo resultado los cumpla.

## Redacción contextual del prompt de imagen

Los ocho puntos siguientes ordenan el prompt de imagen; no son una condición universal de calidad ni un motivo para reescribir los ejemplos íntegros.

### Corrección de estilo y escala (01/10/2026, 22:21)
La tanda KaffeeBild/EisWerk anterior NO es un patrón estético: Emmanuel rechaza la dominante verdosa, la piel alisada, la iluminación uniforme y el producto con aspecto de recorte pegado. No reutilizar esos resultados como composición o estilo. Priorizar las fotografías reales de Emmanuel sobre los ejemplos sintéticos cuando discrepen en piel, exposición o integración. Los ejemplos anteriores no obligan a repetir paredes verdes, madera, guirnaldas o un mismo decorado.

Actualización del 03/10: las cinco referencias utilizables prevalecen sobre recetas estéticas anteriores. Verde o beige reales no se prohíben; evitar una dominante impuesta y el acabado uniformemente limpio y relleno de la escena.

- Describir una fuente concreta y su dirección por escena (ventana lateral, puerta abierta, luminarias del local); conservar caída de luz, zonas de sombra y blancos neutros. No gradación verde/teal, filtro sepia ni relleno de estudio.
- Piel sin retoque cosmético: edad, variación de tono, pliegues y textura sutil visibles a la distancia real. No confundir textura con poros exagerados o HDR.
- Para el producto, usar su proporción real frente a la mano, taza o estante de la referencia canónica; no inventar centímetros. Si sustituye un maniquí u objeto grande de la composición, NO heredar su tamaño. Debe ser un artículo de uso doméstico, no un expositor gigante.
- Misma perspectiva, nitidez, ruido, iluminación y oclusiones que su entorno. En escaparates: sombra de contacto sobre repisa, cristal por delante con reflejos discretos coherentes y objetos de escala en el mismo plano. Nunca ampliar el artículo solo para volverlo protagonista; acercar el encuadre si hace falta sin alterar tamaño físico ni acción autorizada.
- El color viene de objetos identificables y pertinentes. No imponer una paleta repetida a todos los ambientes. Conservar la geometría y el color del asset propio.

La revisión visual de cada salida debe observar estos puntos; escribirlos en el prompt no certifica que se cumplan. No prometer ausencia absoluta de defectos.

### Prioridad de calidad (orden de Emmanuel, 01/10/2026, posterior)
La imagen inicial es el principal determinante del resultado. Antes de dar la imagen por buena, comprobar en una sola revisión composición inicial, manos y objetos, producto exacto, identidad y referencia de realismo pertinente. Pensar a la vez el movimiento del clip: la postura debe permitir la acción sin inventar manos, anticipar sorpresa o reveal, ni exigir cambiar el embalaje durante el clip. Después de generar, comparar esos mismos puntos visualmente contra las fuentes. No presentar «perfecto» sin haberlo comparado. Nombrar desviaciones concretas. Mantener color contextual y textura real por encima de adornos vistosos.

1. Referencia de composición y comienzo exacto: qué ocurre ahora, qué aún no ocurre, distancia, escala y posición de manos y objetos. No anticipar un reveal.
2. Avatar: identificar su número real de imagen y fuente exclusiva de identidad. Conservar la elección explícita; de lo contrario usar el avatar que la aplicación entrega para ese papel.
3. Artículo/embalaje canónico: geometría, proporciones y papel exactos. Si no aparece, declararlo fuera de plano; no inventar accesorios o prestaciones.
4. Entorno concreto: elementos funcionales y variación coherente. El color no es una lista de colores obligatorios. Respetar fondos que el usuario pide conservar.
5. Iluminación cotidiana y reflejos propios de ese lugar.
6. Realismo de móvil y papel de la referencia de estilo: `realism reference only`. Excluir copia de rostro, vestuario, producto, banderas y overlays de esa foto.
7. Evitar defectos pertinentes: piel plástica, anatomía imposible, colores arbitrarios, objetos flotantes y geometría alterada. No acumular negativos vacíos.
8. Formato del encargo; sin captions, emojis, interfaz o watermark superpuestos (orden del 30/10/2026, sin excepción). Rótulos físicos no son overlays.

Redactar en prosa natural, adaptando los índices al orden real de las referencias que entrega la aplicación. Mantener el prompt separado de notas y evidencia.

Al construir plantillas, indicar por toma el entorno, la fuente y dirección de luz y las zonas que quedan en sombra. No usar «ceiling lights or window as appropriate» como iluminación final.

## Ejecución de la imagen
- Usar referencias canónicas existentes y la composición original válida. No convertir ejemplos sintéticos o resultados rechazados en estilo ni base de otra imagen; no declarar aprobación visual que no exista.
- Adjuntar una referencia real de estilo pertinente, con papel explícito. No adjuntar todas indiscriminadamente.
- No aplicar filtros ni retoques para simular realismo: se juzga el resultado crudo del modelo y, si se desvía, se cambia el prompt.
- Una referencia de realismo o de entorno no debe llevar una cara visible: la identidad sale solo del avatar (orden del 19/11/2026 sobre la referencia de supermercado, con el rostro cubierto).

### Assets limpios y otros formatos
Esta sigue siendo la regla de imágenes si se pide un artículo aislado, embalaje, logo o imagen web: adaptar los párrafos al fondo, texto y formato solicitados. No introducir personas, tiendas, Navidad, ruido o imperfecciones de móvil en un asset limpio. No modificar producto o marca para añadir color.

## Composiciones de café y pareja (03/10/2026)
Aplicar solo al crear lotes nuevos; no reaplicar estos valores a lotes pendientes, aprobados o en corrección. Son composición, no identidad ni estilo.
- Café: perfil derecho, vaso delante del torso, boca abierta y mirada a la izquierda; no afirmar sorbo en esa captura ni añadir una pose nueva antes de la acción.
- Pareja: dos personas de frente caminando con vasos; ambas erguidas. La captura no contiene desmayo ni obliga a hombres, abrigos azules o rojos ni relación romántica.
- No copiar overlays, ropa, personas ni mercancía ajena a otra cuenta.

### Reparto de papeles
- El avatar que la ficha indica no se sustituye por conveniencia. Un retrato explícito se respeta.
- Si el papel es ambiguo o falta la foto, no inventar el género mirando el producto: resolver esa evidencia.
- Un producto de uñas o belleza conecta con cosmética y asigna mujer a la reacción o al desmayo. Si se indica un público especial, conservarlo al describir el encargo sin cambiar identidades.
- No asignar siempre el mismo `{avatar}` por defecto si hay otra opción adecuada para el papel.

## Escala de producto con mano
Aplicar también la regla «Vídeo con Seedance 2.5», que se entrega junto a esta: las imágenes de referencia de producto muestran el producto comparado con una mano humana, basada en evidencia real del producto original. No inventar centímetros.
