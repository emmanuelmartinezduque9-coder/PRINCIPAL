# cada-motor-tiene-un-minimo-de-segundos

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 el clip1 del C5 de FlauschNest se perdio entero: pedi 3 segundos porque su escena en el video de referencia dura 2,6 s, y seedance rechaza cualquier duracion menor de 4 («duration: Input should be greater than or equal to 4»). La puerta comprobaba el TOPE de duracion pero no el MINIMO.
**Regla:** Cada motor tiene un minimo de duracion ademas de un tope: seedance 4s, kling 3s. Si la escena del video de referencia dura menos que el minimo, el clip se genera al minimo del motor y se le dice a Emmanuel. Tapiado en lanzar.py con MINIMOS, se comprueba antes de gastar.

```datos
{
 "checklist_frames": [
  "la duracion pedida esta dentro del minimo y el tope del motor"
 ]
}
```
