Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/genjutsu.py, /Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/production_common.py, /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/order6852_motion.py, /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/order6852_object.py

# Plantillas del prompt de vídeo: Genjutsu Motion Transfer y Object Swap

## 1. Compilador estándar del motor (`genjutsu.prompt_estandar`, versión `genjutsu-edicion-directa-20260912`)

```
def prompt_estandar(task):
    if modelo(task) in ('wan3_0','wan3_0_prime'):return video_edit_policy.short_wan_prompt(task)
    """Compile editing instructions; no Memories, scene rewrite or model call."""
    no_avatar=task.get('avatar_selector')=='sin avatar'
    text=['Edit the source video; it is the exact authority for actions, timing, camera distance, movements, cuts and duration.']
    if no_avatar:
        text.append('Preserve the original people, identities and faces. No identity reference is supplied.')
    else:
        text.append('Replace the main person with the person in image [1], using that portrait only for identity; preserve the original action and camera framing.')
    offset=1 if no_avatar else 2
    roles=task.get('en_pantalla') or []
    if not isinstance(roles,list):raise ValueError('Declarar qué producto o embalaje se ve')
    for n,role in enumerate(roles,offset):
        paper=str(role).split(':')[0]
        label={'embalaje':'closed retail packaging', 'articulo':'unboxed physical product',
               'articulo_en_mano':'physical product held in a hand'}.get(paper)
        if not label:raise ValueError('Referencia visible desconocida')
        text.append(f'Replace every visible instance of the {label} with image [{n}], preserving realistic size relative to the hands and surroundings.')
    text.extend(task.get('cambios_fondo') or [])
    if modelo(task)=='hf_mult_replace_object':
        text.append('MANDATORY OBJECT SWAP: completely erase ALL original editorial text, subtitles, titles, calls to action and their emojis in EVERY shot; reconstruct the background cleanly, without covering old text with new text. Do not erase physical product markings or the visible product function/light projection. Add no replacement text; localized captions are added only in post-production.')
        text.append('Replace EVERY original environment throughout the entire source sequence. Use one distinct new reference environment for each distinct original location. Shots occurring in the same original location must share the same replacement environment consistently; different original locations must use different new environments. For example, five shots with original locations A/A/B/C/D require four new backgrounds. No original background may remain. Follow the shot-to-environment reference mapping and preserve the action and spatial logic, including refrigerators where the product is taken from a refrigerator.')
    text.append('Change the visible clothing and textile colors and textures. Keep the same type of location and all existing Christmas decoration, but redesign its style. Keep physical store logos and signs.')
    text.append('Natural phone-video textures, neutral light and contact shadows. No text overlays, captions, emojis or interface. Do not add zoom, crop, extra scenes or a product reveal earlier than in the source.')
    language={'GELATOVIVO':'Italian','TARGETALARM':'English'}.get(str(task.get('cuenta')).upper(),'German')
    text.append(f'If the source contains speech, preserve its meaning and speaker turns in natural native {language}, synchronized to the existing dialogue. Do not invent additional dialogue. Preserve other source sounds.')
    if str(task.get('cuenta')).upper()=='RENTIERGLANZ':
        text.append('Each reindeer is approximately 10 cm high and 9 cm wide, not a large wall sculpture.')
    return ' '.join(text)
```
## 2. Plantilla real de los pedidos entregados (pedido 81, 20/11/2026)

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/production_common.py`, función `genjutsu()` (líneas literales). `actions`, `changes`, `product_prompt` y `extra_prompt` son las frases propias de cada vídeo.

```
 fragment=f'Use image [{opening_index}] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting. The source video controls the complete action, camera movement, cuts and timing.'
 identity='Preserve exact product geometry, physical colours, components and plausible real scale in every appearance.';clarity='Keep the product legible at the original hand scale without adding zooms or close-up shots.'
 t['motion_product_guard']=dict(version='2026-09-21-motion-product',identidad_producto=identity,claridad_producto=clarity,referencias_producto=[v['media_id'] for v in t['asset_uploads'].values()])
 text='Use the entire supplied source video as the authority for actions, cuts and camera timing. '+('Preserve the identity from image [1]. ' if not t['sin_avatar'] else 'Preserve original people or identities without adding a new person to the approved opening. ')+fragment+' '+' '.join(actions)+' '+' '.join(changes)+' '+product_prompt+' '+identity+' '+clarity+' '+extra_prompt+' Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions.'
```
## 3. Frases propias y fijas del pedido 54 (21/11/2026), Motion Transfer

Origen: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/order6852_motion.py` (cadenas literales, por línea).

- (l. 23) Use image [1] as the human-approved clean opening frame, preserving its client, stylist, clothing, camera perspective and lighting.
- (l. 25) Keep every original cut and its timing: lifting and brushing crown sections, curling side sections and the final styled-hair reveal. Preserve the stylist finger contacts, brush trajectory and client head turns.
- (l. 26) Throughout all shots keep the approved client identity and grey bob from image [1]. Replace the complete original environment with the same working salon established in image [1], including mirrors, wood stations, black seating, grey flooring and neutral ceiling lights. Keep consistent geography across close-ups.
- (l. 28) Preserve the approved standing female stylist identity and navy blouse in all visible shots, not the source stylist face.
- (l. 29) Image [2] is the sole exact HaarZauber portable styling brush reference: retain its compact handle, colour, exposed black bristles, physical branding and real hand scale. Never turn it into a full-size curling iron; use it with its cover removed.
- (l. 33)  All hands, hair and brush share practical salon lighting with coherent contact shadows and natural phone detail. Completely remove all source captions, emojis, subtitles and overlays throughout, reconstructing the underlying scene. Retain physical product branding. No text overlays, no captions. Preserve complete generated audio; German texts are added in editing.
- (l. 33) Preserve the identity from image [1]. Use the complete source video for all actions, camera movement, cut positions and duration. 
- (l. 34) Review actual generated action and product against source, then approved-frame Topaz 1080p and final edit verification.
- (l. 35) Visual contact sheets observed; no direct listening claimed at preparation. Actual audio requires final review.
- (l. 41) Use image [3] as the exact human-approved clean opening frame, preserving its hand placement, camera angle, lighting and scene.
- (l. 43) Preserve every original cut and timing: open carton and lift out the ice cream maker; pour milk into bowl, fit lid, switch on churning, add colourful sprinkles and chocolate sauce through the fill opening, lift lid, lift a spoonful and show the serving bowl.
- (l. 43) Preserve every original cut and timing: take the carton from the shop shelf and lower it toward the cart; cut to pouring milk into the bowl, fit the lid, switch on churning, add sliced strawberries and chocolate sauce through the fill opening, then scoop finished ice cream.
- (l. 44) For every later home take replace the original room with a coherent Christmas living room with grey seating, white walls, a wooden TV cabinet and garland with red bows; preserve lap-level POV and blanket support.
- (l. 44) Use neutral store ceiling light in the aisle and soft warm domestic practical light in the living room; coherent shadows and scale.
- (l. 45)  EisWerk ice cream maker with large side handle, matching motor and clear dome. Preserve its geometry and small appliance scale through every use. Image [2] supplies its exact closed retail carton and printed packaging; no turquoise machine or turquoise carton.
- (l. 47)  Keep the real fill opening unobstructed: milk enters the uncovered bowl; toppings and sauce enter the aperture, never land on the motor. Preserve the side handle in every shot and functioning rotating paddle after switching on. Remove every source caption, emoji and overlay throughout. No text overlays, no captions. Preserve complete generated audio for final editing.
- (l. 47) Preserve original people and identities without adding a face to the POV shots. Use the entire source video as the authority for all actions, camera movements, cuts and duration. 
- (l. 54) Preserve all three consecutive shop handovers from the exact 3.2-second source segment: the clerk hands out cartons as customers collect them; keep every cut, hand contact, camera position and timing. No printer demonstration or home scene.
- (l. 55) Preserve practical shop light and coherent hand/carton contact; later customers retain their original actions and positions but have distinct new faces and clothes, without duplicating the main woman or source identities.
- (l. 55) Replace every source purple printer carton and held box with slender tall white HaarZauber retail cartons from image [2], including every box in the display.
- (l. 56) Image [2] defines the sole exact HaarZauber retail carton: white slender upright box, burgundy-and-gold hair artwork, mini styling brush image and HaarZauber lettering. Image [3] defines only the exact compact pink portable styling brush printed on the packaging; the actual brush stays completely hidden inside its closed carton throughout. No Bildglück lettering, printer illustrations or purple cube boxes.
- (l. 58)  Completely remove original captions, emojis and subtitles throughout. No text overlays, no captions. Preserve natural scene sound; selected music and German captions are added later.
- (l. 58) Preserve the identity from image [1]. Use the entire supplied 3.2-second shop-only source video as action and cut authority. 
- (l. 61) Observed frame95 still shop, frame96 first printer-body frame; preserve exactly0–96exclusive at30fps.
- (l. 62) Shop-source contact sheet and frame-exact interval reviewed; final actual audio still requires review.

## 4. Frases propias y fijas del pedido 54, Object Swap

Origen: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/order6852_object.py` (cadenas literales, por línea).

- (l. 47) Use image [{…}] as the human-approved clean opening frame, keeping its exact composition, people or POV hands, outfit, background and lighting. The source video controls the complete action, camera movement, cuts and timing.
- (l. 50) Technical decode/source checks, then Topaz after actual human frame approval; final real video review remains required.
- (l. 58) Exact selected hook bounds observed from consecutive source frames; the first next-scene frame is excluded, retaining the complete handover or gift action.
- (l. 59) Preserve exact product geometry, physical colours, components and plausible real scale in every appearance.
- (l. 61)  Remove source captions, subtitles, emojis and interface throughout; preserve authentic physical product print. No text overlays, no captions.
- (l. 62) Source visual samples and local ASR where recorded; no direct listening claimed at preparation. Final generated audio still requires listening/review.
- (l. 74) Keep the full original cloth action and its complete dog-and-light reveal before the cut at 3.133333 seconds; then preserve collar attachment and all subsequent dog-walking takes, original cuts and timing.
- (l. 74) Preserve failed physical-wing-costume attempt, the collar-projector solution and every ensuing walking scene, onlooker reaction and source cut. Use the same approved black-and-white border collie in EVERY shot; never change breed. Replace the failed dragon costume with pink butterfly costume wings as approved.
- (l. 74) Preserve the complete original action and all cuts. During 0–3.4 seconds the golden retriever runs toward the road while a REAL MOVING CAR visibly approaches with headlights from the background: it must advance in the scene during the run, not remain parked or appear only after the cut. Preserve safe separation without impact. Keep the approved woman identity. Then attach collar, show the separate passing taxi shot, then public walking/crowd interactions and final walk.
- (l. 78) For {…}, replace the entire original {…} with the real environment in image [{…}]. Preserve the SOURCE camera angle, subject scale and action, adapting this environment rather than copying its photographic framing. Keep practical dusk/night lighting and clear ground for the dog projection.
- (l. 79)  Keep the near foreground free of cafe tables; dog and projected light stay on unobstructed pedestrian paving.
- (l. 81) Image [{…}] is the exact small black FalterPfote collar projector, including its ribbed mount and two light outlets. Image [{…}] is solely its exact bilateral pink-lilac butterfly floor projection, with rounded upper lobes, tapered lower wings, vein lines and star dots; do not copy that reference dog. Replace every flame, feathered wing, dragon light, angel wing and leash-fire effect throughout with these butterfly wings projected ON THE GROUND beside the dog. Never physical wings in solution shots, floating graphics or flat pasted decals; perspective, ground texture, occlusion and light spill must move naturally with the dog.
- (l. 97) Natural handheld phone texture, realistic skin and fur, shared environment lighting and contact shadows. Keep surroundings naturally readable in deep phone focus. Preserve complete generated audio for editing.

## 5. Segunda pasada de eliminación de textos (Object Swap sobre el vídeo ya aprobado)

Origen: pedido `app-4b5cc5f0692f415dbacdd02be33a328c-46`, envío `v9-text-cleanup` (prompt íntegro, extraído de `~/.principal-sync/aprendizaje/vid_28c-46.txt`).

```
TEXT REMOVAL ONLY. Use the source video as the sole authority for the entire visual result, actions, motion, cuts and timing. The user approved this video's appearance. Preserve original people and identities, dog, collar projector, pink butterfly ground lights, hands, clothes, streets, lighting and camera exactly. ERASE all burned-in English overlaid captions AND their emojis in EVERY frame, including the white text with black outline near the upper centre. Remove all three blocks: Best gift for a dog mom; Comment DOG if you want one. Also erase the devil, sparkle and reaction emojis. Reconstruct the true moving background under the letters seamlessly, with no blur patch, black rectangle or replacement lettering. Output a clean video containing NO text overlays, no captions, no subtitles, no emojis. Do NOT translate or draw German text; German typography will be added in post-production. Keep authentic physical markings untouched. All image references retain their original roles; use them solely as context, preserving the source scenes. Image [8] is the previously human-approved clean opening frame, retained as a clean-text reference only. The user has now approved the source video visually: preserve its actual opening scene, hands, dog, product and lighting; remove only overlaid text. Preserve the full source audio exactly. Do not add or remove scenes, do not change duration, and do not add a new opening image. Preserve the blue retail packaging box exactly. Image [7] is the exact canonical pink butterfly projection functioning reference. Image [3] is the canonical product functioning reference. Image [4], image [5], image [6], image [7] are environment references.
```
