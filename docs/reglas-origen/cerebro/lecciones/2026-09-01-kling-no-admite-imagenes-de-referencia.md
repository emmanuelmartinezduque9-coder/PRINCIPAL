# kling-no-admite-imagenes-de-referencia

**Fecha:** 2026-09-01 · **Ámbito:** GLOBAL
**Qué pasó:** 3 clips de kling fallaron en silencio porque lanzar.py les pasaba --image-references, que kling3_0 no acepta; el fallo se perdio en medio del log
**Regla:** kling3_0 solo admite start_image/end_image: en Kling el producto TIENE que verse en el frame, y cualquier generacion fallida se avisa en un resumen final ruidoso

```datos
{
 "checklist_frames": [
  "si el clip es de Kling, el producto se ve en el propio frame (no se pueden adjuntar imagenes de referencia)"
 ]
}
```
