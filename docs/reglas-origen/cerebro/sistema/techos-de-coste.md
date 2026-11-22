# Techos de coste — duros

Origen: 2026-09-01, **200k tokens por verificar UNA imagen = inaceptable**.

- **Verificadores visuales: SIEMPRE subagente con `model: haiku`** — comparar imágenes no requiere razonar caro — y SOLO en casos de riesgo (producto conflictivo, cambio de producto entre cuentas, frame ya rechazado). Detalle: [[sistema/verificador-independiente]].
- **Frame rutinario: lo miro yo** contra la referencia. Sin subagentes.
- **No releer los .md grandes**: preguntar a `EDITOR/cerebro.py` o a `graphify query`.
- **Imágenes siempre reducidas** (`sips -Z`) antes de abrirlas.

A esto se suman las reglas de eficiencia de [[reglas/globales]]: salidas de terminal cortas, prompts largos en archivos (no re-pegados al chat), generar por CLI cuando no hace falta widget, agrupar operaciones. El gasto de Claude sube por salidas largas y texto repetido, no por descargar: descargar/archivar es gratis y protege el trabajo ([[sistema/entrega-diaria-automatica]]).

Gastar de más «por rigor» es un fallo igual que gastar de menos por pereza: el rigor va en las puertas ([[sistema/una-sola-puerta-para-video]], [[sistema/guardia]]), no en quemar tokens.
