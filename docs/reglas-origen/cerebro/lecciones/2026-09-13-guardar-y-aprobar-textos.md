# Guardar correcciones y aprobar la versión vista

Emmanuel corrigió los textos del lote en el editor y confirmó haberlos aprobado,
pero seguían como pendientes. La ruta de guardar solo llamaba a `reference-texts/revise`;
no registraba la aprobación en el lote. Explicar de nuevo el botón de aprobación no
resolvía esa desconexión.

En la revisión de textos extraídos del lote, el botón **Guardar y aprobar** envía
las correcciones junto con la versión vista a `lote-app/review`. Se valida el lote,
el vídeo, la referencia y la revisión antes de guardar. Después se congela y aprueba
esa revisión exacta. No se aprueba una versión posterior que el usuario no vio.
Las aprobaciones individuales y conjuntas también envían las revisiones mostradas.

Guardar sin cambios reales no incrementa la revisión ni invalida aprobaciones.
Un cambio real posterior sí exige una nueva aprobación. El editor independiente de
la biblioteca mantiene guardado sin aprobación del lote. No aprobar automáticamente
por abrir el editor ni por tener el indicador `user_edited`.

Para recuperar este incidente concreto, la confirmación explícita del usuario
«ya los aprobé y cambié» autoriza registrar sus versiones corregidas comprobadas,
sin modificar textos, configuración o selección, ni enviar a Oficina.

Regresiones: `EDITOR/test_lote_text_approval.py` y `EDITOR/lote_selection_e2e.cjs`.
Probar el botón real, recarga, preparar otra vez, guardar sin cambios, conflicto
de versiones, tiempos inválidos y persistencia del texto exacto. No basta probar
el endpoint de aprobación por separado.
