# «Reportar un problema» y «Mejoras» (24/11/2026)

Petición de Emmanuel (hoja de ruta, punto 2: aprendizaje de verdad, no reglas inventadas). Antes no
tenía forma de saber si la automatización aprende. Ahora cada problema se reporta donde se ve, queda
ligado al resultado concreto, y una corrección solo cuenta como aprendida si los números mejoran.

## Qué había en Codex

Revisado `/Volumes/T7/AUTOMATIZACION SEGA`: **no había un mecanismo de aprendizaje**. Había reglas en
texto tras cada queja (`REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md`, decenas de `REGLA.md` sueltos con
copias `.before-*`), rechazos guardados a mano por lote (`human-rejection-*.json`) y veredictos de un
revisor independiente. Nada medía si una regla mejoraba algo. Lo que sí se copia tal cual es la lista
de comprobación que repetía ese revisor como **tipos de problema**: producto ausente o sustituido,
rótulos/marcas de agua, fondo, encuadre, manos y dedos, identidad y piel; más audio, montaje, luz,
movimiento del clip, bloqueos de Higgsfield y pantalla (`src/lib/mejoras.ts`).

## Cómo funciona

1. **Reportar** (`src/components/mejoras/report-button.tsx`): botón discreto «Reportar un problema»
   junto a la imagen, el clip, el montaje, en la cabecera del lote y abajo en el menú (pantalla). Texto
   libre, dictado (el mismo `DictateButton` de siempre) y captura opcional (elegir o pegar con Cmd+V,
   máx. 4 MB). Lo puede usar cualquiera con sesión que vea el vídeo.
2. **Queda ligado** (`problem_reports`): vídeo, generación y resultado, montaje (si no se dice cuál, el
   último), lote, página, persona, fecha, «versión» legible («imagen, ronda 2», «montaje v3») y commit
   de la web (`RAILWAY_GIT_COMMIT_SHA`).
3. **Clasificación con Haiku** (`src/server/videos/mejoras/classify.ts`, tarea `mejoras.barrido` cada
   minuto): tipo, causa en español sencillo y qué hace falta: `regla` (prompt de imagen o clip),
   `codigo` (fallo del programa) o `uso` (nada que cambiar). Lleva el contexto técnico del vídeo
   (modelo del clip, si se pidió audio, rondas y motivos, montaje, doblaje) y la captura reducida.
   Va por la pasarela (`src/llm/`), así que cuenta en el gasto y el tope **de quien reportó**; si se
   pasa del tope o falla, se queda «Recibido» y se reintenta cada 30 min (hasta 6 veces).
4. **Reglas o prompts → datos versionados que usa el motor** (`learned_corrections`): una instrucción
   corta en inglés que `frame.ts` y `clip.ts` añaden **literal** al final del prompt (después de
   `NO_PEOPLE_PICTURES` en la imagen), para todos los productos o solo uno; como mucho 4 por prompt, las
   más recientes. Cada versión es inmutable (reescribir = versión nueva; la anterior se retira). Si ya
   hay una activa que cubre el problema, el reporte se enlaza a ella en vez de crear otra. Se aplica
   sola (regla fija: sin botones ni avisos); el dueño puede retirarla en «Mejoras».
5. **Fallos de código → cola** visible en «Mejoras» (solo el dueño) y en `GET /api/mejoras/cola`
   (Markdown, para el coordinador PRINCIPAL LOCAL). No es automático: una sesión de Claude lo arregla
   y apunta el commit (campo en la página o `PATCH /api/mejoras/<id>` con `{ "codeCommit": "abc1234" }`).
6. **Rechazos de siempre**: cada motivo de rechazo de imagen o clip (`generations.reject_reason`) se
   clasifica también por tipo con Haiku, en tandas de 30 (`rejection_types`). Los «Corrección
   automática:» del sistema no cuentan.

## Cuándo cuenta como aprendido (`src/server/videos/mejoras/metrics.ts`)

Por vídeo y paso (imagen inicial o clip):
- **aceptado a la primera**: el resultado aprobado es de la primera ronda y no hubo rechazos suyos;
- **regeneraciones**: rondas rechazadas por la persona;
- **problemas de un tipo**: rechazos clasificados + bloqueos de Higgsfield + reportes de ese paso.

Una corrección de prompt se mide con **después** = vídeos cuya primera ronda llevó su texto en el prompt
(se ve en `generations.request`), y **antes** = los 40 vídeos más recientes anteriores a su primera
versión (mismo paso; mismo producto si es de un producto). Un arreglo de código: vídeos empezados en
los 30 días antes del commit frente a los empezados después (cuentan también los reportes de montaje,
p. ej. audio).

Veredicto: con menos de 5 vídeos después (o menos de 3 antes), «Midiendo». **Solo «Aprendido: mejora»
si baja la parte de vídeos con ese problema y no baja la aceptación a la primera**; si no, «No mejora:
no cuenta como aprendido». Cada cifra cita los vídeos en que se basa (enlaces en «Casos en que se basa»).

## Página «Mejoras» (`/mejoras`)

El dueño ve todo; cada persona, sus reportes y las correcciones que salen de ellos. Arriba, cuántos
reportes, cuántos con cambio aplicado, aprendidos, midiendo y sin mejora. Luego «Lo aprendido» (cada
corrección con su texto, versiones, antes/después y casos), la cola de arreglos de código y los
reportes con su recorrido: Recibido → Causa → Cambio aplicado → Comprobado.

## Decisiones

- Haiku (`tier: "small"`), sin reglas en caché, máx. 1.500 tokens de salida: céntimos por reporte.
- La corrección se detecta por su texto literal en el prompt guardado: no hace falta otra columna en
  `generations` y la evidencia es lo que de verdad se envió a Higgsfield.
- El estado «Comprobado» no se escribe a mano: sale de los números cada vez que se abre la página.
