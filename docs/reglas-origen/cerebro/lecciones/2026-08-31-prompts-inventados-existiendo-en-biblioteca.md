# Prompts inventados existiendo en biblioteca

**Fecha:** 2026-08-31 · **Ámbito:** GLOBAL

**Qué pasó:** 4 clips (clip1 y clip2 del C3 de [[cuentas/EisWerk]], clip1 del C5 de [[cuentas/Gelatovivo]], clip1 del C6 de [[cuentas/EisMeister]]) se generaron con el prompt tecleado a mano teniéndolo ya guardado, y sin la imagen del producto. Al reconstruir de memoria, el 1,2,3 perdió la frase hablada, y el clip1 de EisWerk salió sin declarar que la cuenta habla alemán.

**Por qué pasó:** La regla escrita «copiar literal» dependía de que yo la recordara. Al reconstruir de memoria se caen piezas (la frase hablada, el idioma, el producto adjunto) sin que uno lo note.

**Regla que dejó:** PROHIBIDO teclear un prompt que exista en la biblioteca o en el registro. Se genera por nombre con EDITOR/generar.py o lanzar.py, que leen el texto LITERAL del archivo; si el nombre no existe, el script falla y se pregunta a Emmanuel — jamás se improvisa. Ver [[reglas/globales]].

Aplicada por: EDITOR/generar.py + EDITOR/lanzar.py (prompt por nombre o guardado) + EDITOR/guardia.py (bloquea la CLI directa: no hay segunda puerta).
