# lo-que-no-se-ve-se-comprueba-con-la-url

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** Si algo no se ve en la app, se comprueba pidiendo la URL con curl y mirando el codigo HTTP: NUNCA se atribuye a la herramienta de captura ni se da por arreglado sin medir. El 2026-09-02 di por bueno que los recuadros negros eran cosa de mi capturador; el 03 Emmanuel tuvo que repetirlo por tercera vez. La causa: las miniaturas se construian con el CDN de medias y los ids de generacion devuelven 403. La comprobacion vale por el comando: 'N de M URLs devuelven 200', no por mi palabra.

```datos
{
 "checklist_frames": [
  "todas las imagenes de la app devuelven HTTP 200, comprobado con curl sobre cada URL del index.html"
 ]
}
```
