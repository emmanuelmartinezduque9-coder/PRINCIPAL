# un-muro-no-puede-bloquear-lo-que-no-le-toca

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 puse un muro en registrar() que comprobaba el registro ENTERO antes de escribir. Discomagia, cuenta retirada, arrastra ids de frame viejos cortados, asi que TODA escritura del registro empezo a abortar en silencio. El clip3 del C8 de GelatoVivo se genero con el frame navideno y su frame NUNCA se guardo: Emmanuel lo pregunto cuatro veces y yo le contestaba que el dato estaba bien porque miraba el registro… que no se habia actualizado.
**Regla:** Un muro comprueba SOLO lo que se esta escribiendo o generando en ese momento, nunca el historico entero: si no, datos viejos que ya no se pueden arreglar bloquean el trabajo de hoy y encima en silencio. Y cuando un dato «no cambia» despues de una generacion, lo primero que hay que mirar es si la escritura fallo, no si el dato de origen esta mal.

```datos
{
 "checklist_frames": [
  "el muro que valida el registro mira solo las filas del lote, no el registro completo"
 ]
}
```
