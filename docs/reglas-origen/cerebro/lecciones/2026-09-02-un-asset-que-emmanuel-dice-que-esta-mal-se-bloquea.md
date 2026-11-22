# un-asset-que-emmanuel-dice-que-esta-mal-se-bloquea

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** Cuando Emmanuel dice que un asset esta mal («ese no es el producto correcto») no basta con 'tenerlo en cuenta': se marca con "incorrecto" en assets.json y las dos puertas PARAN si alguien lo declara. Si solo lo apunto, la siguiente generacion lo vuelve a usar sin que nadie lo note. Y si el dice «no regeneres nada», no se regenera: se bloquea y se espera a que pase la referencia buena.

```datos
{
 "checklist_frames": [
  "ningun asset marcado como incorrecto se usa en la generacion"
 ]
}
```
