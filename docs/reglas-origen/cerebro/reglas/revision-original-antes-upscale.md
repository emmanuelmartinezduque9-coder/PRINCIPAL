# Revisar el original antes del escalado

Si Emmanuel pide ver primero el original Seedance 2.5 a 480p, declarar en el encargo `revision_antes_upscale` con su petición explícita.

- La puerta genera y archiva el original con su audio y duración, conservando la versión anterior.
- Queda como `pendiente_revision_480p`, nunca como final escalado.
- La pausa persistente por trabajo bloquea también una llamada posterior de escalado hasta una nueva aprobación explícita del usuario.
- No es un fallback si falla el escalado y no modifica el estándar ByteDance Standard / 4K / 60fps / Common de otros vídeos.
- Revisar las acciones completas (por ejemplo, soltar el café y verlo caer antes del corte), no solo que aparezcan en el prompt.
