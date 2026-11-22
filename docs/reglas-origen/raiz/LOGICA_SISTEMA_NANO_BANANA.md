# 🧠 LÓGICA DEL SISTEMA — PROYECTO NANO BANANA
### Documento de razonamiento (el "cómo pensar", no solo el "qué")
### Leer junto con PROMPT_MAESTRO, BIBLIOTECA_PROMPTS y ADAPTACIONES_PROMPT

---

## PROPÓSITO DE ESTE DOCUMENTO

El prompt maestro te da los DATOS (assets, conceptos, IDs). Este documento te da la LÓGICA: cómo interpretar lo que Emmanuel dice y cómo decidir qué hacer. Si entiendes esta lógica, no necesitas preguntar en cada paso. La confusión más común es sobre qué es un FRAME y qué hacer con una imagen de referencia — eso se explica en detalle abajo.

---

## 1. EL CONCEPTO MÁS IMPORTANTE: IMAGEN DE REFERENCIA vs FRAME

Son DOS COSAS DISTINTAS. No confundirlas nunca.

### IMAGEN DE REFERENCIA (o "captura de referencia")
- Es una imagen que Emmanuel sube COMO INSPIRACIÓN/BASE.
- Normalmente es un screenshot de un video viral, un anuncio de la competencia, o una escena que quiere replicar.
- **NO se usa tal cual.** Es materia prima.
- Su función: definir la COMPOSICIÓN, POSE, ENCUADRE y ESCENA que se quiere recrear.
- Casi siempre hay que CAMBIARLE cosas: el producto de la competencia → el producto de Emmanuel, la persona → el avatar de la cuenta, el fondo → rediseñado, el idioma → el del mercado.

### FRAME
- Es la imagen FINAL, YA GENERADA por ti (con nano_banana_pro), lista y aprobada.
- Es el resultado de tomar una imagen de referencia + aplicarle todos los cambios.
- **El FRAME es lo que se usa como `start_image` para generar un VIDEO (clip).**
- Un frame solo es "frame oficial" cuando Emmanuel dice **"esta imagen está bien"**.

### EL FLUJO LÓGICO (esto es lo que se estaba malentendiendo):

```
IMAGEN DE REFERENCIA (Emmanuel la sube)
        │
        ▼
  [Tú generas una imagen con nano_banana_pro,
   tomando la referencia para la composición/pose
   pero cambiando producto/avatar/fondo/idioma]
        │
        ▼
  IMAGEN GENERADA (candidata a frame)
        │
        ├──> Emmanuel no le gusta → iteras (regeneras) → nueva candidata
        │
        └──> Emmanuel dice "esta imagen está bien"
                    │
                    ▼
              FRAME OFICIAL (aprobado, numerado: frame1, frame2...)
                    │
                    ▼
      [Se usa como start_image para generar el CLIP (video)]
```

**REGLA CLAVE:** una imagen de referencia NUNCA es directamente el frame. Primero la conviertes en imagen generada (aplicando cambios), y solo cuando Emmanuel la aprueba se vuelve frame. La referencia es el "antes", el frame es el "después aprobado".

---

## 2. QUÉ HACER CUANDO EMMANUEL PASA UNA IMAGEN DE REFERENCIA

Cuando Emmanuel sube una imagen y dice algo como "crea el frame1 con esta imagen" o "genera una imagen usando esta de referencia", el razonamiento es:

1. **Identifica qué es la imagen:** ¿es una referencia de composición (screenshot viral) o un asset limpio (producto/avatar)? Normalmente es referencia de composición.

2. **Identifica la cuenta** → de ahí sale: idioma/mercado, avatar fijo, producto/caja a usar.

3. **Aplica SIEMPRE los cambios estándar** (sin que Emmanuel los pida):
   - **Producto:** si en la referencia hay una caja/producto de la competencia, se REEMPLAZA por la caja/producto de la cuenta (aunque sea el mismo tipo de producto). Esto incluye TODAS las instancias: la que alguien sostiene Y las que estén apiladas/de fondo.
   - **Persona:** si hay que poner el avatar de la cuenta, se usa el avatar fijo (identidad desde esa imagen, pose desde la referencia).
   - **Fondo:** rediseño de elementos concretos y nombrados (colores, materiales, muebles, props) — sin relocalizar la escena, solo cambiar el diseño de lo que hay.
   - **Luz:** cambia solo la DIRECCIÓN/ángulo, nunca la temperatura de color. Balance neutro, sin filtro amarillo.
   - **Realismo:** máximo — piel con poros y textura real, grano de sensor, sombras de contacto reales, anti-collage. La piel es la prioridad #1.
   - **Idioma:** cualquier texto en escena va en el idioma del mercado (alemán/italiano). Solo si el texto existe; nunca inventarlo.
   - **Cámara:** la distancia/escala de la persona en el encuadre debe COINCIDIR EXACTAMENTE con la referencia.

4. **Genera la imagen** directamente en Higgsfield (no pidas permiso, no preguntes "¿quieres que la genere?").

5. **Espera aprobación.** No es frame hasta que Emmanuel diga "esta imagen está bien".

---

## 3. LÓGICA DEL FRAME AL REGENERAR (regla crítica)

Cuando Emmanuel pide regenerar un clip/concepto:

- **Si pasa una imagen nueva en esa misma petición** → esa imagen es AUTOMÁTICAMENTE el nuevo frame de ese clip/concepto/variación. Reemplaza cualquier frame anterior, aunque sea parecida o la misma. No preguntes.
- **Si NO pasa ninguna imagen** → usa el último frame guardado de ese clip/concepto.

Nunca ignores una imagen recién pasada usando el frame viejo. Nunca uses el frame viejo si hay uno nuevo sobre la mesa.

---

## 4. LÓGICA DE IMAGEN → VIDEO (no re-subir nada)

- Una imagen generada por ti tiene un `job_id`. Un video necesita un `start_image`.
- **El `job_id` de la imagen se usa directo como `start_image` del video.** No hay que descargar ni re-subir nada.
- Cuando Emmanuel dice "usa la imagen N con el prompt [X]", tomas el job_id de esa imagen aprobada (frame N) y generas el video con el prompt X.

---

## 5. LÓGICA DE LOS PROMPTS (biblioteca)

- Los prompts que funcionan están en `BIBLIOTECA_PROMPTS.md` bajo `## NOMBRE`.
- Cuando Emmanuel dice "usa el prompt [NOMBRE]", copias el texto EXACTO, LITERAL. No lo reescribes, no lo optimizas, no lo resumes, no lo mejoras.
- **Única excepción:** si un elemento concreto no coincide con el contexto (el avatar es de otro género, el producto/elemento/idioma es distinto), cambias SOLO esa parte. Todo lo demás queda idéntico.
- Nunca cambias un prompt "porque quedaría mejor". Emmanuel valida sus prompts por experiencia; si funciona, se respeta.

### Clasificación mental (solo para ti, Emmanuel solo dice el nombre):
- **SECUENCIA:** prompts largos escena-por-escena con múltiples cortes (Seedance los ejecuta). Ej. las RECETAS, DISCO NEVERA, 1,2,3.
- **ACCIÓN:** prompts cortos de una sola toma continua. Ej. DEJAR CAER CAFE, movimientos de cámara.

---

## 6. LÓGICA DE ADAPTACIÓN (cuando un prompt no encaja tal cual)

Si Emmanuel quiere un prompt en una escena/cuenta distinta:

1. Mira `ADAPTACIONES_PROMPT.md`: ¿hay una variante ya validada parecida? Si sí, úsala como patrón.
2. Todo prompt tiene una **MECÁNICA CENTRAL intocable** (lo que lo hace funcionar) y **VARIABLES ADAPTABLES** (escena, personas, idioma, producto, cámara).
3. Adaptas solo las variables, nunca la mecánica.
4. Ejemplo — el "1,2,3": la mecánica es "contar uno-dos-tres sincronizado con tapar/destapar 3 veces → revelar producto al final, sin mostrarlo antes". Eso NO se toca. Lo que cambia: quién cuenta, con qué tapa (sábana/paño/tapa de cocina), dónde, en qué idioma, qué producto revela.
5. Cuando una adaptación nueva funciona y Emmanuel la valida, se guarda en el documento como variante nueva.

---

## 7. LÓGICA DE CONCEPTOS Y VARIACIONES

- **CONCEPTO** = un video completo = varios clips en orden. Cada clip guarda: su frame (start_image), su prompt (cuál + cómo se adaptó), su config (modelo/duración/elementos), y su orden.
- **Numeración por cuenta:** CONCEPTO1 de Discomagia ≠ CONCEPTO1 de EisWerk.
- **"regenera CONCEPTO# de la cuenta X"** → relanzas TODOS sus clips en orden.
- **VARIACIÓN:** versión alternativa del mismo concepto que cambia un detalle (ej. recetas caramelo/galletas/MMS = misma mecánica, distinto topping).
   - "regenera CONCEPTO# variación X" → regeneras esa variación.
   - "regenera CONCEPTO#" sin variación → ese concepto no tiene variaciones.
- **Adaptar un concepto a otra cuenta:** "crea CONCEPTO# de [destino] tomando CONCEPTO# de [origen]" → mantienes la mecánica de cada clip, cambias solo avatar + producto + fondo/idioma. Si falta un reference element de la cuenta destino, lo creas automáticamente.

---

## 8. LÓGICA DEL IMGCOMPLEMENTO (mockup por variante)

- Algunos clips (las recetas de EisWerk/GelatoVivo) usan DOS imágenes: el frame (start_image) + un imgcomplemento (mockup del producto).
- Solo hay dos variantes de producto: ROSA y AZUL.
- **Identifica tú la variante mirando el frame** y usa el mockup correspondiente automáticamente. Emmanuel no te lo dice cada vez.
- Mockup ROSA = `18d948a1-a346-4967-9496-f3ac47ee68b1`. Mockup AZUL = pendiente.

---

## 9. LÓGICA DE CONFIGURACIÓN DE VIDEO

- "con Kling" → `kling3_0`, 1080p, 9:16.
- "con Seedance" o por defecto → `seedance_2_0`, 720p, 9:16 (requiere `mode: omni_reference` si hay start_image).
- La duración siempre la da Emmanuel.
- "por defecto seedance" significa exactamente: seedance_2_0, 720p, 9:16.

---

## 10. REGLA DE ORO DEL RAZONAMIENTO

Cuando Emmanuel da una orden, ANTES de actuar razona en este orden:
1. ¿Qué cuenta es? → idioma, avatar, producto, caja.
2. ¿Me pasó una imagen? → ¿es referencia (para componer) o asset? ¿es un frame nuevo que reemplaza?
3. ¿Es imagen o video? → config correspondiente.
4. ¿El prompt está en la biblioteca? → literal. ¿Necesita adaptación? → mira adaptaciones.
5. ¿Aplico los cambios estándar? → SIEMPRE (fondo, luz, realismo, producto, idioma).
6. ¿Depende de una aprobación pendiente? → si no, puedo lanzarlo en paralelo ya.

Si después de este razonamiento algo es genuinamente ambiguo (falta un dato imposible de inferir), pregunta UNA cosa concreta. Si no, ejecuta sin preguntar.

---

## 11. ERRORES QUE NO DEBES COMETER (aprendidos en el trabajo real)

- ❌ Tratar la imagen de referencia como si fuera el frame final (usarla directo sin aplicar cambios).
- ❌ Reescribir/optimizar un prompt de la biblioteca que ya funciona.
- ❌ Regenerar algo que Emmanuel no pidió regenerar.
- ❌ Ignorar una imagen recién pasada y usar el frame viejo.
- ❌ Olvidar reemplazar el producto de la competencia (todas las instancias, incluido el fondo).
- ❌ Cambiar la temperatura de color de la luz (solo se cambia dirección).
- ❌ Dejar piel plástica/suavizada (la piel real es prioridad #1).
- ❌ Preguntar demasiado cuando la orden ya trae la info.
- ❌ Contradecir a Emmanuel cuando afirma un hecho de sus herramientas.
- ❌ Crear/editar documentos de registro durante el trabajo (solo el prompt maestro al cerrar).

---

*Fin del documento de lógica. Este documento explica el razonamiento; los datos concretos están en el PROMPT_MAESTRO.*
