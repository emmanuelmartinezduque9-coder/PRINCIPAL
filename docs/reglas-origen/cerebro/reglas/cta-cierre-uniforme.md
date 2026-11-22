# CTA uniforme de cierre — orden de Emmanuel, 03/10/2026

Evidencia: `Sentinel_7e2712d396108191bb150fe655592fbd`.

Texto exacto de EisWerk, en una capa editable distinta del gancho:

```text
Kommentiere "EisWerk"
für den Link 🍨💖🎄🔗
```

Para cada cuenta solo cambia el nombre entre comillas y los emojis relacionados
con el producto. El CTA queda uniforme por cuenta, en dos líneas y al final.
No crear variantes de redacción ni mezclarlo con el texto del hook. No implica
modificar voz, música, clips o prompts de generación.

Aplicación: nuevas solicitudes de proyectos/variaciones y la entrega EisWerk
actual aún pendiente. Sin migración de proyectos terminados, colas históricas
o los nueve proyectos NagelKlar actuales. El ejemplo NagelKlar es para futuras
preparaciones: `Kommentiere "NagelKlar"` / `für den Link 💅✨💖🔗`.

Mecanización: `EDITOR/closing_cta_defaults.json` conserva nombre y emojis por
cuenta; `capcut_projects.enqueue` congela la política en solicitudes nuevas.
`closing_cta.prepare_plan` usa un estilo de texto existente seleccionado,
prepara una capa separada de cierre y limita hook/body al intervalo anterior.
`capcut_texts.prepare` y la entrega comprueban texto exacto, dos líneas,
posición final y ausencia de solapamiento. CTA vacío o plantilla ausente no
se declara entrega completa. Si falta un estilo real, queda pendiente de
plantilla; no se inventa un formato de CapCut.

La preparación offline con una copia en memoria puede hacerse con CapCut
abierto; escribir sus proyectos sigue requiriendo que esté cerrado.
