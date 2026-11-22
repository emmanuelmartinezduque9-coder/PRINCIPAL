---
name: nano-video
description: >
  Genera un CLIP de vídeo simple (una sola acción/toma) desde una línea corta + parámetros,
  para el proyecto Nano Banana. Se usa cuando Emmanuel dice "toma el frame#, [lo que quiero], [kling|seedance] [Xs]"
  o pide un clip de acción sencilla (no recetas ni prompts escena-por-escena, esos van en BIBLIOTECA_PROMPTS.md).
  Convierte una descripción breve en un buen prompt de vídeo hiperrealista, aplicando idioma/avatar/producto de la
  cuenta y la config del motor. Crece sola: cada acción validada se guarda como bloque reutilizable en acciones.md.
argument-hint: "toma el frame# | <acción corta> | <kling|seedance> <Xs>"
---

# nano-video — clips simples desde una línea

## Cuándo usar esta skill
- Emmanuel ya tiene un **frame aprobado** y quiere un **clip nuevo** de **una sola acción/toma continua**.
- La orden llega como: **"toma el frame#, [lo que quiero], [motor] [segundos]"**.
- Ejemplos de acción simple: levantar la caja y mostrarla, dejar caer algo, un movimiento de cámara POV, girar el producto, una sonrisa a cámara, sacar el producto de la caja.

## Cuándo NO usar (usar la biblioteca en su lugar)
- Prompts largos escena-por-escena con múltiples cortes → esos son **SECUENCIA** y viven literales en `BIBLIOTECA_PROMPTS.md` (RECETAS, DISCO NEVERA, 1,2,3). No los reconstruyas aquí.
- Si Emmanuel nombra un prompt de biblioteca ("usa RECETA 2"), se copia literal, no se expande.

## Entrada (gramática flexible — acepta lenguaje natural)
Todo esto es equivalente:
- `toma el frame1 del C4 discomagia, la mujer levanta la caja y la muestra a cámara sonriendo, seedance 5s`
- `frame:frame1-C4-disco | acción: levanta la caja y la muestra a cámara | seedance 5s`

Campos que hay que resolver:
1. **frame** → cuál (por nombre "frame1 C4 discomagia" o job_id directo). Buscar en `NanoBanana/_registro/registro.json`.
2. **acción** → la descripción corta de lo que pasa en el clip.
3. **motor** → `kling` o `seedance` (si no lo dice → seedance por defecto).
4. **segundos** → duración (siempre la da Emmanuel).

## Paso a paso
1. **Resolver el frame** en el registro → obtener su `job_id` de imagen aprobada. Ese job_id es el `start_image` del vídeo (NO re-subir nada).
2. **Resolver la cuenta** desde el frame → **idioma/mercado** (Discomagia/Gelatovivo=italiano, EisWerk=alemán), **avatar** y **producto** de la cuenta (registro.json › cuentas). El producto del clip es SIEMPRE el de la cuenta.
3. **¿La acción ya existe como bloque validado en `acciones.md`?**
   - Sí → usar su expansión validada, adaptando solo variables (idioma, sujeto, producto).
   - No → expandir con la PLANTILLA DE EXPANSIÓN de abajo.
4. **Config del motor** (aplicar sin preguntar):
   - `kling` → `kling3_0`, 1080p, 9:16, duración = Xs.
   - `seedance` (defecto) → `seedance_2_0`, **720p**, 9:16, duración = Xs. (Estándar original.)
   - CALIDAD: NO subir resolución para "mejorar"; la tarea real es igualar la calidad de la web con los MISMOS parámetros. Ver ⚠️ CALIDAD en AGENTS.md.
5. **Generar directo** en Higgsfield (MCP `generate_video` para verlo en el chat, o CLI `higgsfield generate create` para lotes/descarga). Sin pedir permiso.
6. **Al aprobar** ("este vídeo está bien" / "guárdalo") → descargar el mp4 a `NanoBanana/[CUENTA]/[CONCEPTO]/[clip]/` con nombre `CUENTA-C#-clip#-YYYYMMDD.mp4` + `prompt.txt`, y registrar el clip.
7. **Crecer**: si la acción era nueva y quedó bien, añadir el bloque a `acciones.md` (ver formato allí).

## PLANTILLA DE EXPANSIÓN (acción simple → buen prompt)
Rellenar los `[slots]` y quitar las líneas de habla si el clip no lleva voz. Mantener el resto literal — es el "boilerplate" de realismo que hace que los clips salgan bien.

```
Use the provided start image as the exact first frame. Preserve its composition, the subject exactly as shown (face, hair, clothing, body, pose), the [PRODUCTO DE LA CUENTA] exactly as shown, the background, and the lighting. Do not redesign, morph or replace any existing element.
Create a hyper-realistic handheld iPhone video in one single continuous take with subtle natural handheld camera shake. No cuts.
Action: [ACCIÓN CONCRETA EN 1-2 FRASES — qué hace el sujeto/la mano/la cámara, de principio a fin del clip].
[Si hay habla:] Every spoken line must be in perfectly fluent native [IDIOMA] with authentic [IDIOMA] lip sync and a native accent. No English at any point. The person says: „[FRASE EN IDIOMA]".
Physics and realism: natural motion and weight, real contact shadows, one coherent light source (change only direction, neutral white balance, never a warm/yellow filter), visible sensor grain, no CGI, no plastic, no collage look. Maximum skin realism (pores, natural imperfections, no smoothing).
Vertical 9:16.
```

## Reglas heredadas (no romper)
- Producto de la cuenta siempre; idioma según cuenta; no inventar texto en escena.
- No reescribir prompts de biblioteca. Aquí solo se EXPANDEN acciones simples nuevas.
- Máximo realismo, piel prioridad #1, luz solo en dirección.
- Ver `LOGICA_SISTEMA_NANO_BANANA.md` y `AGENTS.md` si hay duda de interpretación.
