# un-auditor-no-puede-gritar-en-falso

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 mi auditor de conceptos acuso a dos frames de TargetAlarm de «no existir en ningun sitio». Existian: lo que pasa es que solo miraba las caches locales, y esas solo guardan las ultimas generaciones. Antes ya me habia pasado con la comprobacion frame-contra-video, que daba 13 falsos positivos porque Seedance reencuadra.
**Regla:** Una comprobacion que acusa tiene que verificar de verdad antes de acusar: si el dato no esta en la cache local, se pregunta a la fuente (el CDN) y se cachea la respuesta. Un auditor que grita en falso se acaba ignorando y entonces no protege de nada. Si una comprobacion da falsos positivos, se corrige o se baja a diagnostico, nunca se deja gritando.

```datos
{
 "checklist_frames": [
  "las comprobaciones que bloquean el turno no dan falsos positivos: lo que acusan se ha verificado contra la fuente"
 ]
}
```
