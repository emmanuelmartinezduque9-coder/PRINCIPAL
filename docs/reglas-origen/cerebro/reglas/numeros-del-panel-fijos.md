# Los números del panel son fijos

El número de un frame se asigna **una sola vez** y vive en `PANEL/numeros.json`. **Los frames nuevos entran siempre por detrás y ningún número existente se mueve nunca.**

Porqué: antes el número salía de la POSICIÓN al ordenar; al entrar un frame nuevo se recolocaban todos y "frame galletas 5" pasaba a ser otra imagen distinta. Emmanuel se refiere a los frames POR NÚMERO, así que eso rompía sus referencias en silencio (arreglado 2026-08-31).

Rutina al aprobar frames — **EN EL MISMO MOMENTO, no después**:
1. Montarlos en el panel: `bash PANEL/refresh.sh` (o `python3 PANEL/generate_panel.py`).
2. Etiquetarlos en `PANEL/overrides.json` › `retag` (grupo).
3. Mandar a `hidden` las versiones descartadas del día, para que no ensucien.

Estos números son los que usan "regenera el C# de [cuenta], clip# frame N" (solo ese clip cambia de frame; el resto se regenera tal cual) y "regenera el frame [grupo] N" ([[reglas/nuevo-frame-vs-referencia]]). Si el grupo es ambiguo, tomar el del tipo/cuenta del concepto o confirmar en una línea.

Aplicada por: PANEL/generate_panel.py (números persistidos en PANEL/numeros.json).
