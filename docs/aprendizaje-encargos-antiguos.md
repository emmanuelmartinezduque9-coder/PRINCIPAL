# Aprendizaje de los encargos antiguos: lo que pidió Emmanuel frente a lo que se envió a Higgsfield

Estudio del 22/11/2026, solo lectura en el Mac del dueño. No se modificó nada del sistema antiguo ni del disco T7, no se abrió ninguna credencial y no se llamó a ninguna herramienta que genere o gaste. Los únicos archivos nuevos en el Mac son extractos de texto en `~/.principal-sync/aprendizaje/`.

Objetivo: comparar, tarjeta por tarjeta, la nota de Emmanuel con los prompts y adjuntos reales que Codex envió y que dieron resultados aceptados, para corregir las reglas e instrucciones de PRINCIPAL.

Qué está comprobado y qué no:
- **Comprobado**: los textos de los prompts, el orden de los adjuntos, los modelos y los parámetros salen de los recibos reales (rutas abajo).
- **Entrega comprobada**: pedido `…-81` del 20/11 (18 vídeos entregados según `post-edit/delivery-manifest.json`, con dos defectos menores anotados en V12 y V14) y los dos clips del pedido `…-54` que Emmanuel dio por buenos de palabra (`docs/piloto-pedido-54/indicaciones-del-dueno.md`).
- **No comprobado**: en los pedidos `…-46` y `…-11` hay ediciones finales (`post-edit/final-*`), pero no leí su manifiesto de entrega. Los uso solo como ejemplo de Wan y de Seedance, marcados como tales.
- No he visto los vídeos ni las imágenes: el juicio de calidad es el de los recibos y el del dueño, no mío.

## 1. Dónde está cada cosa

| Qué | Ruta |
|---|---|
| Pedido tal como lo guardó la pantalla de lote (tarjetas en `batch.items[]`: `notes`, `kind`, `method`, `genjutsu_model`, `product_variant_key`, `avatar`, `hook_test`, `genjutsu_references`, `concept_adaptation`, `url`) | `~/Library/Application Support/SEGATOM/local-access-state-20261005-1/original-intake/NanoBanana/_LOTES_APP/owners/emmanuel/orders/app-<id>-<rev>.json` |
| Carpeta de trabajo de cada pedido (163 carpetas) | `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-<id>-<rev>/` (abajo, `ORD`) |
| Prompt de imagen preparado, por vídeo y revisión | `ORD/frame-preparation/vN-c1-prepared-rM/frame-001.txt` y `frames.json` (avatar elegido, composición, referencia de realismo, modelo) |
| **Envío real de la imagen** (prompt exacto, lista ordenada de adjuntos con su papel, comando, id del trabajo) | `ORD/frame-transport/<sha>.json` (`kind: create`; los `kind: upload` son las subidas) |
| Imágenes generadas y decisión del dueño | `ORD/frames_salida/`, `ORD/human-all-frames-approved.json`, `ORD/frame-preparation/*human-decision*.json` |
| **Recibo de cada vídeo** (prompt, motor, modelo, segundos, adjuntos y papeles, frame aprobado, plan de edición) | `ORD/EDITOR/video_recibos/<job>.json` |
| Envío real del vídeo (comando) | `ORD/video-transport/<sha>.json`; para Genjutsu y Wan, además, la respuesta del proveedor con `params` en `ORD/EDITOR/genjutsu_envios/<sha>.submitted-receipt.json` |
| Topaz | `ORD/upscale-transport/<sha>.json` |
| Rechazos y revisiones de vídeo | `ORD/video-preparation/*rejection*.json`, `ORD/EDITOR/revisiones_video/` |
| Vídeos fuente (reel descargado y capturas) | `ORD/sources/<id>/ref.mp4`, `escenaNN.png` |
| Ediciones y entrega | `ORD/post-edit/final-vN-rM/`, `ORD/post-edit/delivery-manifest.json`; carpeta entregada en `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/<fecha>/<pedido>/<Cuenta - DE>/` |
| Código que añade los párrafos fijos del prompt de imagen | `~/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/frame_realism.py` |
| Foto de realismo que se adjunta siempre la última | `…/AUTOMATIZACION IA VIDEOS/REFERENCIA_CALIDAD/realismo-emmanuel-20261003/emmanuel-2.png` |
| Extractos de este estudio | `~/.principal-sync/aprendizaje/` (`summary_orders.txt` = las 40 últimas tarjetas con sus notas; `spec54.txt`, `spec81.txt` = prompts de imagen sin los párrafos fijos; `vid54.txt`, `vid81.txt`, `vid11.txt` = prompts de vídeo; `dump_app-*.txt` = volcado completo; `dump.py`, `spec.py`, `vid.py`, `summ.py` = los guiones que los generan) |

Pedidos leídos: `app-6852a9fd…-54` (21/11), `app-8082c194…-81` (20/11, entregado), `app-4b5cc5f0…-46` (19/11), `app-1db468b5…-11` (18/11) y, solo las notas, los 40 más recientes.

## 2. Modelos reales del proveedor y parámetros

Todos los envíos se hacían con la CLI `higgsfield generate create <modelo> …`. Los valores salen de los comandos y de la respuesta del proveedor.

| Opción de la tarjeta | ID real | Parámetros enviados | Adjuntos |
|---|---|---|---|
| Imagen (Nano Banana) | `nano_banana_2_1` | `--resolution 2k --aspect-ratio 9:16 --thinking-level high` | `--image-references` repetido, en el orden del apartado 4.1 |
| Genjutsu · Motion Transfer (por defecto) | `hf_mult_motion_control` («Higgsfield Multiplier Motion Control») | `--resolution 480p`. El proveedor devuelve `aspect_ratio 9:16`, `bitrate_mode high`, `generate_audio false`, `scene_mode off`, `duration` = la del vídeo fuente, 720×1280 | `--image-references` (frame aprobado, artículo, embalaje, fondos) y `--video-references` (el reel fuente completo). El frame aprobado va como referencia de imagen, **no** como `start_image` |
| Genjutsu · Object Swap | `hf_mult_replace_object` («Higgsfield Multiplier Replace Object») | `--resolution 480p`. Devuelve `aspect_ratio auto`, `generate_audio false`, `duration` = la del fuente | Igual: hasta 9 imágenes vistas en un envío (artículo, funcionamiento, 6 fondos, frame aprobado) más el vídeo |
| Genjutsu Lite · Motion Transfer | `hf_mult_motion_control_flash` | No vi ningún recibo; el ID sale de `docs/importacion/lote-antiguo-funciones.md` (referencia de 4–15 s) | — |
| Wan 3.0 Prime | `wan3_0_prime` | `--resolution 480p --duration 12 --aspect_ratio auto --generate_audio true --enable_thinking false` | 3 imágenes (frame aprobado, artículo, fondo) y el vídeo fuente |
| Wan 3.0 | `wan3_0` | Sin recibo visto (1 uso en 572 tarjetas) | — |
| Seedance | `seedance_2_5` | `--start-image <frame aprobado> --duration 6` (gancho) o `14` (vídeo completo) `--aspect-ratio 9:16 --bitrate_mode high --resolution 480p --mode omni_reference` | `--image-references` con embalaje y artículo. **Sin vídeo de referencia** |
| Topaz | `topaz_video` | `--video <job> --resolution 1080p --aspect_ratio auto --enhancement {"model":"thd-3",…} --frame_interpolation null` | — |

Uso real en 572 tarjetas guardadas: Motion Transfer 525, Wan 3.0 Prime 23, Object Swap 10, Lite 9, Wan 3.0 1. Seedance se usaba para ganchos con diálogo y para cuerpos nuevos, no para replicar un reel.

## 3. Casos emparejados

`[N]` es el número de adjunto que cita el prompt. «Frame» = prompt de imagen (solo la parte propia de la escena; los párrafos fijos están en 4.1).

| # | Pedido · vídeo | Tipo | Nota de Emmanuel (literal) | Imagen: adjuntos en orden | Imagen: qué dice lo propio de la escena | Vídeo: modelo, adjuntos y qué dice | Resultado |
|---|---|---|---|---|---|---|---|
| 1 | 81 · V1 EisWerk | Réplica, variante fresa, fondo subido | «quiero que uses esta imagen de referencia comop fondo pero hazlo como si huebiera un sofa frente al televisor y que ella este sentada alli» | [1] captura del reel, [2] artículo fresa, [3] salón subido, [4] realismo | «Exact first-person opening [1]: two hands beginning to unwrap an opaque patterned gift on the low coffee table. Keep the gift fully covered, its scale, finger contacts and camera angle. No revealed machine yet. Change sleeve knit to muted plum.» · «Use the actual living room [3]: large TV… The viewer sits on a sofa opposite the TV; table immediately in front.» | Motion Transfer, 13 s. Imágenes: [1] artículo fresa, [2] embalaje fresa, [3] salón, [4] frame aprobado. Lista las acciones del reel en orden, «Place all home shots in the supplied living room with the sofa opposite the TV» | Entregado |
| 2 | 81 · V2 EisWerk | Réplica, variante azul turquesa, avatar elegido (mujer 12), fondo subido | «usa esta imagen de referencia como fondo» | [1] captura, [2] artículo, [3] salón, [4] mujer 12, [5] realismo | Pose y campana metálica cerrada, «All contents remain concealed», pijama nuevo. Corrección r2: «the brunette woman in composition [1] must be completely replaced. Keep only her pose, hand contacts, clothing and framing, never her facial identity» más una descripción de los rasgos del avatar | Motion Transfer, 15 s. [1] frame, [2] artículo azul, [3] embalaje azul, [4] salón. «reveal the exact blue-variant retail box… The woman is the approved blonde mujer 12 throughout, never the original brunette» | Entregado (la primera imagen conservó la cara del original y hubo que corregirla) |
| 3 | 81 · V4 EisWerk | Réplica con dos lugares, variante virutas | «usa esta imagen de referencia para el fondo de los clips en el super y cambia las banderas de estados unidos por las banderas de alemania y usa la segunda imagen de referencia como fondo en el salon de los demas clips» | [1] captura, [2] artículo, [3] supermercado subido, [4] avatar, [5] realismo | «Match source [1] wide low phone opening inside the shopping aisle… Keep positions, angle and crop. Change clothing… Replace hanging US flags with small German flags. The product is not revealed yet.» · «Rebuild the actual supermarket aisle from [3]…» | Motion Transfer, 15 s. [1] frame, [2] artículo, [3] embalaje, [4] súper, [5] salón. «Use the first supplied image for supermarket scenes including checkout; replace US flags with German flags. Use the second supplied image for ALL home scenes.» | Entregado |
| 4 | 81 · V9 HaarZauber | Réplica, tienda, variante blanca, avatar elegido | Nota de cuenta: «no pongas avatares ancianos ni mujeres con canas ya que intento conectar con mujeres de 35-50 años» + «quiero que la tienda sea sephora» | [1] captura, [2] embalaje, [3] foto real de Sephora, [4] otra referencia adjunta (no identifiqué cuál), [5] avatar «mujer 16», [6] realismo | Caja exacta sobre la bolsa, tarjeta de pago, «Same pose and framing as [1]… no dm logo anywhere» · «Different Sephora interior from [3]… authentic physical Sephora signage. Employee wears simple black store clothing.» | Motion Transfer, 16 s. [1] frame, [2] artículo blanco, [3] embalaje. «with the WHITE brush in every appearance… All store shots are in the same replacement Sephora… No dm or Target branding. Every visible woman must have natural hair without grey, approximately 35 to 50 years old.» | Entregado |
| 5 | 81 · V12 FalterPfote | Réplica con Object Swap | «el producto del video de referenci es diferente fisicamente al mio por lo que tambien rienes que hacer object swap del producto fisico ademas de todo lo demas como la proyeccion, fondos etc» | [1] captura, [2] artículo, [3] funcionamiento, [4] calle, [5] realismo | «POV night walk: a small reddish spaniel on a leash… This is the problem scene before the product is fitted: no butterfly light projection yet.» | Object Swap, 15,7 s. [1] artículo, [2] funcionamiento, [3]–[8] seis fondos, [9] frame aprobado. Prompt íntegro en 3.3 | Entregado en su revisión 2 (queda un defecto: corazones en dos planos) |
| 6 | 81 · V13 FalterPfote | Solo gancho (desde enlace) + cuerpo reutilizado, tienda | «quiero que tambien sea en aldi, pero quyiero que el pasillo hayan productos de perro, cambies los avatares, el color de las sabasnas, que la ropa que usen las personas tenga que ver con masctotas y que cada una tenga un perro sentado al lado de ellas…» | [1] captura, [2] artículo, [3] embalaje, [4] foto real de Aldi, [5]–[6] otras referencias adjuntas (no identifiqué cuáles), [7] avatar principal, [8] realismo | Cola de dueñas, sábana mostaza opaca «from floor to above all boxes… Nothing beneath it is visible», un perro distinto sentado junto a cada una, ropa con motivos de perro · «real Aldi interior [4]… this aisle contains dog food, leashes and dog toys rather than groceries» | Motion Transfer, 6 s. [1] frame, [2] artículo, [3] embalaje. «Both women pull the cloth away only on the source reveal cue… The body is added separately during editing.» | Entregado |
| 7 | 54 · V4 EisWerk | Réplica, variante virutas, sin notas | (sin nota) | [1] captura, [2] artículo virutas, [3] embalaje virutas, [4] cocina (Pinterest), [5] realismo | «Replace the turquoise carton with the exact white sprinkle-pattern EisWerk carton in image [3]… Preserve the still-closed initial state; do not show the extracted machine early.» | Motion Transfer, 480p. Prompt íntegro en 3.2 | Clip aceptado por el dueño: «este vídeo sí está bien, solo le falta la edición» |
| 8 | 54 · V1 EisWerk | Solo gancho «1, 2, 3» de biblioteca + cuerpo C78, tienda | «Quiero que el mantel tenga el diseño de Starbucks por Eiswerk y quiero que la bandera de atrás sea de Alemania, el Starbucks sea como un Starbucks de Alemania. Cambies la cara de los avatares…» | [1] captura del gancho, [2] artículo, [3] embalaje rosa, [4]–[6] avatares secundarios, [7] avatar principal, [8] realismo | Cuatro personas y sus posiciones, tela hasta el suelo «no boxes peeking out», «Replace its Disney artwork with a physically printed green Starbucks emblem and the words STARBUCKS x EisWerk» · lista de sustituciones del local, una por una | Seedance 2.5, 6 s, `start_image` = frame aprobado, [2] embalaje, [3] artículo. Prompt de la biblioteca de ganchos (igual al de 3.4 con la marca cambiada) | Gancho aceptado por el dueño: «este gancho también está bien» |
| 9 | 54 · V12 FalterPfote | Solo gancho «1, 2, 3» + cuerpo, tienda, límite de tiempo | «haz que la tienda sea LIDL , que se vea en el diseñp de la sabana LIDL x nuestra marca, maximo que dure 5 segundos hasta el destape y el cuerpo adjuntalo desde el primer clip» | Como el caso 8 | «Replace the cloth print with a physical authentic LIDL emblem and LIDL x FalterPfote…» · «Replace the Starbucks entirely with a German Lidl store: blue checkout fixtures…» | Seedance 2.5, 6 s. Prompt íntegro en 3.4, con los tiempos del límite al final | Listo para editar según `docs/piloto-pedido-54/estado.md` |
| 10 | 54 · V2 EisWerk | Solo gancho + 2 cuerpos, avatar elegido, fondo subido, variante fresa | «quiero que uses esta imagen de referencia como fondo de la cocina, quiero tambien que cambies el color del trapo a rosa brandeado de eiswerk» | [1] captura, [2] artículo, [3] embalaje, [4] cocina subida, [5] mujer 12, [6] realismo | Prompt íntegro en 3.1 | Seedance (gancho). La primera versión se rechazó | Imagen aprobada por el dueño; el vídeo quedó sin revisar |
| 11 | 54 · V10 FalterPfote | Réplica con cambio de concepto, Object Swap | «quiero que en el concepto en vez de ser unas alas de dragon que sean unas alas de mariposa, tambien obviamente cambia la raza de perro en todas las tomas y todos los cambios que ya sabes» | [1] captura, [2] artículo, [3] funcionamiento, [4] salón, [5] realismo | «Replace the boxer with an adult black-and-white border collie, same dog size, seated location and gaze. Replace physical dragon costume wings with lightweight pale-pink butterfly costume wings of similar span, held at the same two points. This is the unsuccessful costume idea, not the electronic projection yet.» | Object Swap, 13,9 s, un fondo por tramo de tiempo («For 4–7.43s, replace the entire original Brandenburg Gate square with the real environment in image [4]») | Imagen aprobada. **Vídeo rechazado**: conservó los rótulos del original. Rehecho con Seedance en PRINCIPAL (`docs/piloto-pedido-54/prompts/`) |
| 12 | 11 · V3 HaarFein | Réplica con Wan 3.0 Prime | «quiero que cambies el produto del video de referencia por mi producto que cumple exactamente la misma funcion» | — | — | Wan 3.0 Prime, 12 s, audio activado. [1] frame, [2] artículo rosa, [3] salón. Prompt íntegro en 3.5 | Generado y editado; entrega sin comprobar |
| 13 | 11 · V2 HaarFein | Vídeo completo con Seedance (método B) | «haz un analizis de video detallado para que le prompt de seedance de un resultado lo mas fiel posible al video de referencai» | — | — | Seedance 2.5, 14 s, `start_image` + artículo. Un solo párrafo con las acciones en orden y «Cut to rear three-quarter view», más un bloque fijo de encuadre («No macro, no close-up… no push-in and no zoom-in») | Generado y editado; entrega sin comprobar |

### 3.1 Prompt de imagen íntegro (caso 10, pedido 54 · V2, corrección 1; 4.655 caracteres)

Adjuntos: [1] captura del reel, [2] artículo fresa, [3] embalaje fresa, [4] cocina subida por Emmanuel, [5] avatar «mujer 12», [6] foto de realismo.

```
Image [1] supplies the exact opening composition: a woman behind a kitchen counter, waist-up, one hand resting on top of the opaque drape and the other supporting its side. Preserve the source camera height, distance and hand contacts; do not widen into an interior-design room photograph. Replace face and hair exclusively with the selected portrait in image [5]. She wears an oatmeal knitted sweater. The complete small strawberry ice-cream machine is concealed under an opaque pink cloth bearing a small physical EisWerk logo. The cloth reaches and rests on the counter all around: no visible white base, handle, lid or product beneath the hem. Keep real small domestic appliance proportions and enough loose fabric for the later reveal; do not lift the cloth yet.

Identity assignments: The main subject is the woman in image [5] and only that person: exact face, hair, skin tone and natural age, re-lit into this setting. Do not blend any identity with source, environment or realism references.

Image [2] is the exact selected product; image [3] is its exact retail packaging. Retain its geometry, markings, materials and realistic scale. Where described as concealed or later-use only, do not display it early. The composition controls hand contact and action, not the wrong source variant.

Image [4] is the user-selected kitchen: white cabinets, large windows left/rear, grey-veined marble island, pine garland and wreaths, glass-front cabinets right. Place the woman behind the usable island in the source pose and reserve a clear area for the covered appliance. Keep the nutcracker arrangement and glass jars farther back to avoid hand collisions. Replace the original subway-tile wooden-shelf kitchen entirely. Make the intended audience recognizable on first sight, without sound or captions. Use one prominent, physically plausible visual cue belonging to this product's audience in the described setting. Keep the action, hand positions and reveal timing intact.

Follow image [4] bright diffuse window light from left/rear, softened by the room. Faces, hands, pink fabric and marble share neutral daylight, real shading on the far sides and contact shadows at fingers and cloth base. Tiny warm garland bulbs are accents, not a separate spotlight. When a room, space or environment reference is supplied, its observed lighting is the primary authority for the entire scene, overriding conflicting lighting in composition, avatar, product or style references and generic lighting recipes. Match its light direction, sources, colour temperature, intensity, contrast, exposure and falloff across the person, skin, clothing, hands, product and packaging. Re-light inserted elements to that environment, including cast and contact shadows, occlusion, reflections and colour bounce; match perspective, scale, depth, sharpness and image texture. Preserve real differences between illuminated and shaded areas: coherent integration does not mean flat or evenly filled lighting. No pasted cutouts, halos, floating objects, isolated portrait lighting or independent exposure. If no environment reference is supplied, retain the scene-specific lighting described above.

Image 6 is realism reference only for texture. The scene-specific light in the previous paragraph controls all lighting; do not import the style photograph lighting or setting.  If an environment reference is supplied, this style reference supplies texture only and must not override that environment lighting.  Everyday phone-video softness varies with subject distance, light and movement; do not give skin, fabric and background identical fine detail. Do not copy its person, pose, face, clothing, product, logos or overlays. IDENTITY SOURCE PRIORITY: only the explicitly selected avatar references define each person. Ignore every face in realism/style references: never borrow or blend their facial geometry, eyes, nose, mouth, jaw, age, hair or likeness. Apply photographic texture to the selected avatar without replacing or averaging that identity. Composition and background references also provide no identity unless explicitly assigned as an avatar. Preserve the identity and action already specified. No artificial HDR or cosmetic skin smoothing.

One coherent casual iPhone-style photograph with broad depth of field, realistic perspective, material texture, gentle contact shadows and natural unposed anatomy. No cutout edges, waxy skin, fused fingers or artificial pore sharpening.

Vertical 9:16. No watermark. No text overlay. No subtitles, emojis or interface. The only lettering visible is on relevant physical package labels, fabric printing and shop signage.
```

### 3.2 Genjutsu Motion Transfer íntegro (caso 7, pedido 54 · V4, job `e7e8b21a`; aceptado por el dueño)

Adjuntos: vídeo fuente completo; imágenes [1] artículo virutas, [2] embalaje virutas, [3] frame aprobado.

```
Preserve original people and identities without adding a face to the POV shots. Use the entire source video as the authority for all actions, camera movements, cuts and duration. Use image [3] as the exact human-approved clean opening frame, preserving its hand placement, camera angle, lighting and scene. Preserve every original cut and timing: open carton and lift out the ice cream maker; pour milk into bowl, fit lid, switch on churning, add colourful sprinkles and chocolate sauce through the fill opening, lift lid, lift a spoonful and show the serving bowl. Use the approved replacement kitchen throughout every shot and camera angle. Preserve its grey work surface, white cabinets and built-in microwave. Keep the approved seasonal garland and kitchen objects in consistent locations. Relight all hands, appliance and carton to the same warm-neutral kitchen practical lighting. Image [1] is the exact white multicolour-sprinkle-patterned EisWerk ice cream maker with large side handle, matching motor and clear dome. Preserve its geometry and small appliance scale through every use. Image [2] supplies its exact closed retail carton and printed packaging; no turquoise machine or turquoise carton. Keep every product interaction readable at the original hand scale, without adding shots or zooms. Keep the real fill opening unobstructed: milk enters the uncovered bowl; toppings and sauce enter the aperture, never land on the motor. Preserve the side handle in every shot and functioning rotating paddle after switching on. Remove every source caption, emoji and overlay throughout. No text overlays, no captions. Preserve complete generated audio for final editing.
```

### 3.3 Genjutsu Object Swap íntegro (caso 5, pedido 81 · V12 revisión 2, job `f5cbf802`; entregado)

Adjuntos: vídeo fuente; imágenes [1] artículo, [2] funcionamiento (la proyección), [3]–[8] seis fondos, [9] frame aprobado.

```
Use the entire supplied source video as the authority for actions, cuts and camera timing. Preserve original people or identities without adding a new person to the approved opening. Use image [9] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting. The source video controls the complete action, camera movement, cuts and timing. Keep every source shot and timing: unlit roadside walk, attach device beside wooden fence, show projection there, two women react outside storefront, woman reacts beside outdoor restaurant tables, then dog walks through park and residential street. Use the approved reddish spaniel in every shot, never the original white or Yorkshire dogs. All original environments are replaced using the mapped photos. Same location across source cuts uses the same replacement location. Match approved phone-camera distance and normal exposure, with new clothing for all people. Every projection must follow pavement texture, perspective and light falloff; no pasted graphics. Show the exact FalterPfote collar projector in all device shots, including its casing and collar attachment. Replace the original physical projector AND every original projected pattern with the supplied pink butterfly function reference. Preserve exact product geometry, physical colours, components and plausible real scale in every appearance. Keep the product legible at the original hand scale without adding zooms or close-up shots. Preserve original source audio for subsequent controlled German editing. Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions. Image [2] defines the exact PINK BUTTERFLY light pattern, not red feathers, orange bat wings or white angel wings. Use image [3] only for this environment: Opening unlit problem walk. Use image [4] only for this environment: Collar fitting and first illuminated test beside wooden fence. Use image [5] only for this environment: Two women reacting on sidewalk outside the shops. Use image [6] only for this environment: Woman reacting beside restaurant outdoor tables. Use image [7] only for this environment: Park path walk. Use image [8] only for this environment: Final residential street walk. Mandatory correction: Keep the same reddish spaniel throughout EVERY shot. The projected light MUST exactly match supplied butterfly function image: simple pink butterfly wings, never hearts, angel wings or other motifs. Preserve all replaced background mappings.
```

### 3.4 Seedance, gancho «1, 2, 3» de biblioteca, íntegro (caso 9, pedido 54 · V12, job `4d20b781`)

Adjuntos: `start_image` = frame aprobado (el prompt lo llama image [1]); `image_references`: [2] embalaje, [3] artículo. 6 s. Es el prompt guardado del gancho con la marca cambiada; el del caso 8 (aceptado por el dueño) es el mismo con «EISWERK». La última parte, desde «Keep all four people», es lo que se añadió por la nota de la tarjeta.

```
Use image [1] as the exact approved opening. Image [2] defines only the exact closed FALTERPFOTE retail packaging revealed at the end. Preserve the exact composition, framing, camera angle, perspective, store environment, shelving, floor, ceiling, lighting, cart, approved opaque cloth, and every visible background element exactly as shown. Preserve the two rear cloth holders exactly as they appear, including their faces, hairstyles, clothing, body proportions, poses, hand placement, and positions holding the two approved upper grips of the approved opaque cloth. Do not replace, redesign, morph, or alter any existing element.

The concealed product is the exact FALTERPFOTE retail packaging from image [2]. Do not reveal or show them until the final reveal.

IMPORTANT: Every spoken line must be in perfectly fluent native German with natural pronunciation, authentic German lip sync, and a native German accent. No English at any point.

Create a hyper-realistic handheld iPhone video in one continuous take with subtle natural handheld camera shake.

The two rear cloth holders stand exactly as shown in the reference image, each firmly holding one upper corner of the approved opaque cloth. The sheet completely covers the cart and everything behind it.

The two rear cloth holders alternate speaking while looking naturally toward the camera and occasionally at each other.

The rear woman on the left confidently says:

„Eins...“

Exactly synchronized with the word "Eins", the two rear cloth holders quickly lift the large sheet upward together a short distance and immediately lower it back to exactly its original position. The sheet must continue completely hiding everything behind it.

Next, the rear man on the right says:

„Zwei...“

Again, perfectly synchronized with the word, the two rear cloth holders repeat the exact same quick up-and-down movement together. After lowering the sheet, it immediately returns to its original position, completely covering everything behind it.

Then the employee on the left says:

„Drei...“

Once more, synchronized with the word, the two rear cloth holders perform the third identical up-and-down movement. After lowering the sheet for the third time, it completely covers everything exactly as before.

The product boxes must never be visible during any of these three up-and-down movements. Not even for a single frame, corner, edge, shadow, reflection, or partial glimpse.

After the third movement, while still holding the sheet fully covering everything, the rear man on the right looks toward the camera and naturally says:

„Mal sehen, wie es geworden ist.“

Only after finishing the entire sentence do the two rear cloth holders simultaneously pull the large sheet completely away in one fast, smooth, coordinated motion, revealing a large stacked display of the FALTERPFOTE cartons from image [2] arranged neatly on the cart. The stack should appear like an impressive retail product display, with multiple identical product boxes stacked cleanly and symmetrically.

The camera remains steady and centered on the revealed display.

Motion requirements:
- Perfect native German lip sync for the two rear cloth holders.
- Accurate synchronization between each spoken number and each sheet movement.
- The two rear cloth holders move the sheet together with perfectly coordinated timing.
- Three complete up-and-down movements with no pauses.
- Realistic fabric physics, folds, tension, wrinkles, and gravity on the large sheet.
- The sheet never clips through the product display.
- The stack of FALTERPFOTE boxes remains fully concealed until the final reveal.
- Stable handheld iPhone movement with subtle natural shake.
- One continuous take.
- No cuts, transitions, zooms, slow motion, or time jumps.

Negative prompt:
No English speech, no foreign accent, no incorrect German pronunciation, no early product reveal, no partial visibility of the product boxes, no cloth clipping, no AI warping, no object flicker, no body morphing, no identity changes, no extra people, no extra fingers, no hand deformation, no lighting changes, no environment changes, no disappearing objects, no motion blur, no plastic or generic AI appearance, no changes to the store layout, no changes to the employees' appearance or clothing, no text overlays, no subtitles, no watermarks. Keep all four people from image [1], including the front-left selfie presenter and rear-center man; only the two cloth holders move the cloth. Preserve the physical cloth branding and approved store. Three counts during 0–2.5 seconds; finish the complete German sentence by 4.5 seconds and reveal only afterwards, by 5 seconds. Hold the revealed closed packaging for no more than one second. No added music. Preserve the approved opening camera height, angle, distance, subject scale and margins.
```

Aviso sobre este gancho: en el caso 8 la revisión técnica del sistema antiguo lo rechazó porque las cajas asomaban bajo la tela, y aun así Emmanuel lo dio por bueno. La corrección que se escribió (sin revisar todavía) cabe en 1.100 caracteres y fija cada palabra con su segundo: «Eins at 0.25–0.65s, Zwei at 1.0–1.4s, Drei at 1.8–2.2s… ONLY after the last word is finished, fully pull off the cloth during 4.4–4.9s», con «three tiny pulses only in the TOP fabric, never lifting the bottom hem».

### 3.5 Wan 3.0 Prime íntegro (caso 12, pedido 11 · V3, job `c4ffec90`)

Adjuntos: vídeo fuente; imágenes [1] frame aprobado, [2] artículo rosa, [3] salón.

```
Use the entire supplied source video as the authority for actions, cuts and camera timing. Preserve the identity from image [1]. Use image [1] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting. The source video controls the complete action, camera movement, cuts and timing. Lift the crown section upright, place black teeth near roots and draw through; change to closer rear view of upright section, then turn a side section across brush and curve ends in. Release hair and turn client to show layered curved bob in profile. All shots use one replacement salon, all steps preserve original timing and contact. Approved bright working salon, same room across the changing camera angles. Preserve the new store or salon fixtures throughout. Match light and shadows from the approved opening. Keep original actions and camera timing across all cuts. Use the exact dusty-pink HaarFein short palm brush with black bristles and rose-gold rim throughout. Maintain small palm size without a long handle. Preserve exact product geometry, physical colours, components and plausible real scale in every appearance. Keep the product legible at the original hand scale without adding zooms or close-up shots. Keep original audio. Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions. Use image [3] for the replacement salon in every shot. The compact hair brush shown on camera is a pink hair straightening brush. Preserve the original non-speech audio. Do not add speech.
```

## 4. Patrones

### 4.1 Prompt de imagen (Nano Banana 2.1, 2K, 9:16, «thinking» alto)

**Lo escribe una plantilla, no el modelo entero.** De los 3.300–5.000 caracteres de cada prompt, solo 700–1.300 son propios de la escena. El resto son párrafos fijos que añade el código (`frame_realism.py`), siempre iguales y en el mismo sitio. Siete párrafos, en este orden:

1. **Composición y estado de apertura** (propio, 350–700 caracteres). Empieza por la captura: «Image [1] supplies/controls the exact …» o «Exact first-person opening [1]: …». Describe en una o dos frases lo que se ve (quién, dónde está cada uno, qué mano toca qué). Luego «Preserve/Keep» con una lista corta: altura y distancia de cámara, escala, contactos de las manos, posiciones. Luego los cambios, cada uno con «Replace… with…» o «Change…», y el estado del producto en ese instante: «fully covered», «No revealed machine yet», «do not lift the cloth yet», «still-closed initial state». Casi siempre cambia también la ropa, con color y prenda concretos.
2. **Identidad** (fijo, con los números). Con avatar: «Identity assignments: The main subject is the woman in image [5] and only that person: exact face, hair, skin tone and natural age, re-lit into this setting.», una frase por persona con su papel («The back left cloth holder is…»). Sin cara visible: «No featured human face is visible in this opening. Keep only the source anonymous hand poses and natural anatomy. Do not introduce a person from any reference.»
3. **Producto** (fijo). «Image [2] is the exact selected product; image [3] is its exact retail packaging. Retain its geometry, markings, materials and realistic scale. Where described as concealed or later-use only, do not display it early. The composition controls hand contact and action, not the wrong source variant.»
4. **Entorno** (propio, 250–450 caracteres + una frase fija). «Image [4] supplies/is the …» seguido de una lista de lo que se ve en esa foto, dónde se coloca al sujeto dentro de ella y «Replace the original …» con los elementos del original que desaparecen, nombrados uno a uno. Si no hay foto de entorno, la lista de sustituciones va escrita («replace the US flag with the German black-red-gold flag; princess wall pictures with framed coffee illustrations; balloon arch with a simple pine garland…»). Cierra la frase fija del público: «Make the intended audience recognizable on first sight, without sound or captions. Use one prominent, physically plausible visual cue belonging to this product's audience…»
5. **Luz** (una o dos frases propias + bloque fijo). Propias: de dónde viene la luz de esa foto y qué comparten manos, tela y superficie («Follow image [4] bright diffuse window light from left/rear… contact shadows at fingers and cloth base»). Fijo: la luz de la foto de entorno manda sobre la de la composición, el avatar, el producto y la foto de realismo.
6. **Realismo** (fijo). La última imagen adjunta es siempre la misma foto real de Emmanuel: «Image 6 is realism reference only for texture…», con la prohibición de copiar su persona, pose, ropa o luz y la regla de prioridad de identidad.
7. **Cierre** (fijo). «One coherent casual iPhone-style photograph with broad depth of field, realistic perspective, material texture, gentle contact shadows and natural unposed anatomy. No cutout edges, waxy skin, fused fingers or artificial pore sharpening.» y «Vertical 9:16. No watermark. No text overlay. No subtitles, emojis or interface. The only lettering visible is on relevant physical package labels, fabric printing and shop signage.»

**Orden de los adjuntos, siempre el mismo**: [1] captura del reel (composición) → artículo → embalaje (solo si se ve o se va a revelar) → foto de funcionamiento (si el producto proyecta o hace algo) → foto o fotos de entorno → avatares (los secundarios primero, el principal el último) → foto de realismo. El prompt cita cada uno como «image [N]» con ese número.

**Otras constantes:**
- **Siempre hay foto de entorno real.** Subida por Emmanuel o buscada en Pinterest, de una tienda o una casa reales del mercado. El entorno original se sustituye siempre, también cuando la tarjeta no dice nada. La lista de lo que se ve en la foto es lo que evita el «salón de catálogo».
- **Una caja nunca se describe: se adjunta y se nombra.** «the exact white sprinkle-pattern EisWerk carton in image [3]», y a continuación qué había en el original para que no vuelva: «Replace the turquoise carton», «without copying the source turquoise boxes».
- **Si el original ya esconde el producto, la imagen también**, con la tela o el papel descritos como opacos y hasta dónde llegan.
- **Las correcciones se añaden, no se reescribe.** Se conserva el prompt y se añade una frase al final del primer párrafo («IMPORTANT CORRECTION: the shopping cart must be completely unbranded…») y otra al cierre («No Walmart lettering or starburst anywhere»). Cuando la cara del original se coló (caso 2), la corrección fue declarar la composición prohibida como identidad y describir los rasgos del avatar.
- **Mayúsculas sueltas solo en correcciones** («SOLE authority», «EVERY carton»), no en el texto base.
- Longitud: 3.300–3.700 caracteres el 20/11; 4.300–5.000 el 21/11 (los párrafos fijos crecieron).

### 4.2 Prompt de vídeo por modelo

**Genjutsu Motion Transfer** (1.300–1.900 caracteres, un solo párrafo, frases cortas). El vídeo fuente va entero como referencia y manda en el movimiento. Orden fijo:
1. Autoridad: «Use the entire supplied source video as the authority for actions, cuts and camera timing.»
2. Identidad: «Preserve the identity from image [1].» o, en POV, «Preserve original people or identities without adding a new person to the approved opening.»
3. Frame aprobado: «Use image [N] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting.»
4. **Las acciones del reel, en orden, en una frase**: «Unwrap the gift on the coffee table, reveal the exact strawberry machine, prepare the ingredients on the lap, pour milk into the open bowl, fit the lid and churn, add chocolate…, then serve and eat. Preserve every source cut and contact.»
5. Entorno en todas las tomas: «Use the approved replacement kitchen throughout every shot and camera angle», y con dos lugares, qué foto corresponde a cuál.
6. Producto: qué imagen es el artículo y cuál el embalaje, con sus rasgos, la variante prohibida («no turquoise machine or turquoise carton») y **la función física**: «milk enters the uncovered bowl; toppings and sauce enter the aperture, never land on the motor».
7. Frases fijas: «Preserve exact product geometry, physical colours, components and plausible real scale in every appearance. Keep the product legible at the original hand scale without adding zooms or close-up shots.» · «Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions.» · «Preserve the source audio for subsequent controlled editing. No new spoken narration.»

Adjuntos: con persona visible, [1] frame aprobado, [2] artículo, [3] embalaje, [4…] fondos. En POV sin cara, artículo y embalaje primero y el frame aprobado el último. Para «solo gancho» se recorta el vídeo fuente al tramo del gancho («the exact 3.2-second source segment») y se añade «The body is added separately during editing».

**Genjutsu Object Swap** (2.500–3.600 caracteres). La misma cabecera y, además:
- un fondo nuevo por lugar real, citado por número y por toma: «Use image [5] only for this environment: Two women reacting on sidewalk outside the shops», o por tramo de tiempo: «For 4–7.43s, replace the entire original … with the real environment in image [4]. Preserve the SOURCE camera angle, subject scale and action, adapting this environment rather than copying its photographic framing»;
- la regla de continuidad: «Same location across source cuts uses the same replacement location»;
- el objeto que cambia y el efecto que cambia, cada uno con su imagen, y la lista de lo que no debe aparecer («not red feathers, orange bat wings or white angel wings»);
- el animal o la persona que cambian, «in EVERY shot».

Object Swap no quita bien los rótulos del original: V10 y V11 del pedido 54 se rechazaron por eso. El sistema antiguo lo arreglaba con una **segunda pasada** de Object Swap sobre el vídeo ya aprobado, con un prompt que empieza «TEXT REMOVAL ONLY. Use the source video as the sole authority for the entire visual result…» y nombra los rótulos literales que hay que borrar (pedido 46, `v9-text-cleanup`).

**Wan 3.0 Prime** (1.300–1.500 caracteres). El mismo esqueleto que Motion Transfer, más compacto, con audio activado. Tres imágenes como máximo en lo que vi. Se usó cuando hacía falta voz en alemán («Preserve the original non-speech audio. Do not add speech» o el diálogo pedido).

**Seedance 2.5** (sin vídeo de referencia en ningún envío del sistema antiguo). Dos usos:
- Gancho con diálogo (6 s): `start_image` = frame aprobado, y el prompt de la biblioteca de ganchos, con cada frase en alemán entre comillas, quién la dice, qué movimiento va con cada palabra y un bloque final de tiempos. Corto cuando el gancho es propio: 500–600 caracteres («In German she counts naturally “Eins, zwei, drei!” then removes the cloth… Hold the reveal for one second. No generated captions or music.»).
- Cuerpo o vídeo completo nuevo (12–14 s): un párrafo con las acciones en orden, «Then cut to…» para cada cambio de plano, un bloque fijo de encuadre («The camera stays back, at chest or eye level… No macro, no close-up, no overhead shot, no push-in and no zoom-in») y los rasgos del producto a escala de mano.

### 4.3 Cómo se traduce cada tipo de nota

| Lo que escribe Emmanuel | En la imagen | En el vídeo |
|---|---|---|
| «usa esta imagen de referencia como fondo» | La foto entra como entorno. Párrafo 4: lo que se ve en ella y dónde va el sujeto. Párrafo 5: su luz. Pinterest se apaga para esa tarjeta | «Use the supplied home… throughout all home shots» y «Use image [N] for the corresponding background environment» |
| Dos fondos («la primera para el súper, la segunda para el salón») | Solo el fondo de la toma inicial | Los dos adjuntos, cada uno con su lugar: «first supplied image for supermarket scenes including checkout… second for ALL home scenes» |
| Fondo con condición («como si hubiera un sofá frente al televisor y ella sentada allí») | «The viewer sits on a sofa opposite the TV; table immediately in front» | «Place all home shots in the supplied living room with the sofa opposite the TV» |
| Variante elegida en la tarjeta | Artículo y embalaje de esa variante adjuntos; «Replace the turquoise carton with the exact … carton in image [3]» | «the WHITE brush in every appearance», «no turquoise machine or turquoise carton» |
| Tienda («que sea Sephora», «dm», «LIDL») | Foto real de esa cadena como entorno; «authentic physical Sephora signage»; ropa de empleado; la cadena del original prohibida («no dm logo anywhere») | «All store shots are in the same replacement Sephora… No dm or Target branding» |
| Marca en un objeto («el mantel con Starbucks por EisWerk») | «Replace its Disney artwork with a physically printed green Starbucks emblem and the words STARBUCKS x EisWerk» (impreso en la tela, no un rótulo) | «Preserve the physical cloth branding» |
| «cambia las banderas de EE. UU. por las de Alemania» | «Replace hanging US flags with small German flags» | La misma frase, repetida |
| «cambia los avatares» | Una frase de identidad por persona con su número; ropa nueva para todos | «Keep the approved cast», «never the original brunette» |
| Nota de cuenta («ni ancianas ni canas, mujeres de 35–50») | «seated woman aged 35–50, natural brown chin-length bob, no grey hair» | «Every visible woman must have natural hair without grey, approximately 35 to 50 years old» |
| Cambio de concepto («alas de mariposa en vez de dragón», «cambia la raza del perro») | Sustitución con las mismas medidas y puntos de agarre; aclara en qué momento de la historia está la toma («the unsuccessful costume idea, not the electronic projection yet») | «Use the same approved border collie in EVERY shot; never change breed» y la lista de efectos del original que no deben verse |
| Público a primera vista («que cada una tenga un perro al lado», «ropa que tenga que ver con mascotas») | Elementos físicos en la escena: un perro sentado junto a cada persona, pasillo de comida de perro | «Keep the dogs and the approved cast» |
| Límite de tiempo («máximo 5 segundos hasta el destape») | — | Tiempos al final: «Three counts during 0–2.5 seconds; finish the complete German sentence by 4.5 seconds and reveal only afterwards, by 5 seconds. Hold… no more than one second» |
| Acción que debe verse («un coche acercándose») | — | «a REAL MOVING CAR visibly approaches with headlights from the background: it must advance in the scene during the run, not remain parked or appear only after the cut» |
| «replica los 3 primeros clips, adjunta el cuerpo desde el 3.º» | Solo el frame del gancho | Fuente recortado a ese tramo; «The body is added separately during editing» |
| Textos, emojis, «kommentiere…», canción | Nada | Nada: va al plan de edición. El prompt solo dice que los textos se añaden después |
| «todos los cambios que ya sabes» | Los cambios por defecto: entorno nuevo, ropa nueva, caras nuevas, producto y caja exactos, sin rótulos | Igual |

### 4.4 Diferencias con lo que hoy pide PRINCIPAL

| Tema | Sistema antiguo | PRINCIPAL hoy |
|---|---|---|
| Quién escribe el prompt de imagen | El modelo escribe 3 trozos cortos (composición, entorno, luz); el código añade 5 párrafos fijos | `analysisInstructions` pide al modelo un prompt entero de «unos 4.900 caracteres» con siete apartados (a–g) |
| Descripción de la captura | Una o dos frases y una lista corta de lo que se conserva | Enumeración exhaustiva de lo que se conserva (recorte, distancia, ángulo, postura, manos, lados, proporciones, estado) |
| Entorno | Foto real siempre, citada por número y descrita con lo que se ve | Foto `entorno` opcional; sin ella, el lugar se describe con palabras |
| Foto de realismo | Siempre, la última, «only for texture» | No se adjunta (no hay nada en `src/server/videos`) |
| Estado de la acción | Explícito y en negativo cuando hay destape: «not revealed yet», «do not lift the cloth yet» | Está como «estado de la acción» dentro de la lista de lo que se conserva |
| Ropa | Se cambia siempre, con color y prenda | Se menciona como un cambio posible |
| Cita de referencias | «image [N]» con corchetes en imagen y en vídeo | «image N» en imagen, `@ImageN` y `@Video1` en vídeo |
| Motor de la réplica | Genjutsu Motion Transfer con el reel entero como autoridad del movimiento (16 de los 18 entregados el 20/11; los otros dos, Object Swap) | Solo Seedance 2.5, con `@Video1` como estructura y sin sus personas ni lugares |
| Frame aprobado en el vídeo | Referencia de imagen («human-approved clean opening frame»), no `start_image`, en Genjutsu y Wan; `start_image` en Seedance | `start_image` o referencia contextual según el número de planos |
| Prompt de vídeo | Párrafo de frases cortas: autoridad → identidad → frame → acciones en orden → entorno → producto y su función → frases fijas | Plantilla [References]/[Summary]/[Shots]/[Keep] con tiempos por plano |
| Función física del producto | Frase propia por producto («toppings enter the aperture, never land on the motor») | No hay un apartado equivalente |
| Rótulos del original | Frase fija en todos los vídeos y pasada de limpieza cuando falla | Exclusión en [References] y en el cierre |

La plantilla de PRINCIPAL para Seedance dio dos vídeos aceptados a la primera (V10 y V11 del pedido 54), así que no hay motivo para cambiarla. Lo que falta es lo demás.

## 5. Cambios propuestos, por orden

### 1. Montar el prompt de imagen con párrafos fijos (`src/server/videos/analysis.ts` y `frame.ts`)

El modelo deja de escribir el prompt entero. Devuelve tres textos cortos y el código compone el prompt con los párrafos fijos del apartado 3.1, que ya están probados. Sustituir el punto 6 de `analysisInstructions` por:

```
6. imageScene, imageEnvironment, imageLight: las tres partes propias de la escena del prompt de la imagen inicial, en inglés. La aplicación añade después, sin cambios, los párrafos fijos de identidad, producto, luz, realismo y cierre: no los escribas.
   - imageScene (350–700 caracteres): empieza por «Image [1] supplies the exact opening composition:» y describe en una o dos frases lo que de verdad se ve en ese fotograma (quién, en qué lado, qué mano toca qué). Sigue con «Preserve» y la lista corta de lo que no cambia: altura y distancia de cámara, escala, contactos de las manos, posiciones. Después, cada cambio con «Replace … with …» o «Change …»: la variante del producto citada por su número («the exact … carton in image [3]») y nombrando la del original para que no vuelva; la ropa de cada persona con prenda y color nuevos; cada cambio pedido en las indicaciones del dueño. Termina con el estado del producto en ese instante: si en el original aún no se ve, dilo («fully covered, no product visible yet», «still closed»). No describas la cara ni el pelo del avatar.
   - imageEnvironment (250–450 caracteres): si el manifiesto trae foto de entorno, «Image [N] is the real …:» y la lista de lo que se ve en esa foto, dónde se coloca al sujeto dentro de ella y «Replace the original …» con los elementos del decorado original que desaparecen, uno a uno. Si no la trae, la lista de sustituciones «elemento original → elemento nuevo» de un lugar real del mercado del anuncio. Si el encargo pide una tienda, su rótulo físico auténtico y la cadena del original prohibida por su nombre.
   - imageLight (150–300 caracteres): de dónde viene la luz de ese lugar y qué comparten con ella manos, piel, producto y superficie, con sus sombras de contacto.
```

Los párrafos fijos (identidad, producto, cola del entorno, cola de la luz, realismo y cierre) se copian tal cual de 3.1 a una constante del código, con los números de imagen rellenados por la aplicación. Variante sin cara: «No featured human face is visible in this opening. Keep only the source anonymous hand poses and natural anatomy. Do not introduce a person from any reference.»

### 2. Foto de entorno real siempre y foto de realismo al final (`frame.ts`, biblioteca)

- Orden de adjuntos de la imagen: captura → artículo → embalaje (si se ve o se revela) → funcionamiento → entorno → avatares (el principal el último) → realismo.
- Si la tarjeta no trae foto de entorno, la aplicación la pone de una biblioteca de lugares reales por producto y mercado (casas, dm, Sephora, Action, Aldi, Lidl) antes de generar. Sin foto de entorno la imagen no se genera.
- Subir a la biblioteca la foto de realismo (`REFERENCIA_CALIDAD/realismo-emmanuel-20261003/emmanuel-2.png`) y adjuntarla siempre la última.

### 3. Texto para `reglas/imagen-nano-banana.md`

Añadir tras la regla 8 de «Reglas fijas del frame»:

```
### 9. Forma del prompt (aprendida de los encargos entregados, 22/11/2026)
El prompt tiene siete párrafos, siempre en este orden: composición y estado de apertura; identidad; producto; entorno; luz; realismo; cierre. Solo son propios de cada escena el primero, la primera mitad del entorno y las dos primeras frases de la luz: entre 700 y 1.300 caracteres. El resto es texto fijo de la aplicación.

- El primer párrafo empieza por la captura («Image [1] supplies the exact opening composition: …»), la describe en una o dos frases y dice qué se conserva con una lista corta. No es un inventario del fotograma: una descripción larga hace que el modelo pinte otra foto.
- Cada cambio se escribe como sustitución y nombra lo que había: «Replace the turquoise carton with the exact white sprinkle-pattern carton in image [3]». Una caja o un artículo nunca se describen de memoria: se adjuntan y se citan por su número.
- La ropa se cambia siempre, con prenda y color.
- Si en el original el producto está tapado, envuelto o cerrado, la imagen lo deja igual y lo dice: tela opaca, hasta dónde llega, «do not lift the cloth yet».
- El entorno es siempre una foto real adjunta, y el prompt enumera lo que se ve en ella, dónde va el sujeto y qué elementos del original desaparecen.
- Una marca pedida sobre un objeto va impresa en ese objeto («physically printed … emblem»), no como rótulo.
- Una corrección se añade al prompt aprobado con una frase al final del primer párrafo y otra en el cierre; no se reescribe el prompt.
- Si se cuela la cara del original, se declara la captura prohibida como identidad y se describen los rasgos del avatar.
```

### 4. Motores de réplica con el reel como autoridad (`clip.ts`, pantalla de lote)

Añadir los adaptadores con los IDs y parámetros del apartado 2: `hf_mult_motion_control` (por defecto en «replicar»), `hf_mult_replace_object`, `wan3_0_prime`. Todos reciben el reel completo como `video_references` y el frame aprobado como referencia de imagen. Nueva regla `reglas/video-genjutsu.md`:

```
# Vídeo con Genjutsu y Wan (réplica con el vídeo original)

El vídeo original va entero y manda en las acciones, la cámara, los cortes y la duración. El prompt no describe planos ni tiempos: dice qué se conserva y qué cambia. Un solo párrafo de frases cortas, en inglés, con las imágenes citadas como «image [N]» en el orden en que se adjuntan.

Orden del prompt:
1. «Use the entire supplied source video as the authority for actions, cuts and camera timing.»
2. Identidad: «Preserve the identity from image [N].»; en un POV sin cara, «Preserve original people or identities without adding a new person to the approved opening.»
3. «Use image [N] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting.»
4. Las acciones del vídeo original en orden, en una frase, y «Preserve every source cut and contact.»
5. Entorno: el lugar del frame aprobado en todas las tomas de ese lugar. Con varios lugares, una imagen por lugar real y la frase «Use image [N] only for this environment: <toma>». El mismo lugar del original usa el mismo lugar nuevo en todos sus cortes.
6. Producto: qué imagen es el artículo y cuál el embalaje, sus rasgos, la variante del original prohibida por su nombre y la frase de función física del producto (por dónde entran los ingredientes, qué pieza se quita, qué proyecta y sobre qué superficie).
7. Cambios pedidos en la tarjeta, cada uno como hecho visible y «in every shot».
8. Frases fijas: «Preserve exact product geometry, physical colours, components and plausible real scale in every appearance. Keep the product legible at the original hand scale without adding zooms or close-up shots.» «Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions.» «Preserve the source audio for subsequent controlled editing. No new spoken narration.»

Longitud: 1.300–1.900 caracteres en Motion Transfer y Wan 3.0 Prime; hasta 3.600 en Object Swap.

Adjuntos: con persona visible, frame aprobado, artículo, embalaje y fondos, en ese orden; en POV sin cara, artículo, embalaje, fondos y el frame aprobado el último.

Solo gancho: el vídeo original se recorta al tramo del gancho y el prompt añade «The body is added separately during editing.»

Object Swap: sustituye todos los entornos y nombra, además del objeto, el efecto que cambia y los que no deben aparecer. No quita bien los rótulos: revisar el resultado y, si quedan, hacer una segunda pasada que empieza por «TEXT REMOVAL ONLY» y cita los rótulos literales.
```

### 5. Ficha del producto: frase de función física y foto de funcionamiento

Nuevo campo por producto con la frase que el sistema antiguo repetía en cada vídeo, para pegarla tal cual:
- EisWerk: «Keep the real fill opening unobstructed: milk enters the uncovered bowl; toppings and sauce enter the aperture, never land on the motor. Preserve the side handle in every shot and functioning rotating paddle after switching on.»
- HaarZauber: «Image [N] is the sole exact HaarZauber portable styling brush reference: retain its compact handle, colour, exposed black bristles, physical branding and real hand scale. Never turn it into a full-size curling iron; use it with its cover removed.»
- FalterPfote: «Image [N] is solely its exact bilateral pink-lilac butterfly floor projection…; do not copy that reference dog. … butterfly wings projected ON THE GROUND beside the dog. Never physical wings in solution shots, floating graphics or flat pasted decals; perspective, ground texture, occlusion and light spill must move naturally with the dog.»

Y un papel de foto nuevo, «funcionamiento» (lo que el producto hace o proyecta), que se adjunta después del artículo.

### 6. Texto para `reglas/video-seedance.md`

Añadir al final de «Cómo se escribe el prompt»:

```
### Ganchos con diálogo y cuenta atrás (aprendido de los encargos entregados, 22/11/2026)
- La imagen aprobada va como primer fotograma y el prompt empieza diciendo que se conserva entera: composición, personas, local, tela y luz.
- Cada frase va literal en el idioma del anuncio, entre comillas, con quién la dice y qué movimiento coincide con cada palabra.
- Los tiempos se escriben al final, con segundos: cuándo cae cada palabra, cuándo termina la frase, cuándo empieza el destape y cuánto se sostiene («hold at most one second»). Un límite pedido en la tarjeta («máximo 5 segundos hasta el destape») se convierte en esos segundos.
- La tela: «three tiny pulses only in the top fabric, never lifting the bottom hem»; el producto no asoma en ningún fotograma.
- «No added music.»

### Notas del dueño
Cada indicación se convierte en un hecho que se puede comprobar mirando el vídeo: «a real moving car visibly approaches with headlights; it must advance during the run, not remain parked». Lo que el dueño pide para los textos, los emojis, el cierre o la canción no entra en el prompt: va al montaje.
```

### 7. Tabla de traducción de notas en `OWNER_NOTES` (`analysis.ts`)

Añadir a la sección de indicaciones del dueño el contenido del apartado 4.3 como guía: fondo subido, dos fondos, tienda, marca sobre un objeto, banderas, avatares, nota de cuenta, cambio de concepto, público a primera vista, límite de tiempo, acción que debe verse, y que las indicaciones de edición no entran en los prompts. «Todos los cambios que ya sabes» significa: entorno nuevo, ropa nueva, caras nuevas, producto y caja exactos y sin rótulos.

## 6. Pendiente

- Leer los manifiestos de entrega de los pedidos `…-46`, `…-11` y `…-31/-34` para confirmar qué más se entregó.
- Ver los 18 vídeos del 20/11 junto a sus prompts: este estudio compara textos, no imágenes.
- Los cuatro casos de «Adaptación de concepto» del pedido `app-2bab6ff1…-52` (FableSeat, con notas largas) no se han leído; son el mejor material para esa regla.
- El adaptador de `hf_mult_motion_control_flash` y `wan3_0` necesita un recibo real o la ficha del modelo antes de fijar parámetros.
