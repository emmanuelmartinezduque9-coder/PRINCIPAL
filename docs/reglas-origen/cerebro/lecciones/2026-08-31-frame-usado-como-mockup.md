# Frame usado como mockup del producto

**Fecha:** 2026-08-31 · **Ámbito:** GLOBAL

**Qué pasó:** En el clip3 del C3 de [[cuentas/EisWerk]] (galletas) pasé un FRAME del panel como si fuera el mockup del producto. En el C3 de [[cuentas/Gelatovivo]] además fue la misma imagen como frame Y como referencia a la vez.

**Por qué pasó:** Elegí el media_id de memoria, sin comprobar qué imagen era: en la llamada cualquier uuid «cuela» igual, y nada distinguía un frame de escena de un mockup de producto.

**Regla que dejó:** Los imgcomplementos se pasan POR NOMBRE del catálogo de assets, nunca por uuid suelto. La 2ª referencia es SOLO el mockup/caja del producto, y jamás puede ser la misma imagen que el frame. Relacionada: [[lecciones/2026-09-01-referencia-de-producto-tapado]].

Aplicada por: EDITOR/lanzar.py con EDITOR/assets.json (referencias por nombre; frame ≠ referencia).
