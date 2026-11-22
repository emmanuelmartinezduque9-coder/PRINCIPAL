# ADAPTACIONES DE PROMPT
## Proyecto Nano Banana

*Documento de patrones de adaptación. Se alimenta SOLO con adaptaciones ya validadas por Emmanuel (que dieron buen resultado). Sirve para que Claude adapte un prompt base a una escena/elemento/cuenta nueva sin preguntar, reutilizando variantes que ya funcionaron.*

*Regla de uso: cuando Emmanuel pida una adaptación parecida a una variante ya validada aquí, Claude la reproduce con ese patrón. La MECÁNICA CENTRAL de cada prompt base es intocable; solo cambian las VARIABLES ADAPTABLES.*

*Este documento se entrega para resubir junto con el prompt maestro al cambiar de chat, o cuando Emmanuel lo pida — no se edita en cada intento, solo cuando una adaptación queda validada.*

---

# 1,2,3

**MECÁNICA CENTRAL (intocable):** alguien cuenta "uno, dos, tres" (en el idioma de la cuenta) perfectamente sincronizado con un movimiento de tapar-destapar (subir y bajar) repetido 3 veces sobre algo que oculta el producto. El producto NUNCA es visible durante los 3 movimientos (ni un frame, borde, sombra o reflejo). Tras el tercer movimiento, la persona dice una frase tipo "vamos a ver cómo quedó" (en el idioma de la cuenta) y SOLO al terminar la frase completa, retira la cobertura de golpe revelando el producto/elemento. Toma continua, sin cortes, iPhone handheld con micro-shake. El elemento a revelar se embebe con <<<element_id>>>.

**VARIABLES ADAPTABLES:** nº de personas · qué cubre el producto (sábana, paño, tapa...) · escena/decorado · idioma (según cuenta) · qué se revela (caja o producto) · cámara (estática o handheld) · si la cara es visible (lip sync) o solo manos (voz en off sincronizada).

**Frases por idioma:**
- Alemán: „Eins... Zwei... Drei...“ + „Mal sehen, wie es geworden ist.“ / „Schauen wir mal wie das aussieht.“
- Italiano: «Uno... Due... Tre...» + «Vediamo come è venuto.»

---

## Variante A — TIENDA + 2 EMPLEADOS + SÁBANA (validada ✅)

Escena: almacén/tienda, dos empleados de pie, cada uno sostiene una esquina inferior de una gran sábana blanca que cubre un carrito. Cara visible → lip sync nativo. Cámara handheld. Revela: pila de cajas del producto en el carrito.

```
Use the uploaded image as the only reference. Preserve the exact composition, framing, camera angle, perspective, store environment, shelving, floor, ceiling, lighting, cart, large white sheet, and every visible background element exactly as shown. Preserve both employees exactly as they appear, including their faces, hairstyles, clothing, body proportions, poses, hand placement, and positions holding the two bottom corners of the large white sheet. Do not replace, redesign, morph, or alter any existing element.
The product boxes will be provided separately as the element "[ELEMENTO]". Do not reveal or show them until the final reveal.
IMPORTANT: Every spoken line must be in perfectly fluent native [IDIOMA] with natural pronunciation, authentic [IDIOMA] lip sync, and a native [IDIOMA] accent. No English at any point.
Create a hyper-realistic handheld iPhone video in one continuous take with subtle natural handheld camera shake.
Both employees stand exactly as shown in the reference image, each firmly holding one bottom corner of the large white sheet. The sheet completely covers the cart and everything behind it.
The employees alternate speaking while looking naturally toward the camera and occasionally at each other.
The employee on the left confidently says:
„[UNO]...“
Exactly synchronized with the word "[UNO]", both employees quickly lift the large sheet upward together a short distance and immediately lower it back to exactly its original position. The sheet must continue completely hiding everything behind it.
Next, the employee on the right says:
„[DOS]...“
Again, perfectly synchronized with the word, both employees repeat the exact same quick up-and-down movement together. After lowering the sheet, it immediately returns to its original position, completely covering everything behind it.
Then the employee on the left says:
„[TRES]...“
Once more, synchronized with the word, both employees perform the third identical up-and-down movement. After lowering the sheet for the third time, it completely covers everything exactly as before.
The product boxes must never be visible during any of these three up-and-down movements. Not even for a single frame, corner, edge, shadow, reflection, or partial glimpse.
After the third movement, while still holding the sheet fully covering everything, the employee on the right looks toward the camera and naturally says:
„[FRASE FINAL]“
Only after finishing the entire sentence do both employees simultaneously pull the large sheet completely away in one fast, smooth, coordinated motion, revealing a large stacked display of the element "[ELEMENTO]" arranged neatly on the cart. The stack should appear like an impressive retail product display, with multiple identical product boxes stacked cleanly and symmetrically.
The camera remains steady and centered on the revealed display.
Motion requirements:
Perfect native [IDIOMA] lip sync for both employees.
Accurate synchronization between each spoken number and each sheet movement.
Both employees move the sheet together with perfectly coordinated timing.
Three complete up-and-down movements with no pauses.
Realistic fabric physics, folds, tension, wrinkles, and gravity on the large sheet.
The sheet never clips through the product display.
The stack of "[ELEMENTO]" boxes remains fully concealed until the final reveal.
Stable handheld iPhone movement with subtle natural shake.
One continuous take.
No cuts, transitions, zooms, slow motion, or time jumps. <<<[ELEMENT_ID]>>>
```

Ejemplo real usado: EisWerk (alemán), elemento `eiswerk` `<<<692a2dcc-15a8-44d3-92a5-07a2104ca73b>>>`, frase final „Mal sehen, wie es geworden ist."

---

## Variante B — COCINA + 1 MANO/PERSONA + PAÑO A CUADROS (validada ✅)

Escena: encimera de cocina, solo mano y brazo visibles sosteniendo un paño a cuadros que cubre un montaje de toppings/desorden. Cara NO visible → sin lip sync, voz en off femenina sincronizada con el movimiento. Cámara estática. Revela: el producto (máquina) sobre la encimera entre los toppings.

```
Use the uploaded image as the only visual reference. Preserve the exact hand, arm, skin tone, ring, nail polish, grip on the checkered cloth, kitchen countertop, wooden shelving with mugs and plants, window, radiator, milk carton, the bowls of M&Ms, Oreo pieces, and chocolate wafer pieces, the spoon with cream residue, the marble surface, and the lighting exactly as shown. Do not alter or redesign any existing element.
The young woman holding the white-and-navy checkered cloth (only her hand and arm are visible in frame, as in the reference image) smoothly raises and lowers the cloth three times in a continuous fluid sequence while saying "[UNO], [DOS], [TRES]" naturally timed with each raise and lower. After the third lower, the cloth is back down completely, covering the messy countertop setup exactly as arranged in the reference image.
Then she says "[FRASE FINAL]" and only after finishing that sentence completely, she pulls the cloth away entirely, revealing the element "[ELEMENTO]" arranged on the marble countertop among the bowls of toppings and the spoon, exactly where the mess currently is in the reference image.
Warm friendly expression throughout (audible in her tone of voice, since her face is not in frame). Realistic [IDIOMA] lip sync is not applicable since her mouth is not visible — instead, ensure natural, spontaneous vocal delivery perfectly timed with each cloth movement and word, as if she is speaking naturally off-camera while her hand performs the action.
Static shot, camera does not move. Natural soft indoor daylight from the window, consistent with the reference image. Filmed on iPhone 17 Pro Max, handheld micro-shake, raw authentic look, vertical 9:16. 5 seconds.
AUDIO
Voice: young adult woman, native [IDIOMA], natural and warm.
Dialogue, in this exact order:
"[UNO], [DOS], [TRES]."
"[FRASE FINAL]"
Pronunciation: 100% native, natural, conversational — not robotic, not dubbed-sounding.
No words added before, between, or after the two lines beyond what's specified.
FORBIDDEN: No applause. No cheering. No morphing. No melting hand or arm. No extra limbs. No robotic movement. No warping background. No silent pauses where the voice doesn't match the cloth movement. No slow movement. No pausing between numbers. No lifting cloth before finishing the sentence. No change to the kitchen background, shelving, window, or countertop items. No change to the hand's identity, skin tone, ring, or nail polish. No male voice. <<<[ELEMENT_ID]>>>
```

Ejemplo real usado: EisWerk (alemán), elemento `eiswerk-maquina` `<<<fee7296d-41df-4e14-91a7-5d4f14c9fc28>>>`, frase final „Schauen wir mal wie das aussieht."

---

## Variante C — HABITACIÓN NAVIDEÑA + 1 PERSONA SOSTENIENDO TABLA DE MADERA + TAPA DE COCINA (validada ✅)

Escena: habitación con ambiente navideño, una persona sostiene con ambas manos una tabla/bandeja de madera con una tapa de cocina cubriendo el producto encima. Sube y baja la tapa 3 veces contando, revela la caja del producto al final. Cara puede estar visible (lip sync si lo está) + voz en off italiana sincronizada. Cámara handheld. Revela: caja del producto sobre la tabla.

```
Use the uploaded image as the only visual reference. Preserve the exact person, hand and arm, skin tone, the wooden board/tray she is holding, the kitchen lid/cover placed over it, the [DECORADO] room, [ROPA], and lighting exactly as shown. Do not alter or redesign any existing element.
The woman holds the wooden board/tray with both hands, a kitchen lid covering what is on top of it. She smoothly raises and lowers the lid (or lifts and lowers the covered board) three times in a continuous fluid sequence while saying "[UNO], [DOS], [TRES]" naturally timed with each raise and lower. After the third lower, the lid is back down completely, covering the setup exactly as arranged in the reference image. The product must never be visible during any of these three movements, not even a corner, edge, shadow, or partial glimpse.
Then she says "[FRASE FINAL]" and only after finishing that sentence completely, she lifts the kitchen lid away entirely, revealing the element "[ELEMENTO]" arranged on the wooden board, exactly where the covered setup currently is in the reference image.
Warm friendly expression throughout. Every spoken line must be in perfectly fluent native [IDIOMA] with natural pronunciation and a native [IDIOMA] accent, natural spontaneous vocal delivery perfectly timed with each lid movement and word. If her mouth is visible, authentic [IDIOMA] lip sync.
Hyper-realistic handheld iPhone video, subtle natural handheld shake, one continuous take. Natural cozy indoor lighting consistent with the reference image, neutral white balance, muted natural colors, realistic skin texture with visible pores, visible natural photographic grain. Vertical 9:16.
AUDIO
Voice: young adult woman, native [IDIOMA], natural and warm.
Dialogue, in this exact order:
"[UNO], [DOS], [TRES]."
"[FRASE FINAL]"
Pronunciation: 100% native, natural, conversational, not robotic, not dubbed-sounding. No words added before, between, or after the two lines.
FORBIDDEN: No applause. No cheering. No morphing. No melting hand or arm. No extra limbs. No robotic movement. No warping background. No silent pauses where the voice doesn't match the lid movement. No slow movement. No pausing between numbers. No lifting the lid before finishing the sentence. No early product reveal or partial glimpse of the product during the three movements. No change to the room, decoration, clothing, board, or the woman's identity/skin tone. No male voice. No cuts, transitions, zooms, slow motion, or time jumps. <<<[ELEMENT_ID]>>>
```

Ejemplo real usado: Discomagia (italiano), elemento `caja-producto-discomagia` `<<<a1a56354-2b4b-4155-9ee0-f58f785a59fa>>>`, frase final «Vediamo come è venuto.», decorado navideño, pijama navideño. Config: Seedance 2.0, 720p, 9:16, 5s. Validado ✅.

---

*Fin del documento. Alimentar solo con variantes validadas.*

---

# FRAME DESDE REFERENCIA (almacén/palet) — validado ✅

**MECÁNICA CENTRAL (intocable):** la imagen de referencia [1] es una escena AJENA (anuncio de otra marca). Se rehace como frame propio: se COPIA composición/pose/encuadre/distancia de cámara EXACTOS, se REEMPLAZA el producto por la caja/producto de la cuenta [2] en TODAS sus apariciones (mano + todo el palet, todos los niveles/columnas), se REDISEÑAN los objetos de fondo nombrados (estanterías, stock lateral, techo/luces, suelo, estilo de decoración) para que sea visiblemente distinto pero misma tienda, se QUITAN UI/overlay/marcas reales, se ajusta la luz solo en dirección (balance neutro) y se lleva a máximo realismo foto-iPhone.

**VARIABLES ADAPTABLES:** cuenta (→ caja/producto [2], idioma, mercado) · texto del cartel de precio · estilo de decoración · detalles del avatar (mantener el de la referencia salvo que se indique).

**Referencias usadas la 1ª vez (Discomagia C4 frame1):** [1] = anuncio "Vinili di Natale" (media 55952baf) · [2] = caja Discomagia (media 384f03bf).

El prompt literal validado está en el historial del proyecto; se reutiliza cambiando SOLO las variables adaptables. Idioma del cartel/señalética según cuenta (Discomagia/Gelatovivo → italiano, EisWerk → alemán).

---

# PLANTILLA OFICIAL DE PROMPT — FRAME DESDE REFERENCIA (estructura validada por Emmanuel ✅)

> Usar SIEMPRE esta estructura por secciones (no prompts flojos). Adaptar el contenido a la escena.
> Clave: para conservar algo (logo, producto), meterlo en NEGATIVE de forma explícita.

```
Reference image [1]: use for EXACT composition, pose, camera distance, and framing.
Image [2] is the PRODUCT REFERENCE — my own branded product box.   (si aplica)

CAMERA DISTANCE — MATCH EXACTLY, NON-NEGOTIABLE: same crop, distance, and proportion within frame as image [1].

REPLACE PRODUCT — MANDATORY, EVERY INSTANCE: replace every competitor box (held AND all in the stack/pallet) with MY product box from image [2] — reproduce its artwork, colors, text, logo and branding EXACTLY, crisp and fully legible. My brand name and logo MUST remain visible and intact on every unit.
   (variante "conservar tienda/logo": KEEP THE STORE AND ITS LOGO — keep the store facade sign/logo EXACTLY as image [1], do NOT remove/hide/blur/invent/restyle it.)

BACKGROUND — CHANGE DESIGN OF NAMED ELEMENTS (do NOT relocate, same location type): change racking color, side-shelf stock, ceiling lights, floor tone, decor style — visibly different from image [1] while staying the same type of store.

LIGHTING — CHANGE DIRECTION ONLY, NOT COLOR TEMPERATURE: neutral white balance, change only the angle so shadows fall differently. No warm/yellow cast.

THE SCENE — ONE REAL, COHERENT PHOTOGRAPH, NOT A COLLAGE: everything under the same single light source and color temperature, consistent shadows.

MAXIMUM REALISM (top priority):
- Skin: visible pores, natural texture and imperfections, no smoothing, no plastic/beauty-filter.
- Product box reproduces image [2] exactly, logo and brand text sharp and legible.
- Neutral white balance, muted natural colors, real contact shadows, visible sensor grain.
- Wide depth of field, background recognizable, slightly imperfect handheld framing.

NEGATIVE:
- Any competitor box design remaining anywhere.
- Any change in camera distance, crop, or framing from image [1].
- Removing, hiding, blurring or altering MY brand logo or text (o el logo de la tienda si se conserva).
- AI-looking, plastic, over-smooth, waxy or CGI appearance, especially on skin.
- Warm/yellow color cast, oversaturated colors, dark vignette, collage/Canva look.
- Malformed hands, extra or missing fingers.

Strict requirements:
- Product's own packaging, logo and brand text fully visible and legible.
- Same composition, camera angle, camera distance, and framing as image [1].
- Same aspect ratio (vertical, mobile photo format).
```
