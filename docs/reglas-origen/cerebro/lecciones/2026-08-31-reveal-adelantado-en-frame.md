# Reveal adelantado en el frame

**Fecha:** 2026-08-31 · **Ámbito:** GLOBAL

**Qué pasó:** En un clip de reveal, el frame de partida ya enseñaba lo que el clip tenía que destapar. Lo que se destapa es la CAJA: si el producto ya está a la vista en el segundo 0, el clip no revela nada.

**Por qué pasó:** Generé el frame pensando en «que salga el producto de la cuenta», sin pensar QUÉ momento del clip representa ese frame. El frame es el instante ANTES de la acción, no un resumen del clip.

**Regla que dejó:** El frame de un clip de reveal muestra el momento previo: caja cerrada, producto tapado. Nada de lo que el clip debe revelar puede verse ya en el frame. Aplica junto a [[reglas/frame-desde-referencia]]. Fue este caso el que destapó también [[lecciones/2026-08-31-tocar-el-muro-para-pasar]].

Aplicada por: EDITOR/verificar.py (revisión independiente del frame antes de enseñar nada) + el aviso de EDITOR/lanzar.py sobre referencias que sobran en un reveal.
