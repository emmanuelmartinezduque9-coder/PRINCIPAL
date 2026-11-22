# un-muro-se-mide-contra-el-dia-del-turno

**Fecha:** 2026-09-05 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-05, al pasar la medianoche, el hook Stop me bloqueo exigiendo una leccion nueva por una correccion de AYER que ya tenia 16 lecciones escritas ese dia. Buscaba lecciones con la fecha de HOY en vez de la fecha del turno. Es la tercera vez en dos dias que un muro mio grita en falso (antes: el que miraba el registro entero y el auditor que acusaba sin preguntar al CDN).
**Regla:** Una comprobacion que depende de la fecha se mide contra el dia DEL TURNO, no contra el dia de hoy: si no, cualquier turno que cruce la medianoche empieza bloqueado por trabajo ya hecho. Y la regla general que ya llevo tres veces: antes de acusar, comprobar contra el dato correcto.

```datos
{
 "checklist_frames": [
  "las comprobaciones con fecha usan la fecha del turno, no la del reloj"
 ]
}
```
