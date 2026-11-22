# app-se-actualiza-sola-tras-cada-lote

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** entregar.py llevaba desde su creacion con un import roto (import panel, cuando el fichero es generate_panel.py); el error se tragaba en silencio y la app NUNCA se refrescaba sola tras archivar un video, pese a lo que decia CLAUDE.md. Y frame.py nunca llamaba a nada: los frames generados no tocaban la app hasta un refresh.sh manual. Corregido 2026-09-03: los dos llaman de verdad a PANEL/refresh.sh.
**Regla:** Tras CUALQUIER lote (frames o videos) la app se actualiza sola, sin que Emmanuel lo pida. Ademas: cuando se regenera un concepto y un clip cambia de frame, ESE frame pasa a ser el guardado en el registro para ese clip. Y al leer un mensaje de Emmanuel con varias ordenes encadenadas, el frame/clip/concepto se identifica por el CONTENIDO que describe (que persona, que fondo, que cuenta, que numero de clip menciona), no hace falta que lo deletree; si de esas ordenes sale un concepto que no existe todavia en la cuenta, se crea solo en el registro, sin preguntar.

```datos
{
 "checklist_frames": [
  "tras generar el lote, PANEL/index.html quedo actualizado en el mismo momento (automatico, no se pide a mano)"
 ]
}
```
