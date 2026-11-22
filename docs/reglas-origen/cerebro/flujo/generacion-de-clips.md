# Generación de clips (resolución automática)

- **"genera el clip# de C# [cuenta]"** → el frame ya existe: por defecto **clipN usa frameN** del concepto; si el registro asigna otro frame a ese clip, manda el registro. **NUNCA preguntar qué frame.**
- **Elementos secundarios se añaden solos** según cuenta + qué hace el clip: reveal de caja → reference element de la caja de la cuenta; abrir caja / mostrar contenido → el elemento correspondiente; recetas → mockup del producto ROSA o AZUL (la variante se identifica mirando el frame; ver [[reglas/variante-de-color]]). La caja/producto del clip es SIEMPRE el de la cuenta.
- Si de verdad falta un dato imposible de inferir (ej. duración), preguntar SOLO eso, en una línea.

**Configs por defecto (aplicar sin preguntar):**
- **Kling:** kling3_0, 1080p, 9:16, duración la que indique Emmanuel.
- **Seedance** (por defecto si no se especifica): seedance_2_0 (2.0, NO 2.5), 720p, 9:16, **máximo 15s** (si la referencia dura más, comprimir los tiempos proporcionalmente). NO subir la resolución para "mejorar": porqué — es hacer trampa; la tarea real es igualar la calidad de la web con los MISMOS parámetros. Seedance sí ejecuta varias escenas en un solo vídeo. Con dos imágenes: la 1ª es start_image, la 2ª solo el mockup del producto.
- Preset molesto "IN THE DARK": pasar siempre su declined_preset_id para generar literal.

**Prompts:** si el prompt es de biblioteca, PROHIBIDO teclearlo — siempre por `EDITOR/generar.py` ([[logica/biblioteca-de-prompts]]); si no está en la biblioteca, preguntar a Emmanuel, jamás reconstruir de memoria. Clips simples de una línea → skill nano-video. Ver [[flujo/flujo-de-aprobacion]].
Aplicada por: EDITOR/generar.py (prompt literal + sustituciones + diff).
