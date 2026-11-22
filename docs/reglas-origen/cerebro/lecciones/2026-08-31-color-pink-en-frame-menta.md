# «Pink lid» en un frame menta

**Fecha:** 2026-08-31 · **Ámbito:** EISMEISTER

**Qué pasó:** El C3 salió mal porque el frame mostraba el producto MENTA de [[cuentas/EisMeister]] y el prompt decía «pink lid», heredado de la variante rosa/azul de otra cuenta.

**Por qué pasó:** Adapté el prompt cambiando solo unas frases; el color del producto viajó por inercia, sin cotejarlo contra lo que se VE en el frame. La variante se identifica mirando el frame, no heredándola del prompt de origen.

**Regla que dejó:** El prompt TIENE que hablar del color del producto que se ve en ese frame. Antes de generar, se coteja frame → color (rosa / azul / menta) contra el texto del prompt; si no cuadran, no sale. Relacionada: [[lecciones/2026-08-31-producto-eismeister-recoloreado]].

Aplicada por: EDITOR/lanzar.py con EDITOR/variantes.json (mapa frame→color cotejado contra el prompt).
