# Pruebas del selector Replicar: borrado accidental y recuperación

Al comprobar los menús nativos de Replicar con CUA, se activó accidentalmente la
acción de quitar el trabajo 2026-09-10-011 (RentierGlanz, ensayo Genjutsu). No atribuir
una causa técnica exacta sin reproducirla en una copia aislada. El botón no pedía confirmación.

Se avisó inmediatamente a Emmanuel. Se recuperó la entrada desde lote_estado.json.bak
(sin alterar sus valores), el MP4 desde la copia indexada comprobando su SHA256 original,
el recibo y estado de Higgsfield desde los FileChange del historial, la descripción y
transcripción ya indexadas con get_video_content y los dos contactos con los comandos
ffmpeg originales. No se relanzó el ensayo ni se modificaron sus tickets.

Se añadió confirmación explícita a Quitar del lote. Las pruebas de escritura del
formulario deben ejecutarse contra registro temporal; en producción, limitar la
comprobación a lectura y no accionar menús nativos cerca de acciones destructivas.

Comprobación de la recuperación: EDITOR/comprobar_replicar.py.
