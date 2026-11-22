# al-adaptar-el-elemento-es-el-de-la-cuenta-destino

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 los dos clips de militares (TargetAlarm C4 y ZielAlarm C5) salieron con el ENSAMBLE DE EISWERK: el prompt copiado de GelatoVivo traia el elemento <<<d9cc80aa>>> y las reglas de esas cuentas no lo tocaban. Emmanuel: «antes de generarse cualquier video debera de comprobar que el elemento esta correctamente sustituido por la referencia del producto al que se va a adaptar».
**Regla:** Todo <<<elemento>>> del prompt FINAL tiene que ser un elemento de la cuenta que genera. Al adaptar, un elemento de otra cuenta se cambia por el de la cuenta destino con el mismo papel (embalaje/articulo); si no hay uno claro, no se genera. Tapiado en lanzar.py sobre el prompt ya montado.

```datos
{
 "checklist_frames": [
  "ningun <<<elemento>>> del prompt final pertenece a otra cuenta"
 ]
}
```
