# Decisión directa de Emmanuel — 07/10/2026

Fuente: conversación AUTOMATIZACION IA 2.0, autorización explícita para integrar
la función en toda la app y todos los lotes, conservando separación de usuarios.

«Cada clip debe depender de la aprobación de su propia imagen, sin esperar a
las demás. Conserva la revisión agrupada y no generes vídeos de imágenes no
aprobadas.» «Cuando los clips terminen, pásalos automáticamente a Topaz Video
2K, sin otra aprobación creativa del clip.» La elección posterior fue:
«1080p vale pues usa este por defecto».

Aplicación: revisión agrupada de frames; los miembros realmente aprobados
pueden avanzar aunque otros estén pendientes. No inventar aprobación técnica
visual del vídeo: registrar integridad de medios por separado y conservar las
observaciones existentes. Antes de upscale verificar archivo/recibo exactos,
decodificación, dimensiones y duración. Al entregar, verificar encuadre técnico,
fps, número de frames y audio original por paquetes; no fingir escucha humana.

Recuperar siempre el mismo ID aceptado. Un envío incierto no autoriza repetición.
No reactivar históricos ni cambiar credenciales, mantenimiento global o propietario.

Implementación del pedido enviado: `submitted_video_context.approved_clip_upscale`
invocada por el nodo de vídeo existente; recibo exclusivo `:upscale`, sin otra cola.
Esto no acredita pruebas de todas las rutas antiguas de la app.
