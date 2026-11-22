> HISTÓRICO, NO APLICAR. Sustituido el 09/10/2026 por `CEREBRO/reglas/analisis-directo-sin-memories.md`. Emmanuel reiteró el 14/11/2026 que el análisis es directo y local. No consultar Memories ni usarlo como dependencia de entrega.

# Análisis de vídeos con Memories.ai

**Por qué NO se usa el análisis de Higgsfield:** es pobre (escenas cortas, poco detalle) y produce prompts flojos. El análisis oficial sale SIEMPRE de Memories.ai (plugin `memories:*`).

**Los 3 pasos, en orden:**
1. **Analizar** — pasar a Memories.ai (`memories:analyze`; si hace falta indexar primero, `memories:add`) el **link del vídeo** + el prompt COMPLETO de 10 puntos de [[flujo/prompt-de-10-puntos]] (`EDITOR/PROMPT_ANALISIS.md`).
2. **Versión SIN TEXTOS** — sobre ese resultado se pide literalmente: "dame este prompt EXACTAMENTE IGUAL EN INGLÉS pero que no incluya ningún texto para agregar en el vídeo generado, o sea que el vídeo que entregue no tenga ningún texto". Mismo desglose, en inglés, sin captions, sin textos en pantalla, sin gráficos.
3. **A Seedance** — ESE prompt sin captions es el que se usa. Se guarda en `BIBLIOTECA_PROMPTS.md` bajo su `## NOMBRE` y se genera SIEMPRE con `python3 EDITOR/generar.py <CUENTA> "<NOMBRE>" <frame> --duracion N`.

**Reglas:**
- NUNCA escribir el análisis a mano ni "resumirlo": sale de Memories.ai.
- El prompt final que se usa es SIEMPRE el de la versión sin textos.
- Producto/idioma de la cuenta se aplican con `EDITOR/sustituciones.json`, no editando el prompt.

Relacionado: [[flujo/pipeline-manana]], [[logica/biblioteca-de-prompts]].
Aplicada por: EDITOR/generar.py (prompt literal desde biblioteca + sustituciones declaradas).
