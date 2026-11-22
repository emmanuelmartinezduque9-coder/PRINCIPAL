# 🎬 PROMPT MAESTRO — PROYECTO NANO BANANA
### Sistema de producción de contenido AI para e-commerce (Emmanuel / Nordware)
### Documento de traspaso completo — cargar al iniciar cualquier chat o Claude Code

---

## 0. CÓMO USAR ESTE DOCUMENTO

Este documento contiene TODO el sistema de trabajo montado para producir imágenes y videos de marketing con Higgsfield (vía MCP). Al cargarlo, el asistente debe poder continuar la operación exactamente donde quedó, sin perder continuidad. Se acompaña de tres documentos hermanos que viven en el proyecto:
- `BIBLIOTECA_PROMPTS.md` — prompts de video validados
- `ADAPTACIONES_PROMPT.md` — patrones de adaptación de prompts
- (este) `PROMPT_MAESTRO_NANO_BANANA.md` — estado completo del sistema

---

## 1. QUÉ ES EL PROYECTO

Emmanuel produce contenido de marketing (imágenes + videos hiperrealistas estilo UGC) para varias cuentas de e-commerce dropshipping en mercados europeos (alemán e italiano). El contenido se genera con **Higgsfield** conectado por MCP. El objetivo es alto volumen diario, hiperrealismo tipo "foto de celular real", y un flujo que minimice repeticiones y maximice velocidad.

---

## 2. NOMENCLATURA (cómo llamamos a cada cosa)

- **FRAME** = imagen generada (frame1, frame2…). Es el `start_image` de un clip.
- **CLIP** = video generado (clip1, clip2…).
- **IMGCOMPLEMENTO** = imagen de apoyo/referencia secundaria para generar un clip (ej. mockup de producto). Se nombra por el clip al que pertenece: "imgcomplemento clip2 concepto2 eiswerk".
- **CONCEPTO** = un video completo = varios clips en orden. Numerado POR CUENTA (CONCEPTO1 de Discomagia es independiente del CONCEPTO1 de EisWerk).
- **VARIACIÓN** = versión alternativa de un concepto que hace lo mismo cambiando un detalle (ej. recetas caramelo/galletas/MMS). Si Emmanuel no especifica variación al regenerar, el concepto no tiene variaciones.
- **REFERENCE ELEMENT** = imagen con nombre en Higgsfield, embebible en prompts con `<<<id>>>`, persiste entre chats.
- **ASSET FIJO** = producto/logo/caja/avatar de una cuenta (media_id, sin nombre en Higgsfield, se nombra aquí).

---

## 3. FLUJO DE APROBACIÓN Y TRABAJO

1. **Iteración de frame:** mientras Emmanuel no diga exactamente **"esta imagen está bien"**, toda regeneración es iteración del mismo frame en curso (no cuenta como frame nuevo).
2. **"esta imagen está bien"** → fija la última imagen como frame aprobado; el contador avanza (frame1, frame2…).
3. **"usa la imagen N con el prompt [NOMBRE]"** → Claude usa el job_id de esa imagen aprobada como start_image, sin preguntar.
4. **Frame nuevo al regenerar:** si Emmanuel pasa una imagen nueva en la misma petición de regenerar, esa imagen REEMPLAZA automáticamente el frame anterior. Si no pasa imagen, se usa el último frame guardado.
5. **"guarda este video como CONCEPTO# de la cuenta X"** → registra el concepto (todos sus clips: frame + prompt + config + orden).
6. **"regenera el CONCEPTO# de la cuenta X"** → relanza todos los clips en orden. Con variación: "regenera CONCEPTO# variación X".
7. **Trabajo en PARALELO:** todo lo que no dependa de un frame en aprobación pendiente, se lanza en paralelo sin esperar.
8. **Modo lote:** generar N frames de golpe → aprobar en bloque → lanzar N clips en paralelo.

---

## 4. CONFIGURACIÓN DE GENERACIÓN (por defecto, aplicar sin preguntar)

### Imágenes
- Modelo: `nano_banana_pro`
- Resolución: **2K**, aspect ratio **9:16**
- SIEMPRE aplicar (aunque Emmanuel no lo pida): cambios de fondo con checklist de elementos concretos y nombrados + luz que cambia SOLO dirección/ángulo (nunca temperatura de color, nunca filtro cálido/amarillo, balance neutro) + bloque anti-collage/anti-Canva (una sola fuente de luz coherente, sombras de contacto reales, grano de sensor) + MÁXIMO realismo de piel (poros visibles, imperfecciones, sin suavizado/plástico). Empujar el realismo un poco más en cada generación.

### Video "con Kling"
- Modelo: `kling3_0`, calidad **1080p**, aspect ratio **9:16**, duración la que indique Emmanuel.

### Video "con Seedance" (por defecto si no se especifica)
- Modelo: `seedance_2_0` (Seedance 2.0, NO 2.5), calidad **720p**, aspect ratio **9:16**, duración la que indique Emmanuel.
- Requiere `mode: "omni_reference"` cuando se pasa un `start_image`.
- Nota: Seedance SÍ ejecuta múltiples cortes/escenas en un solo video (prompts tipo receta escena-por-escena son válidos tal cual).
- Con dos imágenes: la 1ª (start_image) es la referencia principal, la 2ª (image_references) es solo el mockup del producto.

### Preset molesto
- El preset "IN THE DARK" (`24bae836-2c4a-48e0-89b6-49fcc0b21612`) se dispara solo con estos prompts → pasar siempre `declined_preset_id: "24bae836-2c4a-48e0-89b6-49fcc0b21612"` para generar literal.

---

## 5. CUENTAS Y ASSETS FIJOS (media_id confirmados)

### EISWERK — mercado alemán (germanización) — mini máquina de helados rosa
- Producto: `16f72910-9372-47d8-ac27-cbd66c595067`
- Logo: `3c031e2d-a35a-4d3f-92f8-bd63160fac08`
- Caja: `99974934-f830-4dab-963c-fe2aa67fd007`
- Avatar (fijo, mujer alemana joven): `8ed30f5b-5104-4787-9f43-f4c314b7fb7d`
- Avatar alternativo (selfie, usado en concepto2 clip1): `9c234cb3-e0b7-4d95-951f-80dfa86527a8`
- Mockup producto ROSA (imgcomplemento recetas): `18d948a1-a346-4967-9496-f3ac47ee68b1`
- Mockup producto AZUL: *(pendiente de que Emmanuel lo pase)*
- Reference element `eiswerk`: `d9cc80aa-4f3e-41c0-b45f-6c13a50145fe`
- Regla de fondo: mood cozy nocturno "viendo serie en cama/sofá" (luz cálida de TV/tira LED) EXCEPTO tomas de reveal/supermercado.

### DISCOMAGIA — mercado italiano (italianización) — discos magnéticos musicales para nevera
- Producto: `f148aa0d-0e55-4c19-bad4-17764e5c3812`
- Logo: `8c82f791-0c56-42dc-839e-afa640998f7e`
- Caja: `384f03bf-244d-4ab4-8d93-2ffda9283a3d`
- Avatar (fijo, mujer italiana joven): `b6fcad31-c728-48cd-a031-f8c00d81c1dc`
- Reference element `caja-producto-discomagia`: `a1a56354-2b4b-4155-9ee0-f58f785a59fa`
- Reference element `discos` (contenido de la caja): `a0aca734-0629-42df-8212-37060fe42569`

### GELATOVIVO — mercado italiano (italianización) — mismos assets que EisWerk excepto logo
- Producto: `16f72910-9372-47d8-ac27-cbd66c595067` (mismo EisWerk)
- Caja: `99974934-f830-4dab-963c-fe2aa67fd007` (mismo EisWerk)
- Avatar (fijo): `8ed30f5b-5104-4787-9f43-f4c314b7fb7d` (mismo EisWerk)
- Logo (propio): `a0a1483c-b7d4-4f7e-8138-d70c856ef4af`
- Mockup ROSA (imgcomplemento recetas): `18d948a1-a346-4967-9496-f3ac47ee68b1`
- Conceptos duplicados de EisWerk (mismos frames/prompts/config; mercado italiano).

### PLATTENZAUBER — ⏸️ INACTIVA/PAUSADA
- NO usar como cuenta activa, NO usar en ejemplos ni referencia de estilo. Archivos y assets intactos.
- Reference element `caja-producto-plattenzauber`: `3295fb5f-b572-41b3-a902-5d39eaddce6a` (media `4414f57e-...`, posiblemente incorrecto — verificar si se reactiva).

### Otros reference elements existentes en Higgsfield
- `caja-musica`: `13d0b974-ff26-480d-addb-a4da323a8724`
- `caja-musicaa`: `8915a185-5d78-4e9d-befc-e1d6e7e0d058`

---

## 6. CONCEPTOS ACTUALES (estado a cierre de sesión)

### DISCOMAGIA
**CONCEPTO 1** (3 clips):
- clip1: frame `f3c4780c` (sábana, 2 personas genéricas + gorros navidad) · prompt "1,2,3" italiano + reveal `caja-producto-discomagia` · seedance 2.0 720p 6s
- clip2: frame `65515cac` · abrir caja + `discos` · kling3_0 1080p 3s
- clip3: frame `59d5b857` · "DISCO NEVERA" · seedance 2.0 720p 9s

**CONCEPTO 2** (3 clips, orden: café → caja → nevera):
- clip1: frame `445d26a2` · "DEJAR CAER CAFE" + reveal `caja-producto-discomagia` (varias cajas) · seedance 720p 4s · job `88e9ba8a`
- clip2: frame `65515cac` · abrir caja + `discos` · kling3_0 1080p 3s
- clip3: frame `59d5b857` · "DISCO NEVERA" (corregido: mano se retira, disco gira solo) · seedance 720p 9s

**CONCEPTO 3** (3 clips):
- clip1: frame `468f1726` (habitación navideña + tabla madera + tapa cocina, pijama navideño) · "1,2,3" variante C italiano + reveal `caja-producto-discomagia` · seedance 2.0 720p 5s · job `1228fd0b` ✅ validado
- clip2: frame `65515cac` · abrir caja + `discos` · kling3_0 1080p 3s · job `0efe89f8`
- clip3: frame `59d5b857` · "DISCO NEVERA" · seedance 2.0 720p 9s · job `3a709626`

**CONCEPTO 4** (en construcción):
- frame1: `1f03de0d` (mujer caminando + palet de cajas Discomagia + precio, IKEA genericado) — pendiente de aprobar
- frame2: `0a2b0f66` (POV pago self-checkout, caja Discomagia) — APROBADO ✅
- clips: pendientes de asignar

### EISWERK
**CONCEPTO 1** (recetas, con VARIACIONES) — cada variación: frame + mockup ROSA `18d948a1` + receta literal · seedance 2.0 720p 10s:
- variación caramelo: frame `a12d8287` · RECETA 1 CARAMELO
- variación galletas: frame `6e2d8093` · RECETA 2 GALLETAS
- variación MMS: RECETA 3 MMS (frame pendiente)

**CONCEPTO 2** (3 clips):
- clip1: frame `6ecc56e3` (avatar EisWerk con café) · "DEJAR CAER CAFE" + reveal `eiswerk` · seedance 720p 4s · job `f98d0947`
- clip2: frame `0b21cccf` · sacar producto de la caja · kling3_0 1080p 5s · job `5fee97d4`
- clip3: = CONCEPTO 1 variación caramelo

### GELATOVIVO (duplicado de EisWerk, mercado italiano)
**CONCEPTO 1** (recetas con variaciones):
- variación caramelo: frame `eaac3439` · RECETA 1 CARAMELO + mockup ROSA · seedance 2.0 720p 10s
- variación galletas: frame `6e2d8093` · RECETA 2 GALLETAS + mockup ROSA
- variación MMS: frame `8f09bf56` · RECETA 3 MMS + mockup ROSA

**CONCEPTO 2** (duplicado de EisWerk C2)
**CONCEPTO 3** (3 clips):
- clip1: frame `79aee246` · POV acercarse al supermercado (primera persona) · kling3_0 1080p 3s
- clip2: frame `3b579f78` · levantar caja y mostrarla a cámara · kling3_0 1080p 3s
- clip3: = CONCEPTO 1 variación MMS

---

## 7. BIBLIOTECA DE PROMPTS (`BIBLIOTECA_PROMPTS.md`)

Prompts validados, cada uno bajo `## NOMBRE`. Se usan copiando el texto LITERAL (sin reescribir/optimizar/resumir), salvo que un elemento/avatar/idioma no coincida con el contexto (ahí sí se adapta esa parte).

**Organización interna (solo para el asistente, Emmanuel solo dice el nombre):**
- **SECUENCIA** (largos, escena-por-escena, múltiples cortes): RECETA 1 CARAMELO, RECETA 2 GALLETAS, RECETA 3 MMS, RECETA COCINA MMS, DISCO NEVERA, 1,2,3
- **ACCIÓN** (una toma continua, movimiento concreto): DEJAR CAER CAFE (+ movimientos reutilizables por guardar: SACAR DE CAJA, POV ACERCARSE, MOSTRAR PRODUCTO)

---

## 8. ADAPTACIONES DE PROMPT (`ADAPTACIONES_PROMPT.md`)

Patrones de adaptación validados. Cada prompt base guarda su MECÁNICA CENTRAL intocable + VARIABLES ADAPTABLES + variantes ya validadas. Se alimenta SOLO con adaptaciones que Emmanuel valida (da OK).

**1,2,3 — variantes validadas:**
- A: tienda + 2 empleados + sábana (cara visible, lip sync, handheld)
- B: cocina + 1 mano + paño a cuadros (solo mano, voz en off sincronizada, cámara estática)
- C: habitación navideña + 1 persona + tabla de madera + tapa de cocina (Discomagia italiano, handheld)
- Frases: alemán „Eins/Zwei/Drei" + „Mal sehen, wie es geworden ist"/„Schauen wir mal wie das aussieht"; italiano «Uno/Due/Tre» + «Vediamo come è venuto»

---

## 9. REGLAS DE COMPORTAMIENTO (críticas)

1. **Generar directo en Higgsfield** cuando Emmanuel pasa referencia y describe cambios — sin pedir confirmación. Solo abrir widget si faltan assets.
2. **Prompts de biblioteca = literal**, nunca reescribir "porque quedaría mejor". Solo variar si un elemento/avatar/idioma no coincide.
3. **No contradecir** a Emmanuel cuando afirma un hecho sobre sus herramientas. Solo opinar si él expresa duda o lo pide.
4. **NO crear/editar documentos de registro durante el trabajo normal** (gasta créditos). Todo en contexto. El volcado completo va SOLO en el prompt maestro al cambiar de chat.
5. **"elimina la cuenta X"** = dejar de tratarla como activa, NUNCA borrar archivos/assets.
6. **Idioma/mercado automático** según la cuenta (germanización alemán, italianización italiano). Traducir texto en escena solo si existe, nunca forzar.
7. **Caja de producto en un frame** → reemplazar por la caja de la cuenta (aunque sea el mismo tipo de producto).
8. **Condiciones de piel/narrativa** (irritación, etc.) se reproducen exactas de la referencia si son parte del mensaje.
9. **Nunca generar bebés/niños** en cuentas de producto infantil.
10. **No mostrar/descargar** media subida por Emmanuel (limitación del entorno de chat — Claude Code sí puede).

---

## 10. 🚀 PARA CLAUDE CODE — QUÉ MEJORAR QUE ANTES NO SE PODÍA

Emmanuel va a mover esta operación a Claude Code (o Cowork) para ganar acceso al sistema de archivos. **Preguntas y mejoras a plantearle al asistente en Claude Code:**

### Fricciones actuales que Claude Code debería resolver:
1. **"No veo las imágenes que subo al widget"** → En Claude Code, ¿puedes leer directamente las imágenes de referencia desde una carpeta de mi PC, eliminando la doble subida (chat + widget)?
2. **"No puedo descargar los videos/imágenes generados"** → ¿Puedes descargar automáticamente cada generación de Higgsfield a mi PC, en la carpeta correcta y con el nombre correcto?
3. **"Los documentos (registro, biblioteca, adaptaciones) los edito manualmente"** → ¿Puedes mantener estos archivos vivos en mi disco y actualizarlos solo, sin que yo resuba nada?

### Sistema de organización a montar en el PC:
4. Crear estructura de carpetas: `/NanoBanana/[CUENTA]/[CONCEPTO]/[clip]` con el video + un `.txt` del prompt usado + el frame de partida al lado.
5. Nomenclatura automática de archivos: `CUENTA-C#-clip#-YYYYMMDD.mp4`.
6. Un `registro.md` o base de datos local que mapee nombre legible → media_id/job_id, actualizado automáticamente.
7. Scripts para: renombrar en lote, mover generaciones nuevas a su carpeta, clasificar por cuenta/concepto, y limpiar duplicados.

### Automatización avanzada a explorar:
8. ¿Puedo lanzar la regeneración de un concepto entero (varios clips) y que Claude Code los descargue y organice todos solo, sin yo estar delante?
9. ¿Puedes leer un video de referencia (mp4) de mi disco, extraer los frames clave, y proponerme los frames a generar?
10. ¿Puedo tener un "comando" (slash o alias) que dispare todo el flujo de un concepto con una sola línea?
11. ¿Puedes correr subagentes en paralelo para generar varios conceptos de distintas cuentas a la vez?

### Migración del sistema actual:
12. Trasladar `BIBLIOTECA_PROMPTS.md`, `ADAPTACIONES_PROMPT.md` y este documento a `CLAUDE.md` + archivos de proyecto en Claude Code, para que las reglas se apliquen automáticamente en cada sesión.

---

## 11. SINTAXIS RÁPIDA PROPUESTA (pendiente de activar)

Para disparar generaciones con una línea (a definir con Emmanuel):
```
/video [cuenta] | frame:[widget|chat|job_id] | prompt:[NOMBRE|descripción] | [kling|seedance] [Xs]
/concepto [N] [cuenta] =
  clip1: frame:X | prompt:NOMBRE | seedance 5s
  clip2: =clip# concepto# cuenta
```

Decisiones pendientes de Emmanuel:
- ¿Sintaxis `/video` `/concepto` o lenguaje natural?
- ¿Generar clip directo sobre frame sin aprobación previa (rápido) o siempre aprobar frame primero (seguro)?

---

*Fin del prompt maestro. Cargar completo junto con `BIBLIOTECA_PROMPTS.md` y `ADAPTACIONES_PROMPT.md` al iniciar cualquier sesión nueva o Claude Code.*
