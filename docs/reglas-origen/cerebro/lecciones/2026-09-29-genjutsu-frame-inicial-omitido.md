# Omitir el frame inicial en Genjutsu

En Nailuna vídeo 4 del lote29, el recibo `v4base.recibo_mcp.json` registra
vídeo fuente, avatar y artículo, pero no un frame inicial limpio. El prompt decía
«No text overlays, captions, emojis or interface»; el resultado conservó textos
residuales. Emmanuel había pedido el frame inicial y el 29/09 ordenó regenerar
solo este vídeo y convertir el requisito en un bloqueo.

La guía local aún decía «no generar frames por rutina». Aplicar esa regla general
contra una instrucción específica fue un fallo del flujo, no falta de información
del usuario. Se sustituye por `../reglas/genjutsu-frame-inicial-obligatorio.md`.

No afirmar que el frame garantiza borrar textos. Verificar todas las tomas y
conservar el original; no aprobar ni regenerar resultados por decisión interna.
