# Replicar debe probarse con tres vídeos diferentes, no solo con un envío

Emmanuel detectó que la tabla no permitía quitar trabajos y que pegar tres enlaces
seguía usando un único avatar y una única música. La prueba anterior comprobaba
campos globales y no representaba ese uso real.

Corrección: cada enlace detectado crea una fila con avatar, canción, inicio y permiso
propios ANTES de añadir. El servidor recibe `items`, valida todo y guarda el envío
de una vez. Un error no deja media tanda; un reintento del mismo `submission_id` no
duplica registros. Al reordenar enlaces sus elecciones viajan con ellos, no con su
posición. Números de avatares permanentes; «Sin avatar» es explícito. El selector
también se guarda para Seedance, sin cambiar el avatar predeterminado de la cuenta.

Quitar del lote no es borrar archivos: confirmación visible dentro de la app,
archivo recuperable y Deshacer. No depender de `window.confirm` del navegador
integrado. Los cambios de cola no esperan el bloqueo de una generación remota.
Snapshots anteriores no pueden revivir un trabajo retirado ni deshacer una restauración.

Prueba mínima permanente: tres URLs, tres selecciones de avatar, canciones/inicios
distintos, reordenación, error en el último elemento, reintento, retirar/cancelar/
deshacer y conservación de archivos. Probar UI y persistencia HTTP, no solo el JSON
del formulario. Ver `EDITOR/test_replicar_por_enlace.py`, `EDITOR/test_replicar.py`
y `EDITOR/replicar_por_enlace_20260913/`.

Genjutsu conserva la elección de música en `edicion_pedida`; esto no activa análisis
Seedance ni render pagado. No lanzar generaciones para comprobar un formulario.
