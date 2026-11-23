Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/frame_realism.py (constantes y build()), más las plantillas de los guiones de pedido que se indican

# Párrafos fijos del prompt de imagen (Nano Banana 2.1)

Copia literal de las constantes y del texto que compone `frame_realism.build()`. Versión `20261003-emmanuel-8`, política de luz `20261030-environment-light-primary-v2`, roles `20261005-explicit-reference-roles`.

## Regla de composición

El prompt fuente tiene EXACTAMENTE ocho párrafos separados por una línea en blanco. `build()` conserva los párrafos 1, 2, 3, 7 y 8 tal como los escribió el agente y sustituye el 4 (entorno), el 5 (luz) y el 6 (realismo). `validate_prepared()` rechaza el envío si 1, 2, 3, 7 u 8 cambiaron, si falta la política de luz en el 5, o si la asignación de identidad/estilo no coincide con el índice real del adjunto.

## Párrafo 4 = entorno propio + frase fija de público (NICHE_DIRECTION)

```
Make the intended audience recognizable on first sight, without sound or captions. Use one prominent, physically plausible visual cue belonging to this product's audience in the described setting. Keep the action, hand positions and reveal timing intact.
```
## Párrafo 5 = luz propia + política de luz (LIGHTING_POLICY, v2)

```
When a room, space or environment reference is supplied, its observed lighting is the primary authority for the entire scene, overriding conflicting lighting in composition, avatar, product or style references and generic lighting recipes. Match its light direction, sources, colour temperature, intensity, contrast, exposure and falloff across the person, skin, clothing, hands, product and packaging. Re-light inserted elements to that environment, including cast and contact shadows, occlusion, reflections and colour bounce; match perspective, scale, depth, sharpness and image texture. Preserve real differences between illuminated and shaded areas: coherent integration does not mean flat or evenly filled lighting. No pasted cutouts, halos, floating objects, isolated portrait lighting or independent exposure. If no environment reference is supplied, retain the scene-specific lighting described above.
```
## Párrafo 6 = realismo (N = índice real de la foto de realismo, siempre el último adjunto)

Tal como lo deja `build()` con N=6 (se conservan los dobles espacios del original):

```
Image 6 is realism reference only for texture. The scene-specific light in the previous paragraph controls all lighting; do not import the style photograph lighting or setting.  If an environment reference is supplied, this style reference supplies texture only and must not override that environment lighting.  Everyday phone-video softness varies with subject distance, light and movement; do not give skin, fabric and background identical fine detail. Do not copy its person, pose, face, clothing, product, logos or overlays. IDENTITY SOURCE PRIORITY: only the explicitly selected avatar references define each person. Ignore every face in realism/style references: never borrow or blend their facial geometry, eyes, nose, mouth, jaw, age, hair or likeness. Apply photographic texture to the selected avatar without replacing or averaging that identity. Composition and background references also provide no identity unless explicitly assigned as an avatar. Preserve the identity and action already specified. No artificial HDR or cosmetic skin smoothing.
```
## Comprobación que se guarda con el frame (NICHE_CHECK, criterio de revisión)

```
Identificar el público de la cuenta y la señal concreta que se ve al primer vistazo sin audio ni texto. Comprobar tamaño, visibilidad, coherencia con el lugar y que no anticipe el destape.
```
## Perfiles de las fotos de realismo (PROFILES; posiciones positivas 1, 2, 3, 4 y 6 del catálogo `REFERENCIA_CALIDAD/realismo-emmanuel-20261003/catalog.json`)

```
1: Exposure follows side-window daylight: direct highlights and a shaded side coexist; retain the darker ceiling and shadow detail at its natural level.
2: Practical overhead lamps form local pools of light; shelves and deeper aisles remain less exposed. Packaging colours belong to the real department.
3: Restrained low-light phone capture: quieter shadows carry less fine detail than the lit face. Do not add heavy noise or make necessary action illegible.
4: Directional sunlight makes visible contact shadows and differences between lit and sheltered surfaces; colour and detail follow that light.
6: Local practical lights illuminate nearby surfaces and fall off with distance; corners keep their natural shadows instead of being brightened evenly.
```
## Párrafos 2, 3, 7 y 8 que escribía el guion del pedido (plantilla más reciente, pedido 54 del 21/11/2026)

Origen: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/order6852_frame_preparation.py`, líneas 123–125 (literal, Python). El orden de adjuntos lo fija la línea «composition, extras, supporting portraits, primary, realism».

```
 identity=('Identity assignments: '+' '.join(f'The {"main subject" if sel==v["cast"][0][0] else role} is the {"man" if sel.startswith("hombre") else "woman"} in image [{next(i for i,r in enumerate(roles,1) if r["key"]==sel)}] and only that person: exact face, hair, skin tone and natural age, re-lit into this setting.' for sel,role,age in v['cast'])+' Do not blend any identity with source, environment or realism references.' if v['cast'] else 'No featured human face is visible in this opening. Keep only the source anonymous hand poses and natural anatomy. Do not introduce a person from any reference.')
 product='Image [2] is the exact selected product; '+('image [3] is its exact retail packaging. ' if v['n'] in (1,2,3,4,7,12) else '')+'Retain its geometry, markings, materials and realistic scale. Where described as concealed or later-use only, do not display it early. The composition controls hand contact and action, not the wrong source variant.'
 txt='\n\n'.join([v['opening'],identity,product,v['environment'],v['lighting'],f'Image [{len(roles)}] is realism reference only: ordinary phone texture, varied natural exposure and subtle skin detail. Never copy its person, clothing, snacks, signs or scene. The environment reference controls light.', 'One coherent casual iPhone-style photograph with broad depth of field, realistic perspective, material texture, gentle contact shadows and natural unposed anatomy. No cutout edges, waxy skin, fused fingers or artificial pore sharpening.', 'Vertical 9:16. No watermark. No text overlay. No subtitles, emojis or interface. The only lettering visible is on relevant physical package labels, fabric printing and shop signage.'])+'\n'
```
## La misma plantilla en el pedido 81 (20/11/2026, entregado)

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/prepare-openings.py` (literal, Python).

```
 # Ordered frame references: composition, extras, supporting portraits, primary, realism.
 identity=(f"The main subject is the person in image [{len(roles)-1}]. Use only this selected portrait for her facial identity; the supporting portrait immediately preceding the primary supplies the companion identity when present; the source controls the action. No identity from composition or style." if v['cast'] else "Only the source hand pose is compositional; use natural anonymous hands and no featured face in this opening.")
 txt='\n\n'.join([v['opening'],identity,"Use the exact product or package reference for geometry, materials, markings and scale. Action props and concealed products remain in their stated opening state.",v['environment'],v['lighting'],'The final image is realism reference only; it never supplies identity.',"One coherent vertical 9:16 casual phone photograph with natural perspective and contact shadows.",'No text overlays, captions, subtitles, emojis or interface. No watermark. Preserve physical product markings and shop signs.'])+'\n'
```
