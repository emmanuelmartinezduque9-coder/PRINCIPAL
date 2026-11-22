# Verificador independiente de frames

Mi criterio visual falló el 2026-08-31 (mandé el frame de [[cuentas/EisMeister]] con el producto de [[cuentas/EisWerk]] pintado de menta; lo cazó Emmanuel, no yo). Esforzarme más no lo arregla: hace falta alguien que **no comparta mi contexto** y no herede mi punto ciego.

```
python3 EDITOR/verificar.py abrir  <lote> <frames.json>   # baja referencia+resultado y BLOQUEA el envío
python3 EDITOR/verificar.py brief  <lote>                 # texto exacto para cada subagente
python3 EDITOR/verificar.py cerrar <lote>                 # lee veredictos y sella (o no)
```

Un subagente por frame, **SIEMPRE con model: haiku** (comparar imágenes no requiere razonar caro — ver [[sistema/techos-de-coste]]). Responde APROBADO/SUSPENSO punto por punto **mirando la imagen**, no el prompt. A mi lista se añaden siempre 8 comprobaciones fijas (producto de la cuenta, overlay fuera, 4 objetos de fondo distintos, encuadre, manos, piel, reveal no adelantado, logos).

**CUÁNDO SÍ** (cada verificador cuesta ~110k tokens, NO se pasa por todos los frames):
- el frame lleva un producto que ya salió mal antes (EisMeister y sus piezas),
- se cambia el producto de una cuenta por el de otra,
- Emmanuel ya rechazó ese frame una vez.

**CUÁNDO NO**: frame rutinario → lo miro yo contra la referencia ([[reglas/globales]], patrón [[reglas/frame-desde-referencia]]) y se lo enseño; si él lo rechaza, ENTONCES entra el verificador. Gastar 200k en un frame que estaba bien es un fallo, no rigor.

El [[sistema/guardia]] **bloquea `SendUserFile` de cualquier imagen mientras haya un lote sin sellar**. Si algo sale SUSPENSO → se regenera, no se enseña.

Aplicada por: EDITOR/verificar.py + EDITOR/guardia.py (SendUserFile)
