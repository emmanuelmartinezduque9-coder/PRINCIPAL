# la-url-de-un-frame-no-se-construye

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** La URL de un frame NO se construye pegando el id al CDN de medias: la mitad de los ids del catalogo son de GENERACION y ahi ese CDN devuelve 403 — en la app se ven recuadros negros. La URL buena viene en el propio listado de generaciones (result_url / min_result_url) y se guarda en un mapa ACUMULATIVO (PANEL/urls_frames.json), porque el listado solo trae las ultimas generaciones y las viejas se caerian. Ademas: el 2026-09-02 di por bueno que las imagenes en negro eran cosa de mi capturador de pantalla; era real y Emmanuel lo veia en su navegador. Si algo no se ve, se comprueba pidiendo la URL, no se atribuye a la herramienta.

```datos
{
 "checklist_frames": [
  "todas las imagenes de la app devuelven 200: se ha comprobado pidiendo las URLs, no a ojo"
 ]
}
```
