# No volver a pedir permiso para fallos sin salida

Fallo observado: los dos Object Swap del lote 54 quedaron en `failed`, sin URL ni archivo, y no se reintentaron pese a la autorización previa de Emmanuel. La existencia del helper de reintento no bastaba: faltaba conectar su recuperación al motor y aplicar la orden durante el trabajo.

Corrección inmediata: se validaron los fallos originales y se reservaron tickets hijos idempotentes con los mismos parámetros. Higgsfield aceptó Nailuna `192d44c5-0d97-4140-a9eb-8d42ad586e0f` y KuschelGrinch `ebd4530d-b591-482e-a5a7-5758f0b9fa2b`. Aceptación no equivale a entrega.

Evidencia: `EDITOR/lotes/app_20260922_54/v8.retry-authorization.json`, `v9.retry-authorization.json`, los recibos `v8.retry1.mcp-receipt.json` y `v9.retry1.mcp-receipt.json`. Política permanente: `CEREBRO/reglas/reintentos-sin-salida.md`.

No reintentar estados pendientes/inciertos ni resultados existentes; tampoco rechazos de seguridad. No afirmar reembolso sin evidencia. Conservar cada intento y no presentar el trabajo como terminado antes de revisión.
