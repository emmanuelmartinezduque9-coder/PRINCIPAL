# el-id-de-una-generacion-no-es-un-media-id

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** Un asset de cuenta tiene que ser un MEDIA de Higgsfield, no el id del job que lo genero. Los dos son UUID y se parecen, pero la URL del CDN de medias devuelve 403 con un id de generacion: los assets no cargaban en la app y las generaciones que los usaran de referencia habrian fallado. Despues de generar un asset hay que SUBIRLO con 'higgsfield upload create' y guardar ESE id. Y subirlo ligero: un PNG de 2048x2048 pesa hasta 8,5 MB y la app tarda en pintarlo; redimensionar a 1400 px deja el peso en 0,5-2,7 MB sin perder nada util.

```datos
{
 "checklist_frames": [
  "los assets de la cuenta son media_id subidos con upload create, no ids de generacion, y pesan menos de 3 MB"
 ]
}
```
