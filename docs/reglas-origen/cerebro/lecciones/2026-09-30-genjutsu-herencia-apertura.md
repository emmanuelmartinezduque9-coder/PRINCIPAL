# Regeneración literal y apertura histórica — 30/09/2026

Emmanuel autorizó corregir la vinculación de Nailuna C18 en lote12 conservando
imagen, prompt y referencias, sin generar otro frame. Orden literal y snapshot
por hash en `EDITOR/lotes/app_20260930_12/nailuna_autorizacion.json`.

`genjutsu_regeneration.py` resuelve exclusivamente el clip congelado elegido,
comprueba bytes y aprobación histórica del mismo frame y exige prompt, motor,
duración y lista ordenada de referencias idénticos. No fabrica revisión ni
aprobación nueva. El frame sigue enviado como referencia de apertura.
No concede permiso general para adaptar ni reutilizar aprobaciones de otra imagen.

La reserva de esta ruta incorpora lote/item/clip a su identidad: una regeneración
expresamente encargada puede repetir parámetros históricos, pero dos envíos del
mismo item siguen colisionando. Los tickets históricos quedan intactos.
La recuperación de colisión local exige traceback FileExists contra el ticket
aceptado del job fuente; no reinicia solicitudes inciertas del proveedor.

Pruebas: `test_genjutsu_saved_opening` y `test_regeneration_engine_inheritance`.
La comprobación previa no demuestra generación ni aprobación del vídeo resultante.
