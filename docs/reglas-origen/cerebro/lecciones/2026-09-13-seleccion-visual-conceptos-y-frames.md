# Reconocer conceptos y frames antes de elegir

## Corrección de Emmanuel

El selector de conceptos del lote solo mostraba nombres. Emmanuel necesita ver
miniaturas para reconocer el concepto y el frame que lleva cada clip.

## Causa y solución general

Un desplegable nativo de texto no resuelve una elección visual. El mismo componente
de galería sirve ahora para conceptos, recetas y frames, con búsqueda y selección
por identificadores estables. La tarjeta muestra los frames elegidos por clip;
cambiar una receta actualiza también su miniatura principal.

La imagen procede del ID exacto guardado en el registro. Las URLs antiguas que
faltaban se recuperaron de los metadatos de subidas, sin generar imágenes.
No usar una portada genérica ni escoger un frame parecido. Si un ID no tiene una
imagen accesible, indicarlo; si el clip no tiene frame inicial, no inventarlo.
Un prefijo ambiguo de ID nunca basta para asignar una imagen.

## Comprobación repetible

- `EDITOR/test_lote_app.py`: asociación exacta, IDs ambiguos y registro intacto.
- `EDITOR/lote_visual_miniaturas_e2e.cjs`: carga real de las imágenes de C4,
  selección independiente por clip, persistencia tras recargar, variantes de C1,
  exclusión de clips, móvil, Escape y colocación dentro de la app.
- Borradores de prueba aislados; únicamente guardar/configurar. Nada de OCR,
  traducción, generación o exportación para mostrar miniaturas.

La guía de diseño de componentes se aplicó para reutilizar la galería en el flujo
existente, sin añadir otra sección. Relacionado: [[sistema/lote-visual-configurable]].
