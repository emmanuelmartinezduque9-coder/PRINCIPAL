# un-corte-detectado-no-es-un-clip-hasta-mirarlo

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** ffmpeg mide cambio de PIXELES, no cambio de escena. Cuando alguien gira el movil deprisa, el cuadro cambia entero y se lee como corte, pero narrativamente es la MISMA toma. El 2026-09-02 di por clip 2 el volteo de camara del clip 1 y el clip 2 de verdad estaba un corte mas alla; lo tuvo que corregir Emmanuel. ANTES de dar por buena la particion hay que MIRAR el fotograma de cada corte y fundir con el anterior los que sean barridos. cortes.py avisa con «¿PANEO?» cuando la imagen ya venia moviendose mucho antes del corte: el aviso da falsos positivos a proposito, porque mirar un fotograma de mas no cuesta nada y partir mal un video cuesta una generacion.

```datos
{
 "checklist_frames": [
  "los cortes detectados se han mirado uno a uno y los que eran barridos de camara estan fundidos con su clip anterior"
 ]
}
```
