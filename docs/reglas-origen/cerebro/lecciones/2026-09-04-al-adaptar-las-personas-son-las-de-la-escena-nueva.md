# al-adaptar-las-personas-son-las-de-la-escena-nueva

**Fecha:** 2026-09-04 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-04 los militares hablaban con voz de mujer: cambie «three young women» por «three soldiers» y el prompt seguia diciendo women/she/her nueve veces. El modelo hace caso a lo que queda escrito, no a lo que yo crei cambiar.
**Regla:** Al adaptar una escena, el contrato de escena declara QUIENES son las personas (personas_son) y que palabras de las anteriores NO pueden quedar (no_pueden_quedar). Si queda rastro, no se genera. Tapiado en contrato_escena de lanzar.py.

```datos
{
 "checklist_frames": [
  "si la escena declara personas_son, no queda en el prompt ninguna palabra de no_pueden_quedar"
 ]
}
```
