# Regeneraciones sin cambios — orden del 12 septiembre 2026

Emmanuel: «solo validar los videos nuevos, las regeneraciones solo comprobar que
sea el mismo prompt y ya esta».

Esta orden prevalece sobre la aplicación retroactiva de los controles de vídeo.
Una regeneración sin cambios usa exactamente el prompt guardado: ni reconstrucción,
ni nuevos bloques de cámara, ni nuevo análisis de Memories, ni otro veredicto
independiente. Mantiene frame, cuenta, concepto, clip, motor y duración.
Se siguen aplicando los parámetros técnicos vigentes (caras Seedance: 720p nativo;
sin caras: 480p + escalado habitual), archivo y entrega diaria.

`EDITOR/regeneracion.py` compara el prompt final completo, hash y origen contra
un snapshot del registro anterior con hash. Cualquier cambio invalida esta ruta.
No se usa para adaptaciones, correcciones de prompt o vídeos nuevos. Estos
mantienen su validación normal. Registrar `regeneracion_guardada` en manifiesto,
registro y ficha. No confundir generado con aprobado por Emmanuel.

Si el usuario especifica cambios, pertenecen al flujo de corrección, no a esta
ruta. Para C4 pidió revisar el prompt por sospecha de pérdida: se cotejó con el
original y no se encontró pérdida. Tras su orden posterior de literalidad se
regenera el guardado; la propuesta de añadido de cámara NO se envía.
