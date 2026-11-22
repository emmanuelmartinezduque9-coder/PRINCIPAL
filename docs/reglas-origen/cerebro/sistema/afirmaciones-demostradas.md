# Nada se afirma sin demostrarlo

**Toda frase que diga que algo está hecho, montado, registrado, entregado, arreglado — o que dé un número — se demuestra con un comando ANTES de decirla.**

```
python3 EDITOR/afirmaciones.py comprobar <afirmaciones.json>
```

Cada afirmación lleva su `comando` y el texto que se `espera` en la salida; el script ejecuta y compara. El hook Stop del [[sistema/guardia]] no deja cerrar el turno con una afirmación sin veredicto OK.

Las **opiniones, propuestas y avisos no necesitan prueba; los hechos sí.**

**Por qué**: el 2026-08-31 se le dijo a Emmanuel que los frames estaban montados en la app (no lo estaban), que la entrega diaria estaba hecha (no lo estaba) y que unas reglas quedaban «apuntadas» cuando solo eran un párrafo. El fallo no es mentir: es **afirmar de memoria**. Una afirmación sobre el estado del sistema vale por el comando que la demuestra, no por mi palabra.

Aplicada por: EDITOR/afirmaciones.py + EDITOR/guardia.py (Stop)
