# un-concepto-de-un-solo-clip-no-es-un-concepto

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-03, por TERCERA vez en el dia, Emmanuel encontro un concepto guardado a medias: el C12 de EisWerk tenia solo el clip1 cuando el video que pidio eran tres (sorpresa en el super, coger la caja, receta). Yo generaba el primer clip, lo registraba como CONCEPTO_N y me iba. Al poner la comprobacion aparecieron CINCO conceptos de un solo clip, no uno.
**Regla:** Un concepto NUNCA se deja con un solo clip, salvo que ese clip sea un seedance largo (8s o mas) que ya es un video entero por si mismo. Cuando Emmanuel describe un video encadenando ordenes («genera el clip X, luego regenera el clip2 del C9, luego la receta»), todo eso es UN concepto y hay que registrarlo entero, reutilizando los clips que ya existan. Ya esta tapiado: EDITOR/conceptos_completos.py lo detecta y el hook Stop no deja cerrar el turno con un concepto a medias.

```datos
{
 "checklist_frames": [
  "ningun concepto tocado en este turno se queda con un solo clip que no sea un seedance de 8s o mas"
 ]
}
```
