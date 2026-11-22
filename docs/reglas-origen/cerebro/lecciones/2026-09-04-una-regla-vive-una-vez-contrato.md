# una-regla-vive-una-vez-contrato

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 Emmanuel pidio un rediseño completo porque «los errores que sigues cometiendo son de inicio». La causa raiz: la misma regla vivia DOS veces (lanzar.py para video, frame.py para imagen) y las copias se separaban: la lista negra solo en imagen, la tercera imagen solo en video, los elementos ajenos solo en video.
**Regla:** Cada comprobacion compartida vive UNA vez en EDITOR/contrato.py y las dos puertas la llaman. Ampliar el contrato amplia las dos puertas. Un muro nuevo que sirva a mas de una puerta se escribe ahi, nunca duplicado.

```datos
{
 "checklist_frames": [
  "la regla que se acaba de añadir vive en contrato.py si sirve a imagen y a video"
 ]
}
```
