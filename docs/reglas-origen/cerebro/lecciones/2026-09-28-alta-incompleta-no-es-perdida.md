# Alta incompleta de WärmeNest

WärmeNest se añadió a PANEL/generate_panel.py y al registro pero no a
EDITOR/autoedit/store.py:ACCOUNTS. El catálogo de Lotes filtra mediante esa lista.
También faltaba en EDITOR/lanzar.py:ACTIVAS. No era pérdida de imágenes.

Al completar altas, comprobar el endpoint real /api/lote-app/catalog además de
Conceptos, assets, idioma y puertas de generación. Recargar la interfaz solo si
el borrador figura guardado. No declarar una cuenta lista basándose solo en HTML.
Prueba de regresión: python3 EDITOR/test_alta_waermenest.py.

El 28/09 se compararon 3094 documentos/código de EDITOR/CEREBRO/PANEL contra el
inventario del 27/09: ninguno ausente ni vaciado. 1781 marcados dataless; no implica
borrado ni permite certificar integridad de sus bytes. Los muros del sello son
legibles y sintácticamente válidos; la única diferencia fue la ampliación de
lanzar.py realizada en esta corrección. El sello reciente no prueba toda la historia.

La configuración .codex/hooks.json contiene matcher Bash/SendUserFile y guardia.py
filtra tool_name Bash. No presentar esta configuración como protección automática
verificada para herramientas exec_command ni para otros clientes. No se cambiaron
los hooks en esta reparación: requiere comprobar el soporte del runtime.
