# Guardia — el hook que tapia las puertas

`EDITOR/guardia.py`, registrado en `.claude/settings.json` como hook. No es una regla que haya que recordar: **el comando falla**. Tres puertas:

**1. PreToolUse sobre Bash** — bloquea cualquier `higgsfield generate create` de vídeo que no venga de `lanzar.py` (que se identifica con `NANO_PUERTA=1`). Se permiten sin tocar: `generate get/list/wait`, `media` y la generación de IMÁGENES (nano_banana_pro), que tiene su propio circuito de aprobación. Ver [[sistema/una-sola-puerta-para-video]]. *Por qué: el 31 ago, cuando el script no encajaba, se tiraba de la CLI directa y se colaron notas en el prompt, un frame usado de mockup, prompts inventados y clips sin idioma.*

**2. PreToolUse sobre SendUserFile** — bloquea el envío de cualquier imagen mientras haya un lote de verificación sin sellar. Un frame no se le enseña a Emmanuel sin veredicto del [[sistema/verificador-independiente]].

**3. Stop** — no deja cerrar el turno si queda:
- una corrección de Emmanuel sin convertir en lección → [[sistema/lecciones-aprendizaje-forzado]]
- un muro tocado sin contárselo → [[sistema/muros-no-se-tocan]]
- una afirmación sin demostrar → [[sistema/afirmaciones-demostradas]]
- una orden pendiente (ni hecha ni aplazada) → [[sistema/registro-de-ordenes]]

**Por qué existe**: las reglas escritas que dependían de recordarlas fallaron una y otra vez (27, 29 y 31 de agosto). El guardia convierte la regla en muro: no hay que acordarse, el sistema lo impone.

Aplicada por: EDITOR/guardia.py (hooks PreToolUse Bash, PreToolUse SendUserFile, Stop)
