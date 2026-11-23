Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/hook_library.py, hook_durations.json, lanzar.py, calidad_seedance.py, hook_scene_defaults.py, order6852_hooks.py y BIBLIOTECA_PROMPTS.md

# Seedance y biblioteca de ganchos validados

## Entradas de la biblioteca (`hook_library.ENTRIES`: id, título en la app, sección de BIBLIOTECA_PROMPTS.md)

```
ENTRIES=[('countdown','1,2,3 · destapar con tela','1,2,3'),
         ('coffee','Sorpresa · escupir y dejar caer el café','DEJAR CAER CAFE'),
         ('coffee_window','Dejar caer el café ante el escaparate','DEJAR CAER EL CAFE ANTE EL ESCAPARATE'),
         ('couple','Pareja · reacción ante el estante','PAREJA DESMAYO ESTANTE — ZIELALARM 20260906'),
         ('gift_delivery','Entrega de regalo','EISWERK LOTE81 V3 ENTREGA REGALO'),
         ('gift_surprise','Sorpresa al recibir regalo','NO WAY REGALO (aleman)'),
         ('need_this','Cariño, necesito esto','SCHATZ ICH BRAUCH DAS EN EL SUPERMERCADO'),
         ('checkout','Escanear caja y clienta emocionada','ESCANEAR LA CAJA EN LA CAJA REGISTRADORA'),
         ('laugh','Risa mirando a cámara','EISWERK LOTE36 RISA CAMARA KLING 3S')]
```
## Adaptación obligatoria de un frame de referencia de la biblioteca (`hook_library.frame_reference`)

```
Crear un frame NUEVO para la cuenta destino: producto y embalaje de sus assets, avatar seleccionado y público adecuado. Belleza/uñas: mujeres adultas jóvenes en lugar de ancianos del gancho, salvo indicación contraria. Adaptar fondo y luz con realismo; conservar acción, encuadre y relación espacial. No copiar textos superpuestos. No usar esta referencia como start_image ni como frame aprobado. No sustituir el avatar fijo por las personas de la referencia.
```
## Duraciones confirmadas por el dueño (`hook_durations.json`)

```
{
  "countdown": {
    "duration_seconds": 6,
    "confirmed_by": "Emmanuel",
    "user_response": "6 seg",
    "scope": "Nuevas pruebas; no modificar snapshots ni trabajos históricos"
  },
  "coffee": {"duration_seconds": 4, "confirmed_by": "Emmanuel", "user_response": "4 segundos"},
  "coffee_window": {"duration_seconds": 4, "confirmed_by": "Emmanuel", "user_response": "4 segundos"},
  "couple": {"duration_seconds": 5, "confirmed_by": "Emmanuel", "user_response": "5 segundos"},
  "gift_delivery": {"duration_seconds": 3, "confirmed_by": "Emmanuel", "user_response": "3 segundos"},
  "gift_surprise": {"duration_seconds": 4, "confirmed_by": "Emmanuel", "user_response": "4 segundos"},
  "need_this": {"duration_seconds": 3, "confirmed_by": "Emmanuel", "user_response": "3 segundos"},
  "checkout": {"duration_seconds": 3, "confirmed_by": "Emmanuel", "user_response": "3 segundos"},
  "laugh": {"duration_seconds": 3, "confirmed_by": "Emmanuel", "user_response": "3 segundos"}
}

[executed on device: MacBook-Air-de-Emmanuel.local (56c6175f-1d25-4cfe-9ec5-0a15a2fa60e6)]
```
## Frases habladas por idioma (`lanzar.HABLA`)

```
HABLA = {
    "German":  {"uno": "„Eins...“", "dos": "„Zwei...“", "tres": "„Drei...“",
                "cierre": "„Mal sehen, wie es geworden ist.“"},
    "Italian": {"uno": "«Uno...»", "dos": "«Due...»", "tres": "«Tre...»",
                "cierre": "«Vediamo come è venuto.»"},
    "English": {"uno": "“One...”", "dos": "“Two...”", "tres": "“Three...”",
                "cierre": "“Let's see how it turned out.”"},
}
```
## Comando de envío de vídeo (`lanzar.video_command`: Seedance / Kling)

```
def video_command(r, transport_frame, transport_refs):
    """One parameter compiler shared by quote and the original sender."""
    modelo, _ = MOTORES[r['motor']]
    contextual = r.get('uso_imagen') == 'referencia_contextual'
    if contextual and modelo != 'seedance_2_5':
        raise ValueError('referencia_contextual solo está implementada para Seedance 2.5')
    import submitted_video_context as SVC
    cmd=['higgsfield','generate','create',modelo,'--prompt',SVC.transport_prompt(r['prompt'],r['cuenta']),
         '--image-references' if contextual else '--start-image',transport_frame,
         '--duration',str(r['segundos']),'--aspect-ratio','9:16','--json']
    if modelo.startswith('seedance'):
        import calidad_seedance as CS
        cmd+=['--bitrate_mode','high','--resolution',CS.validar_politica(r.get('calidad_seedance'))['resolution']]
    if modelo=='seedance_2_5':cmd+=['--mode','omni_reference']
    if r.get('physical_product_source_contract'):
        import physical_product_source_details as CSD
        CSD.validate(r)
        cmd += ['--generate_audio', str(r['generate_audio']).lower()]
    if r.get('hoofholly_model_switch'):
        import hoofholly_seedance as HS
        HS.validate(r)
        cmd+=['--generate_audio','false']
    if r.get('seedance_video_reference'):
        import submitted_full_seedance as comparison
        cmd+=['--video-references',comparison.source(r)['media_id']]
    if modelo == 'kling4_0':
        cmd += ['--mode', 'image-to-video', '--resolution', r['generation_resolution']]
    if r['motor']=='kling':cmd+=['--mode','pro']
    else:
        for ref in transport_refs:cmd+=['--image-references',ref]
    return cmd
```
## Política de resolución Seedance (`calidad_seedance.politica`)

```
def politica(task):
    """Clasificación visual explícita del clip entero; nunca por cuenta o solo frame."""
    caras = task.get('caras_humanas')
    if type(caras) is not bool:
        raise ValueError('Seedance requiere caras_humanas=true/false para TODO el clip')
    motivo = task.get('criterio_caras')
    if not isinstance(motivo, str) or len(motivo.strip()) < 12:
        raise ValueError('Seedance requiere criterio_caras: evidencia visual de la clasificación')
    explicit = task.get('generation_resolution')
    if explicit not in (None, 'auto'):
        if explicit not in ('480p','720p','1080p'):raise ValueError('Resolución Seedance no válida')
        base = politica({k:v for k,v in task.items() if k != 'generation_resolution'})
        return {**base, 'version':'2026-11-04-explicit', 'base_version':base['version'], 'generation_resolution':explicit, 'resolution':explicit, 'upscale': False if explicit=='1080p' else base['upscale']}
    if task.get('motor') == 'seedance_2_0':
        return dict(version=LEGACY_VERSION, caras_humanas=caras, criterio_caras=motivo.strip(),
                    resolution='720p' if caras else '480p', upscale=not caras)
    alejadas = task.get('caras_alejadas', False)
    if type(alejadas) is not bool or (alejadas and not caras):
        raise ValueError('caras_alejadas debe ser booleano y requiere caras_humanas=true')
    return dict(version=VERSION, caras_humanas=caras, caras_alejadas=alejadas,
                criterio_caras=motivo.strip(),
                resolution='720p' if alejadas else '480p', upscale=not alejadas)
```
## Escenas por defecto de los ganchos de café y pareja (`hook_scene_defaults`: composición y movimiento)

- (l. 111) Image 1 supplies only the vertical side-profile composition: the reactor is on the right, holding iced coffee in front of the torso, mouth open and eyes turned off-screen left. Keep the broad aisle and ceiling context and the cup in the same hand. The frame shows surprise, not a sip, spill or cup drop. Remove source captions. Do not copy the source person, clothes, logos or merchandise.
- (l. 117) Image 1 supplies only the front-facing vertical two-person walking composition, side-by-side spacing, cups held in front and visible legs with store context. The reactor is on the left and the supporting companion on the right. Both remain upright: no fainting or collapse has happened in this initial frame. Do not copy source genders, faces, blue/red jackets, ski merchandise or captions.
- (l. 126) The {…} is the {…} in image {…} and only that person. Preserve that portrait identity and clothing: {…}.
- (l. 150) Start exactly from the approved frame. Preserve its people, clothes, hands, cups, environment and camera distance. 
- (l. 152) The {…} already holds the iced coffee and looks surprised to the left. Do not invent an additional sip or exchange hands. The reactor spits the sip already in the mouth to the left, releases the cup with natural liquid and cup physics, and the phone pans left to the adjacent shelf of exact {…} closed retail boxes.
- (l. 160) The two people walk side by side holding their cups. After 2–3 seconds the {…}, the reactor on the left, looks {…}, reacts with shock, then faints. The supporting companion catches the reactor with both arms before the fall reaches the floor. The phone follows the reactor gaze to the {…} and reveals exact {…} closed retail boxes on the adjacent department shelf. Keep natural weight and support mechanics.
- (l. 165)  Single continuous handheld phone shot; no slow motion, identity changes, added captions, graphic overlays or music.
- (l. 180) Nueva composición autorizada y roles por destinatario; conservar el prompt fuente histórico aparte.

## Ganchos Seedance del pedido 54 (cadenas literales de `order6852_hooks.py`)

- (l. 48) Use image [1] as the exact approved opening. Image [2] defines only the exact closed {…} retail packaging revealed at the end.
- (l. 51) The stack should appear like an impressive retail product display, with multiple identical product boxes stacked cleanly and symmetrically.
- (l. 54)  Keep all four people from image [1], including the front-left selfie presenter and rear-center man; only the two cloth holders move the cloth. Preserve the physical cloth branding and approved store.
- (l. 57) The pink cloth completely conceals only the single carton on the island, leaving the kitchen and the woman visible.
- (l. 57) as they appear, including their faces, hairstyles, clothing, body proportions, poses, hand placement, and positions
- (l. 60)  Three counts during 0–2.5 seconds; finish the complete German sentence by 4.5 seconds and reveal only afterwards, by 5 seconds. Hold the revealed closed packaging for no more than one second. No added music. 

## Prompts íntegros de los nueve ganchos de la biblioteca

Origen: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/BIBLIOTECA_PROMPTS.md` (754 KB, secciones: 241); aquí solo las nueve secciones que la app ofrece como ganchos validados, literales.


## 1,2,3

Use the uploaded image as the only reference. Preserve the exact composition, framing, camera angle, perspective, store environment, shelving, floor, ceiling, lighting, cart, large white sheet, and every visible background element exactly as shown. Preserve both employees exactly as they appear, including their faces, hairstyles, clothing, body proportions, poses, hand placement, and positions holding the two bottom corners of the large white sheet. Do not replace, redesign, morph, or alter any existing element.

The product boxes will be provided separately as the element "zielalarm". Do not reveal or show them until the final reveal.

IMPORTANT: Every spoken line must be in perfectly fluent native German with natural pronunciation, authentic German lip sync, and a native German accent. No English at any point.

Create a hyper-realistic handheld iPhone video in one continuous take with subtle natural handheld camera shake.

Both employees stand exactly as shown in the reference image, each firmly holding one bottom corner of the large white sheet. The sheet completely covers the cart and everything behind it.

The employees alternate speaking while looking naturally toward the camera and occasionally at each other.

The employee on the left confidently says:

„Eins...“

Exactly synchronized with the word "Eins", both employees quickly lift the large sheet upward together a short distance and immediately lower it back to exactly its original position. The sheet must continue completely hiding everything behind it.

Next, the employee on the right says:

„Zwei...“

Again, perfectly synchronized with the word, both employees repeat the exact same quick up-and-down movement together. After lowering the sheet, it immediately returns to its original position, completely covering everything behind it.

Then the employee on the left says:

„Drei...“

Once more, synchronized with the word, both employees perform the third identical up-and-down movement. After lowering the sheet for the third time, it completely covers everything exactly as before.

The product boxes must never be visible during any of these three up-and-down movements. Not even for a single frame, corner, edge, shadow, reflection, or partial glimpse.

After the third movement, while still holding the sheet fully covering everything, the employee on the right looks toward the camera and naturally says:

„Mal sehen, wie es geworden ist.“

Only after finishing the entire sentence do both employees simultaneously pull the large sheet completely away in one fast, smooth, coordinated motion, revealing a large stacked display of the element "zielalarm" arranged neatly on the cart. The stack should appear like an impressive retail product display, with multiple identical product boxes stacked cleanly and symmetrically.

The camera remains steady and centered on the revealed display.

Motion requirements:
- Perfect native German lip sync for both employees.
- Accurate synchronization between each spoken number and each sheet movement.
- Both employees move the sheet together with perfectly coordinated timing.
- Three complete up-and-down movements with no pauses.
- Realistic fabric physics, folds, tension, wrinkles, and gravity on the large sheet.
- The sheet never clips through the product display.
- The stack of "zielalarm" boxes remains fully concealed until the final reveal.
- Stable handheld iPhone movement with subtle natural shake.
- One continuous take.
- No cuts, transitions, zooms, slow motion, or time jumps.

Negative prompt:
No English speech, no foreign accent, no incorrect German pronunciation, no early product reveal, no partial visibility of the product boxes, no cloth clipping, no AI warping, no object flicker, no body morphing, no identity changes, no extra people, no extra fingers, no hand deformation, no lighting changes, no environment changes, no disappearing objects, no motion blur, no plastic or generic AI appearance, no changes to the store layout, no changes to the employees' appearance or clothing, no text overlays, no subtitles, no watermarks.

---



## DEJAR CAER CAFE

Use the uploaded image as the only reference. Preserve the exact identity of the man, his face, hairstyle, beard, facial features, body proportions, skin tone, military camouflage pants, olive-green t-shirt, dog tags, plastic cup with iced coffee, straw, store environment, shelves, lighting, perspective, and overall composition. Do not replace, redesign, morph, or alter any existing elements before the action begins.
Create a hyper-realistic handheld first-person smartphone video with subtle natural camera shake, realistic rolling-shutter motion, accurate autofocus breathing, and natural exposure adaptation. The scene must feel like a genuine unedited iPhone recording inside the same electronics warehouse.
The man is already walking slowly toward the camera while drinking from the iced coffee through the straw. His movement is natural, relaxed, and continuous. After taking another sip, he suddenly notices something off-screen to his right. His eyes immediately shift to the right, followed by his head turning in the same direction. His expression instantly changes from neutral to genuine surprise.
His surprise feels completely authentic. He abruptly spits the coffee out to his right while still walking, creating a realistic spray of liquid with accurate physics. Without stopping, he instinctively lets go of the plastic cup, allowing it to fall naturally onto the floor. The cup bounces realistically while a small amount of remaining coffee splashes onto the ground.
The camera operator, filming in first person, reacts instinctively to his unexpected behavior. As soon as the man spits out the coffee, the handheld camera quickly pans to the right in one smooth natural motion, as if trying to discover what caused such a strong reaction. The movement must include slight handheld shake, realistic inertia, subtle motion blur, and natural autofocus adjustment while turning.
The pan ends focused on a nearby retail shelf containing multiple identical ZielAlarm product boxes neatly displayed together. ZielAlarm is the obvious object that surprised him. The boxes occupy a prominent section of the shelf among other electronics products, appearing professionally merchandised in a believable retail display. The camera settles naturally on the shelf for a brief moment.
Maintain consistent lighting, perspective, and environment throughout the entire shot. All body motion, clothing movement, liquid physics, cup drop, autofocus behavior, and handheld camera movement must be physically accurate and free of morphing or AI artifacts.
NEGATIVE:
No cuts, no transitions, no scene changes, no teleportation, no morphing, no identity changes, no facial distortion, no extra people interacting with the subject, no exaggerated acting, no slow motion, no cinematic camera moves, no gimbal stabilization, no impossible physics, no duplicated objects, no malformed hands or fingers, no floating cup, no disappearing coffee, no changes to the store layout, no changes to the man's clothing, no text overlays, no subtitles, no logos added, no watermarks, no UI elements, no plastic AI-looking skin, no oversaturated colors.

---



## DEJAR CAER EL CAFE ANTE EL ESCAPARATE

Use the uploaded image as the starting frame. Preserve the woman, her pink puffer jacket, the shopping centre and the lit shop window exactly as they are.

Zero to one and a half seconds: her eyes go wider at what she has seen behind the glass and she gasps out loud, saying in clear native German with real shock in her voice, "Oh mein Gott!", her mouth forming the words. As she says it her grip simply gives way and the takeaway coffee cup slips out of her fingers, drops and hits the floor, bursting, coffee spreading across the tiles and the lid skidding away. She never looks down at it.

One and a half to two and a half seconds: her hand flies up to her mouth for a beat, then she throws her arm straight out and points hard at the shop window, still staring, mouth open.

Two and a half to four seconds: the camera swings smoothly to the right and travels along the shop window, following the line of her pointing arm, leaving her behind at the edge of frame until only her outstretched arm and finger are in shot. The move ends framed on the window display, where the account's hooded sweater stands on a low plinth, seen close and clear: the thick teddy fleece, the oversized hood and the large front pouch across the chest, with a second one folded beside it. It is exactly the product from the reference image, same colour, same fabric, same cut.

The whole thing is one continuous handheld phone shot with natural shake, no cut and no zoom, only that one pan. Real falling physics on the cup and the liquid, real skin texture, five fingers on both hands, the same shopping centre light throughout, faint sensor noise. Every spoken word is in fluent native German with natural lip sync. The recording stays a plain unedited phone capture with nothing added over the picture: the frame carries no caption, no subtitle, no emoji and no interface graphics.



## PAREJA DESMAYO ESTANTE — ZIELALARM 20260906
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para ZIELALARM C9 clip1.
-->
Use the uploaded reference image as the ONLY visual reference.

Create a realistic handheld POV video. Preserve the exact man, the exact woman, their faces, hairstyles, clothing, body proportions, tattoos, accessories, the warehouse store environment, aisle, shelves, lighting, camera height, walking direction and overall composition. Do not replace or redesign any existing character or environment.

The product "zielalarm" is a separate element that will appear only at the end on the shelf.

Scene:

The video starts exactly where the image leaves off. The handheld camera walks naturally in front of the couple with slight realistic handheld movement and subtle vertical bounce, as if recorded with a smartphone while walking backwards.

The man calmly drinks from his can while walking beside the woman. The woman continues walking normally beside him.

After about 2-3 seconds, the man suddenly turns his head to the RIGHT as if something caught his attention on one of the warehouse shelves. His facial expression instantly changes from neutral to extreme shock and excitement. His eyes open wide, he freezes for a brief moment, then completely loses consciousness.

His body goes limp and he falls sideways/backwards naturally. Before he hits the floor, the woman reacts immediately, grabs him with both arms and struggles to keep him from falling. Her expression becomes surprised and concerned while trying to support his weight.

The exact moment the man faints, the camera operator quickly reacts. The handheld camera rapidly pans and turns to the RIGHT following the man's line of sight.

The camera finishes pointing directly at the warehouse shelving on the right side.

Reveal:

The shelves are filled with multiple authentic white, black and yellow "zielalarm" retail boxes matching the supplied packaging reference exactly, neatly stacked across several shelf levels. There should be many visible boxes, creating the impression of a fully stocked display. The boxes are the obvious reason for the man's exaggerated reaction.

The camera settles on the shelves for the final seconds with a slight handheld sway while remaining focused on the many "zielalarm" boxes.

Style:

- Natural physics
- Realistic body movement
- Authentic handheld smartphone footage
- Smooth walking motion
- Natural lighting
- No slow motion
- No cuts
- Single continuous shot
- Maintain perfect identity consistency throughout <<<879c6667-44e0-4ae3-a9d0-db23ef6b6bc1>>>





## EISWERK LOTE81 V3 ENTREGA REGALO
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para EISWERK C46 clip1.
-->
Start exactly from the approved image: a seated recipient under a beige blanket, the bearded man in the black plaid shirt leaning in from the upper right, holding the closed mint-variant EisWerk retail box while the recipient reaches for it. In one continuous handheld POV take, he passes the box into the recipient’s hands, releases it, and the recipient draws it slightly closer and tilts the front upright to look at it. Keep the closed box intact with the mint ice-cream maker printed on its front exactly as in the approved frame. Do not open it or show the bare article in this clip. Preserve both people, hands, blanket, room and Christmas decorations from the approved image.

Keep the approved starting camera height, distance and subject scale, with the same visible floor or blanket and room margins. Preserve ordinary handheld phone motion without zoom or a new camera angle.

Natural readable room light, neutral colours, ordinary skin and fabric texture, plausible hand contact and object weight. Natural room ambience and paper or fabric handling only, without spoken dialogue or music. No captions, subtitles, emojis, added signatures or interface graphics.

Keep the approved starting camera height, distance and subject scale, with the same visible floor or blanket and room margins. Preserve ordinary handheld phone motion without zoom or a new camera angle.




## NO WAY REGALO (aleman)
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para EISWERK C8 clip1.
-->
Use the uploaded image as the exact first frame. Preserve the composition, framing, camera angle, the two people, their clothing, the open cardboard box on her lap, the EisWerk retail box standing inside it, the lit Christmas tree, the lamp and the whole room exactly as shown. Do not replace, redesign or alter any existing element.

Create a hyper-realistic handheld iPhone video in one continuous take with subtle natural handheld camera shake, shot with the phone's flash lighting the two people from the front.

The woman keeps her eyes DOWN on the EisWerk retail box inside the open cardboard box the whole time, her face lighting up with genuine, unguarded delight at the gift. She NEVER looks at the camera, never lifts her head towards it, never addresses it — this is a private, real moment of happiness about the present, not a piece to camera. Still looking at the box and smiling, she says out loud:
„Auf keinen Fall!“

IMPORTANT: the spoken line must be in perfectly fluent native German with natural pronunciation, authentic German lip sync and a native German accent. No other words are spoken.

The man behind her reacts by laughing and leaning slightly closer to look at the box with her. Both keep their existing clothing and positions. The retail box stays in place, front facing camera, its artwork and logo clearly legible throughout.

No on-screen text, no captions, no emoji, no watermark, no interface of any kind.




## SCHATZ ICH BRAUCH DAS EN EL SUPERMERCADO
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para EISWERK C12 clip1.
-->
Use the uploaded image as the starting frame. Preserve the exact composition, framing, the wide supermarket walkway, the shelving, the Christmas decorations and the light. The camera never moves: no cut, no zoom, no pan, no turn, the framing at the end is identical to the framing at the start. Over four seconds the woman keeps walking forward and keeps staring off to her right at whatever has caught her eye, never turning her face to the camera and never turning to look at the man. Still staring, she reaches across with her near hand and grabs the man's forearm, tugging at it, and says out loud in German, with real excitement in her voice, «Schatz, ich brauch das!», her mouth forming the words clearly. Her eyebrows stay high and her mouth open in genuine delighted surprise. The man beside her looks up from his phone at her, mildly startled, and keeps walking. Their steps stay natural, the shopping basket swings a little, the flat overhead shop light stays the same, faint phone sensor noise throughout, and no text, caption, emoji or graphic of any kind appears on screen at any moment.




## ESCANEAR LA CAJA EN LA CAJA REGISTRADORA
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para EISWERK C14 clip1.
-->
Use the uploaded image as the starting frame. Preserve the exact composition, framing, camera height and angle, the checkout, the conveyor, the shop behind, the customer and the light. The phone never moves: no cut, no zoom, no pan. Over five seconds the worker's hand in the lower right, the one holding the black handheld barcode scanner, reaches forward and passes the scanner across the barcode on the side of the box the customer is holding, tilting it slightly to line it up. Then that same hand takes hold of the box, the customer letting go of it easily, and draws it down and toward the camera to set it on the conveyor belt to be rung up. Throughout, the customer stays visibly delighted: she keeps smiling widely, her eyes following the box, and she gives a small excited shift of her shoulders. She is the customer, not an employee. The box is the element <<<d9cc80aa-4f3e-41c0-b45f-6c13a50145fe>>>, keeping its real proportions, artwork, colours and German lettering from beginning to end, with no redesign. Real hands with five fingers, real weight as the box changes hands, the same flat overhead shop light throughout, faint phone sensor noise, and no text, caption, subtitle or graphic of any kind appears on screen at any moment.




## EISWERK LOTE36 RISA CAMARA KLING 3S
<!-- NOTAS (nunca se envian al motor)
Creado por lanzar.py para EISWERK C58 clip1.
-->
Use the provided start image as the exact first frame. Preserve the woman exactly as shown, including face, hair, clothing, body, pose, hand over her mouth, background and lighting. Create an ordinary handheld iPhone video in one continuous take with subtle natural shake. The woman continues laughing naturally with her hand over her mouth, then turns her gaze toward the phone camera while still laughing. Preserve her hand, sweater and the original selfie distance throughout this small head and eye movement. Natural laughter and shop ambience only, no intelligible speech or music. Maintain natural skin pores, photographic grain, coherent contact shadows and realistic hand anatomy. Vertical 9:16.

Keep the starting selfie perspective and subject scale fixed, with the sweater, raised hand and warehouse shelves visible. Only subtle handheld phone movement and her natural head and eye turn; no zoom, approach or cuts.
