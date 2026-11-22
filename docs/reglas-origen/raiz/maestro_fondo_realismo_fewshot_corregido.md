# PROMPT MAESTRO FEW-SHOT — SISTEMA DE FONDO + REALISMO
## Para alimentar automatización de generación de frames (Nano Banana)

*Objetivo: que la automatización genere frames realistas y con fondo genuinamente variado a la primera. Este documento define el sistema de cambios de fondo, iluminación coherente y realismo casero, con recetas few-shot reales que el modelo puede imitar.*

---

## PRINCIPIOS CENTRALES (aplican a todo frame)

Actualización prioritaria 01/10/2026, 18:29: consultar las cuatro referencias y
criterios de `.agents/skills/higgsfield-generate/references/emmanuel-nanobanana-realismo.md`.
Las recetas inferiores son estructura, no autorización para bloques multicolores,
piel plástica o nitidez artificial. Adaptar sus frases de luz única y nitidez a
las fuentes reales del entorno y a la textura de móvil de las referencias.

### A. El frame es UNA sola fotografía coherente, no un collage
El error más común y más delator es que el resultado parece un "edit de Canva" — elementos pegados con luces distintas. Para evitarlo:
- Describir el espacio como un lugar real y coherente, no como una lista fragmentada de "reemplaza X, reemplaza Y".
- Fuentes de luz prácticas y coherentes con el lugar; se permite mezcla natural de ventana, techo y decoración, con temperaturas distintas justificadas.
- Sombras de contacto reales y consistentes con esas fuentes y posiciones.
- Grano/ruido natural de sensor de cámara de móvil (especialmente en poca luz).

### B. Cambio de fondo OBLIGATORIO con checklist de verificación
Para próximos supermercados/tiendas, aplicar `.cursor/rules/supermercados-color-realista.mdc`:
variedad real de colores en envases, productos y cartelería, sin convertir todos
los fondos en gris/beige; conservar realismo y colores exactos de los assets.
Nano Banana ignora los cambios de fondo si se piden de forma vaga. Solución probada:
- Lista concreta y nombrada de elementos a cambiar (nunca "cambia el fondo sutilmente").
- Bloque de verificación explícita: *"before rendering, confirm each of these N elements is visibly and unmistakably different from image [1]"*.
- Reforzar en NEGATIVE: *"a background that matches image [1] in ANY of the elements listed above is a failed generation"*.
- Para un cambio total: *"this must read as a genuinely different location, not a redecorated version of the same one"*.

### C. Estándar de realismo iPhone (obligatorio por defecto)
- Shot on iPhone 17 Pro Max main camera, 1x.
- Colores naturales: en supermercados/tiendas, variedad viva de envases y cartelería sin desaturación forzada ni sobresaturación artificial (orden 01/10/2026).
- Piel con poros, líneas finas e irregularidad tonal — nunca lisa/plástica/beauty-filter.
- Profundidad de campo moderada — nunca bokeh fuerte tipo lente profesional.
- Detalle natural de móvil, con suavidad y compresión leves cuando correspondan; no ultranitidez uniforme ni textura plástica.
- Balance de blancos y exposición propios del entorno; no homogeneizar artificialmente luces cálidas y ambiente frío.
- Encuadre ligeramente inclinado, composición casual de foto de móvil, no un shoot profesional.

### D. Coherencia de identidad del sujeto (cuando hay avatar)
- El rostro/piel/pelo salen EXCLUSIVAMENTE de la imagen de avatar, nunca de la persona de la referencia.
- La referencia se usa solo para pose/encuadre/distancia, descrita de forma anatómica/funcional.
- Reforzar en NEGATIVE: no mezclar rasgos, no derivar hacia la persona de la referencia.

### E. Preservación de producto (cuando no se sustituye)
- Bloque `PRODUCT — DO NOT CHANGE, DO NOT REDESIGN, DO NOT SUBSTITUTE`.
- Verificación pixel-a-pixel: forma, color, proporciones, material, número de elementos.
- Todo lo relativo al producto vive SOLO en ese bloque, en ninguna otra sección.

---

## ESTRUCTURA ESTÁNDAR DE UN PROMPT (orden de bloques)

1. `Reference image [1]:` — uso (pose/encuadre) + qué NO copiar.
2. `Image [2] (avatar/hand):` — fuente exclusiva de identidad.
3. `PRODUCT` — bloque DO NOT CHANGE o REPLACE (aislado).
4. `MANDATORY BACKGROUND CHANGES — CHECKLIST` — lista nombrada + verificación.
5. `LIGHTING — CHANGE` (o KEEP, según caso) — fuente única y coherente.
6. `CRITICAL` — bloque de hiperrealismo iPhone + coherencia de escena.
7. `NEGATIVE` — todo lo que delata IA/collage.
8. `Strict requirements` — sin overlays, mismo encuadre, mismo aspect ratio.

---

## RECETA 1 — Sujeto en tienda/pasillo (avatar + fondo genuinamente distinto)

```
Reference image [1]: use for EXACT composition, pose, and framing — [descripción de la pose: persona en pasillo, gesto, expresión, ropa, y el entorno de tienda de fondo]. Do NOT copy the face, hair, or identity of the person in image [1]. Do NOT copy any on-screen caption text or emoji from image [1].

Image [2] (avatar): use this exact person's face, physical appearance, hair, and skin tone exactly as shown in image [2] — wearing THEIR OWN clothing, not the reference person's clothing. Reproduce the skin exactly as shown in image [2] — natural, realistic texture with visible pores and natural tonal irregularity, no discoloration or skin condition not present in image [2]. This is the ONLY source for face, hair, and identity. Do NOT generate a different-looking person. Do NOT blend features with the person in image [1]. Body pose, gesture, head angle, expression, and camera angle must be IDENTICAL to the reference.

MANDATORY BACKGROUND CHANGES — CHECKLIST, VERIFY EACH ONE BEFORE RENDERING: the final image MUST differ from image [1] in ALL FIVE of the following ways simultaneously. Before rendering, confirm each item is visibly and unmistakably different:
1. The shelving/rack upright color is REPLACED — [color A → color B, concreto].
2. The stocked products on the shelves are REPLACED with a different mix of shapes, colors, and packaging.
3. The ceiling light fixture type is REPLACED — [tipo A → tipo B, concreto].
4. The floor tone is REPLACED — [tono A → tono B, concreto].
5. The background signage/props are REPLACED with a different design/color.

LIGHTING — CHANGE: shift the light source to fall from a slightly different angle and warmth than image [1], keeping the space bright and evenly lit. Every surface shares the same single light source, direction, and color temperature.

CRITICAL — hyperrealism and full integration (this must look like ONE real, unedited photograph, casual phone-shot realism — NOT saturated, NOT plastic, NOT commercial-looking, must look OBVIOUSLY DIFFERENT from image [1] in the background at first glance):
- The avatar's skin must match image [2] exactly: visible pores, natural tonal irregularity, no unnatural smoothing.
- Real contact shadows under the subject, consistent with the light direction.
- Natural lifelike colours; in stores preserve varied colourful packaging and signage, without forced desaturation or artificial oversaturation.
- Shot on iPhone 17 Pro Max main camera, 1x, wide depth of field — background reasonably in focus, no heavy bokeh.
- Natural contrast, mild saturation, neutral-warm white balance, highlights protected from clipping.
- Visible natural sensor grain consistent with a phone camera.
- Even algorithmic sharpness across the frame — no chromatic aberration.
- Vertical mobile photo format, candid casual phone-shot composition.

NEGATIVE / avoid completely:
- The face, hair, or identity of the person in image [1] appearing instead of image [2].
- A background that matches image [1] in ANY of the five checklist elements above — a failed generation.
- Any look of a graphic-design composition, Canva-style edit, or collage of separately-lit elements.
- Mismatched lighting or shadow direction between subject and background.
- Malformed hands, extra or missing fingers.
- Any leftover caption text, emoji, play button, or mute icon.
- No dark vignette, no dramatic studio lighting, no artificial golden-hour glow, no plastic beauty-filter skin, no 3D-render or generic-AI look.
- No change of pose, camera angle, or framing from the reference.

Strict requirements:
- No text overlays, no watermarks.
- Same composition, camera angle and framing as image [1].
- Same aspect ratio (vertical, mobile photo format) as the reference image.
```

---

## RECETA 2 — POV de manos con producto (fondo reconstruido, misma cámara)

```
Reference image [1]: use ONLY for pose, framing, and camera distance — a first-person POV shot looking down at two hands [descripción: qué sostiene cada mano, ropa visible, superficie/entorno]. Do NOT copy any skin tone, hand shape, nail color, or identity marker from the person in image [1] — treat image [1] purely as a pose/framing reference. Do NOT copy any on-screen caption text or emoji from image [1]. Do NOT copy the background from image [1] — it will be fully replaced.

HANDS AND SKIN — MANDATORY REPLACEMENT: the hands, skin tone, hand shape, finger proportions, and nail appearance must come EXCLUSIVELY from image [2] — NOT from image [1]. Only the pose (grip on the objects) is copied from image [1].

Image [2] (avatar/hand reference): use this exact person's skin tone, hand shape, hand proportions, and nail style exactly as shown in image [2].

PRODUCT — DO NOT CHANGE, DO NOT REDESIGN, DO NOT SUBSTITUTE: [descripción del producto] is ALREADY the correct, final product exactly as it should appear — same shape, color, and design. Do not modify its shape, color, material, or proportions. It stays at the exact same distance from camera and same position in frame as image [1].

CAMERA POSITION — UNCHANGED FROM IMAGE [1]: camera height, angle, and distance pixel-identical to image [1]. Only the background changes.

THE SCENE — ONE REAL, COHERENT ROOM, NOT A COLLAGE: picture a genuine [tipo de habitación y mood] photographed as it actually exists, not assembled from separate pieces. Everything sits under the exact same [tipo de luz] — no element looks lit differently from any other. The room: [descripción coherente en prosa de la habitación: paredes, muebles, fuente de luz, elementos, ropa de cama/superficie — como un espacio real, no una lista].

LIGHTING — SINGLE CONSISTENT SOURCE, MANDATORY: exactly one practical light source [descripción]. Every surface — skin, product, background — is lit by that same source at the same color temperature, with soft, naturally falling-off shadows.

CRITICAL — indistinguishable from a real unedited iPhone photo, NOT a graphic-design composition, NOT a Canva-style edit, NOT a collage:
- Hands match image [2] exactly.
- The product reproduces image [1] exactly.
- Visible natural sensor grain consistent with a phone camera in this lighting.
- Real, soft contact shadows under hands/product, consistent with the single light direction.
- Colors [warm/neutral] muted, low-contrast, slightly desaturated in shadows — the way real phone photos look.
- Background softly, naturally out of focus, not artificially blurred.

NEGATIVE / avoid completely:
- Any graphic-design composition, Canva-style edit, or collage of separately-lit elements — the single most important thing to avoid.
- Hands, skin tone, nail color/shape, or finger proportions matching image [1] instead of image [2].
- Any change to the camera distance, angle, or framing of the hands/product from image [1].
- A background that reads as "the same room with different decor" instead of a genuinely different location.
- Any change to the product's shape, color, or material.
- Perfectly clean, noise-free, airbrushed rendering; flat shadowless lighting; multiple mismatched light sources.
- Malformed hands, extra or missing fingers.
- No 3D-render or generic-AI look.

Strict requirements:
- No text overlays, no watermarks.
- Same pose, camera angle, distance, and framing as image [1]; hands from image [2]; fully reconstructed coherent room as described.
- Same aspect ratio (vertical, mobile photo format) as the reference image.
```

---

## RECETA 3 — Solo cambio de fondo, sujeto/producto intactos

```
Reference image [1]: use as the exact base for this edit. Preserve EXACTLY as shown: [sujeto, producto, manos, superficie principal — todo lo que NO cambia]. NONE of these elements change in any way — not their shape, color, position relative to each other, or texture.

[SUJETO/PRODUCTO] — DO NOT CHANGE, ZERO TOLERANCE: reproduce pixel-for-pixel identical to image [1]. Do not redesign, resize, recolor, or reposition.

MANDATORY BACKGROUND CHANGES — CHECKLIST, VERIFY EACH ONE BEFORE RENDERING: the final image MUST differ from image [1] in ALL [N] of the following ways simultaneously:
1. [elemento A → B concreto]
2. [elemento A → B concreto]
3. [elemento A → B concreto]
4. [elemento A → B concreto]
5. [elemento A → B concreto]

LIGHTING — CHANGE: shift the light source to fall from a different angle and warmth than image [1]. The subject and product remain exactly as shown, just lit differently and consistently under the new single light direction.

CRITICAL — hyperrealism (this must look like ONE real, unedited photograph — NOT a Canva-style edit, NOT a collage):
- The subject/product is an exact match to image [1] — verified before finalizing.
- The new lighting is applied consistently across everything — no mismatched shadows.
- Visible natural sensor grain consistent with a phone camera.
- Real contact shadows consistent with the new single light direction.
- Colors muted and natural, not vivid or oversaturated.
- Shot on iPhone 17 Pro Max main camera, 1x, even algorithmic sharpness, no chromatic aberration.

NEGATIVE / avoid completely:
- ANY change to the subject/product's shape, color, or design.
- A background that matches image [1] in ANY checklist element above.
- Any graphic-design composition, Canva-style edit, or collage look.
- Mismatched or inconsistent lighting across parts of the image.
- Any text, caption, watermark, or overlay.
- No dark vignette, no 3D-render or generic-AI look.

Strict requirements:
- No text overlays, no watermarks.
- Same composition, camera angle, and framing as image [1].
- Same aspect ratio as the reference image.
```

---

## RECETA 4 — Fondo cozy nocturno coherente (mood fijo, decoración variable)

```
SETTING — MANDATORY, NON-NEGOTIABLE FIXED REQUIREMENT: the scene stays a warm, dim, NIGHTTIME "relaxing at home" atmosphere — low ambient warm lighting (no bright daylight anywhere), soft surfaces, an intimate, relaxed, sleepy mood. This mood must NEVER be lost or replaced with anything bright, daytime, sterile, or landscape-like.

THE SCENE — ONE REAL, COHERENT ROOM, NOT A COLLAGE: picture a genuine cozy room at night, photographed as it actually exists. Everything sits under the exact same warm, dim lamp light. The room: [descripción coherente en prosa: paredes en tono cálido, mueble bajo, una única lámpara cálida como fuente de luz, objetos simples, textura de manta/sofá — como un espacio real].

BUILD A GENUINELY DIFFERENT ROOM, NOT A REDECORATED VERSION: confirm every element below is present and clearly different from image [1] while staying dim and warm:
- [pared: color cálido concreto]
- [fuente de luz cálida única, posición concreta]
- [mueble bajo con 1-2 objetos simples]
- [textura de manta/superficie, tono neutro claro para contraste con el producto]
- [pantalla/TV con glow tenue de escena interior genérica, si aplica]

LIGHTING — SINGLE CONSISTENT WARM SOURCE: one practical warm light source (roughly 2700-3000K), soft, gradually falling-off shadows exactly as real lamplight behaves. Do not light the subject with one setup and the room with another.

CRITICAL — indistinguishable from a real unedited low-light iPhone photo:
- Visible natural sensor grain consistent with a phone camera in low light.
- Real soft contact shadows, single light direction.
- Warm, muted, low-contrast colors, slightly desaturated in shadows.
- The product/subject reads clearly against the lighter surface (deliberate but natural bedding/surface choice).

NEGATIVE:
- Any Canva-style edit / collage of separately-lit elements — most important to avoid.
- Any bright, daytime, outdoor, or landscape content or lighting.
- Cold, sterile, or clinical lighting.
- Flat shadowless lighting or multiple mismatched sources.
- The product blending into the background from insufficient contrast.
- No 3D-render or generic-AI look.
```

---

---

*Fin del documento. Rellenar los corchetes [ ] con los detalles concretos de cada frame antes de alimentar la automatización.*
