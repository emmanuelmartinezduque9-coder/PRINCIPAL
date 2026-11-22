# el-motor-se-decide-clip-a-clip

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** Un video de referencia no lleva un solo motor: cada clip puede llevar el suyo. Se detectan los cortes con EDITOR/cortes.py (ffmpeg, umbral 0.2 calibrado contra el analisis de Memories), se extrae el fotograma del inicio exacto de cada escena y se propone motor por clip. KLING solo si es UNA accion corta y estable Y todo lo que se ve ya esta en el frame, porque kling no admite imagenes de referencia. SEEDANCE si dura mas de 5s, si pasan varias cosas dentro de la escena, si aparece algo que no esta en el frame, o si hay habla. La tabla se le ensena a Emmanuel antes de generar: la propuesta no decide.

```datos
{
 "checklist_frames": [
  "el motor de cada clip esta justificado: kling solo cuando todo lo visible ya esta en el frame y es una accion corta"
 ]
}
```
