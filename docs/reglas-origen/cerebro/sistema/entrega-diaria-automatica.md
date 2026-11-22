# Entrega diaria — automática, ya no se pide

Cada clip generado queda en DOS sitios, siempre:
- `NanoBanana/<CUENTA>/<CONCEPTO_n>/<clip>/` → mp4 + **prompt.txt exacto** + `ficha.json` (archivo canónico)
- `NanoBanana/_ENTREGA_DIARIA/<fecha>/<CUENTA>/` → copia lista para CapCut

Ya no depende de acordarse: **`EDITOR/lanzar.py` llama solo a `EDITOR/entregar.py` al terminar** cada generación ([[sistema/una-sola-puerta-para-video]]). Y el [[sistema/detector-de-deriva]] avisa cada mañana de cualquier vídeo generado que no llegó a la entrega.

**Por qué** (error 2026-08-31): se generaron 13 vídeos y no se archivó ni entregó ninguno hasta que Emmanuel tuvo que pedirlo. La regla llevaba escrita desde el principio; el problema era que dependía de la memoria. Descargar es gratis y protege el trabajo — no hay excusa para dejarlo «para luego».

Aplicada por: EDITOR/entregar.py (invocado automáticamente por EDITOR/lanzar.py)


## Hoja de entrega (2026-09-01)
Cada día se genera `ENTREGA.html` en la carpeta de la fecha: los vídeos se reproducen ahí mismo, con el pedido original, el frame de origen (por su nombre del panel) y el motor/duración. Nació de que Emmanuel no podía saber qué era cada vídeo del lote.
