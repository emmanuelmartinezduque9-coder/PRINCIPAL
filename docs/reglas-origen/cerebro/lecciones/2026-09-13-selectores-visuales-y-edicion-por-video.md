# Selecciones reconocibles y cambios aislados por vídeo

Emmanuel pidió extender las miniaturas a avatares y poder elegir un frame concreto
en regeneraciones. También pidió reproducir una referencia de edición y cambiar
sus textos sin perder una música elegida.

## Corrección aplicada

- Un selector visual compartido para conceptos, recetas, frames y avatares.
- Frames junto al concepto y botón «Elegir frame» bajo cada clip. No esconder
  las imágenes en otra parte al escoger «Elegir por clip».
- Avatar con foto y número permanente, conservando las opciones de mantener
  el actual o no sustituir personas. Nunca modificar el avatar global de la cuenta.
- «Ver vídeo y editar textos» reproduce la referencia local y guarda las
  personalizaciones en la tarjeta (`text_custom`), no en la edición compartida.
- La referencia reproduce sus textos/audio originales: no es un render final.
  `texedicion` identifica textos/tiempos; la música y su inicio son independientes.
- Copiar una tarjeta no vincula sus modificaciones de texto con la original.
  Preparar y aprobar el lote conserva el snapshot personalizado y su procedencia.
- Si cambia la revisión de la edición base, la personalización no se aplica a
  ciegas. Los tiempos siguen validados contra la duración; no se alarga el vídeo.

## Evidencia repetible

`lote_avatar_frame_e2e.cjs`: fotos cargadas, C1 con Galletas 14, persistencia,
avatares diferentes en dos tarjetas, sin avatar y móvil.
`lote_edition_preview_e2e.cjs`: reproducción real, cambios consecutivos,
persistencia, duplicado independiente, restauración y música sin cambios.
`test_lote_app.py`: personalizaciones en snapshots, validación y fuente intacta.
Los E2E usan almacenamiento temporal, sin OCR, traducción ni generación.

La guía de diseño se aplicó reutilizando la galería y poniendo los controles junto
a su resultado; no mediante nuevas secciones. Las ventanas se colocan dentro del
área visible incluso cuando el lote está en un iframe alto.

Relacionado: [[sistema/lote-visual-configurable]].
