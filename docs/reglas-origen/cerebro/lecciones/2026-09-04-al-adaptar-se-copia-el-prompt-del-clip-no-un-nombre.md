# al-adaptar-se-copia-el-prompt-del-clip-no-un-nombre

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04, adaptando el C8 de GelatoVivo a EisWerk, cogi el prompt de la biblioteca llamado «1,2,3» en vez del texto guardado de ESE clip. El de la biblioteca es dos empleados en una tienda con un carro; el C8 son TRES CHICAS en un salon. Mande una escena que no tiene nada que ver. Emmanuel: «ni siquiera es el prompt original».
**Regla:** Adaptar un concepto es COPIAR el prompt guardado del clip de origen y cambiarle solo el idioma. El nombre de un prompt de la biblioteca NO identifica la escena: puede haber varias versiones y la que vale es la que genero ese clip. Ya esta tapiado: lanzar.py acepta "prompt": {"copiar_de": {"cuenta":..., "concepto":..., "clip":...}}, que trae el texto exacto del registro, le quita las notas y le aplica las reglas de idioma de la cuenta destino.

```datos
{
 "checklist_frames": [
  "en una adaptacion, el prompt de cada clip viene copiado del clip de origen (copiar_de), no de un nombre de biblioteca"
 ]
}
```
