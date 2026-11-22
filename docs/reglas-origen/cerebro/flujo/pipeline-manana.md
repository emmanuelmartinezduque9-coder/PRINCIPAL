# Pipeline de la mañana

Emmanuel pega links de vídeos de referencia en la pestaña **Mañana** del panel (cuenta + método) y luego dice **"prepara el lote"**.

**Reparto:** el script (`EDITOR/pipeline.py`) hace lo determinista — descargar links con yt-dlp, subir, extraer fotogramas, montar (`EDITOR/montar.py`, ffmpeg), estado. Claude hace lo de IA: analizar el vídeo ([[flujo/analisis-con-memories]]), generar frames y clips. Si un link es privado → pedirle a Emmanuel que lo suba a mano.

**Métodos** (se elige en la app; "auto" = decide Claude, y **>4 escenas → B** por regla de Emmanuel):
- **A (multi-clip):** por CADA escena se extrae el fotograma del **inicio exacto del cambio de escena** (punto de partida del clip) → se convierte en FRAME con el patrón [[reglas/frame-desde-referencia]] → se genera el CLIP con la acción de esa escena en la referencia y **su misma duración** → montaje final con el ritmo del original.
- **B (prompt largo), actualizado 2026-09-08:** análisis del vídeo → referencia contextual propia con artículo + avatar de Emmanuel + interacción + contexto + realismo → aprobación → Seedance 2.5 en modo contextual, con comienzo y escenas descritos por separado. Ya no se obliga a convertir el segundo 0 en start_image. Leer [[reglas/seedance-largo-referencia-contextual]]. Mantener los tiempos aprobados y el límite vigente del motor.

**Secuencia por elemento:** nuevo → preparar → análisis → escenas → fotogramas → frames → aprobación → clips → montar. **El orden GLOBAL del lote lo gobierna `.cursor/rules/lotes-frames-completos.mdc` (2026-09-11):** la primera ronda reúne todos los frames de Replicar Y adaptaciones; esta secuencia no autoriza completar un elemento o una cuenta antes de preparar los demás. Aprobación: [[flujo/flujo-de-aprobacion]].

**2 correcciones de Emmanuel (29-08):**
1. Al generar el FRAME, pasar SIEMPRE la imagen del producto de la cuenta como 2ª referencia (caja/producto/mockup). Porqué: sin ella el producto sale aproximado.
2. El análisis se hace con [[flujo/prompt-de-10-puntos]] (`EDITOR/PROMPT_ANALISIS.md`), no con el resumen corto de Higgsfield. Porqué: el de Higgsfield es pobre y da prompts flojos. Claude lo redacta combinando escenas+tiempos de Higgsfield con los fotogramas extraídos, y ese desglose se convierte en prompt de Seedance quitando los captions.

Aplicada por: EDITOR/pipeline.py y EDITOR/montar.py (la parte determinista).
