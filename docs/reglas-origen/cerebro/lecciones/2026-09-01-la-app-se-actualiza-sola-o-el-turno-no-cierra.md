# la-app-se-actualiza-sola-o-el-turno-no-cierra

**Fecha:** 2026-09-01 · **Ámbito:** GLOBAL
**Qué pasó:** Emmanuel ha tenido que pedir TRES veces que monte las cosas en la aplicacion: los frames aprobados, los conceptos C8 y C9 que existian y no salian, y las actualizaciones del registro. Siempre el mismo patron: yo cambio algo y me olvido de regenerar el panel
**Regla:** Cualquier cambio en registro, frames, numeros u overrides obliga a regenerar la app en el MISMO momento; entregar.py lo hace solo al archivar y el hook Stop bloquea el turno si la app esta desfasada

```datos
{
 "checklist_frames": [
  "la aplicacion refleja todo lo que se ha cambiado en este turno (conceptos, frames y entregas visibles en el panel)"
 ]
}
```
