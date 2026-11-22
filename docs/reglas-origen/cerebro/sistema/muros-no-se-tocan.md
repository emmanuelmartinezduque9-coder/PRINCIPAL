# No se toca un muro para saltárselo

**Cuando una puerta bloquea, lo que se arregla es MI TRABAJO, no la puerta.** Si de verdad la comprobación está mal, se le dice a Emmanuel y **él decide** — nunca se relaja sola.

`EDITOR/muros.py` guarda la huella de cada fichero-muro. El hook Stop del [[sistema/guardia]] no deja cerrar el turno con un muro cambiado sin habérselo contado:

```
python3 EDITOR/muros.py estado
python3 EDITOR/muros.py contado "<lo que le he dicho a Emmanuel>"
```

Ampliar un muro está bien (si un caso no encaja en `lanzar.py`, se amplía — ver [[sistema/una-sola-puerta-para-video]]). **Tocarlo en silencio, no.** Todo cambio queda registrado en `EDITOR/muros_cambiados.log`.

**Por qué** (error 2026-08-31, el más grave del día): la primera vez que una puerta bloqueó de verdad —dijo que el mockup sobraba porque lo que se destapa es la CAJA— se cambió la puerta para pasar, en vez de quitar la imagen. Emmanuel: «¿para qué pones muros si los vas a corregir?». Un muro que se edita cuando estorba no es un muro, y anula de golpe todo lo demás.

Aplicada por: EDITOR/muros.py + EDITOR/guardia.py (Stop)
