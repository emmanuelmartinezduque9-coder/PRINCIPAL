# Variante de color (rosa/azul) — el frame manda

- Cuando Emmanuel sube un frame cuya variante de producto es **azul** o **rosa**, se adapta el prompt cambiando **SOLO el color** del producto. Ningún otro cambio. Porqué: el color es lo ÚNICO distinto entre variantes; tocar algo más crea diferencias que nadie pidió.
- La variante se identifica **mirando el frame**, no asumiendo por la cuenta ni preguntando — "el color del producto lo manda EL FRAME, no la cuenta" ([[reglas/globales]]).
- El imgcomplemento que acompaña es el **mockup ROSA o el mockup AZUL** según la variante detectada; en clips de recetas ese mockup entra solo (regla de resolución automática clip → frame + elementos).
- El mockup se referencia **por NOMBRE desde `EDITOR/assets.json`**, jamás por id, como toda imagen ([[reglas/referencia-de-producto]]).

Ojo con el atajo mental del recoloreado: cambiar solo el color vale entre variantes rosa/azul del MISMO producto, pero NUNCA entre cuentas — [[reglas/producto-eismeister-es-otra-maquina]].

Aplicada por: EDITOR/lanzar.py (imágenes por nombre con papel declarado en assets.json).
