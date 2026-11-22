# nombres-que-no-se-parecen

**Fecha:** 2026-09-01 · **Ámbito:** GLOBAL

**Qué pasó:** en los dos clips de «dejar caer el café» adjunté la **imagen de producto** cuando lo único
que se revela son **cajas** en un estante. Emmanuel: *«los videos estan bien pero literalmente por
suerte… es algo que ya te lo he repetido muchas veces y en lo que supuestamente ya habias puesto un
muro para que no volviera a pasar»*.

**Por qué el muro no sirvió:** solo saltaba si el prompt decía que el producto iba TAPADO, y ahí no hay
nada tapado. Y no podía distinguir una caja de un producto porque **los nombres compartían la palabra
«producto»**: `caja` era «la caja de producto», `producto` era «el producto», y `mockup` era otro nombre
para lo mismo que `producto`. Tres nombres para dos cosas.

**Regla:** Dos cosas distintas no pueden compartir una palabra en su nombre. EMBALAJE = la caja de venta cerrada; ARTICULO = el producto solo. 'mockup' NO es una categoria de imagen: es solo el paso previo para generar la imagen de producto limpia. Y las imagenes no se eligen: se declara que se ve (en_pantalla) y el sistema las pone.

**Lo que destapó de paso**, y es lo más grave del día:
- Tres notas del CEREBRO tenían el bloque `datos` con **JSON inválido**, así que el muro del día
  anterior estaba **mudo** para EisWerk, Gelatovivo y EisMeister: `lanzar.py` se lo tragaba con un
  `except: lista = []`. **Un control que se calla cuando sus datos fallan no es un control.** Ahora para.
- El grupo de color `menta_azul` mezclaba dos productos distintos y hacía que el sistema pidiera una
  imagen «menta» inexistente en cuentas cuyo producto es **azul**.
- El clip 2 de ZielAlarm/TargetAlarm tenía el fallo **contrario**: el prompt enseña el reloj saliendo
  de la caja y solo se adjuntaba la caja. Lo cazó el cotejo en sentido inverso.

**Cómo reconocerlo la próxima vez:** cuando dos cosas se confunden una y otra vez, mirar primero si
**comparten una palabra**. Si la comparten, no es falta de atención: es nomenclatura, y se arregla
renombrando, no esforzándose más.

```datos
{
 "checklist_frames": [
  "si se adjunta la imagen del articulo, el prompt tiene que ensenar el producto en si, no solo su caja"
 ]
}
```

Relacionado: [[vocabulario-de-imagenes]] · [[2026-09-01-solo-se-adjunta-lo-que-se-va-a-ver]] · [[variante-de-color]]
