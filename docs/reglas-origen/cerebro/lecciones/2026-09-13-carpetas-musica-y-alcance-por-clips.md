# Carpetas de música y alcance por clips

## Error y corrección verificada

La biblioteca ya devolvía `sections` y `songs[].section_ids`, pero el lote solo utilizaba `songs` como lista plana. El selector debe conservar la organización del usuario en cada consumidor, no solo en la biblioteca.

El primer arreglo añadió un filtro de carpeta separado. Emmanuel lo rechazó por enredar la interfaz. La corrección vigente es **un único desplegable de canciones agrupadas por las carpetas de la biblioteca**, tanto en cada tarjeta como en Asignar música, sin selector de carpeta adicional. Los inicios siguen siendo independientes por vídeo. Sin carpeta recoge canciones sin membresía vigente; pertenencia a varias carpetas se conserva. Prueba: `EDITOR/lote_music_folders_e2e.cjs`.

Al comunicar avances, no mezclar una función terminada con una propuesta como si ambas estuvieran disponibles. En ese momento existía elegir un frame guardado por clip, pero no adjuntar una captura. La pregunta de estado no autoriza por sí sola implementar todo ese flujo. **Actualización posterior:** Emmanuel ordenó expresamente implementarlo; la carga por clip y su despacho se detallan en [[2026-09-13-captura-por-clip]]. Los límites descritos abajo son el diagnóstico histórico, no el estado vigente de la carga.

## Límite detectado, no implementado en este cambio

Crear desde cero permite un encargo escrito, no construir un concepto nuevo por clips con subida de una captura para cada clip. El campo actual `frame_reference` es un enlace a nivel de tarjeta; `frames` son IDs de frames ya existentes. Método A no equivale a elegir solo el primer clip de una referencia ni a solicitar solo un frame.

Propuesta para acordar con Emmanuel: Nuevo concepto por clips. Cada clip indica captura de referencia / frame listo / clip existente, su acción si debe generarse y su orden. La captura determina el aspecto, no todos los movimientos. Distinguir imagen de referencia de frame aprobado. Distinguir salida solo frame de frame + clip. Referencia para textos y música siguen a nivel de montaje. No generar el vídeo completo ni inventar los clips que falten por una selección ambigua.
