# Orden de ejecución exigido por Emmanuel — 20 septiembre 2026

1. Leer snapshot y recibos. Enviar regeneraciones literales listas inmediatamente por el motor, sin esperar el plan creativo del resto.
2. Preparar y añadir juntos TODOS los frames requeridos; mantener cuenta, avatar, toma y orden seleccionados.
3. Presentar cada resultado tan pronto esté disponible y pedir aprobación visual real. No posponerlo por documentación o edición.
4. Generar clips aprobados, avanzar tareas independientes y preparar recetas de montaje en paralelo.
5. Verificar y entregar. Nunca marcar completo un lote parcial ni duplicar trabajos existentes.

Aplicación: `production_engine.py`, política `rounds_append_only`, un único pedido y cola. Nodos anteriores inmutables, envíos persistidos antes de gastar y recuperación por recibo. `lote_control.py` conserva prioridad de regeneraciones y aprobación de imágenes.

No es autorización para quitar revisiones, cambiar imágenes aprobadas, comprar créditos ni regenerar fallos visuales sin decisión del usuario.
