# traducir-un-idioma-no-es-cambiar-la-palabra

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 mi traduccion automatica de idioma cambio «Italian»->«English» en TODO el prompt, incluida la frase que PROHIBIA un idioma. Resultado: «must be in native English … No English at any point» y en el negativo «No English speech», con las lineas habladas en ingles. Seedance obedece el negativo: el clip habria salido mudo o en otro idioma. Lo caza el verificador independiente, no yo.
**Regla:** Al pasar un prompt de un idioma a otro hay que reparar tambien las PROHIBICIONES: si el prompt prohibe justo el idioma de la cuenta destino, se convierte en «no language other than <idioma>». Tapiado en adaptar_idioma de lanzar.py. Y la regla general: un cambio de idioma no es un buscar-y-reemplazar, hay que releer lo que queda.

```datos
{
 "checklist_frames": [
  "el prompt no exige y prohibe el mismo idioma a la vez"
 ]
}
```
