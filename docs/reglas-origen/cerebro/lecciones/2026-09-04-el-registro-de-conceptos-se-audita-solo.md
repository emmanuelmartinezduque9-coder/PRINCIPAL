# el-registro-de-conceptos-se-audita-solo

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 Emmanuel: «la parte de conceptos en imagenes, prompts y clips lo tienes ASQUEROSO». Al medirlo habia 30 problemas: 14 clips con el id del frame CORTADO a 8 caracteres (no apuntan a nada), frames que desaparecian del panel porque el catalogo se reconstruia solo con las ultimas 100 generaciones, frames mal clasificados en «Otros», clips sin prompt guardado y conceptos de un solo clip.
**Regla:** El registro de conceptos se audita solo y el turno no se cierra con conceptos rotos. EDITOR/auditar_conceptos.py comprueba en las cuentas activas: prompt guardado, frame presente, frame que existe de verdad, frame no escondido, frame de la cuenta correcta (las cuentas hermanas si comparten) y concepto con mas de un clip. Ademas: el catalogo del panel es ACUMULATIVO (un frame no desaparece nunca) y lanzar.py no escribe el registro si algun clip queda con el id del frame cortado.

```datos
{
 "checklist_frames": [
  "el auditor de conceptos sale limpio: cada clip con su frame completo y su prompt guardado"
 ]
}
```
