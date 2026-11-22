# Notas en el prompt enviado al motor

**Fecha:** 2026-08-31 · **Ámbito:** GLOBAL

**Qué pasó:** En 4 vídeos del lote del 31 (C8 de [[cuentas/EisWerk]], C8 y C3 de [[cuentas/Gelatovivo]], C3 de [[cuentas/EisMeister]]) el prompt que llegó a Seedance llevaba dentro mi nota en español («> Este es el prompt OFICIAL…»). Venía pasando desde el 27 de agosto: la basura salió en vídeos el 27, el 29 y el 31. Cuatro días.

**Por qué pasó:** Copiaba el bloque entero del archivo con mis líneas de anotación `>` incluidas, y nada revisaba el texto FINAL enviado al motor. No faltaba una regla: faltaba que ALGO mirase lo enviado — hacia delante antes de generar, y hacia atrás sobre lo ya generado.

**Regla que dejó:** El prompt que sale hacia el motor se valida SIEMPRE antes de enviar (nada de líneas `>`, notas ni español colado), y cada mañana algo repasa lo YA generado por si se coló basura. Ver también [[reglas/globales]] y [[lecciones/2026-08-31-prompts-inventados-existiendo-en-biblioteca]].

Aplicada por: EDITOR/lanzar.py (valida el prompt antes de enviar) + EDITOR/deriva.py (mira hacia atrás cada mañana).
