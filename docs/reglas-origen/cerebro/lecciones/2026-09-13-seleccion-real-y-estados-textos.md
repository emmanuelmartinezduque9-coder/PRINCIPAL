# Selección de lote: debe controlar el envío real

Emmanuel desmarcó el vídeo 3 de ZIELALARM para probar los otros seis, pero preparar/enviar seguía incluyendo los siete. Las casillas solo controlaban acciones de música/textos. La expectativa visible y el backend no coincidían.

Corrección: `selection` persistente y `prepared_ids` fijan el alcance. Preparar analiza/valida solo los seleccionados. Cambiar la selección exige prepararla de nuevo; no se amplía silenciosamente una lista vacía. Enviar comprueba la correspondencia exacta con las configuraciones preparadas y la aprobación de textos. `sent_items` y `dispatches` registran los envíos: un reintento no duplica trabajos. Los excluidos permanecen editables; los enviados quedan bloqueados en ese encargo. Se conservan sus snapshots y el historial sin modificar los conceptos.

No arreglar una edición ausente inventando texto ni copiando cualquier URL: señalar el menú visible **Textos**, con edición guardada / extraer de otro enlace / sin texto. Una captura de referencia del frame no sustituye automáticamente la referencia de edición.

Otro fallo: «Por revisar» mezclaba fallo técnico, procesamiento y aprobación. Mostrar el estado concreto en la cabecera de cada tarjeta y por cuenta: **Completar opciones**, **Error en textos**, **Procesando textos**, **Textos por aprobar**, **Listo para enviar**, **Enviado**. Cuando están listos sin aprobar, indicarlo como tal (no un error). Mostrar avisos específicos, como un emoji dudoso, y el botón de revisar/aprobar en la propia tarjeta; no aprobar por el usuario ni ocultar un fallo real bajo un mensaje de éxito.

Pruebas aisladas: `EDITOR/test_lote_selection.py`, `EDITOR/lote_selection_e2e.cjs`. Caso obligatorio: siete tarjetas, tercera incompleta, seleccionar seis; enviar exactamente seis, conservar la tercera, completarla y enviarla sin repetir las anteriores. Verificar también selección vacía, revisión, cambios posteriores, caché de análisis y estados claros.
