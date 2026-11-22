# la-app-no-se-abria-y-yo-decia-que-si

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** Emmanuel puso la URL del panel y no abría. El servidor llevaba **desde el 30 de
agosto** en marcha devolviendo 404 en TODO —incluidos sus propios ficheros—: su ruta interna se
había quedado congelada apuntando a una carpeta que ya no era. Mientras tanto `panel.py estado`
decía «✅ La app está al día», porque solo comparaba **fechas de fichero**.

**El fallo de fondo** es el mismo que el del cerebro mudo del día anterior: **una comprobación
que mide lo que es fácil de medir en vez de lo que importa**. La fecha de `index.html` no dice
nada sobre si la app se puede abrir. Ahora `viva()` pide la URL de verdad, comprueba que
responde, que lo que devuelve es el panel, y que **coincide en tamaño con el fichero del disco**
(para cazar justamente el proceso viejo sirviendo otra versión). 
**Regla:** Una comprobacion que mide la FECHA de un fichero no demuestra que el servicio funcione. La app se da por buena solo si responde de verdad en su URL y sirve el mismo contenido que hay en disco; si un proceso viejo se queda sirviendo otra carpeta, hay que matarlo y rearrancar con 'python3 EDITOR/panel.py arrancar'.

```datos
{
 "checklist_frames": [
  "la app responde en su URL y sirve el mismo index que hay en disco, no solo tiene la fecha reciente"
 ]
}
```
