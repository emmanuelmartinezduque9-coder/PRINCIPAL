# 🎬 acciones.md — biblioteca viva de clips simples (crece con el uso)

> Bloques de **acción simple** validados para la skill `nano-video`.
> Cada bloque = una acción de una sola toma que, dada un frame + motor + segundos, produce un buen clip.
> **Cómo crece:** cuando Emmanuel valida un clip nuevo ("este vídeo está bien"), se añade aquí un bloque
> con el formato de abajo. Solo se guardan acciones VALIDADAS (que dieron buen resultado).
>
> Los prompts LARGOS escena-por-escena (recetas, DISCO NEVERA, 1,2,3) NO van aquí — viven literales en `BIBLIOTECA_PROMPTS.md`.

## Formato de cada bloque
```
## NOMBRE_CORTO   (alias que Emmanuel puede decir)
- que_hace: <1 frase>
- lleva_voz: si/no  (+ frase base por idioma si aplica)
- motor_tipico: kling|seedance · duracion tipica
- variables: <qué cambia por cuenta/escena>
- expansion: <el texto de acción que va en la PLANTILLA DE EXPANSIÓN del SKILL.md,
             o "literal en BIBLIOTECA_PROMPTS.md › NOMBRE" si ya existe allí>
- validado_en: <cuenta/concepto donde funcionó>
```

---

## DEJAR CAER CAFE
- que_hace: se deja caer café/topping sobre algo y (según variante) se revela el producto de la cuenta.
- lleva_voz: no (o voz en off corta según variante)
- motor_tipico: seedance · ~4s
- variables: qué se deja caer · producto que se revela · idioma
- expansion: **literal en `BIBLIOTECA_PROMPTS.md` › DEJAR CAER CAFE** (es una ACCIÓN ya validada; copiar literal, solo adaptar producto/idioma/reveal).
- validado_en: Discomagia C2 clip1 (job 88e9ba8a) · EisWerk C2 clip1 (job f98d0947)

## SACAR DE CAJA
- que_hace: una mano saca el producto de la caja de la cuenta y lo deja a la vista.
- lleva_voz: no
- motor_tipico: kling · 3-5s
- variables: producto/caja de la cuenta · mano (avatar) · superficie
- expansion: "A hand enters and pulls the [PRODUCTO DE LA CUENTA] out of its [CAJA DE LA CUENTA] in one smooth motion, setting it in view; the box stays recognizable." (usar dentro de la PLANTILLA DE EXPANSIÓN)
- validado_en: EisWerk C2 clip2 (frame 0b21cccf, job 5fee97d4)

## POV ACERCARSE
- que_hace: cámara en primera persona que camina/avanza acercándose a un objetivo (estante/supermercado/producto).
- lleva_voz: no
- motor_tipico: kling · 3s
- variables: hacia qué se avanza · entorno · idioma de señalética
- expansion: "First-person POV walking forward, approaching [OBJETIVO], natural walking bob in the handheld camera, the target getting closer and centered by the end."
- validado_en: Gelatovivo C3 clip1 (frame 79aee246)

## MOSTRAR PRODUCTO
- que_hace: el sujeto levanta la caja/producto y la muestra a cámara.
- lleva_voz: opcional (frase corta en idioma de la cuenta)
- motor_tipico: kling · 3s
- variables: sujeto (avatar) · caja/producto · si habla o no
- expansion: "The person lifts the [CAJA/PRODUCTO DE LA CUENTA] up toward the camera and presents it clearly, turning it slightly so the front artwork faces the lens, natural proud expression."
- validado_en: Gelatovivo C3 clip2 (frame 3b579f78)

---

*Añadir nuevos bloques debajo a medida que se validen.*
