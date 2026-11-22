# del-video-de-referencia-tambien-audio-y-camara

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-03 hice el clip1 del C3 de FlauschNest solo con la descripcion visual que devolvio Memories. Me deje dos cosas que si estaban en el original: ella dice «Oh mein Gott» en aleman, y a los 2,3 segundos la camara BARRE a lo largo del escaparate siguiendo su brazo hasta encuadrar el producto. Emmanuel: «pense que se lo pasabas a la api de memories, ese error no lo deberias de cometer». Ademas Memories devolvio la transcripcion VACIA aunque el video si tiene audio real.
**Regla:** De un video de referencia hay que sacar SIEMPRE tres cosas antes de escribir el prompt de un clip: que se ve, QUE SE DICE y COMO SE MUEVE LA CAMARA. Se pide a Memories la transcripcion ademas del caption, y si vuelve vacia no se da por hecho que no hay habla: se comprueba el audio del fichero y se mira la tira de fotogramas a 3 fps para cazar barridos, giros y cortes. Un prompt de clip escrito solo con el resumen visual no vale.

```datos
{
 "checklist_frames": [
  "el prompt del clip recoge lo que se dice y los movimientos de camara del original, no solo lo que se ve"
 ]
}
```
