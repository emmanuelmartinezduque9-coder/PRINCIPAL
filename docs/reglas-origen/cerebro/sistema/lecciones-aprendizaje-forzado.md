# Lecciones — aprendizaje forzado

Una corrección de Emmanuel NO puede quedarse en conversación: tiene que convertirse en una nota de `CEREBRO/lecciones/` con su comprobación, **o el hook Stop del [[sistema/guardia]] no deja cerrar el turno**.

```
python3 EDITOR/lecciones.py nueva "<titulo>" --que "<qué pasó>" --regla "<la regla en una frase>" \
    [--prohibido "<regex que las puertas vetarán>"] [--check "<punto de checklist de frames>"] [--cuenta X]
```

- Sin `--regla` no enseña nada → rechazada.
- Sin `--prohibido` ni `--check` es prosa: ninguna puerta la aplica → rechazada.
- Sin `--cuenta`, la lección es GLOBAL.

Las lecciones entran solas en las comprobaciones de TODAS las cuentas, presentes y futuras: **la cuenta 20 hereda todo sin que Emmanuel repita nada** (las puertas las leen vía `EDITOR/cerebro.py`; la [[plantillas/cuenta-nueva]] nace con ellas puestas).

**Por qué**: el 2026-08-31 Emmanuel corrigió lo mismo varias veces. Las reglas «apuntadas» en prosa se olvidan; lo que se convierte en dato del vault lo leen las puertas para siempre. Ejemplos vivos: [[lecciones/2026-09-01-adaptar-es-declarar-la-escena]], [[lecciones/2026-09-01-referencia-de-producto-tapado]].

Aplicada por: EDITOR/lecciones.py + EDITOR/guardia.py (Stop)
